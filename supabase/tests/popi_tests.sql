-- PO / PI / payment tests. Local test database only; runs in a transaction and rolls back.
begin;

create function pg_temp.expect_error(p_sql text, p_pattern text, p_label text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm !~* p_pattern then
      raise exception 'FAIL %: expected error like "%", got "%"', p_label, p_pattern, sqlerrm;
    end if;
    raise notice 'PASS %  ->  %', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: expected an error like "%" but it succeeded', p_label, p_pattern;
end;
$$;

create function pg_temp.act_as(p_employee uuid)
returns void
language sql
as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claim.sub', coalesce(p_employee::text, ''), true);
  select set_config('role', 'authenticated', true);
$$;

-- Mirror Supabase's default grants on pre-existing tables (the local copy is restored without them).
grant select, insert, update, delete on public.companies, public.vendors, public.skus, public.employees,
  public.delivery_locations, public.document_series, public.terms_templates, public.audit_log to authenticated;
grant select (id, company_id, account_name, bank_name, branch, account_no_last4, ifsc, upi_id, is_default)
  on public.company_bank_accounts to authenticated;

-- Fixture: a PARTNER-tier employee (no current employee maps to PARTNER).
insert into auth.users (id, email) values ('11111111-2222-3333-4444-555555555555', 'partner.test@localhost.invalid');
insert into public.employees (id, full_name, email, role, is_active)
values ('11111111-2222-3333-4444-555555555555', 'Test Partner', 'partner.test@localhost.invalid', 'Sales', true);

-- Fixture: complete VG company details so documents can be numbered.
update public.companies set gstin = '27AAACV1234F1Z5', pan = 'AAACV1234F', state_code = '27', state_name = 'Maharashtra',
  reg_address = 'Unit 1, Andheri East, Mumbai', books_locked_until = null where abbr = 'VG';
insert into public.company_bank_accounts (company_id, account_name, bank_name, account_no, ifsc, is_default)
select id, 'Vensun Group', 'HDFC Bank', '50200012345678', 'HDFC0000123', true from public.companies where abbr = 'VG';
insert into public.vendors (vendor_code, vendor_name, business_line, vendor_type, contact_person, phone, city_state, gstin, status, gst_registration, msme_registered, tds_section, tds_pct, state_code)
select 'VT-IGST', 'Delhi Paper Mills', business_line, vendor_type, contact_person, phone, city_state, '07AAACD1234E1Z2', 'Active', 'REGULAR', true, '194Q', 0.1, '07'
from public.vendors limit 1;
insert into public.vendors (vendor_code, vendor_name, business_line, vendor_type, contact_person, phone, city_state, gstin, status, gst_registration, msme_registered, state_code)
select 'VT-HOLD', 'Held Vendor', business_line, vendor_type, contact_person, phone, city_state, null, 'On hold', 'UNREGISTERED', false, '27'
from public.vendors where vendor_code <> 'VT-IGST' limit 1;

do $$
declare
  v_vg uuid := (select id from public.companies where abbr = 'VG');
  v_bank uuid := (select id from public.company_bank_accounts where company_id = (select id from public.companies where abbr = 'VG') and is_default);
  v_owner uuid := '9396199a-31da-4cb4-84cd-d47fd9384913';
  v_director uuid := '11111111-2222-3333-4444-555555555555';
  v_viewer uuid := '3a357572-8319-410a-b533-704b67432493';
  v_vendor uuid := (select id from public.vendors where gstin = '27AWYPP2920L1ZR');
  v_vendor_igst uuid := (select id from public.vendors where vendor_code = 'VT-IGST');
  v_vendor_hold uuid := (select id from public.vendors where vendor_code = 'VT-HOLD');
  v_sku uuid := (select id from public.skus where code = 'SV29768');
  v_ship jsonb := '{"name":"Vensun Warehouse","line1":"Plot 4, MIDC","city":"Bhiwandi","state":"Maharashtra","state_code":"27","pin":"421302","contact_name":"Ravi","contact_phone":"9820000000"}';
  v_po jsonb;
  v_lines jsonb;
  r jsonb;
  v_po1 uuid; v_po2 uuid; v_po3 uuid;
  v_pi1 uuid; v_pi2 uuid;
  v_pay uuid;
  v_n text;
  v_row record;
begin
  update public.skus set gst_pct = 18, hsn = '48191010' where id = v_sku;
  v_lines := jsonb_build_array(jsonb_build_object('sku_id', v_sku, 'qty', 1000, 'rate', 160.20, 'discount_pct', 0));
  v_po := jsonb_build_object('company_id', v_vg, 'vendor_id', v_vendor, 'po_date', '2026-10-01', 'purchase_type', 'STOCK',
    'ship_to', v_ship, 'payment_basis', 'DELIVERY', 'payment_days', 45, 'lines', v_lines,
    'annexure_terms', jsonb_build_array('Goods must match the approved sample', ''));

  -- Roles
  perform pg_temp.act_as(v_viewer);
  perform pg_temp.expect_error(format('select public.create_po(%L::jsonb)', v_po), 'permission', 'VIEWER cannot create PO');
  perform pg_temp.act_as(null);
  perform pg_temp.expect_error(format('select public.create_po(%L::jsonb)', v_po), 'permission', 'anonymous user cannot create PO');

  -- Direct table writes are blocked even for an OWNER
  perform pg_temp.act_as(v_owner);
  perform pg_temp.expect_error(format(
    'insert into public.purchase_orders (company_id, number, po_date, vendor_id, purchase_type, ship_to, payment_terms_text, gst_mode, vendor_snapshot, company_snapshot) values (%L, %L, current_date, %L, %L, %L::jsonb, %L, %L, %L::jsonb, %L::jsonb)',
    v_vg, 'PO-VG-1', v_vendor, 'STOCK', v_ship, 'x', 'IGST', '{}', '{}'), 'only be changed through the app', 'direct insert blocked');
  perform pg_temp.expect_error(format('select public.next_document_number(%L, %L)', v_vg, 'PO'), 'issued only when the document is saved', 'numbers cannot be consumed directly');

  -- Test 1: 1000 x 160.20 @18%% intra-state
  r := public.create_po(v_po);
  v_po1 := (r->>'id')::uuid;
  assert r->>'number' = 'PO-VG-91010', 'first PO number is PO-VG-91010, got ' || (r->>'number');
  select * into v_row from public.purchase_orders where id = v_po1;
  assert v_row.taxable_total = 160200.00 and v_row.cgst_total = 14418.00 and v_row.sgst_total = 14418.00
     and v_row.igst_total = 0 and v_row.grand_total = 189036.00, 'test 1 totals';
  assert v_row.gst_mode = 'CGST_SGST', 'same state -> CGST+SGST';
  assert v_row.payment_terms_text = 'Payment will be done 45 days from the date of delivery', 'payment terms text';
  assert v_row.annexure_terms = '["Goods must match the approved sample"]'::jsonb, 'blank annexure lines dropped';
  assert (v_row.vendor_snapshot->>'vendor_name') = 'JALARAM STATIONERY & PACKAGING', 'vendor snapshot stored';
  raise notice 'PASS test 1: 160,200.00 + CGST 14,418.00 + SGST 14,418.00 = 189,036.00 (PO-VG-91010)';

  -- Test 2: inter-state -> IGST
  r := public.create_po(v_po || jsonb_build_object('vendor_id', v_vendor_igst));
  v_po2 := (r->>'id')::uuid;
  assert r->>'number' = 'PO-VG-91011', 'second PO number';
  select * into v_row from public.purchase_orders where id = v_po2;
  assert v_row.gst_mode = 'IGST' and v_row.igst_total = 28836.00 and v_row.cgst_total = 0, 'inter-state uses IGST';
  raise notice 'PASS test 2: inter-state vendor -> IGST 28,836.00';

  -- Discount, multiple rates, round off
  r := public.create_po(v_po || jsonb_build_object('round_off_enabled', true, 'lines', jsonb_build_array(
    jsonb_build_object('sku_id', v_sku, 'qty', 3, 'rate', 33.33, 'discount_pct', 10),
    jsonb_build_object('sku_id', v_sku, 'qty', 7, 'rate', 12.5, 'gst_pct', 5))));
  v_po3 := (r->>'id')::uuid;
  select * into v_row from public.purchase_orders where id = v_po3;
  -- 3*33.33*0.9 = 89.99 (18% -> 16.20) ; 7*12.5 = 87.50 (5% -> 4.38)
  assert v_row.taxable_total = 177.49 and v_row.tax_total = 20.58 and v_row.cgst_total + v_row.sgst_total = v_row.tax_total, 'mixed rates';
  assert v_row.round_off = -0.07 and v_row.grand_total = 198.00, 'round off to nearest rupee';
  raise notice 'PASS discount + mixed GST rates + round off (198.07 -> 198.00)';

  -- Validation (edge cases 10, 11, 14)
  perform pg_temp.expect_error(format('select public.create_po(%L::jsonb)', v_po || '{"lines":[]}'), 'at least one line', 'PO with no lines');
  perform pg_temp.expect_error(format('select public.create_po(%L::jsonb)', v_po || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('sku_id', v_sku, 'qty', 0, 'rate', 10)))), 'quantity must be greater than 0', 'qty 0 blocked');
  perform pg_temp.expect_error(format('select public.create_po(%L::jsonb)', v_po || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('sku_id', v_sku, 'qty', 5, 'rate', 0)))), 'total must be greater than 0', 'zero total blocked');
  perform pg_temp.expect_error(format('select public.create_po(%L::jsonb)', v_po || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('sku_id', v_sku, 'qty', 5, 'rate', 1, 'hsn', '')))), 'HSN', 'HSN required');
  perform pg_temp.expect_error(format('select public.create_po(%L::jsonb)', v_po || '{"purchase_type":"BILL_TO_SHIP_TO"}'), 'linked sales invoice', 'Bill to Ship to needs sales invoice');
  perform pg_temp.expect_error(format('select public.create_po(%L::jsonb)', v_po || jsonb_build_object('ship_to', v_ship - 'pin')), 'pin is required', 'ship-to PIN required');
  perform pg_temp.expect_error(format('select public.create_po(%L::jsonb)', v_po || jsonb_build_object('vendor_id', v_vendor_hold)), 'choose an active vendor', 'inactive vendor blocked on new PO');

  -- Edge 15: failed saves never consume numbers
  perform pg_temp.act_as(null);
  perform set_config('role', 'postgres', true);
  assert (select next_number from public.document_series where company_id = v_vg and doc_type = 'PO') = 91013, 'no gaps after failed saves';
  raise notice 'PASS edge 15: next PO number is still PO-VG-91013 after 8 failed saves';

  -- Edge 2: partner can edit while CREATED
  perform pg_temp.act_as(v_director);
  perform public.update_po(v_po1, v_po || jsonb_build_object('vendor_quotation_ref', 'Q-77'));
  assert (select vendor_quotation_ref from public.purchase_orders where id = v_po1) = 'Q-77', 'PO edited';
  perform pg_temp.expect_error(format('select public.update_po(%L, %L::jsonb)', v_po1, v_po || jsonb_build_object('company_id', (select id from public.companies where abbr = 'SS'))), 'Company cannot be changed', 'company change blocked');

  -- Create PI (edge 9: snapshot, dates)
  perform pg_temp.expect_error(format('select public.create_pi_from_po(%L, %L::jsonb)', v_po1, '{"pi_date":"2026-10-03","vendor_invoice_no":"JAL/101","vendor_invoice_date":"2026-10-02"}'), 'Received date is required', 'received date required');
  perform pg_temp.expect_error(format('select public.create_pi_from_po(%L, %L::jsonb)', v_po1, '{"pi_date":"2026-10-03","vendor_invoice_no":"JAL/101","vendor_invoice_date":"2026-10-05","received_date":"2026-10-03"}'), 'cannot be after the PI date', 'vendor invoice date after PI date');
  r := public.create_pi_from_po(v_po1, '{"pi_date":"2026-10-03","vendor_invoice_no":"JAL/101","vendor_invoice_date":"2026-10-02","received_date":"2026-10-03"}');
  v_pi1 := (r->>'id')::uuid;
  assert r->>'number' = 'PI-VG-91010', 'first PI number';
  assert r->'warnings' ? 'E-way bill number missing for a consignment over ₹50,000', 'e-way bill warning';
  select * into v_row from public.purchase_invoices where id = v_pi1;
  assert v_row.grand_total = 189036.00 and v_row.due_date = '2026-11-17' and v_row.itc_eligible, 'PI copies PO totals, due = received + 45';
  assert (select status from public.purchase_orders where id = v_po1) = 'PI_CREATED', 'PO status PI_CREATED';
  raise notice 'PASS create PI: PI-VG-91010, due 2026-11-17, e-way warning returned';

  -- Edge 1: one active PI per PO
  perform pg_temp.expect_error(format('select public.create_pi_from_po(%L, %L::jsonb)', v_po1, '{"pi_date":"2026-10-03","vendor_invoice_no":"JAL/102","vendor_invoice_date":"2026-10-02","received_date":"2026-10-03"}'), 'PI already created: PI-VG-91010', 'second PI blocked');
  -- Edge 3: PO locked once PI exists
  perform pg_temp.expect_error(format('select public.update_po(%L, %L::jsonb)', v_po1, v_po), 'locked because PI-VG-91010 exists', 'PO locked after PI');
  -- Edge 4: cannot cancel PO with active PI
  perform pg_temp.expect_error(format('select public.cancel_po(%L, %L)', v_po1, 'not needed'), 'Cancel PI-VG-91010 first', 'cancel PO blocked by PI');
  -- Duplicate vendor invoice number across POs
  perform pg_temp.expect_error(format('select public.create_pi_from_po(%L, %L::jsonb)', v_po3, '{"pi_date":"2026-10-03","vendor_invoice_no":"jal/101","vendor_invoice_date":"2026-10-02","received_date":"2026-10-03"}'), 'already booked for this vendor', 'duplicate vendor invoice no');

  -- Edge 12: PI correction while unpaid
  perform public.update_pi(v_pi1, jsonb_build_object('pi_date', '2026-10-03', 'vendor_invoice_no', 'JAL/101', 'vendor_invoice_date', '2026-10-02',
    'received_date', '2026-10-03', 'eway_bill_no', '331000000001',
    'lines', jsonb_build_array(jsonb_build_object('po_line_id', (select id from public.purchase_order_lines where po_id = v_po1), 'qty', 950, 'rate', 160.20))));
  assert (select pi_value_diff from public.purchase_order_overview where id = v_po1) = -9451.80, 'PO shows PI difference';
  raise notice 'PASS edge 12: PI corrected to 950 qty; PO overview shows difference -9,451.80';

  -- Payments (tests 3, 4; edges 16-18, 20, 21)
  perform pg_temp.expect_error(format('select public.record_payment(%L, %L::jsonb)', v_pi1, jsonb_build_object('payment_date', '2026-10-10', 'amount', 50000, 'mode', 'NEFT', 'reference', 'UTR1', 'bank_account_id', v_bank, 'paid_by', v_owner)), 'proof is required', 'proof required');
  perform pg_temp.expect_error(format('select public.record_payment(%L, %L::jsonb)', v_pi1, jsonb_build_object('payment_date', '2026-10-10', 'amount', 50000, 'mode', 'NEFT', 'bank_account_id', v_bank, 'paid_by', v_owner, 'proof_path', 'x.pdf')), 'Reference', 'reference required for NEFT');
  perform pg_temp.expect_error(format('select public.record_payment(%L, %L::jsonb)', v_pi1, jsonb_build_object('payment_date', '2026-10-01', 'amount', 50000, 'mode', 'NEFT', 'reference', 'UTR1', 'bank_account_id', v_bank, 'paid_by', v_owner, 'proof_path', 'x.pdf')), 'before the PI date', 'payment before PI date');
  perform pg_temp.expect_error(format('select public.record_payment(%L, %L::jsonb)', v_pi1, jsonb_build_object('payment_date', '2026-10-10', 'amount', 0, 'mode', 'NEFT', 'reference', 'UTR1', 'bank_account_id', v_bank, 'paid_by', v_owner, 'proof_path', 'x.pdf')), 'greater than 0', 'zero payment');

  r := public.record_payment(v_pi1, jsonb_build_object('payment_date', '2026-10-10', 'amount', 50000, 'mode', 'NEFT', 'reference', 'UTR1',
    'bank_account_id', v_bank, 'paid_by', v_owner, 'proof_path', 'vg/pay/1.pdf', 'tds_section', '194Q', 'tds_pct', 0.1));
  v_pay := (r->>'id')::uuid;
  assert r->>'status' = 'PI_CREATED', 'partial stays PI_CREATED';
  assert (select payment_label || '|' || outstanding from public.purchase_invoice_overview where id = v_pi1) = 'Partially paid|129584.20', 'partially paid label + outstanding';
  assert (select net_paid from public.purchase_payments where id = v_pay) = 49950.00, 'TDS 0.1% deducted from net paid';
  perform pg_temp.expect_error(format('select public.update_pi(%L, %L::jsonb)', v_pi1, '{"pi_date":"2026-10-03","vendor_invoice_no":"JAL/101","vendor_invoice_date":"2026-10-02","received_date":"2026-10-03"}'), 'has payments and is locked', 'PI locked after payment');
  raise notice 'PASS test 3: 50,000 paid -> Partially paid, outstanding 1,29,584.20, TDS 50.00';

  perform pg_temp.expect_error(format('select public.record_payment(%L, %L::jsonb)', v_pi1, jsonb_build_object('payment_date', '2026-10-11', 'amount', 1000, 'mode', 'IMPS', 'reference', 'utr1', 'bank_account_id', v_bank, 'paid_by', v_owner, 'proof_path', 'x.pdf')), 'Duplicate reference', 'duplicate UTR');
  perform pg_temp.expect_error(format('select public.record_payment(%L, %L::jsonb)', v_pi1, jsonb_build_object('payment_date', '2026-10-11', 'amount', 200000, 'mode', 'RTGS', 'reference', 'UTR9', 'bank_account_id', v_bank, 'paid_by', v_owner, 'proof_path', 'x.pdf')), 'more than the outstanding', 'overpayment blocked');
  perform pg_temp.act_as(v_viewer);
  perform pg_temp.expect_error(format('select public.void_payment(%L, %L)', v_pay, 'typo'), 'permission', 'VIEWER cannot void');
  perform pg_temp.act_as(v_director);
  perform pg_temp.expect_error(format('select public.record_payment(%L, %L::jsonb)', v_pi1, jsonb_build_object('payment_date', '2026-10-11', 'amount', 200000, 'mode', 'RTGS', 'reference', 'UTR9', 'bank_account_id', v_bank, 'paid_by', v_owner, 'proof_path', 'x.pdf', 'overpayment_reason', 'Advance for next order')), 'more than the outstanding|permission', 'overpayment with reason needs OWNER');

  -- Cash 40A(3) warning (edge 22)
  r := public.record_payment(v_pi1, jsonb_build_object('payment_date', '2026-10-12', 'amount', 12000, 'mode', 'CASH',
    'bank_account_id', v_bank, 'paid_by', v_owner, 'proof_path', 'vg/pay/cash.jpg'));
  assert jsonb_array_length(r->'warnings') = 1, 'cash over 10,000 warns';
  raise notice 'PASS edge 22: cash 12,000 recorded with 40A(3) warning';

  r := public.record_payment(v_pi1, jsonb_build_object('payment_date', '2026-10-15', 'amount', 117584.20, 'mode', 'RTGS', 'reference', 'UTR2',
    'bank_account_id', v_bank, 'paid_by', v_owner, 'proof_path', 'vg/pay/2.pdf'));
  assert r->>'status' = 'PAID', 'fully paid';
  assert (select paid_on from public.purchase_invoices where id = v_pi1) = '2026-10-15', 'paid on date';
  raise notice 'PASS test 4: balance paid -> PAID on 2026-10-15';

  -- Edge 20: void payment (OWNER) reverts status
  perform pg_temp.expect_error(format('select public.void_payment(%L, %L)', v_pay, 'typo'), 'permission', 'PARTNER cannot void');
  perform pg_temp.act_as(v_owner);
  r := public.void_payment(v_pay, 'Wrong UTR entered');
  assert r->>'status' = 'PI_CREATED', 'void reverts to partially paid';
  assert (select outstanding from public.purchase_invoice_overview where id = v_pi1) = 50000.00, 'outstanding restored';
  raise notice 'PASS edge 20: void payment -> back to Partially paid, outstanding 50,000.00';

  -- Edge 13: cannot cancel PI with active payments
  perform pg_temp.expect_error(format('select public.cancel_pi(%L, %L)', v_pi1, 'wrong'), 'Void payments first', 'cancel PI with payments blocked');

  -- Test 5 + edge 6: cancel PI -> PO back to CREATED; new PI gets next number
  r := public.create_pi_from_po(v_po2, '{"pi_date":"2026-10-04","vendor_invoice_no":"DPM-55","vendor_invoice_date":"2026-10-04","received_date":"2026-10-04","goods_moved":false}');
  v_pi2 := (r->>'id')::uuid;
  assert r->>'number' = 'PI-VG-91011' and jsonb_array_length(r->'warnings') = 0, 'PI-VG-91011 without e-way warning when goods not moved';
  perform pg_temp.act_as(v_director);
  perform pg_temp.expect_error(format('select public.cancel_pi(%L, %L)', v_pi2, 'wrong qty'), 'permission', 'only OWNER cancels PI');
  perform pg_temp.act_as(v_owner);
  perform pg_temp.expect_error(format('select public.cancel_pi(%L, %L)', v_pi2, ' '), 'reason is required', 'cancel reason required');
  r := public.cancel_pi(v_pi2, 'Vendor sent wrong invoice');
  assert r->>'po_status' = 'CREATED' and (select status from public.purchase_orders where id = v_po2) = 'CREATED', 'PO back to CREATED';
  r := public.create_pi_from_po(v_po2, '{"pi_date":"2026-10-05","vendor_invoice_no":"DPM-55","vendor_invoice_date":"2026-10-04","received_date":"2026-10-04","goods_moved":false}');
  assert r->>'number' = 'PI-VG-91012', 'replacement PI gets new number, cancelled one kept';
  assert (select status from public.purchase_invoices where id = v_pi2) = 'CANCELLED', 'cancelled PI kept';
  raise notice 'PASS test 5 + edge 6: PI-VG-91011 cancelled & kept, PO reopened, new PI-VG-91012 with same vendor invoice no';

  -- Edge 23: PI in filed period needs ITC reversal confirmation
  perform pg_temp.act_as(null);
  perform set_config('role', 'postgres', true);
  update public.companies set books_locked_until = '2026-10-31' where id = v_vg;
  perform pg_temp.act_as(v_owner);
  perform pg_temp.expect_error(format('select public.cancel_pi(%L, %L)', (r->>'id')::uuid, 'late return'), 'GST_FILED_PERIOD', 'filed period cancel warns');
  perform public.cancel_pi((r->>'id')::uuid, 'Late return', true);
  raise notice 'PASS edge 23: cancel in filed period required ITC reversal confirmation';
  -- Edge 19: new PI in locked period blocked
  perform pg_temp.expect_error(format('select public.create_pi_from_po(%L, %L::jsonb)', v_po2, '{"pi_date":"2026-10-20","vendor_invoice_no":"DPM-56","vendor_invoice_date":"2026-10-20","received_date":"2026-10-20"}'), 'locked period', 'PI date in locked period blocked');

  -- Edge 4 positive: cancel PO without PI
  r := public.cancel_po(v_po3, 'Duplicate order');
  perform pg_temp.expect_error(format('select public.create_pi_from_po(%L, %L::jsonb)', v_po3, '{"pi_date":"2026-11-03","vendor_invoice_no":"X1","vendor_invoice_date":"2026-11-02","received_date":"2026-11-03"}'), 'is cancelled', 'PI from cancelled PO blocked');

  -- Edge 7/8: vendor put on hold after PO -> PI still allowed with warning; PO keeps its own values
  perform pg_temp.act_as(null);
  perform set_config('role', 'postgres', true);
  update public.companies set books_locked_until = null where id = v_vg;
  update public.vendors set status = 'On hold' where id = v_vendor_igst;
  update public.skus set std_purchase_rate = 999, gst_pct = 12 where id = v_sku;
  perform pg_temp.act_as(v_owner);
  r := public.create_pi_from_po(v_po2, '{"pi_date":"2026-11-05","vendor_invoice_no":"DPM-57","vendor_invoice_date":"2026-11-04","received_date":"2026-11-04","goods_moved":false}');
  assert r->'warnings' ? 'Vendor is On hold', 'inactive vendor warning';
  assert (select gst_pct from public.purchase_invoice_lines where pi_id = (r->>'id')::uuid) = 18, 'PI uses PO rate, not changed SKU master';
  raise notice 'PASS edges 7 + 8: on-hold vendor warns; SKU master change did not alter PO/PI';

  -- Audit trail
  assert (select count(*) from public.audit_log where entity_type in ('purchase_order', 'purchase_invoice', 'purchase_payment')) >= 15, 'audit rows written';
  raise notice 'PASS audit log: % PO/PI/payment entries', (select count(*) from public.audit_log where entity_type in ('purchase_order', 'purchase_invoice', 'purchase_payment'));

  -- Viewer can read, not write
  perform pg_temp.act_as(v_viewer);
  assert (select count(*) from public.purchase_invoice_overview) = 4, 'viewer reads PIs';
  perform set_config('app.popi_rpc', '', true);
  update public.purchase_invoices set grand_total = 1 where id = v_pi1;
  assert (select grand_total from public.purchase_invoices where id = v_pi1) = 179584.20, 'viewer update matched no rows';
  raise notice 'PASS viewer direct update blocked by RLS (0 rows changed)';
  perform pg_temp.act_as(v_owner);
  perform pg_temp.expect_error(format('update public.purchase_invoices set grand_total = 1 where id = %L', v_pi1), 'only be changed through the app', 'owner direct update blocked');
  perform pg_temp.expect_error(format('delete from public.purchase_invoices where id = %L', v_pi1), 'permission denied', 'hard delete blocked');

  perform pg_temp.act_as(null);
  perform set_config('role', 'postgres', true);
  raise notice 'ALL PO/PI TESTS PASSED';
end;
$$;

rollback;
