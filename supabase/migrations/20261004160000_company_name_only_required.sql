-- Only legal_name is mandatory on a company. Nothing else -- GSTIN, PAN, registered
-- address, state code, default bank account -- blocks PO / PI / SI creation, and the
-- company code is auto-generated when left blank so the UI never has to require it.

-- 1. Document creation is never blocked by incomplete company tax/address/banking details.
create or replace function public.company_document_blockers(c public.companies)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array[]::text[];
$$;

comment on function public.company_document_blockers(public.companies) is
  'Always empty: only legal_name is required on a company, so PO/PI/SI creation is never blocked on tax/address/bank details.';

-- 2. The "missing fields" completeness hint only ever flags legal_name (which the NOT NULL
--    constraint already guarantees is set), matching the single mandatory field.
create or replace function public.company_missing_fields(c public.companies)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_remove(array[
    case when nullif(btrim(c.legal_name), '') is null then 'legal_name' end
  ], null);
$$;

-- 3. Auto-generate the company code (e.g. C03) when left blank, so creating a company
--    never requires anything beyond the legal name.
create or replace function private.companies_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    new.code := nullif(upper(btrim(new.code)), '');
    if new.code is null then
      select 'C' || lpad((coalesce(max(substring(code from '^C([0-9]+)$')::int), 0) + 1)::text, 2, '0')
      into new.code
      from public.companies
      where code ~ '^C[0-9]+$';
    end if;

    new.abbr := coalesce(nullif(upper(btrim(new.abbr)), ''), public.company_abbr(new.legal_name));
    if new.abbr is null then
      raise exception 'Could not derive an abbreviation from the legal name' using errcode = '23514';
    end if;
    new.is_default := new.status = 'Active' and not exists (select 1 from public.companies where is_default);
  else
    new.code := upper(btrim(new.code));
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

revoke execute on function public.company_document_blockers(public.companies) from public, anon;
grant execute on function public.company_document_blockers(public.companies) to authenticated;
