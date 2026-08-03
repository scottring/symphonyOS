-- Attachments inherit their parent entity's sharing rule.
--
-- Problem: `tasks`, `projects`, `notes` and `routines` are all shareable —
--   (auth.uid() = user_id)
--   OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id))
-- but `attachments` was owner-only:
--   (auth.uid() = user_id)
-- and so was the storage object. So sharing a task with Iris and dropping a PDF
-- on it silently gave her a task with an attachment she could neither see nor
-- open — the row was filtered out entirely, so nothing indicated it existed.
--
-- Same class of bug as the context-graph blindness (2026-08-01): a feature
-- built on top of a shared entity, whose new table did not restate the parent's
-- RLS. So this restates each parent's own rule rather than assuming one shared
-- rule covers them all.
--
-- Deliberately NOT widened:
--   * 'instance_note' — instance_notes is itself owner-only
--     ((auth.uid() = user_id), no household clause). Widening attachments past
--     their parent would leak.
--   * 'event_note'    — entity_id is a GOOGLE event id, not a DB row, so there
--     is no parent to authorize against. Household-wide access here would also
--     expose work-calendar attachments, which are private by design.
-- Both keep the owner-only path via the first clause.
--
-- Writes are unchanged: INSERT/UPDATE/DELETE stay (auth.uid() = user_id), so a
-- household member can add their own attachment to a shared task (which the
-- owner then sees, by the same rule) but cannot mutate or delete someone
-- else's.

begin;

-- ── Table ────────────────────────────────────────────────────────────────────
drop policy if exists "Users can view own attachments" on public.attachments;

create policy "Users can view reachable attachments"
on public.attachments
for select
using (
  auth.uid() = user_id
  or (
    entity_type = 'task' and exists (
      select 1 from public.tasks t
      where t.id::text = attachments.entity_id
        and t.scope in ('couple', 'compound')
        and public.users_share_household(auth.uid(), t.user_id)
    )
  )
  or (
    entity_type = 'project' and exists (
      select 1 from public.projects p
      where p.id::text = attachments.entity_id
        and p.scope in ('couple', 'compound')
        and public.users_share_household(auth.uid(), p.user_id)
    )
  )
  or (
    entity_type = 'note' and exists (
      select 1 from public.notes n
      where n.id::text = attachments.entity_id
        and n.scope in ('couple', 'compound')
        and public.users_share_household(auth.uid(), n.user_id)
    )
  )
  or (
    entity_type = 'routine' and exists (
      select 1 from public.routines r
      where r.id::text = attachments.entity_id
        and r.scope in ('couple', 'compound')
        and public.users_share_household(auth.uid(), r.user_id)
    )
  )
);

-- ── Storage ──────────────────────────────────────────────────────────────────
-- The existing owner policy stays (it also covers `{uid}/capture/...` objects
-- that have no attachments row). This ADDS a second policy; SELECT policies are
-- OR'd, so together they mean "yours, or reachable through a visible row".
--
-- Composes with the table policy above rather than duplicating its four
-- branches: the sub-select runs as the caller, so `attachments` RLS filters it
-- and the object is readable exactly when the row is. One definition of
-- reachability, not two that can drift apart.
create policy "Household can view shared attachment objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attachments'
  and exists (
    select 1 from public.attachments a
    where a.storage_path = storage.objects.name
  )
);

commit;
