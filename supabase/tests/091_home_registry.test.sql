-- 091_home_registry.test.sql
-- Verify household isolation: a user in household A cannot see household B's homes.
-- Run after applying migration 091.

begin;

-- Two users in different households (assumes existing test seed in this project).
-- Replace UUIDs below if test seed uses different fixtures.
insert into homes (id, user_id, name) values
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'House A'),
  ('00000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'House B');

-- Simulate auth as user 1
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

-- User 1 should see exactly 1 home
select count(*) = 1 as user1_sees_one
  from homes;

-- Switch to user 2
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

select count(*) = 1 as user2_sees_one
  from homes;

rollback;
