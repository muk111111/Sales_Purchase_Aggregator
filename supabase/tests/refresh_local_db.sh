#!/usr/bin/env bash
# Rebuilds a throwaway local Postgres database from the production schema + reference data,
# so migrations and SQL tests can be exercised without touching production.
# Usage: bash supabase/tests/refresh_local_db.sh [dbname]
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source /vercel/share/.env.project; set +a

DB="${1:-popi_test}"
LOCAL="-h /tmp -p 54329 -U postgres"
WORK=/tmp/popi_refresh
mkdir -p "$WORK"

pg_dump "$POSTGRES_URL_NON_POOLING" --schema-only --no-owner --no-privileges \
  --schema=public --schema=private -f "$WORK/schema.sql" 2>"$WORK/schema.err"
pg_dump "$POSTGRES_URL_NON_POOLING" --data-only --no-owner --disable-triggers \
  -t public.companies -t public.document_series -t public.employees -t public.vendors \
  -t public.skus -t public.customers -t public.terms_templates -t public.delivery_locations \
  -t public.company_bank_accounts -t public.purchase_docs -t public.purchase_doc_lines \
  -t public.payments -t public.role_module_permissions -f "$WORK/data.sql" 2>"$WORK/data.err"
psql "$POSTGRES_URL_NON_POOLING" -X -A -t -c \
  "select 'insert into auth.users(id,email) values ('''||id||''','''||replace(email,'''','''''')||''') on conflict do nothing;' from auth.users" \
  > "$WORK/auth_users.sql"

psql $LOCAL -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql $LOCAL -X -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/local_bootstrap.sql
psql $LOCAL -X -q -d "$DB" -f "$WORK/auth_users.sql" >/dev/null
sed -e '/^CREATE SCHEMA public;/d' -e '/^COMMENT ON SCHEMA public/d' "$WORK/schema.sql" > "$WORK/schema.fixed.sql"
psql $LOCAL -X -q -d "$DB" -f "$WORK/schema.fixed.sql" 2>"$WORK/restore.err" >/dev/null || true
psql $LOCAL -X -q -d "$DB" -f "$WORK/data.sql" 2>>"$WORK/restore.err" >/dev/null || true
echo "restore errors: $(grep -c ERROR "$WORK/restore.err" || true)"
grep ERROR "$WORK/restore.err" | head -10 || true
psql $LOCAL -X -A -t -d "$DB" -c "select 'companies='||(select count(*) from companies)||' docs='||(select count(*) from purchase_docs)||' employees='||(select count(*) from employees)||' skus='||(select count(*) from skus)||' vendors='||(select count(*) from vendors)"
