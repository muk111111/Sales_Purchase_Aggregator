-- create_po / create_pi_from_po are security invoker, so the calling user must be able to execute
-- next_document_number. The function itself refuses PO/PI numbers outside those RPCs.
begin;
revoke execute on function public.next_document_number(uuid, text) from public, anon;
grant execute on function public.next_document_number(uuid, text) to authenticated, service_role;
revoke execute on function private.company_snapshot(uuid) from public, anon;
grant execute on function private.company_snapshot(uuid) to authenticated, service_role;
commit;
