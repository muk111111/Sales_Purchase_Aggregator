-- Company setup tests. Runs inside a transaction and rolls back; leaves no data behind.
begin;

do $$
declare
  v_company uuid;
  v_bare uuid;
  v_owner uuid := (select id from public.employees where is_active and role in ('Admin', 'Director') order by created_at limit 1);
  v_viewer uuid := (select id from public.employees where is_active and role = 'Ops Leads' limit 1);
  v_partner uuid := (select id from public.employees where is_active and role = 'Director' order by created_at desc limit 1);
  v_n text;
  v_po_first text;
  v_po_cancelled text;
  v_po_next text;
  v_msg text;
begin
  -- Abbreviation
  assert public.company_abbr('Vensun Group') = 'VG', 'Vensun Group -> VG';
  assert public.company_abbr('Supply360 Solution PVT LTD.') = 'SS', 'Supply360 -> SS';
  assert public.company_abbr('Vensun') = 'VE', 'single word -> first two letters';
  raise notice 'PASS abbreviation rules';

  -- Existing data
  assert (select abbr from public.companies where is_default) = 'VG', 'Vensun Group is the default';
  assert (select count(*) from public.companies where is_default) = 1, 'exactly one default';
  assert (select count(*) from public.companies where entity_type = 'Private Limited' and legal_name = 'Vensun Group') = 0,
    'entity type not forced to Private Limited';
  assert exists (select 1 from public.purchase_docs where po_number = 'P0300419'), 'P0300419 kept';
  assert (select prefix || next_number from public.document_series s join public.companies c on c.id = s.company_id
          where c.abbr = 'VG' and s.doc_type = 'PO') = 'PO-VG-91010', 'VG PO series at PO-VG-91010';
  raise notice 'PASS existing data (VG default, P0300419 kept, entity type untouched)';

  -- Active company saves with missing details (warnings only)
  insert into public.companies (code, legal_name, fy, status)
  values ('ZZBARE', 'Bare Minimum Co', '2026-27', 'Active')
  returning id into v_bare;
  assert cardinality((select public.company_missing_fields(c) from public.companies c where id = v_bare)) > 0,
    'missing fields reported as warnings';
  raise notice 'PASS Active company saved without GSTIN/PAN/address';

  -- New company with GSTIN but no bank account: PO / PI / SI blocked, SO / CN allowed
  insert into public.companies (code, legal_name, gst_type, gstin, state_name, reg_address, fy, status)
  values ('ZZTEST', 'Zeta Quartz Traders', 'Regular', '24ABCDE1234F1Z5', 'Gujarat', '1 Test Road, Surat', '2026-27', 'Active')
  returning id into v_company;
  assert (select pan from public.companies where id = v_company) = 'ABCDE1234F', 'PAN derived from GSTIN';
  assert (select count(*) from public.document_series where company_id = v_company and next_number = 91010) = 5,
    'five series at 91010';

  begin
    perform public.next_document_number(v_company, 'PO');
    raise exception 'PO without bank account should be blocked';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    assert v_msg = 'Cannot create PO for Zeta Quartz Traders: add default bank account', v_msg;
  end;
  begin
    perform public.next_document_number(v_bare, 'SI');
    raise exception 'SI for bare company should be blocked';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    assert v_msg like 'Cannot create SI for Bare Minimum Co: add GSTIN, PAN, registered address, state code, default bank account', v_msg;
  end;
  raise notice 'PASS PO/PI/SI blocked with message: %', v_msg;

  insert into public.company_bank_accounts (company_id, account_name, bank_name, account_no, ifsc)
  values (v_company, 'Zeta Quartz Traders', 'HDFC Bank', '50100123456789', 'hdfc0001234');
  assert (select is_default from public.company_bank_accounts where company_id = v_company), 'first account is default';

  v_n := public.next_document_number(v_company, 'PO');
  assert v_n = 'PO-ZQ-91010', format('first PO, got %s', v_n);
  v_n := public.next_document_number(v_company, 'PO');
  assert v_n = 'PO-ZQ-91011', format('second PO, got %s', v_n);
  v_n := public.next_document_number(v_company, 'SI');
  assert v_n = 'SI-ZQ-91010', format('first SI, got %s', v_n);
  raise notice 'PASS numbering PO-ZQ-91010, PO-ZQ-91011, SI-ZQ-91010';

  -- Trigger ignores client-supplied numbers; cancelled numbers are never reissued
  insert into public.purchase_docs (company_id, created_by, po_number)
  values (v_company, v_owner, 'HACKED-1') returning po_number into v_po_first;
  assert v_po_first = 'PO-ZQ-91012', format('trigger ignores client number, got %s', v_po_first);
  insert into public.purchase_docs (company_id, created_by) values (v_company, v_owner) returning po_number into v_po_cancelled;
  update public.purchase_docs set status = 'CANCELLED', cancel_reason = 'test' where po_number = v_po_cancelled;
  insert into public.purchase_docs (company_id, created_by) values (v_company, v_owner) returning po_number into v_po_next;
  assert v_po_cancelled = 'PO-ZQ-91013' and v_po_next = 'PO-ZQ-91014', 'cancelled number not reused';
  raise notice 'PASS cancelled PO-ZQ-91013 not reused (next %)', v_po_next;

  begin
    update public.companies set abbr = 'XX' where id = v_company;
    raise exception 'abbr update should have failed';
  exception when check_violation then null;
  end;
  raise notice 'PASS abbreviation immutable';

  -- Tiers and RLS (PARTNER simulated by temporarily re-titling one Director as Sales)
  update public.employees set role = 'Sales' where id = v_partner;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('role', 'authenticated', true);
  assert public.app_role() = 'OWNER', 'owner tier';
  update public.companies set website = 'https://zeta.example' where id = v_company;
  assert found, 'OWNER can edit company';

  perform set_config('request.jwt.claim.sub', v_partner::text, true);
  assert public.app_role() = 'PARTNER', 'partner tier';
  insert into public.delivery_locations (owner_type, company_id, name, line1, city, state, state_code, pin, contact_name, contact_phone)
  values ('COMPANY', v_company, 'New ship-to', '2 Dock Road', 'Surat', 'Gujarat', '24', '395002', 'Ravi', '9999999999');
  update public.companies set website = 'https://nope.example' where id = v_company;
  assert not found, 'PARTNER cannot edit company';
  update public.delivery_locations set name = 'Renamed' where company_id = v_company;
  assert not found, 'PARTNER cannot edit company location';

  perform set_config('request.jwt.claim.sub', v_viewer::text, true);
  assert public.app_role() = 'VIEWER', 'viewer tier';
  assert (select count(*) from public.companies) >= 2, 'VIEWER can read companies';
  begin
    insert into public.delivery_locations (owner_type, company_id, name, line1, city, state, state_code, pin, contact_name, contact_phone)
    values ('COMPANY', v_company, 'Viewer ship-to', '3 Road', 'Surat', 'Gujarat', '24', '395003', 'Ravi', '9999999999');
    raise exception 'VIEWER location insert should fail';
  exception when insufficient_privilege then null;
  end;
  assert (select account_no_last4 from public.company_bank_accounts where company_id = v_company) = '6789',
    'VIEWER sees last 4 digits';
  begin
    perform account_no from public.company_bank_accounts;
    raise exception 'VIEWER read of account_no should fail';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.company_bank_account_number((select id from public.company_bank_accounts where company_id = v_company));
    raise exception 'VIEWER full-number RPC should fail';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  assert public.app_role() is null, 'non-employee has no tier';

  perform set_config('role', 'postgres', true);
  raise notice 'PASS tiers: OWNER edits, PARTNER adds ship-to only, VIEWER read-only';

  assert public.gst_supply_type('24', '24') = 'CGST_SGST', 'same state';
  assert public.gst_supply_type('24', '27') = 'IGST', 'different state';
  raise notice 'PASS GST split';

  raise notice 'ALL COMPANY SETUP TESTS PASSED';
end;
$$;

rollback;
