-- Purchase Orders, Purchase Invoices and Payments.
-- All state changes go through the RPCs below (security invoker, one transaction each).
-- Direct client UPDATE/DELETE is rejected by private.popi_guard().
begin;

-- ---------------------------------------------------------------- vendor attributes used by PO/PI
alter table public.vendors
  add column if not exists address text,
  add column if not exists state_code text,
  add column if not exists gst_registration text not null default 'REGULAR',
  add column if not exists msme_registered boolean not null default false,
  add column if not exists tds_section text,
  add column if not exists tds_pct numeric(5,2);
alter table public.vendors drop constraint if exists vendors_gst_registration_check;
alter table public.vendors add constraint vendors_gst_registration_check
  check (gst_registration in ('REGULAR', 'COMPOSITION', 'UNREGISTERED'));
alter table public.vendors drop constraint if exists vendors_tds_section_check;
alter table public.vendors add constraint vendors_tds_section_check
  check (tds_section is null or tds_section in ('194Q', '194C', '194J', '194H', '194I'));
update public.vendors set state_code = left(gstin, 2)
where state_code is null and gstin ~ '^[0-9]{2}';

-- ---------------------------------------------------------------- helpers
create or replace function private.popi_rpc_begin()
returns void
language sql
set search_path = ''
as $$ select set_config('app.popi_rpc', 'on', true); $$;

create or replace function private.popi_in_rpc()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('app.popi_rpc', true), '') = 'on'; $$;

create or replace function private.popi_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.popi_in_rpc() and current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'Purchase documents can only be changed through the app actions'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.popi_audit(p_entity text, p_id uuid, p_action text, p_meta jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (entity_type, entity_id, action, actor_id, metadata)
  values (p_entity, p_id, p_action, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function private.popi_require_role(p_roles text[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(public.app_role(), '') <> all (p_roles) then
    raise exception 'You do not have permission for this action' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.vendor_snapshot(p_vendor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (to_jsonb(v) - array['created_at', 'updated_at', 'notes']) || jsonb_build_object('snapshot_at', now())
  from public.vendors v where v.id = p_vendor_id;
$$;

create or replace function private.employee_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select e.full_name from public.employees e where e.id = p_id; $$;

create or replace function private.employee_is_active(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select e.is_active from public.employees e where e.id = p_id), false); $$;

-- Numbers for PO/PI may only be consumed inside a PO/PI RPC, so no number is ever burned without a saved document.
create or replace function public.next_document_number(p_company_id uuid, p_doc_type text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.document_series%rowtype;
  v_company public.companies%rowtype;
  v_blockers text[];
  v_number text;
begin
  if p_doc_type is null or p_doc_type not in ('PO', 'PI', 'SO', 'SI', 'CN') then
    raise exception 'Unknown document type %', p_doc_type using errcode = '22023';
  end if;
  if p_doc_type in ('PO', 'PI') and not private.popi_in_rpc() then
    raise exception '% numbers are issued only when the document is saved', p_doc_type using errcode = '42501';
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

  v_number := v_series.prefix || v_series.next_number::text;
  if char_length(v_number) > 16 then
    raise exception 'Document number % exceeds 16 characters (GST limit)', v_number using errcode = '23514';
  end if;

  update public.document_series
  set next_number = v_series.next_number + 1, updated_at = now()
  where id = v_series.id;

  return v_number;
end;
$$;

-- ---------------------------------------------------------------- tables
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  number text not null,
  po_date date not null,
  vendor_id uuid not null references public.vendors(id),
  vendor_quotation_ref text,
  purchase_type text not null check (purchase_type in ('STOCK', 'BILL_TO_SHIP_TO')),
  linked_sales_invoice_no text,
  partner_id uuid references public.employees(id),
  subject text not null default 'Purchase Order',
  intro_text text,
  internal_notes text,
  ship_to jsonb not null,
  ship_to_location_id uuid references public.delivery_locations(id) on delete set null,
  payment_basis text not null default 'DELIVERY'
    check (payment_basis in ('DELIVERY', 'PO_DATE', 'INVOICE_DATE', 'ADVANCE_BALANCE', 'FULL_ADVANCE', 'AGAINST_DELIVERY', 'CUSTOM')),
  payment_days integer not null default 45 check (payment_days between 0 and 365),
  advance_pct numeric(5,2) check (advance_pct is null or advance_pct between 0 and 100),
  payment_terms_text text not null,
  delivery_days integer not null default 5 check (delivery_days between 0 and 365),
  annexure_enabled boolean not null default true,
  annexure_heading text not null default 'Annexure A',
  annexure_terms jsonb not null default '[]'::jsonb check (jsonb_typeof(annexure_terms) = 'array'),
  round_off_enabled boolean not null default false,
  gst_mode text not null check (gst_mode in ('CGST_SGST', 'IGST')),
  taxable_total numeric(14,2) not null default 0,
  cgst_total numeric(14,2) not null default 0,
  sgst_total numeric(14,2) not null default 0,
  igst_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  round_off numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  status text not null default 'CREATED' check (status in ('CREATED', 'PI_CREATED', 'CANCELLED')),
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  vendor_snapshot jsonb not null,
  company_snapshot jsonb not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint purchase_orders_number_unique unique (company_id, number),
  constraint purchase_orders_number_length check (char_length(number) <= 16),
  constraint purchase_orders_bill_to_ship_to check (purchase_type <> 'BILL_TO_SHIP_TO' or nullif(btrim(linked_sales_invoice_no), '') is not null),
  constraint purchase_orders_cancel_reason check (status <> 'CANCELLED' or nullif(btrim(cancel_reason), '') is not null)
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  line_no integer not null,
  sku_id uuid not null references public.skus(id),
  sku_code text not null,
  item_name text not null,
  description text,
  hsn text not null check (hsn ~ '^[0-9]{2,8}$'),
  qty numeric(14,3) not null check (qty > 0),
  unit text not null,
  rate numeric(14,2) not null check (rate >= 0),
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  taxable numeric(14,2) not null,
  gst_pct numeric(5,2) not null check (gst_pct in (0, 5, 12, 18, 28)),
  gst_amount numeric(14,2) not null,
  line_total numeric(14,2) not null,
  unique (po_id, line_no)
);

create table public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  po_id uuid not null references public.purchase_orders(id),
  number text not null,
  pi_date date not null,
  vendor_id uuid not null references public.vendors(id),
  vendor_invoice_no text not null check (nullif(btrim(vendor_invoice_no), '') is not null),
  vendor_invoice_date date not null,
  vendor_invoice_path text,
  received_date date not null,
  due_date date not null,
  goods_moved boolean not null default true,
  eway_bill_no text,
  notes text,
  ship_to jsonb not null,
  payment_basis text not null,
  payment_days integer not null,
  advance_pct numeric(5,2),
  payment_terms_text text not null,
  delivery_days integer not null,
  annexure_enabled boolean not null,
  annexure_heading text not null,
  annexure_terms jsonb not null,
  subject text not null,
  intro_text text,
  round_off_enabled boolean not null default false,
  gst_mode text not null check (gst_mode in ('CGST_SGST', 'IGST')),
  itc_eligible boolean not null,
  taxable_total numeric(14,2) not null default 0,
  cgst_total numeric(14,2) not null default 0,
  sgst_total numeric(14,2) not null default 0,
  igst_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  round_off numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  paid_total numeric(14,2) not null default 0,
  paid_on date,
  status text not null default 'PI_CREATED' check (status in ('PI_CREATED', 'PAID', 'CANCELLED')),
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  vendor_snapshot jsonb not null,
  company_snapshot jsonb not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint purchase_invoices_number_unique unique (company_id, number),
  constraint purchase_invoices_number_length check (char_length(number) <= 16),
  constraint purchase_invoices_dates check (received_date >= vendor_invoice_date - 365),
  constraint purchase_invoices_cancel_reason check (status <> 'CANCELLED' or nullif(btrim(cancel_reason), '') is not null)
);
-- One active PI per PO today; drop this index to allow partial deliveries (multiple PIs) later.
create unique index purchase_invoices_one_active_per_po on public.purchase_invoices (po_id) where status <> 'CANCELLED';
create unique index purchase_invoices_vendor_invoice_unique on public.purchase_invoices (vendor_id, lower(btrim(vendor_invoice_no))) where status <> 'CANCELLED';
create index purchase_invoices_po_idx on public.purchase_invoices (po_id);

create table public.purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  pi_id uuid not null references public.purchase_invoices(id) on delete cascade,
  po_line_id uuid references public.purchase_order_lines(id),
  line_no integer not null,
  sku_id uuid not null references public.skus(id),
  sku_code text not null,
  item_name text not null,
  description text,
  hsn text not null check (hsn ~ '^[0-9]{2,8}$'),
  qty numeric(14,3) not null check (qty > 0),
  unit text not null,
  rate numeric(14,2) not null check (rate >= 0),
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  taxable numeric(14,2) not null,
  gst_pct numeric(5,2) not null check (gst_pct in (0, 5, 12, 18, 28)),
  gst_amount numeric(14,2) not null,
  line_total numeric(14,2) not null,
  unique (pi_id, line_no)
);

create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  pi_id uuid not null references public.purchase_invoices(id),
  company_id uuid not null references public.companies(id),
  vendor_id uuid not null references public.vendors(id),
  payment_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  mode text not null check (mode in ('NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE', 'CASH', 'CARD', 'ADJUSTED')),
  bank_account_id uuid not null references public.company_bank_accounts(id),
  reference text,
  cheque_no text,
  cheque_date date,
  cheque_bank text,
  tds_section text,
  tds_pct numeric(5,2) not null default 0 check (tds_pct between 0 and 100),
  tds_amount numeric(14,2) not null default 0 check (tds_amount >= 0),
  net_paid numeric(14,2) not null,
  proof_path text not null,
  paid_by uuid not null references public.employees(id),
  remarks text,
  overpayment_reason text,
  voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint purchase_payments_reference check (mode = 'CASH' or nullif(btrim(reference), '') is not null),
  constraint purchase_payments_cheque check (mode <> 'CHEQUE' or (cheque_no is not null and cheque_date is not null and cheque_bank is not null)),
  constraint purchase_payments_void_reason check (not voided or nullif(btrim(void_reason), '') is not null),
  constraint purchase_payments_net check (net_paid = amount - tds_amount)
);
create unique index purchase_payments_vendor_reference_unique
  on public.purchase_payments (vendor_id, lower(btrim(reference))) where not voided and reference is not null;
create index purchase_payments_pi_idx on public.purchase_payments (pi_id);

-- ---------------------------------------------------------------- guards, RLS, grants
do $$
declare t text;
begin
  foreach t in array array['purchase_orders', 'purchase_order_lines', 'purchase_invoices', 'purchase_invoice_lines', 'purchase_payments'] loop
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function private.popi_guard()', t || '_guard', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.app_role()) is not null)', t || '_select', t);
  end loop;
