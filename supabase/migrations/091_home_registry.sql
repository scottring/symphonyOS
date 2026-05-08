-- 091_home_registry.sql
-- Home app Phase 1A: registry foundation.
-- See docs/superpowers/specs/2026-05-06-home-app-phase-1a-design.md
--
-- Three new tables:
--   homes   — top-level home entity (one row per household by default)
--   spaces  — rooms AND zones in one table; self-ref for room→zone
--   assets  — every asset is item OR collection (asset_kind flag)
--
-- Sharing model: user_id ownership + users_share_household() helper
-- (matches existing meal_planner / pantry_inventory pattern).

-- ─────────────────────────────────────────────────────────────────
-- homes
-- ─────────────────────────────────────────────────────────────────
create table homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index homes_user_idx on homes(user_id);

alter table homes enable row level security;

create policy "homes household select" on homes for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
create policy "homes household insert" on homes for insert
  with check (auth.uid() = user_id);
create policy "homes household update" on homes for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
create policy "homes household delete" on homes for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- spaces (rooms + zones in one table)
-- ─────────────────────────────────────────────────────────────────
create table spaces (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  parent_space_id uuid references spaces(id) on delete cascade,
  -- NOTE: cross-home consistency (parent_space_id and assets.space_id pointing
  -- at a space in the same home) is enforced at the application layer.
  -- Add a composite FK in a follow-up if service-role writes ever land here.
  space_type text not null check (space_type in ('room','zone')),
  name text not null check (length(trim(name)) > 0),
  photo_url text,
  sort_order int not null default 0,
  facts jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Rooms have no parent; zones must have a parent.
  -- Application enforces parent must be a room (no nested zones).
  constraint zone_parent_consistency check (
    (space_type = 'room' and parent_space_id is null) or
    (space_type = 'zone' and parent_space_id is not null)
  )
);

create index spaces_home_idx on spaces(home_id, space_type);
create index spaces_parent_idx on spaces(parent_space_id) where parent_space_id is not null;

alter table spaces enable row level security;

create policy "spaces household select" on spaces for select
  using (
    exists (
      select 1 from homes h
      where h.id = spaces.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "spaces household insert" on spaces for insert
  with check (
    exists (
      select 1 from homes h
      where h.id = spaces.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "spaces household update" on spaces for update
  using (
    exists (
      select 1 from homes h
      where h.id = spaces.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "spaces household delete" on spaces for delete
  using (
    exists (
      select 1 from homes h
      where h.id = spaces.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- assets
-- ─────────────────────────────────────────────────────────────────
create table assets (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  space_id uuid references spaces(id) on delete set null,
  asset_kind text not null default 'item' check (asset_kind in ('item','collection')),
  asset_type text not null default 'other' check (asset_type in
    ('appliance','vehicle','electronics','furniture','fixture','tool','collection','other')),
  name text not null check (length(trim(name)) > 0),
  photo_url text,
  purchase_date date,
  purchase_price numeric,
  warranty_expires_at date,
  serial_number text,
  manual_url text,
  tags text[] not null default '{}'::text[],
  details jsonb not null default '{}'::jsonb,
  notes_id uuid references notes(id) on delete set null,
  domain text not null default 'family' check (domain in ('work','family','personal')),
  needs_details bool not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assets_home_idx on assets(home_id);
create index assets_space_idx on assets(space_id) where space_id is not null;
create index assets_needs_details_idx on assets(home_id) where needs_details = true;
create index assets_warranty_idx on assets(home_id, warranty_expires_at)
  where warranty_expires_at is not null;

alter table assets enable row level security;

create policy "assets household select" on assets for select
  using (
    exists (
      select 1 from homes h
      where h.id = assets.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "assets household insert" on assets for insert
  with check (
    exists (
      select 1 from homes h
      where h.id = assets.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "assets household update" on assets for update
  using (
    exists (
      select 1 from homes h
      where h.id = assets.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "assets household delete" on assets for delete
  using (
    exists (
      select 1 from homes h
      where h.id = assets.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- updated_at triggers (mirror existing pattern in earlier migrations)
-- ─────────────────────────────────────────────────────────────────
create trigger homes_updated_at before update on homes
  for each row execute function update_updated_at_column();
create trigger spaces_updated_at before update on spaces
  for each row execute function update_updated_at_column();
create trigger assets_updated_at before update on assets
  for each row execute function update_updated_at_column();

comment on table homes is 'Home app: top-level home entity. One per household by default.';
comment on table spaces is 'Home app: rooms (parent_space_id NULL) and zones (parent → room). No nested zones.';
comment on table assets is 'Home app: physical items or collections, located in a space.';
comment on column assets.needs_details is 'True after photo-first capture; surfaces in inbox triage until filled.';
comment on column spaces.facts is 'Typed list of reference facts: [{type,label,value}]. Types: wifi|paint|code|supply|measurement|freetext.';
