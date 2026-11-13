import SwiftUI

/// Describe the work → AI drafts line items → pricing fills in what it can → a draft estimate opens.
struct EstimateDraftSheet: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let job: Job
    let defaultLanguage: AppLanguage
    let onCreated: (UUID) -> Void
    @State private var notes = ""
    @State private var language: AppLanguage
    @State private var phase: EstimateDrafting.Phase?
    @State private var failure: BackendError?
    @FocusState private var notesFocused: Bool

    init(job: Job, defaultLanguage: AppLanguage, onCreated: @escaping (UUID) -> Void) {
        self.job = job
        self.defaultLanguage = defaultLanguage
        self.onCreated = onCreated
        _language = State(initialValue: defaultLanguage)
    }

    private var canDraft: Bool { phase == nil && notes.trimmed.count >= 10 && workspace.estimateService != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: .estimateDraftPlaceholder), text: $notes, axis: .vertical)
                        .lineLimit(6...14)
                        .focused($notesFocused)
                        .accessibilityIdentifier("draft-notes")
                } header: {
                    Text(.estimateDraftNotesHeader)
                } footer: {
                    Label { Text(.estimateDraftDictateHint) } icon: { Image(systemName: "mic") }
                }
                Section {
                    Picker(selection: $language) {
                        ForEach(AppLanguage.allCases, id: \.self) { Text($0.title).tag($0) }
                    } label: {
                        Text(.estimateDraftLanguage)
                    }
                }
                if workspace.estimateService == nil {
                    Section { Text(.aiErrorNotConfigured).foregroundStyle(.orange) }
                }
                if let failure {
                    Section { Text(failure.message).foregroundStyle(.red) }
                }
                Section {
                    Button(action: draft) {
                        HStack {
                            Label { Text(.estimateDraftAction) } icon: { Image(systemName: "sparkles") }
                            Spacer()
                            if let phase {
                                ProgressView()
                                Text(phase == .reading ? .estimateDraftReading : .estimateDraftPricing)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .disabled(!canDraft)
                } footer: {
                    Text(.estimateDraftReviewHint)
                }
            }
            .navigationTitle(Text(.estimateDraftTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.commonCancel) }
                        .disabled(phase != nil)
                }
            }
            .interactiveDismissDisabled(phase != nil || !notes.trimmed.isEmpty)
            .onAppear { notesFocused = true }
        }
    }

    private func draft() {
        guard let service = workspace.estimateService else { return }
        failure = nil
        notesFocused = false
        Task {
            defer { phase = nil }
            do {
                let result = try await EstimateDrafting.draft(notes: notes, language: language, service: service) { phase = $0 }
                let estimate = try workspace.createEstimate(for: job, notes: notes, language: language, draft: result)
                dismiss()
                onCreated(estimate.id)
            } catch {
                failure = error as? BackendError ?? .invalidResponse
            }
        }
    }
}
