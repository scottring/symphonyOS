-- 092_kiosk_cards_asset.sql
-- Phase 1A: kiosk_cards gets a new source pointer for assets,
-- so the kiosk-agent can surface home-related cards
-- (asset_added, warranty_expiring, needs_details, recently_added).

alter table kiosk_cards
  add column if not exists source_asset_id uuid references assets(id) on delete cascade;

create index if not exists kiosk_cards_source_asset_idx
  on kiosk_cards(source_asset_id) where source_asset_id is not null;