end;
$$;
grant delete on public.purchase_order_lines, public.purchase_invoice_lines to authenticated;

create policy purchase_orders_insert on public.purchase_orders for insert to authenticated
  with check ((select public.app_role()) in ('OWNER', 'PARTNER') and created_by = (select auth.uid()));
create policy purchase_orders_update on public.purchase_orders for update to authenticated
  using ((select public.app_role()) in ('OWNER', 'PARTNER')) with check ((select public.app_role()) in ('OWNER', 'PARTNER'));

create policy purchase_order_lines_write on public.purchase_order_lines for all to authenticated
  using ((select public.app_role()) in ('OWNER', 'PARTNER')
         and exists (select 1 from public.purchase_orders p where p.id = po_id and p.status = 'CREATED'))
  with check ((select public.app_role()) in ('OWNER', 'PARTNER')
         and exists (select 1 from public.purchase_orders p where p.id = po_id and p.status = 'CREATED'));

create policy purchase_invoices_insert on public.purchase_invoices for insert to authenticated
  with check ((select public.app_role()) in ('OWNER', 'PARTNER') and created_by = (select auth.uid()));
create policy purchase_invoices_update on public.purchase_invoices for update to authenticated
  using ((select public.app_role()) in ('OWNER', 'PARTNER')) with check ((select public.app_role()) in ('OWNER', 'PARTNER'));

create policy purchase_invoice_lines_write on public.purchase_invoice_lines for all to authenticated
  using ((select public.app_role()) in ('OWNER', 'PARTNER')
         and exists (select 1 from public.purchase_invoices i where i.id = pi_id and i.status = 'PI_CREATED'))
  with check ((select public.app_role()) in ('OWNER', 'PARTNER')
         and exists (select 1 from public.purchase_invoices i where i.id = pi_id and i.status = 'PI_CREATED'));

create policy purchase_payments_insert on public.purchase_payments for insert to authenticated
  with check ((select public.app_role()) in ('OWNER', 'PARTNER') and created_by = (select auth.uid()));
create policy purchase_payments_void on public.purchase_payments for update to authenticated
  using ((select public.app_role()) = 'OWNER') with check ((select public.app_role()) = 'OWNER');

