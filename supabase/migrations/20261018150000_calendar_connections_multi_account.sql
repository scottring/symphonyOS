-- More than one calendar account per provider (2026-10-18): a personal and a
-- work Google account, two Outlook accounts. A connection is now one ACCOUNT,
-- named by its email, instead of one row per provider.
--
-- account_email          which account this is; set at connection, backfilled
--                        on the next read for rows made before this migration.
-- is_primary             the Google account Symphony writes new events to and
--                        reads mail through when nothing names another. One
--                        per person per provider; the existing row is it.
-- writable_calendar_ids  calendars this account can write to, refreshed on
--                        every read, so an edit to an event goes out through
--                        the account that owns its calendar.

alter table public.calendar_connections add column if not exists account_email text;
alter table public.calendar_connections add column if not exists is_primary boolean not null default false;
alter table public.calendar_connections add column if not exists writable_calendar_ids text[] not null default '{}';

comment on column public.calendar_connections.account_email is 'The provider account (email) this connection signs in as; null only on rows made before multi-account and not yet read.';
comment on column public.calendar_connections.is_primary is 'The account used for new events and mail when no calendar names another. At most one per user and provider.';
comment on column public.calendar_connections.writable_calendar_ids is 'Calendar ids this account can write to, as of the last read; routes edits to the owning account.';

-- Every existing row was the only one for its provider. Written so a second
-- run never makes a second primary: only the oldest row of a provider that
-- has none is promoted.
update public.calendar_connections c set is_primary = true
where c.id = (
  select o.id from public.calendar_connections o
  where o.user_id = c.user_id and o.provider = c.provider
  order by o.created_at, o.id limit 1
)
and not exists (
  select 1 from public.calendar_connections p
  where p.user_id = c.user_id and p.provider = c.provider and p.is_primary
);

alter table public.calendar_connections drop constraint if exists calendar_connections_user_id_provider_key;
create unique index if not exists calendar_connections_account_key
  on public.calendar_connections (user_id, provider, account_email);
create unique index if not exists calendar_connections_one_primary
  on public.calendar_connections (user_id, provider) where is_primary;

-- Disconnecting the primary account hands the role to the oldest remaining
-- account of that provider, so writes and mail never point at nothing.
create or replace function public.promote_calendar_connection_after_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.is_primary then
    update public.calendar_connections set is_primary = true
    where id = (
      select id from public.calendar_connections
      where user_id = old.user_id and provider = old.provider
      order by created_at, id
      limit 1
    );
  end if;
  return null;
end;
$$;
revoke all on function public.promote_calendar_connection_after_delete() from public, anon, authenticated;

drop trigger if exists calendar_connections_promote_primary on public.calendar_connections;
create trigger calendar_connections_promote_primary
  after delete on public.calendar_connections
  for each row execute function public.promote_calendar_connection_after_delete();

-- Make one of the caller's own accounts primary for its provider. Runs as the
-- caller (RLS applies), clearing the old primary first so the partial unique
-- index never sees two.
create or replace function public.make_calendar_connection_primary(p_connection_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_provider text;
begin
  select provider into v_provider from public.calendar_connections
  where id = p_connection_id and user_id = auth.uid();
  if v_provider is null then
    return false;
  end if;
  update public.calendar_connections set is_primary = false, updated_at = now()
  where user_id = auth.uid() and provider = v_provider and is_primary and id <> p_connection_id;
  update public.calendar_connections set is_primary = true, updated_at = now()
  where id = p_connection_id and user_id = auth.uid();
  return true;
end;
$$;
revoke all on function public.make_calendar_connection_primary(uuid) from public, anon;
grant execute on function public.make_calendar_connection_primary(uuid) to authenticated;
