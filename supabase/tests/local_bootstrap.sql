-- Minimal Supabase stand-ins so a schema dump of public/private can be restored
-- into a plain local Postgres for migration testing. Never run against Supabase.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage' and nspowner <> (select oid from pg_roles where rolname = current_user)) then
    raise exception 'local_bootstrap.sql must only run on a local test database';
  end if;
end;
$$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end;
$$;

alter role service_role bypassrls;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
grant usage on schema auth, storage, extensions, public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $$ select (string_to_array(name, '/'))[1:greatest(cardinality(string_to_array(name, '/')) - 1, 0)] $$;
grant execute on function storage.foldername(text) to authenticated;
