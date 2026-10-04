-- Company Setup (Our Companies): master data, bank accounts, dispatch locations,
-- document series {DOC}-{ABBR}-{COUNTER}, RLS, audit, storage.
-- Extends the existing companies / document_series / delivery_locations tables.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Role tiers. employees.role holds job titles ('Admin', 'Director', 'Ops Leads', ...),
--    which never matched the old OWNER/PARTNER/VIEWER checks. app_role() maps them:
--      OWNER   = Owner, Admin, Director
--      PARTNER = Partner, Sales, Purchase, Accounts
--      VIEWER  = every other active employee
--      NULL    = not an active employee
-- ---------------------------------------------------------------------------
create or replace function public.app_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when lower(btrim(e.role)) in ('owner', 'admin', 'director') then 'OWNER'
    when lower(btrim(e.role)) in ('partner', 'sales', 'purchase', 'accounts') then 'PARTNER'
    else 'VIEWER'
  end
  from public.employees e
  where e.id = (select auth.uid()) and e.is_active;
$$;

revoke execute on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

create or replace function private.is_company_owner()
returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(public.app_role() = 'OWNER', false) $$;

revoke execute on function private.is_company_owner() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_company_owner(), private.is_active_employee() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Abbreviation: first letter of the first two words, or first two letters of a single word
-- ---------------------------------------------------------------------------
create or replace function public.company_abbr(p_legal_name text)
returns text
language sql immutable
set search_path = ''
as $$
  with w as (
    select regexp_split_to_array(
      btrim(regexp_replace(upper(coalesce(p_legal_name, '')), '[^A-Z0-9]+', ' ', 'g')),
      ' '
    ) as words
  )
  select case
    when words[1] = '' then null
    when cardinality(words) >= 2 then left(words[1], 1) || left(words[2], 1)
    else left(words[1], 2)
  end
  from w;
$$;

-- ---------------------------------------------------------------------------
-- 3. Companies: new master fields
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists abbr text,
  add column if not exists cin text,
  add column if not exists incorporation_date date,
  add column if not exists logo_path text,
  add column if not exists gst_type text not null default 'Regular',
  add column if not exists tan text,
  add column if not exists msme_no text,
  add column if not exists iec text,
  add column if not exists website text,
  add column if not exists signatory_name text,
  add column if not exists signatory_designation text,
  add column if not exists signature_path text,
  add column if not exists default_payment_terms text not null default '45 days from date of delivery',
  add column if not exists default_delivery_days integer not null default 5,
  add column if not exists default_terms_template_id uuid references public.terms_templates(id) on delete set null,
  add column if not exists tds_commission_pct numeric(5,2) not null default 5,
  add column if not exists books_locked_until date,
  add column if not exists doc_terms_text text,
  add column if not exists doc_footer_note text,
  add column if not exists show_bank_on_docs boolean not null default true,
  add column if not exists created_by uuid default auth.uid() references public.employees(id) on delete set null,
  add column if not exists updated_by uuid references public.employees(id) on delete set null;

-- Backfill existing rows (C01 Supply360 Solution PVT LTD. -> SS, C02 Vensun Group -> VG)
update public.companies set abbr = public.company_abbr(legal_name) where abbr is null;

-- Entity type is chosen by the owner in the UI ("Add entity type"); never guessed.
-- Unrecognised legacy values become NULL; recognised ones are kept.
alter table public.companies
  alter column entity_type drop not null,
  alter column entity_type drop default;

