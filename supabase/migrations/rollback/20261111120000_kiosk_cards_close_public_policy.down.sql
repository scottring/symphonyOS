-- Restores the old (unsafe) policy. Only for an emergency rollback.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiosk_cards TO anon;
CREATE POLICY "Service role can manage all kiosk cards" ON public.kiosk_cards
  FOR ALL USING (true) WITH CHECK (true);
