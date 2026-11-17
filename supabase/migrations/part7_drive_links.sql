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
