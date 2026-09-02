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

    // MARK: - derive: the two-adult ambiguity (regression for the array-order bug)

    /// Both members are stamped with the household CREATOR's `userId` (every
    /// row in the house is) — Iris additionally has her OWN `authUserId`
    /// from her own login. A loose second-branch match (no `authUserId ==
    /// nil` guard) would let Iris's row match `userId == creator` exactly
    /// like the creator's own seed row, and `.first(where:)` would then
    /// depend on array order — Scott's task assigned to Iris could resolve
    /// self to IRIS HERSELF, producing `individual` and hiding it from her.
    /// Both orders must resolve self to the CREATOR's row and answer
    /// "couple", never "individual".
    @Test func ownerAsSelfIsStableAcrossMemberArrayOrderWhenBothShareUserId() {
        let creatorAuthId = UUID()
        let irisAuthId = UUID()
        let creator = FamilyMember(userId: creatorAuthId, name: "Scott", initials: "S", color: "blue")
        let iris = FamilyMember(userId: creatorAuthId, name: "Iris", initials: "I", color: "teal")
        iris.authUserId = irisAuthId

        let task = SymphonyTask(userId: creatorAuthId, title: "Book the sitter")
        task.assignedTo = iris.id

        #expect(ScopeRule.derive(for: task, parent: nil, members: [creator, iris]) == "couple")
        #expect(ScopeRule.derive(for: task, parent: nil, members: [iris, creator]) == "couple")
    }

    /// The inverse: a task actually owned by Iris (her own `authUserId` as
    /// `task.userId`) resolves self to HER row via the first branch — the
    /// creator's row, which also carries `userId == creator's own id`, must
    /// never be mistaken for the owner here. Assigning it to the creator
    /// (someone other than Iris) must answer "couple" in both orders too.
    @Test func partnerOwnedTaskResolvesSelfToPartnerAcrossMemberArrayOrder() {
        let creatorAuthId = UUID()
        let irisAuthId = UUID()
        let creator = FamilyMember(userId: creatorAuthId, name: "Scott", initials: "S", color: "blue")
        let iris = FamilyMember(userId: creatorAuthId, name: "Iris", initials: "I", color: "teal")
        iris.authUserId = irisAuthId

        let task = SymphonyTask(userId: irisAuthId, title: "Iris's own errand")
        task.assignedTo = creator.id

        #expect(ScopeRule.derive(for: task, parent: nil, members: [creator, iris]) == "couple")
        #expect(ScopeRule.derive(for: task, parent: nil, members: [iris, creator]) == "couple")
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

    // MARK: - memberForAuthUser: the strict twin itself

    @Test func memberForAuthUserPrefersAuthLinkOverUserIdMatch() {
        let creatorAuthId = UUID()
        let irisAuthId = UUID()
        let creator = FamilyMember(userId: creatorAuthId, name: "Scott", initials: "S", color: "blue")
        let iris = FamilyMember(userId: creatorAuthId, name: "Iris", initials: "I", color: "teal")
        iris.authUserId = irisAuthId

        #expect(ScopeRule.memberForAuthUser(in: [creator, iris], authUserId: irisAuthId)?.name == "Iris")
        #expect(ScopeRule.memberForAuthUser(in: [iris, creator], authUserId: irisAuthId)?.name == "Iris")
    }

    @Test func memberForAuthUserSecondBranchRequiresNilAuthUserId() {
        // A member whose OWN authUserId is set never matches the creator's
        // userId lookup, even though her userId field also equals it.
        let creatorAuthId = UUID()
        let iris = FamilyMember(userId: creatorAuthId, name: "Iris", initials: "I", color: "teal")
        iris.authUserId = UUID()

        #expect(ScopeRule.memberForAuthUser(in: [iris], authUserId: creatorAuthId) == nil)
    }

    @Test func memberForAuthUserHasNoIsFullUserFallback() {
        // Unlike FamilyMember.current, a full user with no matching
        // authUserId/userId row must resolve to nil, not to "any full user".
        let fullUser = FamilyMember(userId: UUID(), name: "Legacy", initials: "L", color: "red")
        fullUser.isFullUser = true

        #expect(ScopeRule.memberForAuthUser(in: [fullUser], authUserId: UUID()) == nil)
    }

    @Test func memberForAuthUserNilAuthUserIdReturnsNil() {
        let member = FamilyMember(userId: UUID(), name: "Scott", initials: "S", color: "blue")
        #expect(ScopeRule.memberForAuthUser(in: [member], authUserId: nil) == nil)
    }
}
