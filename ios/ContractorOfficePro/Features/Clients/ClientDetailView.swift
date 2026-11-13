import SwiftData
import SwiftUI

struct ClientDetailView: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    @Query private var clients: [Client]
    @Query private var jobs: [Job]
    @State private var clientEditor: ClientEditorRequest?
    @State private var jobEditor: JobEditorRequest?
    @State private var confirmingDelete = false
    @State private var saveFailed = false

    init(clientID: UUID) {
        _clients = Query(filter: #Predicate<Client> { $0.id == clientID && $0.deletedAt == nil })
        _jobs = Query(filter: #Predicate<Job> { $0.clientId == clientID && $0.deletedAt == nil },
                      sort: \Job.updatedAt, order: .reverse)
    }

    var body: some View {
        if let client = clients.first {
            content(for: client)
        } else {
            ContentUnavailableView {
                Label { Text(.clientNotFound) } icon: { Image(systemName: "trash") }
            }
        }
    }

    private func content(for client: Client) -> some View {
        List {
            ContactActions(client: client)
            Section {
                InfoRow(label: .clientFieldPhone, value: client.phone)
                InfoRow(label: .clientFieldEmail, value: client.email)
                InfoRow(label: .clientFieldAddress, value: client.address)
            } header: {
                Text(.clientSectionContact)
            }
            Section {
                LabeledContent { Text(client.preferredLanguage.title) } label: { Text(.clientFieldLanguage) }
                LabeledContent { Text(client.smsConsent.title) } label: { Text(.clientFieldSmsConsent) }
                if client.isSenior65Plus {
                    Label { Text(.clientFieldSenior) } icon: { Image(systemName: "person.badge.clock") }
                }
                if let notes = client.notes {
                    Text(notes)
                }
            } header: {
                Text(.clientSectionDetails)
            }
            Section {
                ForEach(jobs) { job in
                    NavigationLink(value: AppRoute.job(job.id)) {
                        HStack {
                            Text(job.title)
                            Spacer()
                            StatusBadge(status: job.status)
                        }
                    }
                }
                if jobs.isEmpty {
                    Text(.clientNoJobs).foregroundStyle(.secondary)
                }
                Button {
                    jobEditor = JobEditorRequest(clientID: client.id)
                } label: {
                    Label { Text(.clientNewJob) } icon: { Image(systemName: "plus") }
                }
            } header: {
                Text(.clientSectionJobs)
            }
            Section {
                Button(role: .destructive) { confirmingDelete = true } label: { Text(.commonDelete) }
            }
        }
        .navigationTitle(client.name)
        .toolbar {
            Button { clientEditor = ClientEditorRequest(client: client) } label: { Text(.commonEdit) }
        }
        .sheet(item: $clientEditor) { ClientEditor(request: $0) }
        .sheet(item: $jobEditor) { JobEditor(request: $0) }
        .confirmationDialog(Text(.clientDeleteConfirm), isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button(role: .destructive) {
                if (try? workspace.delete(client)) != nil { dismiss() } else { saveFailed = true }
            } label: { Text(.commonDelete) }
        } message: {
            Text(.clientDeleteMessage)
        }
        .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
    }
}

private struct ContactActions: View {
    @Environment(\.openURL) private var openURL
    let client: Client

    var body: some View {
        let actions: [(LocalizedStringResource, String, URL?)] = [
            (.clientActionCall, "phone.fill", ContactLinks.phone(client.phone)),
            (.clientActionText, "message.fill", ContactLinks.sms(client.phone)),
            (.clientActionEmail, "envelope.fill", ContactLinks.email(client.email)),
        ]
        if actions.contains(where: { $0.2 != nil }) {
            Section {
                HStack {
                    ForEach(actions.indices, id: \.self) { index in
                        let (title, icon, url) = actions[index]
                        Button {
                            if let url { openURL(url) }
                        } label: {
                            VStack {
                                Image(systemName: icon).font(.title3)
                                Text(title).font(.caption)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(url == nil)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
        }
    }
}
