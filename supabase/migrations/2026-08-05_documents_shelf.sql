-- Documents shelf: durable documents promoted out of attachments.
-- Spec: docs/superpowers/specs/2026-08-05-documents-shelf-design.md
--
-- document_status null  = ordinary attachment, not a document (the vast majority)
--                'proposed'  = analyze-attachment thinks it is one, awaiting the user
--                'kept'      = on the shelf
--                'dismissed' = user said no; never propose again

alter table attachments
  add column if not exists document_status     text,
  add column if not exists document_kind       text,
  add column if not exists document_label      text,
  add column if not exists document_owner      text,
  add column if not exists document_expires_on date,
  add column if not exists document_scope      text not null default 'private';

do $$ begin
  alter table attachments add constraint attachments_document_status_check
    check (document_status is null or document_status in ('proposed','kept','dismissed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table attachments add constraint attachments_document_scope_check
    check (document_scope in ('private','household'));
exception when duplicate_object then null; end $$;

-- Direct uploads into the shelf hang off the user themselves (entity_id = user_id),
-- so a passport can be added without inventing a fake task.
alter table attachments drop constraint if exists attachments_entity_type_check;
alter table attachments add constraint attachments_entity_type_check
  check (entity_type in ('task','project','event_note','instance_note','note','routine','document'));

create index if not exists attachments_document_status_idx
  on attachments (user_id, document_status) where document_status is not null;

create index if not exists attachments_document_expiry_idx
  on attachments (user_id, document_expires_on) where document_status = 'kept';

-- THE privacy control. Permissive policies OR together, so the household
-- visibility policy from 2026-08-03 would otherwise still expose a private
-- document promoted off a family-scoped task. A restrictive policy ANDs with
-- the permissive set and clamps every grant path.
drop policy if exists "private documents are owner-only" on attachments;
create policy "private documents are owner-only"
  on attachments as restrictive for select
  using (
    document_status is distinct from 'kept'
    or document_scope is distinct from 'private'
    or user_id = auth.uid()
  );
