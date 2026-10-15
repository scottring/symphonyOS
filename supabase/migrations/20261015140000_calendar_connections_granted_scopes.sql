-- Calendar consent separate from mail (beta readiness B05, 2026-10-15).
-- Google connections record which scopes the person actually granted, so
-- mail features can tell "not authorized" from "nothing found" and Settings
-- can offer mail as an optional, separate connection.
alter table public.calendar_connections add column if not exists granted_scopes text;
comment on column public.calendar_connections.granted_scopes is 'Space-separated OAuth scopes the provider reported as granted at the last connection; null when unknown (older connections).';
