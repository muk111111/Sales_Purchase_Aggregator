-- PO/PI clean start.
-- Old purchase tables and numbering functions are moved (not dropped) into a locked backup schema,
-- so this migration is fully reversible with down/20261004130000_popi_cleanup.down.sql.
-- File backups: backups/po-pi-<timestamp>/ (CSV + JSON), taken before this migration.
begin;

create schema if not exists backup_popi_20261004;
revoke all on schema backup_popi_20261004 from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema backup_popi_20261004 from %I', r);
    end if;
  end loop;
end;
$$;

create table backup_popi_20261004.object_defs as
select 'function'::text as kind, n.nspname || '.' || p.proname as name, pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in ('allocate_purchase_order_number', 'submit_purchase_doc', 'cancel_purchase_doc', 'revise_purchase_doc'))
   or (n.nspname = 'private' and p.proname = 'companies_before_delete')
union all
select 'trigger', t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t
where t.tgrelid = 'public.purchase_docs'::regclass and not t.tgisinternal;

create table backup_popi_20261004.document_series as select * from public.document_series;

drop trigger if exists purchase_docs_allocate_po_number on public.purchase_docs;

alter table public.payments set schema backup_popi_20261004;
alter table public.purchase_doc_lines set schema backup_popi_20261004;
alter table public.purchase_docs set schema backup_popi_20261004;

alter function public.allocate_purchase_order_number() set schema backup_popi_20261004;
alter function public.submit_purchase_doc(uuid) set schema backup_popi_20261004;
alter function public.cancel_purchase_doc(uuid, text) set schema backup_popi_20261004;
alter function public.revise_purchase_doc(uuid) set schema backup_popi_20261004;

revoke all on all tables in schema backup_popi_20261004 from public;
revoke all on all functions in schema backup_popi_20261004 from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema backup_popi_20261004 from %I', r);
      execute format('revoke all on all functions in schema backup_popi_20261004 from %I', r);
    end if;
  end loop;
end;
$$;

-- A company "has documents" once any series has issued a number; numbers are only consumed by saved documents.
create or replace function private.companies_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_default then
    raise exception 'The default company cannot be deleted' using errcode = '23514';
  end if;
  if exists (select 1 from public.document_series where company_id = old.id and next_number > start_number) then
    raise exception 'Company has documents; deactivate it instead' using errcode = '23503';
  end if;
  return old;
end;
$$;

-- Only the five company series may number documents; every company gets all five.
delete from public.document_series where doc_type not in ('PO', 'PI', 'SO', 'SI', 'CN');
insert into public.document_series (company_id, doc_type, prefix, start_number, next_number)
select c.id, t.doc_type, t.doc_type || '-' || c.abbr || '-', 91010, 91010
from public.companies c
cross join (values ('PO'), ('PI'), ('SO'), ('SI'), ('CN')) as t(doc_type)
on conflict (company_id, doc_type) do nothing;

update public.document_series
set start_number = 91010, next_number = 91010, updated_at = now()
where doc_type in ('PO', 'PI');

alter table public.document_series drop constraint if exists document_series_number_length;
alter table public.document_series add constraint document_series_number_length
  check (char_length(prefix) + char_length(next_number::text) <= 16);

commit;
