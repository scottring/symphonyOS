-- Migration 055: Archive Relish Tables
-- Relish code has been decoupled from Symphony OS.
-- These tables are preserved for data integrity but no longer actively used.
-- Recovery: git tag 'relish-archive-point' has the full codebase.

COMMENT ON TABLE manuals IS 'ARCHIVED: Relish family manual system - data preserved, no longer in active use';
COMMENT ON TABLE yearbooks IS 'ARCHIVED: Relish yearbook system - data preserved, no longer in active use';
COMMENT ON TABLE entries IS 'ARCHIVED: Relish yearbook entries - data preserved, no longer in active use';
COMMENT ON TABLE conversations IS 'ARCHIVED: Relish AI conversations - data preserved, no longer in active use';
COMMENT ON TABLE checkins IS 'ARCHIVED: Relish check-in system - data preserved, no longer in active use';
COMMENT ON TABLE assessment_actions IS 'ARCHIVED: Relish assessment actions - data preserved, no longer in active use';
COMMENT ON TABLE households IS 'ARCHIVED: Relish household system - data preserved, family_members table still active for Symphony task assignment';
COMMENT ON TABLE household_members IS 'ARCHIVED: Relish household membership - data preserved, no longer in active use';
COMMENT ON TABLE household_invitations IS 'ARCHIVED: Relish household invitations - data preserved, no longer in active use';
