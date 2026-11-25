import SwiftData
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
    @Query private var photos: [Media]

    init(job: Job, defaultLanguage: AppLanguage, onCreated: @escaping (UUID) -> Void) {
        self.job = job
        self.defaultLanguage = defaultLanguage
        self.onCreated = onCreated
        _language = State(initialValue: defaultLanguage)
        let jobID = job.id, photo = Media.Kind.photo.rawValue
        _photos = Query(filter: #Predicate<Media> { $0.jobId == jobID && $0.kindRaw == photo && $0.deletedAt == nil },
                        sort: \Media.capturedAt)
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
                    VStack(alignment: .leading, spacing: 6) {
                        Label { Text(.estimateDraftDictateHint) } icon: { Image(systemName: "mic") }
                        if !photos.isEmpty {
                            Label { Text(.photosAiWillUse(count: min(photos.count, 6))) } icon: { Image(systemName: "photo") }
                        }
                    }
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
                            Image(systemName: "sparkles")
                                .symbolEffect(.variableColor.iterative, isActive: phase != nil)
                            if let phase {
                                Text(phase == .reading ? .estimateDraftReading : .estimateDraftPricing)
                            } else {
                                Text(.estimateDraftAction)
                            }
                        }
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .contentTransition(.opacity)
                        .animation(.smooth, value: phase)
                    }
                    .primaryActionStyle()
                    .disabled(!canDraft)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                } footer: {
                    Text(.estimateDraftReviewHint)
                }
            }
            .themedList()
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
        .overlay {
            if phase != nil { AIGlow().transition(.opacity) }
        }
        .animation(.smooth(duration: 0.4), value: phase != nil)
    }

    private func draft() {
        guard let service = workspace.estimateService else { return }
        failure = nil
        notesFocused = false
        Task {
            defer { phase = nil }
            do {
                // The most recent photos (the AI looks at up to 6).
                let images = photos.suffix(6).compactMap { $0.localFileName.flatMap(PhotoStore.shared.aiImage(named:)) }
                let result = try await EstimateDrafting.draft(notes: notes, language: language, images: images,
                                                              service: service) { phase = $0 }
                let estimate = try workspace.createEstimate(for: job, notes: notes, language: language, draft: result)
                dismiss()
                onCreated(estimate.id)
            } catch {
                failure = error as? BackendError ?? .invalidResponse
            }
        }
    }
}
