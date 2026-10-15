-- An invited adult who signs in without the invite link (B04, 2026-10-15):
-- the first-run gate only knew about an invitation remembered in the browser,
-- so a partner who signed up on their own saw "Set up your household" and
-- could make a second household instead of joining. This answers, for the
-- signed-in address, the live invitation's token, so the gate can send them
-- to the join page. Only the invitee's own address is ever matched.
create or replace function public.my_pending_invitation()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('token', i.token, 'household_id', i.household_id)
  from public.household_invitations i
  where lower(i.email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    and i.accepted_at is null and i.expires_at > now()
  order by i.created_at desc limit 1
$$;
revoke all on function public.my_pending_invitation() from public, anon;
grant execute on function public.my_pending_invitation() to authenticated;