-- ---------------------------------------------------------------- calculation helpers
create or replace function private.popi_validate_ship_to(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v_out jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Ship to address is required' using errcode = '23514';
  end if;
  foreach k in array array['name', 'line1', 'city', 'state', 'pin', 'contact_name', 'contact_phone'] loop
    if nullif(btrim(p->>k), '') is null then
      raise exception 'Ship to: % is required', replace(k, '_', ' ') using errcode = '23514';
    end if;
  end loop;
  if (p->>'pin') !~ '^[1-9][0-9]{5}$' then
    raise exception 'Ship to: PIN must be 6 digits' using errcode = '23514';
  end if;
  if nullif(btrim(p->>'gstin'), '') is not null and upper(btrim(p->>'gstin')) !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'Ship to: consignee GSTIN is invalid' using errcode = '23514';
  end if;
  select jsonb_object_agg(key, btrim(value))
  into v_out
  from jsonb_each_text(p)
  where key in ('name', 'line1', 'line2', 'city', 'state', 'state_code', 'pin', 'contact_name', 'contact_phone', 'gstin')
    and nullif(btrim(value), '') is not null;
  return v_out;
end;
$$;

create or replace function private.popi_payment_terms_text(p_basis text, p_days integer, p_advance numeric, p_custom text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_basis
    when 'DELIVERY' then format('Payment will be done %s days from the date of delivery', p_days)
    when 'PO_DATE' then format('Payment will be done %s days from the PO date', p_days)
    when 'INVOICE_DATE' then format('Payment will be done %s days from the invoice date', p_days)
    when 'ADVANCE_BALANCE' then format('%s%% advance with PO, balance %s days from the date of delivery', coalesce(p_advance, 0)::numeric(5,0), p_days)
    when 'FULL_ADVANCE' then '100% advance payment'
    when 'AGAINST_DELIVERY' then 'Payment against delivery'
    else coalesce(nullif(btrim(p_custom), ''), 'As agreed')
  end;
$$;

create or replace function private.popi_due_date(p_basis text, p_days integer, p_po_date date, p_invoice_date date, p_received date, p_pi_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_basis
    when 'PO_DATE' then p_po_date + p_days
    when 'INVOICE_DATE' then p_invoice_date + p_days
    when 'FULL_ADVANCE' then p_pi_date
    when 'AGAINST_DELIVERY' then p_received
    else p_received + p_days
  end;
$$;

-- Validates and normalises line payloads; amounts are always recomputed on the server.
create or replace function private.popi_lines(p_lines jsonb)
returns table (line_no integer, po_line_id uuid, sku_id uuid, sku_code text, item_name text, description text, hsn text,
               qty numeric, unit text, rate numeric, discount_pct numeric, taxable numeric, gst_pct numeric, gst_amount numeric, line_total numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  l jsonb;
  i integer := 0;
  v_sku public.skus%rowtype;
  v_taxable numeric;
  v_gst numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one line item' using errcode = '23514';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    select * into v_sku from public.skus s where s.id = nullif(l->>'sku_id', '')::uuid;
    if not found then
      raise exception 'Line %: select a SKU', i using errcode = '23514';
    end if;
    line_no := i;
    po_line_id := nullif(l->>'po_line_id', '')::uuid;
    sku_id := v_sku.id;
    sku_code := v_sku.code;
    item_name := coalesce(nullif(btrim(l->>'item_name'), ''), v_sku.name);
    description := nullif(btrim(l->>'description'), '');
    if description = item_name then description := null; end if;
    hsn := nullif(regexp_replace(coalesce(l->>'hsn', v_sku.hsn, ''), '\s', '', 'g'), '');
    if hsn is null then
      raise exception 'Line % (%): HSN is required', i, sku_code using errcode = '23514';
    end if;
    if hsn !~ '^[0-9]{2,8}$' then
      raise exception 'Line % (%): HSN must be digits only', i, sku_code using errcode = '23514';
    end if;
    qty := coalesce(nullif(l->>'qty', '')::numeric, 0);
    if qty <= 0 then
      raise exception 'Line % (%): quantity must be greater than 0', i, sku_code using errcode = '23514';
    end if;
    unit := coalesce(nullif(btrim(l->>'unit'), ''), v_sku.uom);
    rate := round(coalesce(nullif(l->>'rate', '')::numeric, -1), 2);
    if rate < 0 then
      raise exception 'Line % (%): rate is required', i, sku_code using errcode = '23514';
    end if;
    discount_pct := round(coalesce(nullif(l->>'discount_pct', '')::numeric, 0), 2);
    if discount_pct < 0 or discount_pct > 100 then
      raise exception 'Line % (%): discount must be between 0 and 100', i, sku_code using errcode = '23514';
    end if;
    gst_pct := coalesce(nullif(l->>'gst_pct', '')::numeric, v_sku.gst_pct);
    if gst_pct not in (0, 5, 12, 18, 28) then
      raise exception 'Line % (%): GST %% must be 0, 5, 12, 18 or 28', i, sku_code using errcode = '23514';
    end if;
    v_taxable := round(qty * rate * (1 - discount_pct / 100), 2);
    v_gst := round(v_taxable * gst_pct / 100, 2);
    taxable := v_taxable;
    gst_amount := v_gst;
    line_total := v_taxable + v_gst;
    return next;
  end loop;
end;
$$;

create or replace function private.popi_totals(p_table text, p_id uuid, p_gst_mode text, p_round boolean)
returns table (taxable_total numeric, cgst_total numeric, sgst_total numeric, igst_total numeric, tax_total numeric, round_off numeric, grand_total numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_taxable numeric;
  v_tax numeric;
  v_half numeric;
begin
  if p_table = 'po' then
    select coalesce(sum(l.taxable), 0), coalesce(sum(l.gst_amount), 0) into v_taxable, v_tax
    from public.purchase_order_lines l where l.po_id = p_id;
    select coalesce(sum(g.half), 0) into v_half from (
      select round(sum(l.gst_amount) / 2, 2) as half from public.purchase_order_lines l where l.po_id = p_id group by l.gst_pct
    ) g;
  else
    select coalesce(sum(l.taxable), 0), coalesce(sum(l.gst_amount), 0) into v_taxable, v_tax
    from public.purchase_invoice_lines l where l.pi_id = p_id;
    select coalesce(sum(g.half), 0) into v_half from (
      select round(sum(l.gst_amount) / 2, 2) as half from public.purchase_invoice_lines l where l.pi_id = p_id group by l.gst_pct
    ) g;
  end if;
  taxable_total := v_taxable;
  tax_total := v_tax;
  if p_gst_mode = 'CGST_SGST' then
    cgst_total := v_half;
    sgst_total := v_tax - v_half;
    igst_total := 0;
  else
    cgst_total := 0;
    sgst_total := 0;
    igst_total := v_tax;
  end if;
  round_off := case when p_round then round(v_taxable + v_tax) - (v_taxable + v_tax) else 0 end;
  grand_total := v_taxable + v_tax + round_off;
  return next;
end;
$$;

create or replace function private.popi_header_from_payload(p jsonb, p_company public.companies, p_vendor public.vendors)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_type text := coalesce(p->>'purchase_type', 'STOCK');
  v_basis text := coalesce(p->>'payment_basis', 'DELIVERY');
  v_days integer := coalesce(nullif(p->>'payment_days', '')::integer, 45);
  v_adv numeric := nullif(p->>'advance_pct', '')::numeric;
  v_terms jsonb := coalesce(p->'annexure_terms', '[]'::jsonb);
begin
  if v_type not in ('STOCK', 'BILL_TO_SHIP_TO') then
    raise exception 'Purchase type must be Stock or Bill to Ship to' using errcode = '23514';
  end if;
  if v_type = 'BILL_TO_SHIP_TO' and nullif(btrim(p->>'linked_sales_invoice_no'), '') is null then
    raise exception 'Bill to Ship to purchase needs a linked sales invoice' using errcode = '23514';
  end if;
  if nullif(p->>'po_date', '') is null then
    raise exception 'PO date is required' using errcode = '23514';
  end if;
  if jsonb_typeof(v_terms) <> 'array' then
    raise exception 'Annexure terms must be a list' using errcode = '23514';
  end if;
  if v_basis = 'ADVANCE_BALANCE' and (v_adv is null or v_adv <= 0 or v_adv >= 100) then
    raise exception 'Advance %% must be between 1 and 99' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(btrim(t)), '[]'::jsonb) into v_terms
  from jsonb_array_elements_text(v_terms) t where nullif(btrim(t), '') is not null;

  return jsonb_build_object(
    'po_date', (p->>'po_date')::date,
    'vendor_quotation_ref', nullif(btrim(p->>'vendor_quotation_ref'), ''),
    'purchase_type', v_type,
    'linked_sales_invoice_no', case when v_type = 'BILL_TO_SHIP_TO' then btrim(p->>'linked_sales_invoice_no') end,
    'partner_id', nullif(p->>'partner_id', ''),
    'subject', coalesce(nullif(btrim(p->>'subject'), ''), 'Purchase Order'),
    'intro_text', nullif(btrim(p->>'intro_text'), ''),
    'internal_notes', nullif(btrim(p->>'internal_notes'), ''),
    'ship_to', private.popi_validate_ship_to(p->'ship_to'),
    'ship_to_location_id', nullif(p->>'ship_to_location_id', ''),
    'payment_basis', v_basis,
    'payment_days', v_days,
    'advance_pct', case when v_basis = 'ADVANCE_BALANCE' then v_adv end,
    'payment_terms_text', private.popi_payment_terms_text(v_basis, v_days, v_adv, p->>'payment_custom_text'),
    'delivery_days', coalesce(nullif(p->>'delivery_days', '')::integer, 5),
    'annexure_enabled', coalesce((p->>'annexure_enabled')::boolean, true),
    'annexure_heading', coalesce(nullif(btrim(p->>'annexure_heading'), ''), 'Annexure A'),
    'annexure_terms', v_terms,
    'round_off_enabled', coalesce((p->>'round_off_enabled')::boolean, false),
    'gst_mode', public.gst_supply_type(p_company.state_code, coalesce(p_vendor.state_code, left(p_vendor.gstin, 2)))
  );
end;
$$;

-- ---------------------------------------------------------------- PO RPCs
create or replace function public.create_po(p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_vendor public.vendors%rowtype;
  v_h jsonb;
  v_id uuid;
  v_number text;
  t record;
begin
  perform private.popi_require_role(array['OWNER', 'PARTNER']);
  perform private.popi_rpc_begin();

  select * into v_company from public.companies where id = nullif(p_payload->>'company_id', '')::uuid;
  if not found then raise exception 'Select a company' using errcode = '23514'; end if;
  if not v_company.buys then raise exception '% is not set up for purchases', v_company.legal_name using errcode = '23514'; end if;
  select * into v_vendor from public.vendors where id = nullif(p_payload->>'vendor_id', '')::uuid;
  if not found then raise exception 'Select a vendor' using errcode = '23514'; end if;
  if v_vendor.status <> 'Active' then
    raise exception 'Vendor % is %; choose an active vendor', v_vendor.vendor_name, v_vendor.status using errcode = '23514';
  end if;

  v_h := private.popi_header_from_payload(p_payload, v_company, v_vendor);
  v_number := public.next_document_number(v_company.id, 'PO');

  insert into public.purchase_orders (
    company_id, number, po_date, vendor_id, vendor_quotation_ref, purchase_type, linked_sales_invoice_no, partner_id,
    subject, intro_text, internal_notes, ship_to, ship_to_location_id, payment_basis, payment_days, advance_pct,
    payment_terms_text, delivery_days, annexure_enabled, annexure_heading, annexure_terms, round_off_enabled, gst_mode,
    vendor_snapshot, company_snapshot, created_by, updated_by)
  values (
    v_company.id, v_number, (v_h->>'po_date')::date, v_vendor.id, v_h->>'vendor_quotation_ref', v_h->>'purchase_type',
    v_h->>'linked_sales_invoice_no', (v_h->>'partner_id')::uuid, v_h->>'subject', v_h->>'intro_text', v_h->>'internal_notes',
    v_h->'ship_to', (v_h->>'ship_to_location_id')::uuid, v_h->>'payment_basis', (v_h->>'payment_days')::integer,
    (v_h->>'advance_pct')::numeric, v_h->>'payment_terms_text', (v_h->>'delivery_days')::integer,
    (v_h->>'annexure_enabled')::boolean, v_h->>'annexure_heading', v_h->'annexure_terms', (v_h->>'round_off_enabled')::boolean,
    v_h->>'gst_mode', private.vendor_snapshot(v_vendor.id), private.company_snapshot(v_company.id), auth.uid(), auth.uid())
  returning id into v_id;

  insert into public.purchase_order_lines (po_id, line_no, sku_id, sku_code, item_name, description, hsn, qty, unit, rate, discount_pct, taxable, gst_pct, gst_amount, line_total)
  select v_id, l.line_no, l.sku_id, l.sku_code, l.item_name, l.description, l.hsn, l.qty, l.unit, l.rate, l.discount_pct, l.taxable, l.gst_pct, l.gst_amount, l.line_total
  from private.popi_lines(p_payload->'lines') l;

  select * into t from private.popi_totals('po', v_id, v_h->>'gst_mode', (v_h->>'round_off_enabled')::boolean);
  if t.grand_total <= 0 then
    raise exception 'PO total must be greater than 0' using errcode = '23514';
  end if;
  update public.purchase_orders set taxable_total = t.taxable_total, cgst_total = t.cgst_total, sgst_total = t.sgst_total,
    igst_total = t.igst_total, tax_total = t.tax_total, round_off = t.round_off, grand_total = t.grand_total
  where id = v_id;

  perform private.popi_audit('purchase_order', v_id, 'CREATE', jsonb_build_object('number', v_number, 'total', t.grand_total));
  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

create or replace function public.update_po(p_po_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_company public.companies%rowtype;
  v_vendor public.vendors%rowtype;
  v_h jsonb;
  v_pi text;
  t record;
begin
  perform private.popi_require_role(array['OWNER', 'PARTNER']);
  perform private.popi_rpc_begin();

  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_po.status <> 'CREATED' then
    select number into v_pi from public.purchase_invoices where po_id = v_po.id and status <> 'CANCELLED' limit 1;
    if v_pi is not null then
      raise exception '% is locked because % exists. Cancel the PI first (only if unpaid).', v_po.number, v_pi using errcode = '23514';
    end if;
    raise exception '% is % and cannot be edited', v_po.number, lower(v_po.status) using errcode = '23514';
  end if;
  if nullif(p_payload->>'company_id', '') is not null and (p_payload->>'company_id')::uuid <> v_po.company_id then
    raise exception 'Company cannot be changed after the PO number is issued' using errcode = '23514';
  end if;

  select * into v_company from public.companies where id = v_po.company_id;
  select * into v_vendor from public.vendors where id = coalesce(nullif(p_payload->>'vendor_id', '')::uuid, v_po.vendor_id);
  if not found then raise exception 'Select a vendor' using errcode = '23514'; end if;
  if v_vendor.id <> v_po.vendor_id and v_vendor.status <> 'Active' then
    raise exception 'Vendor % is %; choose an active vendor', v_vendor.vendor_name, v_vendor.status using errcode = '23514';
  end if;

  v_h := private.popi_header_from_payload(p_payload, v_company, v_vendor);

  update public.purchase_orders set
    po_date = (v_h->>'po_date')::date, vendor_id = v_vendor.id, vendor_quotation_ref = v_h->>'vendor_quotation_ref',
    purchase_type = v_h->>'purchase_type', linked_sales_invoice_no = v_h->>'linked_sales_invoice_no',
    partner_id = (v_h->>'partner_id')::uuid, subject = v_h->>'subject', intro_text = v_h->>'intro_text',
    internal_notes = v_h->>'internal_notes', ship_to = v_h->'ship_to', ship_to_location_id = (v_h->>'ship_to_location_id')::uuid,
    payment_basis = v_h->>'payment_basis', payment_days = (v_h->>'payment_days')::integer, advance_pct = (v_h->>'advance_pct')::numeric,
    payment_terms_text = v_h->>'payment_terms_text', delivery_days = (v_h->>'delivery_days')::integer,
    annexure_enabled = (v_h->>'annexure_enabled')::boolean, annexure_heading = v_h->>'annexure_heading',
    annexure_terms = v_h->'annexure_terms', round_off_enabled = (v_h->>'round_off_enabled')::boolean, gst_mode = v_h->>'gst_mode',
    vendor_snapshot = private.vendor_snapshot(v_vendor.id), company_snapshot = private.company_snapshot(v_company.id),
    updated_by = auth.uid(), updated_at = now()
  where id = v_po.id;

  delete from public.purchase_order_lines where po_id = v_po.id;
  insert into public.purchase_order_lines (po_id, line_no, sku_id, sku_code, item_name, description, hsn, qty, unit, rate, discount_pct, taxable, gst_pct, gst_amount, line_total)
  select v_po.id, l.line_no, l.sku_id, l.sku_code, l.item_name, l.description, l.hsn, l.qty, l.unit, l.rate, l.discount_pct, l.taxable, l.gst_pct, l.gst_amount, l.line_total
  from private.popi_lines(p_payload->'lines') l;

  select * into t from private.popi_totals('po', v_po.id, v_h->>'gst_mode', (v_h->>'round_off_enabled')::boolean);
  if t.grand_total <= 0 then
    raise exception 'PO total must be greater than 0' using errcode = '23514';
  end if;
  update public.purchase_orders set taxable_total = t.taxable_total, cgst_total = t.cgst_total, sgst_total = t.sgst_total,
    igst_total = t.igst_total, tax_total = t.tax_total, round_off = t.round_off, grand_total = t.grand_total
  where id = v_po.id;

  perform private.popi_audit('purchase_order', v_po.id, 'UPDATE',
    jsonb_build_object('number', v_po.number, 'total_from', v_po.grand_total, 'total_to', t.grand_total));
  return jsonb_build_object('id', v_po.id, 'number', v_po.number);
end;
$$;

create or replace function public.cancel_po(p_po_id uuid, p_reason text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_pi text;
begin
  perform private.popi_require_role(array['OWNER', 'PARTNER']);
  perform private.popi_rpc_begin();
  if nullif(btrim(p_reason), '') is null then raise exception 'Cancellation reason is required' using errcode = '23514'; end if;

  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  select number into v_pi from public.purchase_invoices where po_id = v_po.id and status <> 'CANCELLED' limit 1;
  if v_pi is not null then
    raise exception 'Cancel % first', v_pi using errcode = '23514';
  end if;
  if v_po.status <> 'CREATED' then
    raise exception '% is already %', v_po.number, lower(v_po.status) using errcode = '23514';
  end if;

  update public.purchase_orders set status = 'CANCELLED', cancel_reason = btrim(p_reason), cancelled_at = now(),
    cancelled_by = auth.uid(), updated_by = auth.uid(), updated_at = now()
  where id = v_po.id;
  perform private.popi_audit('purchase_order', v_po.id, 'CANCEL', jsonb_build_object('number', v_po.number, 'reason', btrim(p_reason)));
  return jsonb_build_object('id', v_po.id, 'number', v_po.number, 'status', 'CANCELLED');
end;
$$;

-- ---------------------------------------------------------------- PI RPCs
create or replace function private.popi_pi_dates(p jsonb, p_company public.companies)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if nullif(p->>'pi_date', '') is null then raise exception 'PI date is required' using errcode = '23514'; end if;
  if nullif(btrim(p->>'vendor_invoice_no'), '') is null then raise exception 'Vendor invoice no. is required' using errcode = '23514'; end if;
  if nullif(p->>'vendor_invoice_date', '') is null then raise exception 'Vendor invoice date is required' using errcode = '23514'; end if;
  if nullif(p->>'received_date', '') is null then
    raise exception 'Received date is required (GST input needs goods received)' using errcode = '23514';
  end if;
  if (p->>'vendor_invoice_date')::date > (p->>'pi_date')::date then
    raise exception 'Vendor invoice date cannot be after the PI date' using errcode = '23514';
  end if;
  if p_company.books_locked_until is not null and (p->>'pi_date')::date <= p_company.books_locked_until then
    raise exception 'PI date % is in a locked period (books locked until %)', p->>'pi_date', p_company.books_locked_until using errcode = '23514';
  end if;
end;
$$;

create or replace function public.create_pi_from_po(p_po_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_company public.companies%rowtype;
  v_vendor public.vendors%rowtype;
  v_existing text;
  v_id uuid;
  v_number text;
  v_lines jsonb;
  v_warnings text[] := array[]::text[];
  t record;
begin
  perform private.popi_require_role(array['OWNER', 'PARTNER']);
  perform private.popi_rpc_begin();

  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_po.status = 'CANCELLED' then
    raise exception '% is cancelled; a PI cannot be created', v_po.number using errcode = '23514';
  end if;
  select number into v_existing from public.purchase_invoices where po_id = v_po.id and status <> 'CANCELLED' limit 1;
  if v_po.status = 'PI_CREATED' or v_existing is not null then
    raise exception 'PI already created: %', coalesce(v_existing, '?') using errcode = '23505';
  end if;

  select * into v_company from public.companies where id = v_po.company_id;
  select * into v_vendor from public.vendors where id = v_po.vendor_id;
  perform private.popi_pi_dates(p_payload, v_company);
  if (p_payload->>'pi_date')::date < v_po.po_date then
    raise exception 'PI date cannot be before the PO date (%)', v_po.po_date using errcode = '23514';
  end if;
  if v_vendor.status <> 'Active' then
    v_warnings := v_warnings || format('Vendor is %s', v_vendor.status);
  end if;
  if exists (select 1 from public.purchase_invoices where vendor_id = v_vendor.id and status <> 'CANCELLED'
             and lower(btrim(vendor_invoice_no)) = lower(btrim(p_payload->>'vendor_invoice_no'))) then
    raise exception 'Vendor invoice % is already booked for this vendor', btrim(p_payload->>'vendor_invoice_no') using errcode = '23505';
  end if;

  v_number := public.next_document_number(v_company.id, 'PI');

  insert into public.purchase_invoices (
    company_id, po_id, number, pi_date, vendor_id, vendor_invoice_no, vendor_invoice_date, vendor_invoice_path, received_date,
    due_date, goods_moved, eway_bill_no, notes, ship_to, payment_basis, payment_days, advance_pct, payment_terms_text, delivery_days,
    annexure_enabled, annexure_heading, annexure_terms, subject, intro_text, round_off_enabled, gst_mode, itc_eligible,
    vendor_snapshot, company_snapshot, created_by, updated_by)
  values (
    v_company.id, v_po.id, v_number, (p_payload->>'pi_date')::date, v_vendor.id, btrim(p_payload->>'vendor_invoice_no'),
    (p_payload->>'vendor_invoice_date')::date, nullif(p_payload->>'vendor_invoice_path', ''), (p_payload->>'received_date')::date,
    private.popi_due_date(v_po.payment_basis, v_po.payment_days, v_po.po_date, (p_payload->>'vendor_invoice_date')::date,
                          (p_payload->>'received_date')::date, (p_payload->>'pi_date')::date),
    coalesce((p_payload->>'goods_moved')::boolean, true), nullif(btrim(p_payload->>'eway_bill_no'), ''), nullif(btrim(p_payload->>'notes'), ''),
    v_po.ship_to, v_po.payment_basis, v_po.payment_days, v_po.advance_pct, v_po.payment_terms_text, v_po.delivery_days,
    v_po.annexure_enabled, v_po.annexure_heading, v_po.annexure_terms, 'Purchase Invoice', v_po.intro_text, v_po.round_off_enabled,
    v_po.gst_mode, v_vendor.gst_registration = 'REGULAR' and v_vendor.gstin is not null,
    private.vendor_snapshot(v_vendor.id), private.company_snapshot(v_company.id), auth.uid(), auth.uid())
  returning id into v_id;

  insert into public.purchase_invoice_lines (pi_id, po_line_id, line_no, sku_id, sku_code, item_name, description, hsn, qty, unit, rate, discount_pct, taxable, gst_pct, gst_amount, line_total)
  select v_id, l.id, l.line_no, l.sku_id, l.sku_code, l.item_name, l.description, l.hsn, l.qty, l.unit, l.rate, l.discount_pct, l.taxable, l.gst_pct, l.gst_amount, l.line_total
  from public.purchase_order_lines l where l.po_id = v_po.id order by l.line_no;

  select * into t from private.popi_totals('pi', v_id, v_po.gst_mode, v_po.round_off_enabled);
  update public.purchase_invoices set taxable_total = t.taxable_total, cgst_total = t.cgst_total, sgst_total = t.sgst_total,
    igst_total = t.igst_total, tax_total = t.tax_total, round_off = t.round_off, grand_total = t.grand_total
  where id = v_id;

  update public.purchase_orders set status = 'PI_CREATED', updated_by = auth.uid(), updated_at = now() where id = v_po.id;

  if t.grand_total > 50000 and coalesce((p_payload->>'goods_moved')::boolean, true) and nullif(btrim(p_payload->>'eway_bill_no'), '') is null then
    v_warnings := v_warnings || 'E-way bill number missing for a consignment over ₹50,000'::text;
  end if;

  perform private.popi_audit('purchase_invoice', v_id, 'CREATE',
    jsonb_build_object('number', v_number, 'po_number', v_po.number, 'total', t.grand_total, 'warnings', to_jsonb(v_warnings)));
  perform private.popi_audit('purchase_order', v_po.id, 'PI_CREATED', jsonb_build_object('number', v_po.number, 'pi_number', v_number));
  return jsonb_build_object('id', v_id, 'number', v_number, 'warnings', to_jsonb(v_warnings));
end;
$$;

create or replace function public.update_pi(p_pi_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pi public.purchase_invoices%rowtype;
  v_po public.purchase_orders%rowtype;
  v_company public.companies%rowtype;
  v_line jsonb;
  v_po_line public.purchase_order_lines%rowtype;
  v_changes jsonb := '[]'::jsonb;
  v_new_lines jsonb := '[]'::jsonb;
  t record;
begin
  perform private.popi_require_role(array['OWNER', 'PARTNER']);
  perform private.popi_rpc_begin();

  select * into v_pi from public.purchase_invoices where id = p_pi_id for update;
  if not found then raise exception 'Purchase invoice not found' using errcode = 'P0002'; end if;
  if v_pi.status <> 'PI_CREATED' then
    raise exception '% is % and cannot be edited', v_pi.number, lower(v_pi.status) using errcode = '23514';
  end if;
  if exists (select 1 from public.purchase_payments where pi_id = v_pi.id and not voided) then
    raise exception '% has payments and is locked', v_pi.number using errcode = '23514';
  end if;
  select * into v_po from public.purchase_orders where id = v_pi.po_id;
  select * into v_company from public.companies where id = v_pi.company_id;
  perform private.popi_pi_dates(p_payload, v_company);
  if exists (select 1 from public.purchase_invoices where vendor_id = v_pi.vendor_id and id <> v_pi.id and status <> 'CANCELLED'
             and lower(btrim(vendor_invoice_no)) = lower(btrim(p_payload->>'vendor_invoice_no'))) then
    raise exception 'Vendor invoice % is already booked for this vendor', btrim(p_payload->>'vendor_invoice_no') using errcode = '23505';
  end if;

  if p_payload ? 'lines' then
    for v_line in select * from jsonb_array_elements(p_payload->'lines') loop
      select * into v_po_line from public.purchase_order_lines where id = nullif(v_line->>'po_line_id', '')::uuid and po_id = v_po.id;
      if not found then
        raise exception 'PI lines must come from the PO lines' using errcode = '23514';
      end if;
      v_new_lines := v_new_lines || jsonb_build_object(
        'po_line_id', v_po_line.id, 'sku_id', v_po_line.sku_id, 'item_name', v_po_line.item_name,
        'description', v_po_line.description, 'hsn', v_po_line.hsn, 'unit', v_po_line.unit,
        'gst_pct', v_po_line.gst_pct, 'discount_pct', v_po_line.discount_pct,
        'qty', coalesce(v_line->>'qty', v_po_line.qty::text), 'rate', coalesce(v_line->>'rate', v_po_line.rate::text));
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('line', o.line_no, 'qty_from', o.qty, 'qty_to', n.qty, 'rate_from', o.rate, 'rate_to', n.rate)), '[]'::jsonb)
    into v_changes
    from public.purchase_invoice_lines o
    join private.popi_lines(v_new_lines) n on n.po_line_id = o.po_line_id
    where o.pi_id = v_pi.id and (o.qty <> n.qty or o.rate <> n.rate);

    delete from public.purchase_invoice_lines where pi_id = v_pi.id;
    insert into public.purchase_invoice_lines (pi_id, po_line_id, line_no, sku_id, sku_code, item_name, description, hsn, qty, unit, rate, discount_pct, taxable, gst_pct, gst_amount, line_total)
    select v_pi.id, l.po_line_id, l.line_no, l.sku_id, l.sku_code, l.item_name, l.description, l.hsn, l.qty, l.unit, l.rate, l.discount_pct, l.taxable, l.gst_pct, l.gst_amount, l.line_total
    from private.popi_lines(v_new_lines) l;
  end if;

  select * into t from private.popi_totals('pi', v_pi.id, v_pi.gst_mode, v_pi.round_off_enabled);
  if t.grand_total <= 0 then raise exception 'PI total must be greater than 0' using errcode = '23514'; end if;

  update public.purchase_invoices set
    pi_date = (p_payload->>'pi_date')::date, vendor_invoice_no = btrim(p_payload->>'vendor_invoice_no'),
    vendor_invoice_date = (p_payload->>'vendor_invoice_date')::date, received_date = (p_payload->>'received_date')::date,
    vendor_invoice_path = coalesce(nullif(p_payload->>'vendor_invoice_path', ''), vendor_invoice_path),
    goods_moved = coalesce((p_payload->>'goods_moved')::boolean, goods_moved),
    eway_bill_no = nullif(btrim(p_payload->>'eway_bill_no'), ''), notes = nullif(btrim(p_payload->>'notes'), ''),
    due_date = private.popi_due_date(payment_basis, payment_days, v_po.po_date, (p_payload->>'vendor_invoice_date')::date,
                                     (p_payload->>'received_date')::date, (p_payload->>'pi_date')::date),
    taxable_total = t.taxable_total, cgst_total = t.cgst_total, sgst_total = t.sgst_total, igst_total = t.igst_total,
    tax_total = t.tax_total, round_off = t.round_off, grand_total = t.grand_total,
    updated_by = auth.uid(), updated_at = now()
  where id = v_pi.id;

  perform private.popi_audit('purchase_invoice', v_pi.id, 'UPDATE', jsonb_build_object(
    'number', v_pi.number, 'total_from', v_pi.grand_total, 'total_to', t.grand_total, 'line_changes', v_changes,
    'vendor_invoice_no', jsonb_build_object('from', v_pi.vendor_invoice_no, 'to', btrim(p_payload->>'vendor_invoice_no'))));
  return jsonb_build_object('id', v_pi.id, 'number', v_pi.number);
end;
$$;

create or replace function public.attach_pi_invoice_file(p_pi_id uuid, p_path text)
returns void
language plpgsql
set search_path = ''
as $$
declare v_number text;
begin
  perform private.popi_require_role(array['OWNER', 'PARTNER']);
  perform private.popi_rpc_begin();
  update public.purchase_invoices set vendor_invoice_path = p_path, updated_by = auth.uid(), updated_at = now()
  where id = p_pi_id and status <> 'CANCELLED' returning number into v_number;
  if v_number is null then raise exception 'Purchase invoice not found or cancelled' using errcode = 'P0002'; end if;
  perform private.popi_audit('purchase_invoice', p_pi_id, 'ATTACH_INVOICE', jsonb_build_object('number', v_number, 'path', p_path));
end;
$$;

create or replace function public.cancel_pi(p_pi_id uuid, p_reason text, p_confirm_itc_reversal boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pi public.purchase_invoices%rowtype;
  v_po public.purchase_orders%rowtype;
  v_locked date;
begin
  perform private.popi_require_role(array['OWNER']);
  perform private.popi_rpc_begin();
  if nullif(btrim(p_reason), '') is null then raise exception 'Cancellation reason is required' using errcode = '23514'; end if;

  select * into v_pi from public.purchase_invoices where id = p_pi_id for update;
  if not found then raise exception 'Purchase invoice not found' using errcode = 'P0002'; end if;
  if v_pi.status = 'CANCELLED' then raise exception '% is already cancelled', v_pi.number using errcode = '23514'; end if;
  if exists (select 1 from public.purchase_payments where pi_id = v_pi.id and not voided) then
    raise exception 'Void payments first: % has active payments', v_pi.number using errcode = '23514';
  end if;
  select books_locked_until into v_locked from public.companies where id = v_pi.company_id;
  if v_locked is not null and v_pi.pi_date <= v_locked and not coalesce(p_confirm_itc_reversal, false) then
    raise exception 'GST_FILED_PERIOD: % falls in a filed/locked period. Its GST input may already be claimed; a reversal or vendor credit/debit note is needed. Confirm to cancel.', v_pi.number
      using errcode = 'P0001';
  end if;

  select * into v_po from public.purchase_orders where id = v_pi.po_id for update;
  update public.purchase_invoices set status = 'CANCELLED', cancel_reason = btrim(p_reason), cancelled_at = now(),
    cancelled_by = auth.uid(), updated_by = auth.uid(), updated_at = now()
  where id = v_pi.id;
  update public.purchase_orders set status = 'CREATED', updated_by = auth.uid(), updated_at = now()
  where id = v_po.id and status = 'PI_CREATED';

  perform private.popi_audit('purchase_invoice', v_pi.id, 'CANCEL', jsonb_build_object(
    'number', v_pi.number, 'reason', btrim(p_reason), 'itc_reversal_confirmed', coalesce(p_confirm_itc_reversal, false)));
  perform private.popi_audit('purchase_order', v_po.id, 'PI_CANCELLED', jsonb_build_object('number', v_po.number, 'pi_number', v_pi.number));
  return jsonb_build_object('id', v_pi.id, 'number', v_pi.number, 'po_id', v_po.id, 'po_status', 'CREATED');
end;
$$;

-- ---------------------------------------------------------------- payments
create or replace function private.popi_refresh_paid(p_pi_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_paid numeric;
  v_last date;
begin
  select coalesce(sum(amount), 0), max(payment_date) into v_paid, v_last
  from public.purchase_payments where pi_id = p_pi_id and not voided;
  update public.purchase_invoices set
    paid_total = v_paid,
    status = case when status = 'CANCELLED' then status when v_paid >= grand_total - 1 then 'PAID' else 'PI_CREATED' end,
    paid_on = case when v_paid >= grand_total - 1 then v_last end,
    updated_at = now()
  where id = p_pi_id;
end;
$$;

create or replace function public.record_payment(p_pi_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pi public.purchase_invoices%rowtype;
  v_amount numeric := round(coalesce(nullif(p_payload->>'amount', '')::numeric, 0), 2);
  v_mode text := upper(coalesce(p_payload->>'mode', ''));
  v_date date := nullif(p_payload->>'payment_date', '')::date;
  v_tds_pct numeric := coalesce(nullif(p_payload->>'tds_pct', '')::numeric, 0);
  v_tds numeric;
  v_outstanding numeric;
  v_over text := nullif(btrim(p_payload->>'overpayment_reason'), '');
  v_ref text := nullif(btrim(p_payload->>'reference'), '');
  v_cash_day numeric;
  v_id uuid;
  v_warnings text[] := array[]::text[];
begin
  perform private.popi_require_role(array['OWNER', 'PARTNER']);
  perform private.popi_rpc_begin();

  select * into v_pi from public.purchase_invoices where id = p_pi_id for update;
  if not found then raise exception 'Purchase invoice not found' using errcode = 'P0002'; end if;
  if v_pi.status = 'CANCELLED' then raise exception '% is cancelled' , v_pi.number using errcode = '23514'; end if;
  if v_date is null then raise exception 'Payment date is required' using errcode = '23514'; end if;
  if v_date < v_pi.pi_date then raise exception 'Payment date cannot be before the PI date (%)', v_pi.pi_date using errcode = '23514'; end if;
  if v_amount <= 0 then raise exception 'Amount must be greater than 0' using errcode = '23514'; end if;
  if v_mode not in ('NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE', 'CASH', 'CARD', 'ADJUSTED') then
    raise exception 'Select a payment mode' using errcode = '23514';
  end if;
  if v_mode <> 'CASH' and v_ref is null then
    raise exception 'Reference / UTR / transaction ID is required' using errcode = '23514';
  end if;
  if nullif(p_payload->>'proof_path', '') is null then raise exception 'Payment proof is required' using errcode = '23514'; end if;
  if not exists (select 1 from public.company_bank_accounts where id = nullif(p_payload->>'bank_account_id', '')::uuid and company_id = v_pi.company_id) then
    raise exception 'Select the company bank account the payment was made from' using errcode = '23514';
  end if;
  if not private.employee_is_active(nullif(p_payload->>'paid_by', '')::uuid) then
    raise exception 'Select who made the payment' using errcode = '23514';
  end if;
  if v_ref is not null and exists (select 1 from public.purchase_payments where vendor_id = v_pi.vendor_id and not voided and lower(btrim(reference)) = lower(v_ref)) then
    raise exception 'Duplicate reference % for this vendor', v_ref using errcode = '23505';
  end if;

  v_outstanding := v_pi.grand_total - v_pi.paid_total;
  if v_amount > v_outstanding + 1 then
    if v_over is null then
      raise exception 'Amount ₹% is more than the outstanding ₹%', v_amount, v_outstanding using errcode = '23514';
    end if;
    perform private.popi_require_role(array['OWNER']);
  end if;
  if v_tds_pct < 0 or v_tds_pct > 100 then raise exception 'TDS %% must be between 0 and 100' using errcode = '23514'; end if;
  v_tds := round(v_amount * v_tds_pct / 100, 2);

  if v_mode = 'CASH' then
    select coalesce(sum(amount), 0) into v_cash_day from public.purchase_payments
    where vendor_id = v_pi.vendor_id and payment_date = v_date and mode = 'CASH' and not voided;
    if v_cash_day + v_amount > 10000 then
      v_warnings := v_warnings || format('Cash paid to this vendor on %s totals ₹%s (over ₹10,000, Income-tax sec 40A(3))', v_date, v_cash_day + v_amount);
    end if;
  end if;

  insert into public.purchase_payments (pi_id, company_id, vendor_id, payment_date, amount, mode, bank_account_id, reference,
    cheque_no, cheque_date, cheque_bank, tds_section, tds_pct, tds_amount, net_paid, proof_path, paid_by, remarks, overpayment_reason, created_by)
  values (v_pi.id, v_pi.company_id, v_pi.vendor_id, v_date, v_amount, v_mode, (p_payload->>'bank_account_id')::uuid, v_ref,
    nullif(btrim(p_payload->>'cheque_no'), ''), nullif(p_payload->>'cheque_date', '')::date, nullif(btrim(p_payload->>'cheque_bank'), ''),
    case when v_tds > 0 then nullif(p_payload->>'tds_section', '') end, v_tds_pct, v_tds, v_amount - v_tds,
    p_payload->>'proof_path', (p_payload->>'paid_by')::uuid, nullif(btrim(p_payload->>'remarks'), ''),
    case when v_amount > v_outstanding + 1 then v_over end, auth.uid())
  returning id into v_id;

  perform private.popi_refresh_paid(v_pi.id);
  perform private.popi_audit('purchase_payment', v_id, 'CREATE', jsonb_build_object(
    'pi_number', v_pi.number, 'amount', v_amount, 'mode', v_mode, 'reference', v_ref, 'warnings', to_jsonb(v_warnings)));
  return jsonb_build_object('id', v_id, 'warnings', to_jsonb(v_warnings),
    'status', (select status from public.purchase_invoices where id = v_pi.id));
end;
$$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pay public.purchase_payments%rowtype;
  v_number text;
begin
  perform private.popi_require_role(array['OWNER']);
  perform private.popi_rpc_begin();
  if nullif(btrim(p_reason), '') is null then raise exception 'Void reason is required' using errcode = '23514'; end if;
  select * into v_pay from public.purchase_payments where id = p_payment_id;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  select number into v_number from public.purchase_invoices where id = v_pay.pi_id for update;
  if v_pay.voided then raise exception 'Payment is already voided' using errcode = '23514'; end if;

  update public.purchase_payments set voided = true, voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = v_pay.id;
  perform private.popi_refresh_paid(v_pay.pi_id);
  perform private.popi_audit('purchase_payment', v_pay.id, 'VOID', jsonb_build_object('pi_number', v_number, 'amount', v_pay.amount, 'reason', btrim(p_reason)));
  return jsonb_build_object('id', v_pay.id, 'status', (select status from public.purchase_invoices where id = v_pay.pi_id));
end;
$$;

revoke execute on function public.create_po(jsonb), public.update_po(uuid, jsonb), public.cancel_po(uuid, text),
  public.create_pi_from_po(uuid, jsonb), public.update_pi(uuid, jsonb), public.attach_pi_invoice_file(uuid, text),
  public.cancel_pi(uuid, text, boolean), public.record_payment(uuid, jsonb), public.void_payment(uuid, text) from public, anon;
grant execute on function public.create_po(jsonb), public.update_po(uuid, jsonb), public.cancel_po(uuid, text),
  public.create_pi_from_po(uuid, jsonb), public.update_pi(uuid, jsonb), public.attach_pi_invoice_file(uuid, text),
  public.cancel_pi(uuid, text, boolean), public.record_payment(uuid, jsonb), public.void_payment(uuid, text) to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.popi_rpc_begin(), private.popi_in_rpc(), private.popi_guard(), private.popi_require_role(text[]),
  private.popi_validate_ship_to(jsonb), private.popi_payment_terms_text(text, integer, numeric, text),
  private.popi_due_date(text, integer, date, date, date, date), private.popi_lines(jsonb),
  private.popi_totals(text, uuid, text, boolean), private.popi_header_from_payload(jsonb, public.companies, public.vendors),
  private.popi_pi_dates(jsonb, public.companies), private.popi_refresh_paid(uuid), private.popi_audit(text, uuid, text, jsonb),
  private.vendor_snapshot(uuid), private.employee_name(uuid), private.employee_is_active(uuid) to authenticated;
revoke execute on function private.popi_audit(text, uuid, text, jsonb), private.vendor_snapshot(uuid) from public, anon;

-- ---------------------------------------------------------------- read models
create or replace view public.purchase_order_overview with (security_invoker = true) as
select
  po.*,
  c.abbr as company_abbr,
  c.legal_name as company_name,
  v.vendor_name,
  v.status as vendor_status,
  private.employee_name(po.partner_id) as partner_name,
  (select count(*) from public.purchase_order_lines l where l.po_id = po.id) as item_count,
  (select string_agg(l.sku_code || ' ' || l.item_name, ' | ' order by l.line_no) from public.purchase_order_lines l where l.po_id = po.id) as sku_search,
  pi.id as pi_id,
  pi.number as pi_number,
  pi.status as pi_status,
  pi.grand_total as pi_total,
  case when pi.id is not null then pi.grand_total - po.grand_total end as pi_value_diff
from public.purchase_orders po
join public.companies c on c.id = po.company_id
join public.vendors v on v.id = po.vendor_id
left join lateral (
  select i.id, i.number, i.status, i.grand_total from public.purchase_invoices i
  where i.po_id = po.id and i.status <> 'CANCELLED' order by i.created_at desc limit 1
) pi on true;

create or replace view public.purchase_invoice_overview with (security_invoker = true) as
select
  pi.*,
  c.abbr as company_abbr,
  c.legal_name as company_name,
  c.state_code as company_state_code,
  po.number as po_number,
  po.po_date,
  v.vendor_name,
  v.gstin as vendor_gstin,
  v.status as vendor_status,
  v.msme_registered,
  v.tds_section as vendor_tds_section,
  v.tds_pct as vendor_tds_pct,
  coalesce(v.state_code, left(v.gstin, 2)) as vendor_state_code,
  pi.grand_total - pi.paid_total as outstanding,
  case
    when pi.status = 'CANCELLED' then 'Cancelled'
    when pi.status = 'PAID' then 'Paid'
    when pi.paid_total > 0 then 'Partially paid'
    else 'Unpaid'
  end as payment_label,
  (pi.status = 'PI_CREATED' and pi.due_date < current_date) as is_overdue,
  (pi.status = 'PI_CREATED' and v.msme_registered and pi.received_date + 45 < current_date) as msme_overdue,
  (pi.status = 'PI_CREATED' and pi.itc_eligible and pi.vendor_invoice_date + 180 < current_date) as itc_180_day_risk,
  (pi.status <> 'CANCELLED' and pi.grand_total > 50000 and pi.goods_moved and pi.eway_bill_no is null) as eway_missing,
  (c.books_locked_until is not null and pi.pi_date <= c.books_locked_until) as in_filed_period
from public.purchase_invoices pi
join public.companies c on c.id = pi.company_id
join public.purchase_orders po on po.id = pi.po_id
join public.vendors v on v.id = pi.vendor_id;

create or replace view public.purchase_payment_overview with (security_invoker = true) as
select
  p.*,
  pi.number as pi_number,
  v.vendor_name,
  b.bank_name || ' ••' || b.account_no_last4 as paid_from,
  private.employee_name(p.paid_by) as paid_by_name
from public.purchase_payments p
join public.purchase_invoices pi on pi.id = p.pi_id
join public.vendors v on v.id = p.vendor_id
left join public.company_bank_accounts b on b.id = p.bank_account_id;

revoke all on public.purchase_order_overview, public.purchase_invoice_overview, public.purchase_payment_overview from anon;
grant select on public.purchase_order_overview, public.purchase_invoice_overview, public.purchase_payment_overview to authenticated;

-- ---------------------------------------------------------------- storage for vendor invoices and payment proofs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('purchase-files', 'purchase-files', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists purchase_files_select on storage.objects;
drop policy if exists purchase_files_insert on storage.objects;
create policy purchase_files_select on storage.objects for select to authenticated
  using (bucket_id = 'purchase-files' and (select public.app_role()) is not null);
create policy purchase_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'purchase-files' and (select public.app_role()) in ('OWNER', 'PARTNER'));

commit;
