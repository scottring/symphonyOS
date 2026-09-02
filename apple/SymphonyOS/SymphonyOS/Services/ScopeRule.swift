import Foundation

/// Twins:
///   src/lib/scope.ts               — `scopeForDomain`, `memberForAuthUser`
///   src/hooks/useSupabaseTasks.ts  — `updateTask`'s scope-recompute block,
///                                     `selfMemberIdForOwner`
///
/// scope ("individual" | "couple" | "compound") is who can SEE a row — RLS
/// reads it, nothing else does. It is DERIVED, never chosen: every write path
/// that changes `context`, `assignedTo`, or `assignedToAll` must recompute it
/// through this file. See `PageParse.taskFields` (the insert path) and
/// `TaskViewModel.reconcileScope` (the update paths).
enum ScopeRule {
    /// Twin of `scopeForDomain` in src/lib/scope.ts.
    ///
    /// - family → compound (the household layer; every member subscribes)
    /// - anything else handed to another member → couple (the minimum RLS
    ///   share, and it keeps the item off the kitchen wall, which needs compound)
    /// - otherwise → individual
    static func scopeForDomain(context: String?, assignees: [UUID?], selfMemberId: UUID?) -> String {
        if context == "family" { return "compound" }
        let others = assignees.compactMap { $0 }.filter { $0 != selfMemberId }
        return others.isEmpty ? "individual" : "couple"
    }

    /// Twin of the `updateTask` scope-recompute block: a STEP (a task with a
    /// `parentTaskId`) has no domain of its own, so when it carries no context
    /// it follows its PARENT's context instead — a row that carries its own
    /// context, grouped or not, always derives from itself.
    ///
    /// `self` is the row's OWNER, never the editor — resolved via
    /// `FamilyMember.current`, mirroring `selfMemberIdForOwner`'s auth-link-
    /// then-household-creator lookup (`memberForAuthUser`). A partner who
    /// re-tags a task owned by someone else must never filter her own id out
    /// of the assignee list and delete her own access.
    static func derive(for task: SymphonyTask, parent: SymphonyTask?, members: [FamilyMember]) -> String {
        let domain: String?
        if let context = task.context {
            domain = context
        } else if task.parentTaskId != nil {
            domain = parent?.context
        } else {
            domain = nil
        }
        let selfMember = FamilyMember.current(in: members, authUserId: task.userId)
        var assignees: [UUID?] = [task.assignedTo]
        if let all = task.assignedToAll {
            assignees.append(contentsOf: all)
        }
        return scopeForDomain(context: domain, assignees: assignees, selfMemberId: selfMember?.id)
    }
}
