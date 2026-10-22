-- Settings → Displays "Start over": the code on screen stops working at once,
-- so a code made for the wrong kid (or the wrong layout) cannot be claimed
-- later. Only the grown-up who made a code may cancel it, and only before a
-- display has claimed it.
begin;

create or replace function public.cancel_display_pairing_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  delete from public.display_pairing_codes
    where code = upper(trim(p_code)) and created_by = me and claimed_at is null;
  return jsonb_build_object('cancelled', found);
end $$;
revoke all on function public.cancel_display_pairing_code(text) from public, anon;
grant execute on function public.cancel_display_pairing_code(text) to authenticated;

commit;
