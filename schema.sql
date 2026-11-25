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

alter table public.travel_trips enable row level security;
alter table public.travel_items enable row level security;
revoke all on public.travel_trips, public.travel_items from anon, authenticated;
grant select, insert, update, delete on public.travel_trips, public.travel_items to authenticated;

drop policy if exists travel_trips_owner on public.travel_trips;
create policy travel_trips_owner on public.travel_trips for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists travel_items_owner on public.travel_items;
create policy travel_items_owner on public.travel_items for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

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
