-- kiosk_cards: the "Service role can manage all kiosk cards" policy had no
-- role (it applied to PUBLIC), so anon and every signed-in user could read and
-- write every household's cards. The service role bypasses RLS and never
-- needed it. Its only writer, kiosk-agent, was deleted on 2026-11-11.
DROP POLICY IF EXISTS "Service role can manage all kiosk cards" ON public.kiosk_cards;
REVOKE ALL ON public.kiosk_cards FROM anon;
