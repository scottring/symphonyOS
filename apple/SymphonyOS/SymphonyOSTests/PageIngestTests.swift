import Testing
import Foundation
import SwiftData
@testable import Symphony

@MainActor
struct PageIngestTests {
    private func makeContext() throws -> ModelContext {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: SymphonyTask.self, Project.self, Routine.self, Contact.self,
            FamilyMember.self, ActionableInstance.self, EventNote.self, PlaybookBlock.self,
            PlaybookInstance.self, WeeklyTemplate.self, FamilyRule.self,
            Responsibility.self, Household.self, UserProfile.self, PendingChange.self,
            configurations: config
        )
        return ModelContext(container)
    }

    @Test func storagePathIsLowercasedUnderPages() {
        let uid = UUID(uuidString: "BACE953E-87EA-4A59-B7D7-F476FA0E8C94")!
        let fid = UUID(uuidString: "0F0F0F0F-0000-0000-0000-000000000001")!
        #expect(PageIngest.storagePath(userId: uid, fileId: fid)
                == "bace953e-87ea-4a59-b7d7-f476fa0e8c94/pages/0f0f0f0f-0000-0000-0000-000000000001.jpg")
    }

    @Test func currentMemberPrefersAuthLinkThenOwnerThenFullUser() {
        let me = UUID(), owner = UUID()
        let linked = FamilyMember(userId: owner, name: "Iris", initials: "I", color: "teal"); linked.authUserId = me
        let creator = FamilyMember(userId: owner, name: "Scott", initials: "S", color: "blue")
        let full = FamilyMember(userId: UUID(), name: "Legacy", initials: "L", color: "red"); full.isFullUser = true
        #expect(FamilyMember.current(in: [creator, linked, full], authUserId: me)?.name == "Iris")
        #expect(FamilyMember.current(in: [creator, full], authUserId: owner)?.name == "Scott")
        #expect(FamilyMember.current(in: [creator, full], authUserId: UUID())?.name == "Legacy")
        #expect(FamilyMember.current(in: [], authUserId: me) == nil)
    }

    @Test func createTaskFromFieldsWritesEveryFieldAndQueuesAnInsert() throws {
        let context = try makeContext()
        let userId = UUID(), assignee = UUID()
        let weekStart = Calendar.current.startOfDay(for: Date())
        let fields = PageTaskFields(title: "Call school", scheduledFor: nil, isAllDay: false, bucket: "week",
                                    weekStart: weekStart, assignedTo: assignee, notes: "ask about pickup",
                                    scope: "couple")
        let task = TaskViewModel(modelContext: context).createTask(fields: fields, userId: userId)
        #expect(task.title == "Call school")
        #expect(task.bucket == "week")
        #expect(task.weekStart == weekStart)
        #expect(task.assignedTo == assignee)
        #expect(task.notes == "ask about pickup")
        #expect(task.context == nil)          // a capture never stamps the lens
        #expect(task.scope == "couple")
        let queued = try context.fetch(FetchDescriptor<PendingChange>())
        #expect(queued.contains { $0.tableName == "tasks" && $0.recordId == task.id && $0.changeType == "insert" })
    }
}
