-- School email ingest (spec: docs/superpowers/specs/2026-09-02-school-email-to-event-design.md)
-- A household forwards school mail to <inbound_token>@symphony-os.com; the
-- Worker → inbound-email → extract-email chain turns it into placed rows.

create extension if not exists pgcrypto;

alter table households
  add column if not exists inbound_token text unique,
  add column if not exists timezone text not null default 'America/New_York';

alter table captures drop constraint if exists captures_kind_check;
alter table captures add constraint captures_kind_check
  check (kind in ('text','whatsapp_export','classdojo_thread','image','email'));

alter table captures
  add column if not exists household_id uuid references households(id) on delete cascade,
  add column if not exists subject text,
  add column if not exists sender text,
  add column if not exists reviewed_at timestamptz;

-- One capture per email: source_key = 'email:<Message-ID>'.
create unique index if not exists captures_email_message_idx
  on captures (source_key) where kind = 'email';

-- The partner who did not forward the email can still open it.
drop policy if exists captures_household_read on captures;
create policy captures_household_read on captures for select
  using (household_id is not null and users_share_household(auth.uid(), user_id));

drop policy if exists captures_household_review on captures;
create policy captures_household_review on captures for update
  using (household_id is not null and users_share_household(auth.uid(), user_id))
  with check (household_id is not null and users_share_household(auth.uid(), user_id));

-- Returns the household's forwarding token, generating it on first call.
-- Caller must be an ACTIVE member of the household. Nothing else writes it.
create or replace function ensure_inbound_token(p_household uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from household_members
    where household_id = p_household and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not a member of this household';
  end if;

  select inbound_token into v_token from households where id = p_household;
  if v_token is null then
    v_token := substr(encode(gen_random_bytes(12), 'hex'), 1, 16);
    update households set inbound_token = v_token where id = p_household;
  end if;
  return v_token;
end;
$$;

revoke all on function ensure_inbound_token(uuid) from public;
grant execute on function ensure_inbound_token(uuid) to authenticated;
