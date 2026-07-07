import SwiftUI
import SwiftData

struct FamilyRulesView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \FamilyRule.createdAt, order: .reverse) private var rules: [FamilyRule]
    @State private var showingNewRule = false

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()

            if rules.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "list.clipboard")
                        .font(.system(size: 48))
                        .foregroundStyle(Color.coachingTint.opacity(0.5))
                    Text("No Family Rules")
                        .font(.displaySmall)
                    Text("Add rules to guide daily coaching.")
                        .font(.bodySmall)
                        .foregroundStyle(Color.textSecondary)
                }
            } else {
                List {
                    let grouped = Dictionary(grouping: rules) { $0.status }
                    ForEach(["active", "draft", "paused", "retired"], id: \.self) { status in
                        if let statusRules = grouped[status], !statusRules.isEmpty {
                            Section(status.capitalized) {
                                ForEach(statusRules, id: \.id) { rule in
                                    NavigationLink {
                                        FamilyRuleDetailView(rule: rule)
                                    } label: {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(rule.rule)
                                                .font(.bodyMedium)
                                                .lineLimit(2)

                                            HStack(spacing: 4) {
                                                ForEach(rule.appliesTo, id: \.self) { who in
                                                    Text(who.capitalized)
                                                        .font(.captionText)
                                                        .foregroundStyle(Color.textSecondary)
                                                        .padding(.horizontal, 6)
                                                        .padding(.vertical, 2)
                                                        .background(Color.bgSurface)
                                                        .clipShape(Capsule())
                                                }
                                            }
                                        }
                                    }
                                }
                                .onDelete { offsets in
                                    for offset in offsets {
                                        modelContext.queueSync(table: "family_rules", recordId: statusRules[offset].id, type: "delete")
                                        modelContext.delete(statusRules[offset])
                                    }
                                    try? modelContext.save()
                                }
                            }
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
        }
        .navigationTitle("Family Rules")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingNewRule = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingNewRule) {
            if let userId = auth.currentUser?.id {
                NewFamilyRuleSheet(userId: userId)
                    .presentationDetents([.medium])
            }
        }
    }
}

// MARK: - Rule Detail

struct FamilyRuleDetailView: View {
    @Bindable var rule: FamilyRule
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var responsibilities: [Responsibility]

    private var linkedResponsibilities: [Responsibility] {
        responsibilities.filter { $0.ruleId == rule.id }
    }

    var body: some View {
        Form {
            Section("Rule") {
                TextEditor(text: $rule.rule)
                    .font(.bodyMedium)
                    .frame(minHeight: 60)
                    .onChange(of: rule.rule) { _, _ in markDirty() }
            }

            Section("Status") {
                Picker("Status", selection: Binding(
                    get: { rule.status },
                    set: { rule.status = $0; markDirty() }
                )) {
                    Text("Draft").tag("draft")
                    Text("Active").tag("active")
                    Text("Paused").tag("paused")
                    Text("Retired").tag("retired")
                }
            }

            Section("Rationale") {
                TextEditor(text: Binding(
                    get: { rule.rationale ?? "" },
                    set: { rule.rationale = $0.isEmpty ? nil : $0; markDirty() }
                ))
                .frame(minHeight: 60)
            }

            Section("Enforcement Tip") {
                TextEditor(text: Binding(
                    get: { rule.enforcementTip ?? "" },
                    set: { rule.enforcementTip = $0.isEmpty ? nil : $0; markDirty() }
                ))
                .frame(minHeight: 60)
            }

            if !linkedResponsibilities.isEmpty {
                Section("Responsibilities") {
                    ForEach(linkedResponsibilities, id: \.id) { resp in
                        HStack {
                            Text(resp.who.capitalized)
                                .font(.bodySmallBold)
                            Text(resp.task)
                                .font(.bodySmall)
                            Spacer()
                            Text(resp.frequency)
                                .font(.captionText)
                                .foregroundStyle(Color.textTertiary)
                        }
                    }
                }
            }

            Section {
                Button(role: .destructive) {
                    modelContext.queueSync(table: "family_rules", recordId: rule.id, type: "delete")
                    modelContext.delete(rule)
                    try? modelContext.save()
                    dismiss()
                } label: {
                    Label("Delete Rule", systemImage: "trash")
                }
            }
        }
        .navigationTitle("Rule")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func markDirty() {
        rule.updatedAt = Date()
        rule.syncStatus = .pending
        modelContext.queueSync(table: "family_rules", recordId: rule.id, type: "update")
        try? modelContext.save()
    }
}

// MARK: - New Rule Sheet

struct NewFamilyRuleSheet: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var ruleText = ""
    @State private var status = "draft"

    var body: some View {
        NavigationStack {
            Form {
                Section("Rule") {
                    TextEditor(text: $ruleText)
                        .frame(minHeight: 80)
                }

                Section("Status") {
                    Picker("Status", selection: $status) {
                        Text("Draft").tag("draft")
                        Text("Active").tag("active")
                    }
                }
            }
            .navigationTitle("New Rule")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let rule = FamilyRule(userId: userId, rule: ruleText, status: status)
                        modelContext.insert(rule)
                        modelContext.queueSync(table: "family_rules", recordId: rule.id, type: "insert")
                        try? modelContext.save()
                        dismiss()
                    }
                    .disabled(ruleText.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
