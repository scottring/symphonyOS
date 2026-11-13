-- Rollback for 20261113160000_delete_account_data.sql.
drop function if exists public.delete_account_data(uuid);
drop function if exists public.delete_account_has_columns(text, text[]);
