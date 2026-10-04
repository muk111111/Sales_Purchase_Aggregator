-- Reverts 20261004130000_popi_cleanup.sql. Run the PO/PI schema down script first.
begin;

alter table public.document_series drop constraint if exists document_series_number_length;

alter table backup_popi_20261004.purchase_docs set schema public;
alter table backup_popi_20261004.purchase_doc_lines set schema public;
alter table backup_popi_20261004.payments set schema public;

alter function backup_popi_20261004.allocate_purchase_order_number() set schema public;
alter function backup_popi_20261004.submit_purchase_doc(uuid) set schema public;
alter function backup_popi_20261004.cancel_purchase_doc(uuid, text) set schema public;
alter function backup_popi_20261004.revise_purchase_doc(uuid) set schema public;

do $$
declare r record;
begin
  for r in select def from backup_popi_20261004.object_defs where name = 'private.companies_before_delete' loop
    execute r.def;
  end loop;
  for r in select def from backup_popi_20261004.object_defs where kind = 'trigger' loop
    execute r.def;
  end loop;
end;
$$;

grant select, insert, update, delete on public.purchase_docs, public.purchase_doc_lines, public.payments to authenticated;

update public.document_series s
set start_number = b.start_number, next_number = b.next_number, prefix = b.prefix
from backup_popi_20261004.document_series b
where b.id = s.id;

drop schema backup_popi_20261004 cascade;

commit;
