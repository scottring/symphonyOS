-- Each Google connection is a short-lived, one-use server transaction.
create table if not exists public.oauth_transactions (
  nonce uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.oauth_transactions enable row level security;
revoke all on public.oauth_transactions from public, anon, authenticated;
grant all on public.oauth_transactions to service_role;

create or replace function public.consume_oauth_transaction(p_nonce uuid, p_user uuid, p_provider text, p_redirect text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.oauth_transactions set consumed_at = clock_timestamp()
  where nonce = p_nonce and user_id = p_user and provider = p_provider
    and redirect_uri = p_redirect and consumed_at is null and expires_at > clock_timestamp();
  return found;
end;
$$;
revoke all on function public.consume_oauth_transaction(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.consume_oauth_transaction(uuid,uuid,text,text) to service_role;
