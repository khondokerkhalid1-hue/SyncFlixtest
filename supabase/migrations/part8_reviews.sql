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
