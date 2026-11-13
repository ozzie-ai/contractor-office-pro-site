import SwiftData
import SwiftUI

struct JobDetailView: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Query private var jobs: [Job]
    @Query private var clients: [Client]
    @State private var editor: JobEditorRequest?
    @State private var confirmingDelete = false
    @State private var saveFailed = false

    init(jobID: UUID) {
        _jobs = Query(filter: #Predicate<Job> { $0.id == jobID && $0.deletedAt == nil })
        _clients = Query()
    }

    private var job: Job? { jobs.first }
    private var client: Client? { job?.clientId.flatMap { id in clients.first { $0.id == id } } }

    var body: some View {
        if let job {
            content(for: job)
        } else {
            ContentUnavailableView {
                Label { Text(.jobNotFound) } icon: { Image(systemName: "trash") }
            }
        }
    }

    private func content(for job: Job) -> some View {
        List {
            Section {
                Picker(selection: statusBinding(for: job)) {
                    ForEach(Job.Status.allCases, id: \.self) { status in
                        Label { Text(status.title) } icon: { Image(systemName: status.systemImage) }.tag(status)
                    }
                } label: {
                    Text(.jobFieldStatus)
                }
                clientRow
                if let address = job.address {
                    Button {
                        if let url = ContactLinks.maps(address) { openURL(url) }
                    } label: {
                        LabeledContent {
                            Text(address).multilineTextAlignment(.trailing)
                        } label: {
                            Label { Text(.jobActionOpenMaps) } icon: { Image(systemName: "map") }
                        }
                    }
                }
            }
            if let start = job.scheduledStart {
                Section {
                    LabeledContent { Text(start, format: .dateTime.weekday().month().day().hour().minute()) } label: {
                        Text(.jobFieldStart)
                    }
                    if let end = job.scheduledEnd {
                        LabeledContent { Text(end, format: .dateTime.weekday().month().day().hour().minute()) } label: {
                            Text(.jobFieldEnd)
                        }
                    }
                } header: {
                    Text(.jobSectionSchedule)
                }
            }
            if let notes = job.notes {
                Section { Text(notes) } header: { Text(.jobSectionNotes) }
            }
            Section {
                Button(role: .destructive) { confirmingDelete = true } label: { Text(.commonDelete) }
            }
        }
        .navigationTitle(job.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button { editor = JobEditorRequest(job: job) } label: { Text(.commonEdit) }
        }
        .sheet(item: $editor) { JobEditor(request: $0) }
        .confirmationDialog(Text(.jobDeleteConfirm), isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button(role: .destructive) {
                if (try? workspace.delete(job)) != nil { dismiss() } else { saveFailed = true }
            } label: { Text(.commonDelete) }
        }
        .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
    }

    @ViewBuilder
    private var clientRow: some View {
        if let client {
            NavigationLink(value: AppRoute.client(client.id)) {
                LabeledContent {
                    Text(client.deletedAt == nil ? client.name : String(localized: .jobDeletedClient))
                } label: {
                    Text(.jobFieldClient)
                }
            }
        } else {
            LabeledContent { Text(.jobNoClient) } label: { Text(.jobFieldClient) }
        }
    }

    private func statusBinding(for job: Job) -> Binding<Job.Status> {
        Binding(
            get: { job.status },
            set: { newValue in
                do { try workspace.setStatus(newValue, for: job) } catch { saveFailed = true }
            }
        )
    }
}
