-- Employees RLS only exposes the caller's own row, so the PO "Partner / owner" picker
-- reads id + name of active employees through this narrow definer function.
create or replace function public.popi_partner_options()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.full_name
  from public.employees e
  where e.is_active
    and public.app_role() is not null
  order by e.full_name;
$$;

revoke execute on function public.popi_partner_options() from public, anon;
grant execute on function public.popi_partner_options() to authenticated, service_role;
