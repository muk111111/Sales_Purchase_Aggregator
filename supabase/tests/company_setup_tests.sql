-- Company setup tests. Runs inside a transaction and rolls back; leaves no data behind.
begin;

do $$
declare
  v_company uuid;
  v_employee uuid := (select id from public.employees where is_active order by created_at limit 1);
  v_n text;
  v_po_first text;
  v_po_cancelled text;
  v_po_next text;
begin
  -- Abbreviation
  assert public.company_abbr('Vensun Group') = 'VG', 'Vensun Group -> VG';
  assert public.company_abbr('Supply360 Solution') = 'SS', 'Supply360 Solution -> SS';
  assert public.company_abbr('Vensun') = 'VE', 'Vensun -> VE';
  assert public.company_abbr('Supply360 Solution PVT LTD.') = 'SS', 'punctuation ignored';

  -- Existing companies migrated to the new format
  assert (select abbr from public.companies where legal_name = 'Vensun Group') = 'VG', 'Vensun Group abbr';
  assert (select count(*) from public.companies where is_default) = 1, 'exactly one default company';

  -- New company gets 5 series, all at 91010
  insert into public.companies (
    code, legal_name, entity_type, gst_type, pan, state_name, state_code,
    reg_address, city, pin, phone, email, signatory_name, fy, status
  ) values (
    'ZZTEST', 'Zeta Quartz Traders', 'Partnership', 'Unregistered', 'ABCDE1234F', 'Gujarat', '24',
    '1 Test Road', 'Surat', '395001', '9999999999', 'test@zetaquartz.in', 'Test Signatory', '2026-27', 'Active'
  ) returning id into v_company;

  assert (select count(*) from public.document_series
          where company_id = v_company and next_number = 91010 and start_number = 91010) = 5,
    'five series at 91010';

  -- Sequential numbering per type, independent counters
  v_n := public.next_document_number(v_company, 'PO');
  assert v_n = 'PO-ZQ-91010', format('first PO, got %s', v_n);
  v_n := public.next_document_number(v_company, 'PO');
  assert v_n = 'PO-ZQ-91011', format('second PO, got %s', v_n);
  v_n := public.next_document_number(v_company, 'SI');
  assert v_n = 'SI-ZQ-91010', format('first SI, got %s', v_n);
  v_n := public.next_document_number(v_company, 'CN');
  assert v_n = 'CN-ZQ-91010', format('first CN, got %s', v_n);

  -- PO create trigger uses the series; a cancelled number is never reissued
  insert into public.purchase_docs (company_id, created_by, po_number)
  values (v_company, v_employee, 'HACKED-1')
  returning po_number into v_po_first;
  assert v_po_first = 'PO-ZQ-91012', format('trigger ignores client number, got %s', v_po_first);

  insert into public.purchase_docs (company_id, created_by)
  values (v_company, v_employee)
  returning po_number into v_po_cancelled;
  update public.purchase_docs set status = 'CANCELLED', cancel_reason = 'test' where po_number = v_po_cancelled;

  insert into public.purchase_docs (company_id, created_by)
  values (v_company, v_employee)
  returning po_number into v_po_next;
  assert v_po_cancelled = 'PO-ZQ-91013' and v_po_next = 'PO-ZQ-91014', 'cancelled number not reused';

  -- Abbreviation is immutable
  begin
    update public.companies set abbr = 'XX' where id = v_company;
    raise exception 'abbr update should have failed';
  exception when check_violation then null;
  end;

  -- Unknown doc type rejected
  begin
    perform public.next_document_number(v_company, 'XX');
    raise exception 'unknown doc type should have failed';
  exception when invalid_parameter_value then null;
  end;

  -- GST split
  assert public.gst_supply_type('24', '24') = 'CGST_SGST', 'same state';
  assert public.gst_supply_type('24', '27') = 'IGST', 'different state';

  raise notice 'All company setup tests passed';
end;
$$;

rollback;

-- Concurrency check (two sessions):
--   A: begin; select public.next_document_number('<company>', 'PO');   -- returns N, holds row lock
--   B: begin; select public.next_document_number('<company>', 'PO');   -- blocks on the lock
--   A: commit;                                                         -- B now returns N+1
