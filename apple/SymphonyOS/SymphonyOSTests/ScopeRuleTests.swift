import Testing
import Foundation
@testable import Symphony

/// Twin coverage for src/lib/scope.ts's own test table — see ScopeRule.swift's
/// header for the two files this mirrors.
@MainActor
struct ScopeRuleTests {

    // MARK: - scopeForDomain

    @Test func familyContextIsAlwaysCompoundRegardlessOfAssignees() {
        let me = UUID(), other = UUID()
        #expect(ScopeRule.scopeForDomain(context: "family", assignees: [], selfMemberId: me) == "compound")
        #expect(ScopeRule.scopeForDomain(context: "family", assignees: [me], selfMemberId: me) == "compound")
        #expect(ScopeRule.scopeForDomain(context: "family", assignees: [other], selfMemberId: me) == "compound")
    }

    @Test func nonFamilyContextHandedToSomeoneElseIsCouple() {
        let me = UUID(), other = UUID()
        #expect(ScopeRule.scopeForDomain(context: "work", assignees: [other], selfMemberId: me) == "couple")
        #expect(ScopeRule.scopeForDomain(context: "personal", assignees: [me, other], selfMemberId: me) == "couple")
        #expect(ScopeRule.scopeForDomain(context: nil, assignees: [other], selfMemberId: me) == "couple")
    }

    @Test func selfOnlyOrNoAssigneesIsIndividual() {
        let me = UUID()
        #expect(ScopeRule.scopeForDomain(context: "work", assignees: [me], selfMemberId: me) == "individual")
        #expect(ScopeRule.scopeForDomain(context: "personal", assignees: [], selfMemberId: me) == "individual")
        #expect(ScopeRule.scopeForDomain(context: nil, assignees: [nil], selfMemberId: me) == "individual")
    }

    // MARK: - derive: parent-domain fallback for steps

    @Test func stepWithNoContextFollowsParentsFamilyContext() {
        let userId = UUID()
        let parent = SymphonyTask(userId: userId, title: "Plan the trip")
        parent.context = "family"

        let step = SymphonyTask(userId: userId, title: "Book flights")
        step.parentTaskId = parent.id
        // step.context is nil — a step has no domain of its own.

        #expect(ScopeRule.derive(for: step, parent: parent, members: []) == "compound")
    }

    @Test func stepWithItsOwnContextNeverFallsBackToParent() {
        let userId = UUID()
        let parent = SymphonyTask(userId: userId, title: "Plan the trip")
        parent.context = "family"

        let step = SymphonyTask(userId: userId, title: "Book flights")
        step.parentTaskId = parent.id
        step.context = "personal"   // carries its own tag — parent never overrides it

        #expect(ScopeRule.derive(for: step, parent: parent, members: []) == "individual")
    }

    // MARK: - derive: self is the OWNER, never the editor

    @Test func ownersOwnAssignmentStaysIndividualNoMatterWhoEdits() {
        // Task A owns, assigned to A's own member row — an unrelated editor
        // (B, not represented in `members` here, mirroring "editor excluded")
        // must never turn this into "couple" by accident.
        let ownerAuthId = UUID()
        let ownerMember = FamilyMember(userId: ownerAuthId, name: "Scott", initials: "S", color: "blue")

        let task = SymphonyTask(userId: ownerAuthId, title: "Personal errand")
        task.context = "personal"
        task.assignedTo = ownerMember.id

        #expect(ScopeRule.derive(for: task, parent: nil, members: [ownerMember]) == "individual")
    }

    @Test func taskAssignedToSomeoneOtherThanTheOwnerIsCouple() {
        let ownerAuthId = UUID()
        let ownerMember = FamilyMember(userId: ownerAuthId, name: "Scott", initials: "S", color: "blue")
        let partner = FamilyMember(userId: ownerAuthId, name: "Iris", initials: "I", color: "teal")
        partner.authUserId = UUID()

        let task = SymphonyTask(userId: ownerAuthId, title: "Pick up dry cleaning")
        task.assignedTo = partner.id

        #expect(ScopeRule.derive(for: task, parent: nil, members: [ownerMember, partner]) == "couple")
    }

    @Test func unresolvableOwnerExcludesNobodyAndCanOnlyWiden() {
        // The owner's member row isn't in `members` at all (e.g. it hasn't
        // synced down yet) — self resolves to nil, so every assignee counts
        // as "other" and the row only ever widens, never narrows.
        let task = SymphonyTask(userId: UUID(), title: "Orphaned row")
        let assignee = UUID()
        task.assignedTo = assignee

        #expect(ScopeRule.derive(for: task, parent: nil, members: []) == "couple")
    }
}
