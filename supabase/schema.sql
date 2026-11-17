-- SyncFlix database, part 1: user profiles
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  avatar_color text not null default '#7C3AED' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Signed-in users can view profiles" on public.profiles;
create policy "Signed-in users can view profiles"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Profiles are created only by the trigger below, never directly by the browser.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', 'user_' || substr(new.id::text, 1, 8)))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the sign-up form check if a username is free before creating the account.
create or replace function public.username_available(name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.profiles where username = lower(name));
$$;

grant execute on function public.username_available(text) to anon, authenticated;


-- =====================================================================
-- SyncFlix database, part 2: rooms and room members
-- =====================================================================

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  name text not null check (char_length(name) between 3 and 60),
  description text not null default '' check (char_length(description) <= 300),
  is_public boolean not null default true,
  host_id uuid not null references public.profiles (id) on delete cascade,
  max_members integer not null default 10 check (max_members between 2 and 50),
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_members_user_idx on public.room_members (user_id);
create index if not exists rooms_public_idx on public.rooms (is_public, created_at desc);

-- Helper functions (they bypass row security safely, to avoid policy loops)
create or replace function public.is_room_member(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.room_members where room_id = p_room and user_id = auth.uid());
$$;

create or replace function public.is_room_host(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.rooms where id = p_room and host_id = auth.uid());
$$;