update public.companies
set entity_type = null
where entity_type not in ('Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'OPC');

update public.companies
set gstin = nullif(upper(btrim(gstin)), ''),
    pan   = nullif(upper(btrim(pan)), ''),
    email = nullif(lower(btrim(email)), '');

-- Vensun Group (VG) is the default company
update public.companies set is_default = (abbr = 'VG');

alter table public.companies
  alter column abbr set not null;

-- Format rules (NOT VALID first, validated below so legacy rows can't abort the migration)
alter table public.companies
  add constraint companies_abbr_format        check (abbr ~ '^[A-Z0-9]{2,4}$') not valid,
  add constraint companies_entity_type_check  check (entity_type is null or entity_type in ('Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'OPC')) not valid,
  add constraint companies_gst_type_check     check (gst_type in ('Regular', 'Composition', 'Unregistered')) not valid,
  add constraint companies_gstin_format       check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$') not valid,
  add constraint companies_pan_format         check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$') not valid,
  add constraint companies_tan_format         check (tan is null or tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$') not valid,
  add constraint companies_cin_format         check (cin is null or cin ~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$' or cin ~ '^[A-Z]{3}-[0-9]{4}$') not valid,
  add constraint companies_pin_format         check (pin is null or pin ~ '^[1-9][0-9]{5}$') not valid,
  add constraint companies_state_code_format  check (state_code is null or state_code ~ '^[0-9]{2}$') not valid,
  add constraint companies_email_format       check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$') not valid,
  add constraint companies_fy_format          check (fy ~ '^[0-9]{4}-[0-9]{2}$' and (left(fy, 4)::int + 1) % 100 = right(fy, 2)::int) not valid,
  add constraint companies_gstin_pan_state    check (gstin is null or ((pan is null or substr(gstin, 3, 10) = pan) and (state_code is null or left(gstin, 2) = state_code))) not valid,
  add constraint companies_unregistered_gstin check (gst_type <> 'Unregistered' or gstin is null) not valid,
  add constraint companies_tds_range          check (tds_commission_pct between 0 and 100) not valid,
  add constraint companies_delivery_days      check (default_delivery_days between 0 and 365) not valid,
  add constraint companies_default_is_active  check (not is_default or status = 'Active') not valid;

create unique index if not exists companies_abbr_key on public.companies (abbr);
create unique index if not exists companies_gstin_key on public.companies (gstin) where gstin is not null;
create unique index if not exists companies_single_default on public.companies ((true)) where is_default;

-- Recommended fields, shown as warnings only (an Active company may be saved without them).
-- Exposed to PostgREST as a computed field (select=*,company_missing_fields).
create or replace function public.company_missing_fields(c public.companies)
returns text[]
language sql stable
set search_path = ''
as $$
  select array_remove(array[
    case when nullif(btrim(c.code), '') is null then 'code' end,
    case when nullif(btrim(c.legal_name), '') is null then 'legal_name' end,
    case when c.entity_type is null then 'entity_type' end,
    case when c.entity_type in ('LLP', 'Private Limited', 'OPC') and c.cin is null then 'cin' end,
    case when c.gst_type <> 'Unregistered' and c.gstin is null then 'gstin' end,
    case when c.pan is null then 'pan' end,
    case when c.state_code is null or nullif(btrim(c.state_name), '') is null then 'state' end,
    case when nullif(btrim(c.reg_address), '') is null then 'reg_address' end,
    case when nullif(btrim(c.city), '') is null then 'city' end,
    case when c.pin is null then 'pin' end,
    case when nullif(btrim(c.phone), '') is null then 'phone' end,
    case when c.email is null then 'email' end,
    case when nullif(btrim(c.signatory_name), '') is null then 'signatory_name' end
  ], null);
$$;

create or replace function private.companies_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.code       := upper(btrim(new.code));
  new.legal_name := btrim(new.legal_name);
  new.gstin      := nullif(upper(btrim(new.gstin)), '');
  new.pan        := nullif(upper(btrim(new.pan)), '');
  new.tan        := nullif(upper(btrim(new.tan)), '');
  new.cin        := nullif(upper(btrim(new.cin)), '');
  new.email      := nullif(lower(btrim(new.email)), '');
  if new.gstin is not null then
    new.pan        := coalesce(new.pan, substr(new.gstin, 3, 10));
    new.state_code := coalesce(nullif(btrim(new.state_code), ''), left(new.gstin, 2));
  end if;

  if tg_op = 'INSERT' then
    new.abbr := coalesce(nullif(upper(btrim(new.abbr)), ''), public.company_abbr(new.legal_name));
    if new.abbr is null then
      raise exception 'Could not derive an abbreviation from the legal name' using errcode = '23514';
    end if;
    new.is_default := new.status = 'Active' and not exists (select 1 from public.companies where is_default);
  else
    if new.abbr is distinct from old.abbr then
      raise exception 'Company abbreviation cannot be changed after creation' using errcode = '23514';
    end if;
    if old.is_default and not new.is_default and pg_trigger_depth() = 1 then
      raise exception 'Make another company the default instead of clearing this one' using errcode = '23514';
    end if;
  end if;

  if new.is_default and (tg_op = 'INSERT' or not old.is_default) then
    update public.companies set is_default = false where is_default and id <> new.id;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function private.companies_before_delete()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.is_default then
    raise exception 'The default company cannot be deleted' using errcode = '23514';
  end if;
  if exists (select 1 from public.purchase_docs where company_id = old.id)
     or exists (select 1 from public.payments where company_id = old.id)
     or exists (select 1 from public.document_series where company_id = old.id and next_number > start_number) then
    raise exception 'Company has documents; deactivate it instead' using errcode = '23503';
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Bank accounts (repeatable, exactly one default per company)
-- ---------------------------------------------------------------------------
create table if not exists public.company_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  account_name text not null check (btrim(account_name) <> ''),
  bank_name text not null check (btrim(bank_name) <> ''),
  branch text,
  account_no text not null check (account_no ~ '^[0-9]{9,18}$'),
  account_no_last4 text generated always as (right(account_no, 4)) stored,
  ifsc text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  upi_id text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$'),
  is_default boolean not null default false,
  created_by uuid default auth.uid() references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_bank_single_default on public.company_bank_accounts (company_id) where is_default;
create unique index if not exists company_bank_account_unique on public.company_bank_accounts (company_id, ifsc, account_no);

create or replace function private.company_bank_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.ifsc       := upper(btrim(new.ifsc));
  new.account_no := regexp_replace(new.account_no, '\s', '', 'g');
  new.upi_id     := nullif(btrim(new.upi_id), '');
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if not exists (select 1 from public.company_bank_accounts where company_id = new.company_id and is_default) then
      new.is_default := true;
    end if;
  else
    if new.company_id <> old.company_id then
      raise exception 'A bank account cannot be moved to another company' using errcode = '23514';
    end if;
    if old.is_default and not new.is_default and pg_trigger_depth() = 1 then
      raise exception 'Mark another account as default instead of clearing this one' using errcode = '23514';
    end if;
  end if;

  if new.is_default then
    update public.company_bank_accounts
    set is_default = false
    where company_id = new.company_id and is_default and id <> new.id;
  end if;
  return new;
end;
$$;

create or replace function private.company_bank_after_delete()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.is_default then
    update public.company_bank_accounts
    set is_default = true
    where id = (
      select id from public.company_bank_accounts
      where company_id = old.company_id
      order by created_at
      limit 1
    );
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Dispatch / godown locations reuse delivery_locations (owner_type = 'COMPANY')
-- ---------------------------------------------------------------------------
update public.delivery_locations d
set is_default = false
where d.owner_type = 'COMPANY'
  and d.is_default
  and d.id <> (
    select d2.id from public.delivery_locations d2
    where d2.company_id = d.company_id and d2.owner_type = 'COMPANY' and d2.is_default
    order by d2.created_at desc
    limit 1
  );

create unique index if not exists delivery_locations_company_single_default
  on public.delivery_locations (company_id)
  where is_default and owner_type = 'COMPANY';

create or replace function private.company_location_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.owner_type = 'COMPANY' and new.is_default then
    update public.delivery_locations
    set is_default = false
    where company_id = new.company_id and owner_type = 'COMPANY' and is_default and id <> new.id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Document series: {DOC}-{ABBR}-{COUNTER}, counter starts at 91010, never resets
-- ---------------------------------------------------------------------------
alter table public.document_series
  add column if not exists start_number bigint not null default 91010,
  add column if not exists updated_at timestamptz not null default now();

alter table public.document_series
  alter column next_number set default 91010,
  alter column padding set default 0;

-- Move existing PO (P0300419...) and PI (PI-000001...) series to the new format.
-- Old numbers already printed (e.g. P0300419) stay on their documents and are never reissued:
-- the new prefix makes the namespaces disjoint.
update public.document_series s
set prefix = s.doc_type || '-' || c.abbr || '-',
    next_number = 91010,
    start_number = 91010,
    padding = 0,
    updated_at = now()
from public.companies c
where c.id = s.company_id;

insert into public.document_series (company_id, doc_type, prefix, next_number, start_number, padding)
select c.id, t.doc_type, t.doc_type || '-' || c.abbr || '-', 91010, 91010, 0
from public.companies c
cross join (values ('PO'), ('PI'), ('SO'), ('SI'), ('CN')) as t(doc_type)
on conflict (company_id, doc_type) do nothing;

alter table public.document_series
  add constraint document_series_doc_type_check check (doc_type in ('PO', 'PI', 'SO', 'SI', 'CN')),
  add constraint document_series_start_min check (start_number >= 91010),
  add constraint document_series_next_ge_start check (next_number >= start_number);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_series'::regclass and contype = 'f'
  ) then
    alter table public.document_series
      add constraint document_series_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_docs'::regclass and contype = 'f'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.purchase_docs'::regclass and attname = 'company_id')]
  ) then
    alter table public.purchase_docs
      add constraint purchase_docs_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass and contype = 'f'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.payments'::regclass and attname = 'company_id')]
  ) then
    alter table public.payments
      add constraint payments_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
end;
$$;

create or replace function private.companies_after_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.document_series (company_id, doc_type, prefix, next_number, start_number, padding)
  select new.id, t.doc_type, t.doc_type || '-' || new.abbr || '-', 91010, 91010, 0
  from (values ('PO'), ('PI'), ('SO'), ('SI'), ('CN')) as t(doc_type)
  on conflict (company_id, doc_type) do nothing;
  return null;
end;
$$;

-- Details a company must have before it can issue a PO, PI or SI.
-- Exposed as a computed field (select=*,company_document_blockers) for the UI.
create or replace function public.company_document_blockers(c public.companies)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select array_remove(array[
    case when c.gstin is null then 'GSTIN' end,
    case when c.pan is null then 'PAN' end,
    case when nullif(btrim(c.reg_address), '') is null then 'registered address' end,
    case when c.state_code is null then 'state code' end,
    case when not exists (
      select 1 from public.company_bank_accounts b where b.company_id = c.id and b.is_default
    ) then 'default bank account' end
  ], null);
$$;

revoke execute on function public.company_document_blockers(public.companies) from public, anon;
grant execute on function public.company_document_blockers(public.companies) to authenticated;

-- The numbering function. The row lock serialises concurrent callers per (company, doc type);
-- the increment commits or rolls back with the caller's transaction, and nothing ever decrements,
-- so cancelled numbers are never reissued.
create or replace function public.next_document_number(p_company_id uuid, p_doc_type text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_series public.document_series%rowtype;
  v_company public.companies%rowtype;
  v_blockers text[];
begin
  if p_doc_type is null or p_doc_type not in ('PO', 'PI', 'SO', 'SI', 'CN') then
    raise exception 'Unknown document type %', p_doc_type using errcode = '22023';
  end if;

  select * into v_company from public.companies where id = p_company_id;
  if not found then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;
  if v_company.status <> 'Active' then
    raise exception 'Company is inactive; documents cannot be numbered' using errcode = '23514';
  end if;

  if p_doc_type in ('PO', 'PI', 'SI') then
    v_blockers := public.company_document_blockers(v_company);
    if cardinality(v_blockers) > 0 then
      raise exception 'Cannot create % for %: add %', p_doc_type, v_company.legal_name, array_to_string(v_blockers, ', ')
        using errcode = '23514', hint = 'Open Companies > ' || v_company.legal_name || ' to complete these details.';
    end if;
  end if;

  select * into v_series
  from public.document_series
  where company_id = p_company_id and doc_type = p_doc_type
  for update;
  if not found then
    raise exception 'Document series % is not configured for this company', p_doc_type using errcode = 'P0002';
  end if;

  update public.document_series
  set next_number = v_series.next_number + 1, updated_at = now()
  where id = v_series.id;

  return v_series.prefix || v_series.next_number::text;
end;
$$;

-- Only server-side RPCs/triggers may burn numbers.
revoke execute on function public.next_document_number(uuid, text) from public, anon, authenticated;
grant execute on function public.next_document_number(uuid, text) to service_role;

create or replace function public.set_document_series_start(p_company_id uuid, p_doc_type text, p_start_number bigint)
returns public.document_series
language plpgsql security definer
set search_path = ''
as $$
declare
  v_series public.document_series%rowtype;
begin
  if not private.is_company_owner() then
    raise exception 'Only the owner can change document series' using errcode = '42501';
  end if;
  if p_start_number is null or p_start_number < 91010 then
    raise exception 'Starting number must be 91010 or higher' using errcode = '22023';
  end if;

  select * into v_series
  from public.document_series
  where company_id = p_company_id and doc_type = p_doc_type
  for update;
  if not found then
    raise exception 'Document series not found' using errcode = 'P0002';
  end if;
  if v_series.next_number <> v_series.start_number then
    raise exception 'The starting number can only be changed before the first % is issued', p_doc_type using errcode = '23514';
  end if;

  update public.document_series
  set start_number = p_start_number, next_number = p_start_number, updated_at = now()
  where id = v_series.id
  returning * into v_series;
  return v_series;
end;
$$;

revoke execute on function public.set_document_series_start(uuid, text, bigint) from public, anon;
grant execute on function public.set_document_series_start(uuid, text, bigint) to authenticated;

create or replace view public.document_series_overview
with (security_invoker = true) as
select
  s.id,
  s.company_id,
  s.doc_type,
  s.start_number,
  s.next_number,
  s.prefix || s.next_number::text as next_preview,
  case when s.next_number > s.start_number then s.prefix || (s.next_number - 1)::text end as last_issued,
  s.next_number - s.start_number as issued_count
from public.document_series s;

grant select on public.document_series_overview to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Purchase docs wired to the series function + company snapshot + books lock
-- ---------------------------------------------------------------------------
create or replace function private.company_snapshot(p_company_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select (to_jsonb(c) - array['created_by', 'updated_by', 'created_at', 'updated_at'])
    || jsonb_build_object(
      'bank', case when c.show_bank_on_docs then (
        select jsonb_build_object(
          'account_name', b.account_name, 'bank_name', b.bank_name, 'branch', b.branch,
          'account_no', b.account_no, 'ifsc', b.ifsc, 'upi_id', b.upi_id)
        from public.company_bank_accounts b
        where b.company_id = c.id and b.is_default
      ) end,
      'snapshot_at', now()
    )
  from public.companies c
  where c.id = p_company_id;
$$;

revoke execute on function private.company_snapshot(uuid) from public, anon, authenticated;

create or replace function public.allocate_purchase_order_number()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_locked date;
begin
  select books_locked_until into v_locked from public.companies where id = new.company_id;
  if v_locked is not null and coalesce(new.doc_date, current_date) <= v_locked then
    raise exception 'Books are locked up to %', v_locked using errcode = '23514';
  end if;

  -- Always server-assigned; any client-supplied number is ignored.
  new.po_number := public.next_document_number(new.company_id, 'PO');
  new.number    := new.po_number;
  new.po_date   := coalesce(new.po_date, new.doc_date, current_date);
  return new;
end;
$$;

create or replace function public.submit_purchase_doc(p_doc_id uuid)
returns public.purchase_docs
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc public.purchase_docs%rowtype;
  v_locked date;
begin
  if coalesce(public.app_role(), '') not in ('OWNER', 'PARTNER') then
    raise exception 'You are not allowed to invoice purchase orders' using errcode = '42501';
  end if;

  select * into v_doc from public.purchase_docs where id = p_doc_id for update;
  if not found then raise exception 'Purchase document not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'DRAFT' then raise exception 'Only a created purchase order can be invoiced'; end if;
  if coalesce(btrim(v_doc.vendor_invoice_no), '') = '' or v_doc.vendor_invoice_date is null then
    raise exception 'Vendor invoice number and date are required before payment';
  end if;
  if v_doc.ship_to is null or coalesce(v_doc.ship_to->>'name', '') = '' or coalesce(v_doc.ship_to->>'line1', '') = '' then
    raise exception 'Complete ship-to details are required';
  end if;

  select books_locked_until into v_locked from public.companies where id = v_doc.company_id;
  if v_locked is not null and coalesce(v_doc.pi_date, current_date) <= v_locked then
    raise exception 'Books are locked up to %', v_locked using errcode = '23514';
  end if;

  update public.purchase_docs
  set pi_number        = public.next_document_number(v_doc.company_id, 'PI'),
      pi_date          = coalesce(pi_date, current_date),
      status           = 'SUBMITTED',
      submitted_at     = now(),
      submitted_by     = auth.uid(),
      vendor_snapshot  = (select to_jsonb(v) from public.vendors v where v.id = v_doc.vendor_id),
      company_snapshot = private.company_snapshot(v_doc.company_id),
      updated_by       = auth.uid(),
      updated_at       = now()
  where id = p_doc_id
  returning * into v_doc;
  return v_doc;
end;
$$;

revoke execute on function public.submit_purchase_doc(uuid) from public, anon;
grant execute on function public.submit_purchase_doc(uuid) to authenticated;

-- GST split: same state -> CGST + SGST, otherwise IGST
create or replace function public.gst_supply_type(p_company_state_code text, p_party_state_code text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p_company_state_code is not null and p_company_state_code = p_party_state_code then 'CGST_SGST'
    else 'IGST'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Audit every change on company tables (account numbers never written to the log)
-- ---------------------------------------------------------------------------
create or replace function private.audit_company_tables()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb;
  v_changes jsonb;
  v_ignored text[] := array['updated_at', 'updated_by', 'account_no'];
begin
  if tg_table_name = 'document_series' then
    v_ignored := v_ignored || 'next_number'::text;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('from', v_old->n.key, 'to', n.value))
    into v_changes
    from jsonb_each(v_new) n
    where n.key <> all (v_ignored) and (v_old->n.key) is distinct from n.value;

    if v_old->>'account_no' is distinct from v_new->>'account_no' then
      v_changes := coalesce(v_changes, '{}'::jsonb) || jsonb_build_object('account_no', 'changed');
    end if;
    if v_changes is null then
      return null;
    end if;
  end if;

  v_row := coalesce(v_new, v_old) - 'account_no';

  insert into public.audit_log (entity_type, entity_id, action, actor_id, metadata)
  values (
    tg_table_name,
    (v_row->>'id')::uuid,
    tg_op,
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    jsonb_build_object(
      'company_id', coalesce(v_row->>'company_id', case when tg_table_name = 'companies' then v_row->>'id' end),
      'changes', v_changes,
      'row', case when tg_op <> 'UPDATE' then v_row end
    )
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists companies_before_write on public.companies;
create trigger companies_before_write before insert or update on public.companies
  for each row execute function private.companies_before_write();

drop trigger if exists companies_before_delete on public.companies;
create trigger companies_before_delete before delete on public.companies
  for each row execute function private.companies_before_delete();

drop trigger if exists companies_after_insert on public.companies;
create trigger companies_after_insert after insert on public.companies
  for each row execute function private.companies_after_insert();

drop trigger if exists company_bank_before_write on public.company_bank_accounts;
create trigger company_bank_before_write before insert or update on public.company_bank_accounts
  for each row execute function private.company_bank_before_write();

drop trigger if exists company_bank_after_delete on public.company_bank_accounts;
create trigger company_bank_after_delete after delete on public.company_bank_accounts
  for each row execute function private.company_bank_after_delete();

drop trigger if exists company_location_before_write on public.delivery_locations;
create trigger company_location_before_write before insert or update on public.delivery_locations
  for each row execute function private.company_location_before_write();

drop trigger if exists audit_companies on public.companies;
create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function private.audit_company_tables();

drop trigger if exists audit_company_bank_accounts on public.company_bank_accounts;
create trigger audit_company_bank_accounts after insert or update or delete on public.company_bank_accounts
  for each row execute function private.audit_company_tables();

drop trigger if exists audit_document_series on public.document_series;
create trigger audit_document_series after insert or update or delete on public.document_series
  for each row execute function private.audit_company_tables();

drop trigger if exists audit_delivery_locations on public.delivery_locations;
create trigger audit_delivery_locations after insert or update or delete on public.delivery_locations
  for each row execute function private.audit_company_tables();

revoke execute on function
  private.companies_before_write(), private.companies_before_delete(), private.companies_after_insert(),
  private.company_bank_before_write(), private.company_bank_after_delete(),
  private.company_location_before_write(), private.audit_company_tables()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. RLS: every active employee reads; only the OWNER tier writes
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_bank_accounts enable row level security;
alter table public.document_series enable row level security;
alter table public.delivery_locations enable row level security;

drop policy if exists "Authenticated users can insert companies" on public.companies;
drop policy if exists "Authenticated users can update companies" on public.companies;
drop policy if exists "Authenticated users can view companies" on public.companies;

create policy companies_select on public.companies for select to authenticated
  using ((select private.is_active_employee()));
create policy companies_insert on public.companies for insert to authenticated
  with check ((select private.is_company_owner()));
create policy companies_update on public.companies for update to authenticated
  using ((select private.is_company_owner()))
  with check ((select private.is_company_owner()));
create policy companies_delete on public.companies for delete to authenticated
  using ((select private.is_company_owner()));

create policy company_bank_select on public.company_bank_accounts for select to authenticated
  using ((select private.is_active_employee()));
create policy company_bank_insert on public.company_bank_accounts for insert to authenticated
  with check ((select private.is_company_owner()));
create policy company_bank_update on public.company_bank_accounts for update to authenticated
  using ((select private.is_company_owner()))
  with check ((select private.is_company_owner()));
create policy company_bank_delete on public.company_bank_accounts for delete to authenticated
  using ((select private.is_company_owner()));

-- Full account numbers are not selectable by clients; everyone sees account_no_last4.
-- Owners fetch the full number through company_bank_account_number() when editing.
revoke select on public.company_bank_accounts from anon, authenticated;
grant select (id, company_id, account_name, bank_name, branch, account_no_last4, ifsc, upi_id,
              is_default, created_by, created_at, updated_at)
  on public.company_bank_accounts to authenticated;

create or replace function public.company_bank_account_number(p_account_id uuid)
returns text
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if coalesce(public.app_role(), '') <> 'OWNER' then
    raise exception 'Only owners can view full account numbers' using errcode = '42501';
  end if;
  return (select account_no from public.company_bank_accounts where id = p_account_id);
end;
$$;

revoke execute on function public.company_bank_account_number(uuid) from public, anon;
grant execute on function public.company_bank_account_number(uuid) to authenticated;

-- Series: read-only through the API; changes only via set_document_series_start / next_document_number
drop policy if exists document_series_select on public.document_series;
create policy document_series_select on public.document_series for select to authenticated
  using ((select private.is_active_employee()));

-- Company locations: OWNER or PARTNER may add (new ship-to from the PO screen);
-- only OWNER edits or deletes. Customer locations keep the existing employee access.
drop policy if exists delivery_locations_employee_access on public.delivery_locations;
create policy delivery_locations_select on public.delivery_locations for select to authenticated
  using ((select private.is_active_employee()));
create policy delivery_locations_insert on public.delivery_locations for insert to authenticated
  with check (
    (owner_type = 'CUSTOMER' and (select private.is_active_employee()))
    or (owner_type = 'COMPANY' and (select public.app_role()) in ('OWNER', 'PARTNER'))
  );
create policy delivery_locations_update on public.delivery_locations for update to authenticated
  using (
    (owner_type = 'CUSTOMER' and (select private.is_active_employee()))
    or (owner_type = 'COMPANY' and (select private.is_company_owner()))
  )
  with check (
    (owner_type = 'CUSTOMER' and (select private.is_active_employee()))
    or (owner_type = 'COMPANY' and (select private.is_company_owner()))
  );
create policy delivery_locations_delete on public.delivery_locations for delete to authenticated
  using (
    (owner_type = 'CUSTOMER' and (select private.is_active_employee()))
    or (owner_type = 'COMPANY' and (select private.is_company_owner()))
  );

-- ---------------------------------------------------------------------------
-- 10b. Purchase / payment / audit policies and RPCs moved onto app_role()
-- ---------------------------------------------------------------------------
drop policy if exists purchase_docs_select on public.purchase_docs;
drop policy if exists purchase_docs_insert on public.purchase_docs;
drop policy if exists purchase_docs_update on public.purchase_docs;
drop policy if exists purchase_docs_delete on public.purchase_docs;
create policy purchase_docs_select on public.purchase_docs for select to authenticated
  using ((select public.app_role()) is not null);
create policy purchase_docs_insert on public.purchase_docs for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.app_role()) in ('OWNER', 'PARTNER'));
create policy purchase_docs_update on public.purchase_docs for update to authenticated
  using (status = 'DRAFT' and (select public.app_role()) in ('OWNER', 'PARTNER'))
  with check ((select public.app_role()) in ('OWNER', 'PARTNER'));
create policy purchase_docs_delete on public.purchase_docs for delete to authenticated
  using (created_by = (select auth.uid()) and status = 'DRAFT' and (select public.app_role()) in ('OWNER', 'PARTNER'));

drop policy if exists purchase_doc_lines_write on public.purchase_doc_lines;
create policy purchase_doc_lines_write on public.purchase_doc_lines for all to authenticated
  using (
    exists (select 1 from public.purchase_docs d where d.id = purchase_doc_lines.purchase_doc_id and d.status = 'DRAFT')
    and (select public.app_role()) in ('OWNER', 'PARTNER')
  )
  with check (
    exists (select 1 from public.purchase_docs d where d.id = purchase_doc_lines.purchase_doc_id and d.status = 'DRAFT')
    and (select public.app_role()) in ('OWNER', 'PARTNER')
  );

drop policy if exists payments_select on public.payments;
drop policy if exists payments_write on public.payments;
create policy payments_select on public.payments for select to authenticated
  using ((select public.app_role()) is not null);
create policy payments_write on public.payments for all to authenticated
  using ((select public.app_role()) = 'OWNER')
  with check ((select public.app_role()) = 'OWNER');

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.app_role()) is not null);

