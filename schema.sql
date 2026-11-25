begin;

create table if not exists public.travel_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  start_date date not null,
  end_date date not null check (end_date between start_date and start_date + 365),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  itinerary jsonb not null default '{}'::jsonb check (jsonb_typeof(itinerary) = 'object'),
  unique (id, owner_id)
);

create index if not exists travel_trips_owner_date_idx
  on public.travel_trips (owner_id, start_date);

alter table public.travel_trips
  add column if not exists country_code text check (country_code ~ '^[A-Z]{2}$'),
  add column if not exists city text check (char_length(city) between 1 and 120);

create table if not exists public.travel_items (
  trip_id uuid not null,
  owner_id uuid not null default auth.uid(),
  path text not null check (path ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  primary key (trip_id, path),
  foreign key (trip_id, owner_id)
    references public.travel_trips(id, owner_id) on delete cascade
);

create table if not exists public.travel_important_days (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  primary key (owner_id, day)
);

create table if not exists public.travel_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  trip_id uuid not null,
  token_hash bytea not null unique check (octet_length(token_hash)=32),
  viewer_email text check (char_length(viewer_email)<=254),
  created_at timestamptz not null default now(),
  foreign key (trip_id,owner_id) references public.travel_trips(id,owner_id) on delete cascade
);

alter table public.travel_trips enable row level security;
alter table public.travel_items enable row level security;
alter table public.travel_important_days enable row level security;
alter table public.travel_shares enable row level security;
revoke all on public.travel_trips, public.travel_items, public.travel_important_days, public.travel_shares from anon, authenticated;
grant select, insert, update, delete on public.travel_trips, public.travel_items, public.travel_important_days to authenticated;
grant select, insert, delete on public.travel_shares to authenticated;

drop policy if exists travel_trips_owner on public.travel_trips;
create policy travel_trips_owner on public.travel_trips for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists travel_items_owner on public.travel_items;
create policy travel_items_owner on public.travel_items for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists travel_important_days_owner on public.travel_important_days;
create policy travel_important_days_owner on public.travel_important_days for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists travel_shares_owner on public.travel_shares;
create policy travel_shares_owner on public.travel_shares for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- The share token is the only public entry point. Return an allowlist of
-- display fields, even if the owner's itinerary contains notes or attachments.
create or replace function public.travel_open_share(share_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with permitted as (
    select trip.*
    from public.travel_shares as link
    join public.travel_trips as trip on trip.id=link.trip_id and trip.owner_id=link.owner_id
    where share_token ~ '^[0-9a-f]{64}$'
      and link.token_hash = pg_catalog.sha256(pg_catalog.convert_to(share_token,'UTF8'))
      and (link.viewer_email is null or exists (
        select 1 from auth.users as viewer
        where viewer.id=auth.uid() and viewer.email_confirmed_at is not null
          and pg_catalog.lower(viewer.email)=pg_catalog.lower(link.viewer_email)
      ))
  ),
  days as (
    select day->>'id' as id, day->>'date' as day, day->'stops' as stops
    from permitted, lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(itinerary->'days')='array'
           then itinerary->'days' else '[]'::jsonb end
    ) as day
    union all
    select 'day-'||d::date::text, d::date::text, '[]'::jsonb
    from permitted, lateral pg_catalog.generate_series(start_date::timestamp,end_date::timestamp,'1 day'::interval) d
    where case when pg_catalog.jsonb_typeof(itinerary->'days')='array'
               then pg_catalog.jsonb_array_length(itinerary->'days')=0 else true end
  ),
  items as (
    select record.path,record.value from permitted
    join public.travel_items as record on record.trip_id=permitted.id and record.owner_id=permitted.owner_id
    where record.path like 'plans/%' or record.path like 'stopEdits/%'
  ),
  stops as (
    select coalesce(edit.value->>'day',days.id) as day_id,
      coalesce(edit.value->>'time',stop->>'t') as time,
      coalesce(edit.value->>'name',stop->>'n') as name
    from days cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(days.stops)='array' then days.stops else '[]'::jsonb end
    ) as stop
    left join items as edit on edit.path='stopEdits/'|| (stop->>'stopId')
    union all
    select value->>'day',value->>'time',value->>'name' from items where path like 'plans/%'
  )
  select pg_catalog.jsonb_build_object(
    'name',permitted.name,'city',permitted.city,'country_code',permitted.country_code,
    'start',permitted.start_date,'end',permitted.end_date,
    'days',coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('date',days.day,'stops',coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('time',stops.time,'name',stops.name)
          order by case when stops.time ~ '^[0-9]{2}:[0-9]{2}' then stops.time else '99:99' end,stops.name)
        from stops where stops.day_id=days.id and stops.name is not null
      ),'[]'::jsonb)) order by days.day)
      from days),'[]'::jsonb)
  ) from permitted
$$;
revoke all on function public.travel_open_share(text) from public;
grant execute on function public.travel_open_share(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('travel-private', 'travel-private', false, 20971520,
        array['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Object name format is account UUID / trip UUID / file UUID.
drop policy if exists travel_file_read on storage.objects;
create policy travel_file_read on storage.objects for select to authenticated
  using (bucket_id = 'travel-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists travel_file_insert on storage.objects;
create policy travel_file_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'travel-private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.travel_trips
      where owner_id = (select auth.uid()) and id::text = (storage.foldername(storage.objects.name))[2]
    )
  );

drop policy if exists travel_file_delete on storage.objects;
create policy travel_file_delete on storage.objects for delete to authenticated
  using (bucket_id = 'travel-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