create or replace function public.room_host_id(p_room uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select host_id from public.rooms where id = p_room;
$$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

-- Rooms: public rooms are visible to everyone signed in; private rooms only to members.
drop policy if exists "See public rooms and your own rooms" on public.rooms;
create policy "See public rooms and your own rooms"
  on public.rooms for select to authenticated
  using (is_public or host_id = auth.uid() or public.is_room_member(id));

drop policy if exists "Host can update room" on public.rooms;
create policy "Host can update room"
  on public.rooms for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists "Host can delete room" on public.rooms;
create policy "Host can delete room"
  on public.rooms for delete to authenticated
  using (host_id = auth.uid());

-- The host may change only these settings (never the host, code or id).
revoke update on public.rooms from authenticated;
grant update (name, description, is_public, max_members) on public.rooms to authenticated;

-- Members: members see each other. Leave yourself, or the host removes someone. The host cannot be removed.
drop policy if exists "Members see room members" on public.room_members;
create policy "Members see room members"
  on public.room_members for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "Leave room or host removes member" on public.room_members;
create policy "Leave room or host removes member"
  on public.room_members for delete to authenticated
  using ((user_id = auth.uid() or public.is_room_host(room_id)) and user_id <> public.room_host_id(room_id));

-- Creating and joining go through these functions so the rules are enforced in the database.
create or replace function public.create_room(p_name text, p_description text, p_is_public boolean, p_max_members integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.rooms where host_id = auth.uid()) >= 10 then
    raise exception 'You have reached the limit of 10 rooms';
  end if;
  insert into public.rooms (name, description, is_public, max_members, host_id)
  values (trim(p_name), trim(coalesce(p_description, '')), coalesce(p_is_public, true), coalesce(p_max_members, 10), auth.uid())
  returning id into new_id;
  insert into public.room_members (room_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;

create or replace function public.join_room(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.rooms; cnt integer;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into r from public.rooms where code = upper(trim(p_code));
  if not found then raise exception 'Room not found'; end if;
  if exists (select 1 from public.room_members where room_id = r.id and user_id = auth.uid()) then
    return r.id;
  end if;
  select count(*) into cnt from public.room_members where room_id = r.id;
  if cnt >= r.max_members then raise exception 'Room is full'; end if;
  insert into public.room_members (room_id, user_id) values (r.id, auth.uid());
  return r.id;
end;
$$;

create or replace function public.explore_rooms()
returns table (id uuid, code text, name text, description text, max_members integer,
               member_count bigint, host_username text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.id, r.code, r.name, r.description, r.max_members,
         (select count(*) from public.room_members m where m.room_id = r.id),
         p.username, r.created_at
  from public.rooms r join public.profiles p on p.id = r.host_id
  where r.is_public
  order by r.created_at desc
  limit 50;
$$;

revoke execute on function public.create_room(text, text, boolean, integer) from public, anon;
revoke execute on function public.join_room(text) from public, anon;
revoke execute on function public.explore_rooms() from public, anon;
grant execute on function public.create_room(text, text, boolean, integer) to authenticated;
grant execute on function public.join_room(text) to authenticated;
grant execute on function public.explore_rooms() to authenticated;


-- =====================================================================
-- SyncFlix database, part 3: synchronized playback
-- =====================================================================

create table if not exists public.playback_states (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  video_url text check (video_url is null or (char_length(video_url) <= 2000 and video_url ~* '^https://[^[:space:]]+$')),
  title text not null default '' check (char_length(title) <= 100),
  is_playing boolean not null default false,
  position_seconds double precision not null default 0 check (position_seconds >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references public.profiles (id) on delete set null,
  version bigint not null default 1
);

alter table public.playback_states enable row level security;

-- Members can read the room's playback state. Nobody writes directly: only set_playback() below can.
drop policy if exists "Members read playback" on public.playback_states;
create policy "Members read playback"
  on public.playback_states for select to authenticated
  using (public.is_room_member(room_id));

-- The browser asks the server for its clock so everyone agrees on "now".
create or replace function public.server_time()
returns timestamptz language sql stable as $$ select clock_timestamp(); $$;

-- Only the host can change what is playing, and where.
create or replace function public.set_playback(
  p_room uuid, p_video_url text, p_title text, p_is_playing boolean, p_position double precision)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint; url text := nullif(trim(coalesce(p_video_url, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not public.can_control_room(p_room) then raise exception 'You do not have permission to control playback'; end if;
  if url is not null and (char_length(url) > 2000 or url !~* '^https://[^[:space:]]+$') then
    raise exception 'Video link must start with https://';
  end if;
  if p_position is null or p_position < 0 or p_position > 259200 then raise exception 'Invalid position'; end if;

  insert into public.playback_states (room_id, video_url, title, is_playing, position_seconds, updated_at, updated_by, version)
  values (p_room, url, left(trim(coalesce(p_title, '')), 100), coalesce(p_is_playing, false) and url is not null,
          p_position, clock_timestamp(), auth.uid(), 1)
  on conflict (room_id) do update set
    video_url = excluded.video_url, title = excluded.title, is_playing = excluded.is_playing,
    position_seconds = excluded.position_seconds, updated_at = excluded.updated_at,
    updated_by = excluded.updated_by, version = public.playback_states.version + 1,
    current_item_id = case when public.playback_states.video_url is distinct from excluded.video_url
                           then null else public.playback_states.current_item_id end
  returning version into v;
  return v;
end;
$$;

revoke execute on function public.set_playback(uuid, text, text, boolean, double precision) from public, anon;
revoke execute on function public.server_time() from public, anon;
grant execute on function public.set_playback(uuid, text, text, boolean, double precision) to authenticated;
grant execute on function public.server_time() to authenticated;

-- Send playback changes live to everyone in the room (Supabase Realtime).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playback_states') then
    alter publication supabase_realtime add table public.playback_states;
  end if;
end
$$;


-- =====================================================================
-- SyncFlix database, part 4: chat, reactions, online status, host controls
-- =====================================================================

alter table public.rooms add column if not exists allow_member_control boolean not null default false;
alter table public.room_members add column if not exists last_seen timestamptz not null default now();

revoke update on public.rooms from authenticated;
grant update (name, description, is_public, max_members, allow_member_control) on public.rooms to authenticated;

-- Who may control playback: the host, or any member when the host allows it.
create or replace function public.can_control_room(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.rooms r
    where r.id = p_room and (r.host_id = auth.uid() or (r.allow_member_control and public.is_room_member(p_room)))
  );
$$;

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'message' check (kind in ('message', 'reaction', 'system')),
  body text not null check (char_length(body) between 1 and 500 and char_length(trim(body)) >= 1),
  created_at timestamptz not null default now(),
  check (kind <> 'reaction' or body in ('👍', '😂', '😮', '😢', '🔥', '👏')),
  check (kind = 'system' or user_id is not null)
);

create index if not exists chat_messages_room_idx on public.chat_messages (room_id, id desc);

alter table public.chat_messages enable row level security;

drop policy if exists "Members read chat" on public.chat_messages;
create policy "Members read chat"
  on public.chat_messages for select to authenticated
  using (public.is_room_member(room_id));

-- Members may send messages and reactions as themselves. System lines come only from the triggers below.
drop policy if exists "Members send chat" on public.chat_messages;
create policy "Members send chat"
  on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and kind in ('message', 'reaction') and public.is_room_member(room_id));

-- Rate limit: at most 8 messages or reactions per person per room in 10 seconds.
create or replace function public.chat_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'system' and (
       select count(*) from public.chat_messages
       where room_id = new.room_id and user_id = new.user_id and kind <> 'system'
         and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'You are sending messages too fast';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_rate_limit_trg on public.chat_messages;
create trigger chat_rate_limit_trg before insert on public.chat_messages
  for each row execute function public.chat_rate_limit();

-- Join, leave and removal notices in the chat.
create or replace function public.room_member_notice()
returns trigger language plpgsql security definer set search_path = public as $$
declare uname text; the_room uuid; the_user uuid;
begin
  if tg_op = 'INSERT' then the_room := new.room_id; the_user := new.user_id;
  else the_room := old.room_id; the_user := old.user_id; end if;

  select username into uname from public.profiles where id = the_user;
  if uname is null or not exists (select 1 from public.rooms where id = the_room) then
    return coalesce(new, old);
  end if;

  insert into public.chat_messages (room_id, user_id, kind, body)
  values (the_room, the_user, 'system',
    case when tg_op = 'INSERT' then uname || ' joined the room'
         when auth.uid() is not null and auth.uid() <> the_user then uname || ' was removed by the host'
         else uname || ' left the room' end);
  return coalesce(new, old);
end;
$$;

drop trigger if exists room_member_notice_trg on public.room_members;
create trigger room_member_notice_trg after insert or delete on public.room_members
  for each row execute function public.room_member_notice();

-- Online status: each open room page pings every ~25 seconds.
create or replace function public.touch_presence(p_room uuid)
returns void language sql security definer set search_path = public as $$
  update public.room_members set last_seen = now() where room_id = p_room and user_id = auth.uid();
$$;

create or replace function public.room_roster(p_room uuid)
returns table (user_id uuid, username text, avatar_color text, is_host boolean, online boolean, joined_at timestamptz)
language sql security definer set search_path = public stable as $$
  select m.user_id, p.username, p.avatar_color, (m.user_id = r.host_id),
         (m.last_seen > now() - interval '70 seconds'), m.joined_at
  from public.room_members m
  join public.profiles p on p.id = m.user_id
  join public.rooms r on r.id = m.room_id
  where m.room_id = p_room and public.is_room_member(p_room)
  order by m.joined_at;
$$;

create or replace function public.transfer_host(p_room uuid, p_new_host uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  if not public.is_room_host(p_room) then raise exception 'Only the host can do that'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room and user_id = p_new_host) then
    raise exception 'That person is not in the room';
  end if;
  update public.rooms set host_id = p_new_host where id = p_room;
  select username into uname from public.profiles where id = p_new_host;
  insert into public.chat_messages (room_id, user_id, kind, body) values (p_room, p_new_host, 'system', uname || ' is now the host');
end;
$$;

revoke execute on function public.touch_presence(uuid) from public, anon;
revoke execute on function public.room_roster(uuid) from public, anon;
revoke execute on function public.transfer_host(uuid, uuid) from public, anon;
revoke execute on function public.can_control_room(uuid) from public, anon;
grant execute on function public.touch_presence(uuid) to authenticated;
grant execute on function public.room_roster(uuid) to authenticated;
grant execute on function public.transfer_host(uuid, uuid) to authenticated;
grant execute on function public.can_control_room(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end
$$;


-- =====================================================================
-- SyncFlix database, part 5: playlist (one queue per room) and episodes
-- =====================================================================

create table if not exists public.playlist_items (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  video_url text not null check (char_length(video_url) <= 2000 and video_url ~* '^https://[^[:space:]]+$'),
  title text not null default '' check (char_length(title) <= 100),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists playlist_items_room_idx on public.playlist_items (room_id, id);

alter table public.playback_states
  add column if not exists current_item_id bigint references public.playlist_items (id) on delete set null;

alter table public.playlist_items enable row level security;

drop policy if exists "Members read queue" on public.playlist_items;
create policy "Members read queue"
  on public.playlist_items for select to authenticated
  using (public.is_room_member(room_id));

-- Any member can add to the queue. Only the functions below change it.
create or replace function public.queue_add(p_room uuid, p_url text, p_title text)
returns bigint language plpgsql security definer set search_path = public as $$
declare url text := trim(coalesce(p_url, '')); new_id bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not public.is_room_member(p_room) then raise exception 'You do not have permission to add videos here'; end if;
  if char_length(url) > 2000 or url !~* '^https://[^[:space:]]+$' then raise exception 'Video link must start with https://'; end if;
  if (select count(*) from public.playlist_items where room_id = p_room) >= 50 then raise exception 'The queue is full'; end if;
  insert into public.playlist_items (room_id, video_url, title, added_by)
  values (p_room, url, left(trim(coalesce(p_title, '')), 100), auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

-- Remove: the person who added it, or anyone allowed to control the room.
create or replace function public.queue_remove(p_item bigint)
returns void language plpgsql security definer set search_path = public as $$
declare it public.playlist_items;
begin
  select * into it from public.playlist_items where id = p_item;
  if not found then return; end if;
  if not (public.can_control_room(it.room_id) or (it.added_by = auth.uid() and public.is_room_member(it.room_id))) then
    raise exception 'You do not have permission to remove this video';
  end if;
  -- Bumping the version tells everyone's screen to refresh the queue.
  update public.playback_states
    set current_item_id = case when current_item_id = p_item then null else current_item_id end,
        version = version + 1
    where room_id = it.room_id;
  delete from public.playlist_items where id = p_item;
end;
$$;

-- Internal helper (not callable from the browser): start a queue item for everyone.
create or replace function public.start_playlist_item(p_room uuid, p_item bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare it public.playlist_items; v bigint;
begin
  select * into it from public.playlist_items where id = p_item and room_id = p_room;
  if not found then raise exception 'That video is not in the queue'; end if;
  insert into public.playback_states
    (room_id, video_url, title, is_playing, position_seconds, updated_at, updated_by, version, current_item_id)
  values (p_room, it.video_url, it.title, true, 0, clock_timestamp(), auth.uid(), 1, it.id)
  on conflict (room_id) do update set
    video_url = excluded.video_url, title = excluded.title, is_playing = true, position_seconds = 0,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by,
    current_item_id = excluded.current_item_id, version = public.playback_states.version + 1
  returning version into v;
  return v;
end;
$$;

create or replace function public.play_item(p_room uuid, p_item bigint)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not public.can_control_room(p_room) then raise exception 'You do not have permission to control playback'; end if;
  return public.start_playlist_item(p_room, p_item);
end;
$$;

-- Called when a video ends. p_from is the queue item that just ended, so two screens
-- reporting the same ending cannot skip an episode. Answers: advanced, stale, or empty.
create or replace function public.play_next(p_room uuid, p_from bigint)
returns text language plpgsql security definer set search_path = public as $$
declare cur bigint; nxt bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not public.can_control_room(p_room) then raise exception 'You do not have permission to control playback'; end if;
  select current_item_id into cur from public.playback_states where room_id = p_room;
  if cur is distinct from p_from then return 'stale'; end if;
  if cur is null then
    select min(id) into nxt from public.playlist_items where room_id = p_room;
  else
    select min(id) into nxt from public.playlist_items where room_id = p_room and id > cur;
  end if;
  if nxt is null then return 'empty'; end if;
  perform public.start_playlist_item(p_room, nxt);
  return 'advanced';
end;
$$;

revoke execute on function public.queue_add(uuid, text, text) from public, anon;
revoke execute on function public.queue_remove(bigint) from public, anon;
revoke execute on function public.start_playlist_item(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.play_item(uuid, bigint) from public, anon;
revoke execute on function public.play_next(uuid, bigint) from public, anon;
grant execute on function public.queue_add(uuid, text, text) to authenticated;
grant execute on function public.queue_remove(bigint) to authenticated;
grant execute on function public.play_item(uuid, bigint) to authenticated;
grant execute on function public.play_next(uuid, bigint) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playlist_items') then
    alter publication supabase_realtime add table public.playlist_items;
  end if;
end
$$;


-- =====================================================================
-- SyncFlix database, part 6: profile editing
-- =====================================================================

-- A person may change only their own username and avatar colour.
revoke update on public.profiles from authenticated;
grant update (username, avatar_color) on public.profiles to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();


-- =====================================================================
-- SyncFlix database, part 7: Google Drive video links
-- =====================================================================

-- One row per person who connected Google Drive. Tokens are stored encrypted by the server.
-- The browser can never read this table: no policies, and no table access for signed-in users.
create table if not exists public.drive_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  refresh_token_enc text not null,
  access_token_enc text,
  access_expires_at timestamptz,
  scope text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drive_connections enable row level security;
revoke all on public.drive_connections from anon, authenticated;

-- One row per generated SyncFlix video link. The random token IS the link: anyone holding it can watch.
create table if not exists public.drive_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  source text not null check (source in ('public_link', 'oauth')),
  drive_file_id text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{10,128}$'),
  title text not null default '' check (char_length(title) <= 300),
  mime_type text not null check (mime_type in ('video/mp4', 'video/webm')),
  size_bytes bigint not null check (size_bytes > 0),
  thumbnail_url text check (thumbnail_url is null or thumbnail_url ~ '^https://'),
  rights_confirmed boolean not null check (rights_confirmed),
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists drive_links_owner_idx on public.drive_links (owner_id, created_at desc);

alter table public.drive_links enable row level security;

-- A person sees and deletes only their own links. Links are created only by the server, after it has
-- checked the file with Google. Deleting a row stops the link working immediately.
drop policy if exists "Owner reads own drive links" on public.drive_links;
create policy "Owner reads own drive links"
  on public.drive_links for select to authenticated using (owner_id = auth.uid());

drop policy if exists "Owner deletes own drive links" on public.drive_links;
create policy "Owner deletes own drive links"
  on public.drive_links for delete to authenticated using (owner_id = auth.uid());

revoke insert, update on public.drive_links from anon, authenticated;
revoke all on public.drive_links from anon;

-- Rate limiting counters (used only by the server).
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Returns true when the request is allowed, false when the limit for the time window is used up.
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare h integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into h;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return h <= p_limit;
end;
$$;

revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