create or replace function public.revise_purchase_doc(p_doc_id uuid)
returns public.purchase_docs
language plpgsql security definer
set search_path = ''
as $$
declare
  result public.purchase_docs%rowtype;
begin
  update public.purchase_docs
  set status = 'REVISED', updated_at = now(), updated_by = auth.uid()
  where id = p_doc_id
    and status = 'SUBMITTED'
    and (
      public.app_role() = 'OWNER'
      or (public.app_role() = 'PARTNER' and created_by = (select auth.uid()))
    )
  returning * into result;
  if not found then
    raise exception 'Only submitted documents you created (or any, for owners) can be revised' using errcode = '42501';
  end if;
  insert into public.audit_log (entity_type, entity_id, action) values ('purchase_doc', p_doc_id, 'REVISED');
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Storage: private bucket "company-assets", PNG/JPG/SVG, max 1 MB.
--     Paths: {company_id}/logo.<ext>, {company_id}/signature.<ext>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-assets', 'company-assets', false, 1048576, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_assets_select on storage.objects;
drop policy if exists company_assets_insert on storage.objects;
drop policy if exists company_assets_update on storage.objects;
drop policy if exists company_assets_delete on storage.objects;

create policy company_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'company-assets' and (select private.is_active_employee()));
create policy company_assets_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-assets'
    and (select private.is_company_owner())
    and (storage.foldername(name))[1] in (select id::text from public.companies)
  );
create policy company_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'company-assets' and (select private.is_company_owner()))
  with check (
    bucket_id = 'company-assets'
    and (select private.is_company_owner())
    and (storage.foldername(name))[1] in (select id::text from public.companies)
  );
create policy company_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-assets' and (select private.is_company_owner()));

-- ---------------------------------------------------------------------------
-- 12. Validate format constraints; legacy rows that fail stay NOT VALID (still enforced on writes)
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.companies'::regclass and not convalidated
  loop
    begin
      execute format('alter table public.companies validate constraint %I', c.conname);
    exception when check_violation then
      raise notice 'Existing company rows violate %, left NOT VALID', c.conname;
    end;
  end loop;
end;
$$;

commit;
