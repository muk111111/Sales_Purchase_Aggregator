-- A company must have a default bank account before it can issue a PO, PI or SI.
-- GSTIN, PAN, registered address and state code remain optional (see
-- 20261004160000_company_name_only_required.sql) -- this only adds the bank account check.

create or replace function public.company_document_blockers(c public.companies)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when not exists (
      select 1 from public.company_bank_accounts b
      where b.company_id = c.id and b.is_default
    ) then 'a default bank account' end
  ], null);
$$;

comment on function public.company_document_blockers(public.companies) is
  'Blocks PO/PI/SI creation only when the company has no default bank account. legal_name is the only mandatory company field.';
