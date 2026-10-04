-- POs, purchase invoices and sales invoices were blocked until a company had
-- GSTIN, PAN, registered address, state code and a default bank account.
-- Only the legal name is mandatory on a company now; every other field is
-- informational (see company_missing_fields) and never blocks numbering.
create or replace function public.company_document_blockers(c public.companies)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select '{}'::text[];
$$;
