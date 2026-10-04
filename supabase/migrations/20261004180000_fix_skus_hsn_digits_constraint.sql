-- The existing skus_hsn_digits check constraint only allowed 4, 6, or 8 digit
-- HSN codes (pattern: ^[0-9]{4}([0-9]{2}){0,2}$). HSN codes are valid at any
-- length from 4 to 8 digits, so allow 4-8 digits inclusive.
alter table public.skus drop constraint if exists skus_hsn_digits;

alter table public.skus
  add constraint skus_hsn_digits check (hsn ~ '^[0-9]{4,8}$');
