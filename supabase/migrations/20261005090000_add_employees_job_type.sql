alter table public.employees
  add column if not exists job_type text not null default 'Fulltime'
  check (job_type in ('Gigs Job', 'Fulltime'));
