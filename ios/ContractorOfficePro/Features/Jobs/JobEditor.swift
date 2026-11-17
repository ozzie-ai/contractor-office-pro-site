import SwiftData
import SwiftUI

struct JobEditorRequest: Identifiable {
    let id = UUID()
    var job: Job?
    var clientID: UUID?
}

/// New/edit job sheet. Edits a draft; Save writes through the Workspace.
struct JobEditor: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    @Query(filter: #Predicate<Client> { $0.deletedAt == nil }, sort: \Client.name)
    private var clients: [Client]
    let request: JobEditorRequest
    @State private var draft: JobDraft
    @State private var original: JobDraft
    @State private var saveFailed = false

    init(request: JobEditorRequest) {
        self.request = request
        let start = request.job.map(JobDraft.init) ?? JobDraft(clientID: request.clientID)
        _draft = State(initialValue: start)
        _original = State(initialValue: start)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: .jobFieldTitle), text: $draft.title)
                    Picker(selection: $draft.clientID) {
                        Text(.commonNone).tag(UUID?.none)
                        ForEach(clients) { Text($0.name).tag(Optional($0.id)) }
                    } label: {
                        Text(.jobFieldClient)
                    }
                    TextField(String(localized: .jobFieldAddress), text: $draft.address, axis: .vertical)
                        .textContentType(.fullStreetAddress)
                    Picker(selection: $draft.status) {
                        ForEach(Job.Status.allCases, id: \.self) { Text($0.title).tag($0) }
                    } label: {
                        Text(.jobFieldStatus)
                    }
                }
                Section {
                    Toggle(isOn: $draft.hasSchedule.animation()) { Text(.jobFieldHasSchedule) }
                    if draft.hasSchedule {
                        DatePicker(selection: $draft.start) { Text(.jobFieldStart) }
                        DatePicker(selection: $draft.end, in: draft.start...) { Text(.jobFieldEnd) }
                    }
                } header: {
                    Text(.jobSectionSchedule)
                } footer: {
                    if !draft.isScheduleValid { Text(.jobErrorEndBeforeStart).foregroundStyle(.red) }
                }
                Section {
                    TextField(String(localized: .jobFieldNotes), text: $draft.notes, axis: .vertical)
                        .lineLimit(3...8)
                } header: {
                    Text(.jobSectionNotes)
                }
            }
            .navigationTitle(Text(request.job == nil ? .jobsNew : .jobsEdit))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                EditorToolbar(canSave: draft.isValid && draft != original, onCancel: { dismiss() }, onSave: save)
            }
            .interactiveDismissDisabled(draft != original)
            .onChange(of: draft.clientID) { _, newID in fillAddress(from: newID) }
            .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
        }
    }

    private func fillAddress(from clientID: UUID?) {
        guard draft.address.trimmed.isEmpty, let clientID,
              let address = clients.first(where: { $0.id == clientID })?.address else { return }
        draft.address = address
    }

    private func save() {
        do {
            try workspace.save(draft, to: request.job)
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}
