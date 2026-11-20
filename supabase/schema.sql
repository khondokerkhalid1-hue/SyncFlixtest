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


-- =====================================================================
-- SyncFlix database, part 8: Community Reviews (movies, TV series, anime)
-- One permanent review page per title, one vote per person per title,
-- and a Community Final Verdict that the database calculates by itself.
-- =====================================================================

-- One row per title. Only the few fields needed for lists are kept; everything else
-- (cast, trailer, runtime ...) is fetched from TMDB when a page is opened.
create table if not exists public.review_titles (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'tmdb' check (provider = 'tmdb'),
  provider_id bigint not null check (provider_id > 0),
  media_type text not null check (media_type in ('movie', 'tv')),
  content_category text not null check (content_category in ('movie', 'tv_series', 'anime')),
  title text not null check (char_length(title) between 1 and 300),
  poster_path text check (poster_path is null or poster_path ~ '^/[A-Za-z0-9_.-]{1,100}$'),
  backdrop_path text check (backdrop_path is null or backdrop_path ~ '^/[A-Za-z0-9_.-]{1,100}$'),
  release_date date,
  overview text check (overview is null or char_length(overview) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  metadata_refreshed_at timestamptz not null default now(),
  -- the same title can never get two pages, even if two people create it at the same moment
  unique (provider, provider_id, media_type),
  check ((media_type = 'movie' and content_category in ('movie', 'anime'))
      or (media_type = 'tv' and content_category in ('tv_series', 'anime')))
);

create index if not exists review_titles_recent_idx on public.review_titles (created_at desc);
create index if not exists review_titles_category_idx on public.review_titles (content_category, created_at desc);

create table if not exists public.review_votes (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.review_titles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  personal_rating smallint not null check (personal_rating between 1 and 10),
  tier smallint not null check (tier between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, user_id)
);

create index if not exists review_votes_user_idx on public.review_votes (user_id, updated_at desc);
create index if not exists review_votes_tier_idx on public.review_votes (content_id, tier);

alter table public.review_titles enable row level security;
alter table public.review_votes enable row level security;

-- Everyone (even visitors) can read titles. Pages are created only by the server, which checks TMDB first.
drop policy if exists "Anyone reads review titles" on public.review_titles;
create policy "Anyone reads review titles" on public.review_titles for select to anon, authenticated using (true);
revoke insert, update, delete on public.review_titles from anon, authenticated;

-- Votes: a person can read only their own vote. Writing goes only through save_review_vote() below,
-- so nobody can write another person's vote, move a vote to another title, or skip the checks.
revoke all on public.review_votes from anon, authenticated;
grant select on public.review_votes to authenticated;

drop policy if exists "Read own vote" on public.review_votes;
create policy "Read own vote" on public.review_votes for select to authenticated using (user_id = auth.uid());
drop policy if exists "Insert own vote" on public.review_votes;
drop policy if exists "Update own vote" on public.review_votes;

drop trigger if exists review_votes_limit on public.review_votes;
drop function if exists public.review_vote_rate_limit();

drop trigger if exists review_votes_touch on public.review_votes;
create trigger review_votes_touch before update on public.review_votes
  for each row execute function public.touch_updated_at();

-- Save (or change) my vote. One vote per person per title: voting again updates it and never adds a second.
-- The person is always auth.uid(), never something the browser sends. At most 30 saves per minute.
create or replace function public.save_review_vote(p_content_id uuid, p_rating integer, p_tier integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 10 then raise exception 'Rating must be a whole number from 1 to 10'; end if;
  if p_tier is null or p_tier < 1 or p_tier > 4 then raise exception 'Choose one of the four tiers'; end if;
  if not public.hit_rate_limit('vote:' || auth.uid()::text, 30, 60) then raise exception 'You are voting too fast'; end if;
  if not exists (select 1 from public.review_titles where id = p_content_id) then raise exception 'Review page not found'; end if;
  insert into public.review_votes (content_id, user_id, personal_rating, tier)
  values (p_content_id, auth.uid(), p_rating, p_tier)
  on conflict (content_id, user_id) do update set personal_rating = excluded.personal_rating, tier = excluded.tier;
end;
$$;

-- Percentages that always add up to exactly 100 (largest remainder method).
create or replace function public.review_percentages(c int[])
returns int[] language sql immutable as $$
  with t as (select i, c[i] as n from generate_series(1, 4) i),
       s as (select sum(n) as total from t),
       b as (select t.i, (100 * t.n) / s.total as base, (100 * t.n) % s.total as rem
             from t, s where s.total > 0),
       r as (select b.*, row_number() over (order by rem desc, i) as rn,
                    100 - sum(base) over () as leftover from b)
  select case when (select total from s) > 0
              then array(select base + case when rn <= leftover then 1 else 0 end from r order by i)
              else array[0, 0, 0, 0] end;
$$;

-- The winning tier: most votes wins. On a tie, the tied tier whose voters gave the higher average
-- rating wins. If that is also equal, the higher tier wins. No votes means no verdict (no row).
create or replace function public.review_pick(c int[], a numeric[])
returns table (final_tier int, tie_status text) language sql immutable as $$
  with t as (select i as tier, c[i] as n, coalesce(a[i], 0) as avg_rating from generate_series(1, 4) i),
       top as (select t.* from t where t.n = (select max(n) from t) and (select max(n) from t) > 0)
  select (select tier from top order by avg_rating desc, tier desc limit 1),
         case when (select count(*) from top) = 1 then 'clear'
              when (select count(*) from top where avg_rating = (select max(avg_rating) from top)) = 1 then 'tie_broken_by_rating'
              else 'tie_broken_by_order' end
  where exists (select 1 from top);
$$;

-- Internal view: every title with its live statistics. Not readable directly by the browser.
create or replace view public.review_overview as
select t.id, t.provider, t.provider_id, t.media_type, t.content_category, t.title, t.poster_path,
       t.backdrop_path, t.release_date, t.overview, t.created_at,
       coalesce(s.total_votes, 0) as total_votes,
       s.average_rating,
       coalesce(s.c1, 0) as tier_1_count, coalesce(s.c2, 0) as tier_2_count,
       coalesce(s.c3, 0) as tier_3_count, coalesce(s.c4, 0) as tier_4_count,
       (public.review_percentages(array[coalesce(s.c1, 0), coalesce(s.c2, 0), coalesce(s.c3, 0), coalesce(s.c4, 0)]))[1] as tier_1_percentage,
       (public.review_percentages(array[coalesce(s.c1, 0), coalesce(s.c2, 0), coalesce(s.c3, 0), coalesce(s.c4, 0)]))[2] as tier_2_percentage,
       (public.review_percentages(array[coalesce(s.c1, 0), coalesce(s.c2, 0), coalesce(s.c3, 0), coalesce(s.c4, 0)]))[3] as tier_3_percentage,
       (public.review_percentages(array[coalesce(s.c1, 0), coalesce(s.c2, 0), coalesce(s.c3, 0), coalesce(s.c4, 0)]))[4] as tier_4_percentage,
       w.final_tier, w.tie_status
from public.review_titles t
left join lateral (
  select count(*)::int as total_votes, round(avg(v.personal_rating), 2) as average_rating,
         (count(*) filter (where v.tier = 1))::int as c1, (count(*) filter (where v.tier = 2))::int as c2,
         (count(*) filter (where v.tier = 3))::int as c3, (count(*) filter (where v.tier = 4))::int as c4,
         avg(v.personal_rating) filter (where v.tier = 1) as a1, avg(v.personal_rating) filter (where v.tier = 2) as a2,
         avg(v.personal_rating) filter (where v.tier = 3) as a3, avg(v.personal_rating) filter (where v.tier = 4) as a4
  from public.review_votes v where v.content_id = t.id
) s on true
left join lateral public.review_pick(
  array[coalesce(s.c1, 0), coalesce(s.c2, 0), coalesce(s.c3, 0), coalesce(s.c4, 0)],
  array[s.a1, s.a2, s.a3, s.a4]) w on true;

revoke all on public.review_overview from anon, authenticated;

-- Lists for the Reviews home page. sort: recent | most_voted | top_rated | must_watch
create or replace function public.review_list(
  p_category text default null, p_sort text default 'recent',
  p_limit integer default 12, p_offset integer default 0, p_min_votes integer default 3)
returns setof public.review_overview language plpgsql stable security definer set search_path = public as $$
begin
  if p_category is not null and p_category not in ('movie', 'tv_series', 'anime') then raise exception 'Invalid category'; end if;
  if p_sort not in ('recent', 'most_voted', 'top_rated', 'must_watch') then raise exception 'Invalid sort'; end if;
  p_limit := least(greatest(coalesce(p_limit, 12), 1), 50);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  return query
    select o.* from public.review_overview o
    where (p_category is null or o.content_category = p_category)
      and case p_sort when 'top_rated' then o.total_votes >= greatest(coalesce(p_min_votes, 3), 1)
                      when 'must_watch' then o.final_tier >= 3
                      when 'most_voted' then o.total_votes > 0
                      else true end
    order by case when p_sort = 'recent' then o.created_at end desc,
             case when p_sort = 'most_voted' then o.total_votes end desc,
             case when p_sort = 'top_rated' then o.average_rating end desc,
             case when p_sort = 'must_watch' then o.total_votes end desc,
             o.total_votes desc, o.created_at desc
    limit p_limit offset p_offset;
end;
$$;

create or replace function public.review_get(p_media_type text, p_provider_id bigint)
returns setof public.review_overview language sql stable security definer set search_path = public as $$
  select o.* from public.review_overview o
  where o.provider = 'tmdb' and o.media_type = p_media_type and o.provider_id = p_provider_id;
$$;

-- For search results: which of these titles already have a page (up to 50 at a time)?
create or replace function public.review_lookup(p_media text[], p_ids bigint[])
returns setof public.review_overview language sql stable security definer set search_path = public as $$
  select o.* from public.review_overview o
  join (select * from unnest(p_media[1:50], p_ids[1:50]) as k(m, i)) k
    on o.media_type = k.m and o.provider_id = k.i and o.provider = 'tmdb';
$$;

-- "My reviews": the signed-in person's own votes, with the community verdict next to them.
create or replace function public.review_my(p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, provider_id bigint, media_type text, content_category text, title text, poster_path text,
               release_date date, total_votes integer, average_rating numeric, final_tier integer,
               my_rating integer, my_tier integer, voted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.provider_id, o.media_type, o.content_category, o.title, o.poster_path, o.release_date,
         o.total_votes, o.average_rating, o.final_tier, v.personal_rating::int, v.tier::int, v.updated_at
  from public.review_votes v join public.review_overview o on o.id = v.content_id
  where v.user_id = auth.uid()
  order by v.updated_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Server-only: create the page, or return the existing one if somebody else just created it.
create or replace function public.create_review_title(
  p_user uuid, p_provider_id bigint, p_media_type text, p_category text, p_title text,
  p_poster text, p_backdrop text, p_release date, p_overview text)
returns table (id uuid, created boolean) language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  insert into public.review_titles as r (provider, provider_id, media_type, content_category, title, poster_path,
                                          backdrop_path, release_date, overview, created_by)
  values ('tmdb', p_provider_id, p_media_type, p_category, left(trim(p_title), 300), p_poster, p_backdrop, p_release,
          left(p_overview, 1000), p_user)
  on conflict (provider, provider_id, media_type) do nothing
  returning r.id into v;
  if v is not null then return query select v, true; return; end if;
  return query select t.id, false from public.review_titles t
    where t.provider = 'tmdb' and t.provider_id = p_provider_id and t.media_type = p_media_type;
end;
$$;

-- Server-only: keep stored title details fresh (TMDB asks that cached data is not kept for over 6 months).
create or replace function public.refresh_review_title(
  p_media_type text, p_provider_id bigint, p_title text, p_poster text, p_backdrop text, p_release date, p_overview text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.review_titles set title = left(trim(p_title), 300), poster_path = p_poster, backdrop_path = p_backdrop,
         release_date = p_release, overview = left(p_overview, 1000), metadata_refreshed_at = now()
  where provider = 'tmdb' and media_type = p_media_type and provider_id = p_provider_id
    and metadata_refreshed_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function public.save_review_vote(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.review_list(text, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.review_get(text, bigint) from public, anon, authenticated;
revoke execute on function public.review_lookup(text[], bigint[]) from public, anon, authenticated;
revoke execute on function public.review_my(integer, integer) from public, anon, authenticated;
revoke execute on function public.create_review_title(uuid, bigint, text, text, text, text, text, date, text) from public, anon, authenticated;
revoke execute on function public.refresh_review_title(text, bigint, text, text, text, date, text) from public, anon, authenticated;
grant execute on function public.save_review_vote(uuid, integer, integer) to authenticated;
grant execute on function public.review_list(text, text, integer, integer, integer) to anon, authenticated;
grant execute on function public.review_get(text, bigint) to anon, authenticated;
grant execute on function public.review_lookup(text[], bigint[]) to anon, authenticated;
grant execute on function public.review_my(integer, integer) to authenticated;
grant execute on function public.create_review_title(uuid, bigint, text, text, text, text, text, date, text) to service_role;
grant execute on function public.refresh_review_title(text, bigint, text, text, text, date, text) to service_role;
