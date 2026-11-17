import SwiftData
import SwiftUI

struct JobListView: View {
    @Query(filter: #Predicate<Job> { $0.deletedAt == nil }, sort: \Job.updatedAt, order: .reverse)
    private var jobs: [Job]
    @Query(filter: #Predicate<Client> { $0.deletedAt == nil })
    private var clients: [Client]
    @State private var filter: JobFilter = .active
    @State private var editor: JobEditorRequest?

    private var sections: [JobSection] { JobSection.make(from: jobs, filter: filter) }
    private var clientNames: [UUID: String] { Dictionary(uniqueKeysWithValues: clients.map { ($0.id, $0.name) }) }

    var body: some View {
        List {
            Section {
                Picker(selection: $filter) {
                    ForEach(JobFilter.allCases) { Text($0.title).tag($0) }
                } label: {
                    Text(.jobsFilter)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            ForEach(sections) { section in
                Section {
                    ForEach(section.jobs) { job in
                        NavigationLink(value: AppRoute.job(job.id)) {
                            JobRow(job: job, clientName: job.clientId.flatMap { clientNames[$0] })
                        }
                    }
                } header: {
                    StatusBadge(status: section.status)
                }
            }
        }
        .overlay {
            if sections.isEmpty { emptyState }
        }
        .navigationTitle(Text(.jobsTitle))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { editor = JobEditorRequest() } label: {
                    Label { Text(.jobsNew) } icon: { Image(systemName: "plus") }
                }
            }
        }
        .sheet(item: $editor) { request in
            JobEditor(request: request)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        switch filter {
        case .active:
            ContentUnavailableView {
                Label { Text(.jobsEmptyTitle) } icon: { Image(systemName: "hammer") }
            } description: {
                Text(.jobsEmptyMessage)
            } actions: {
                Button { editor = JobEditorRequest() } label: { Text(.jobsNew) }
                    .buttonStyle(.borderedProminent)
            }
        case .done:
            ContentUnavailableView {
                Label { Text(.jobsEmptyDoneTitle) } icon: { Image(systemName: "checkmark.circle") }
            }
        }
    }
}

struct JobRow: View {
    let job: Job
    let clientName: String?

    var body: some View {
        VStack(alignment: .leading) {
            Text(job.title).font(.headline)
            if let clientName {
                Text(clientName).font(.subheadline)
            }
            if let address = job.address {
                Text(address).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            if let start = job.scheduledStart {
                Label {
                    Text(start, format: .dateTime.weekday().month().day().hour().minute())
                } icon: {
                    Image(systemName: "calendar")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    let (container, session) = PreviewData.ready(withSamples: true)
    return RootView().environment(session).modelContainer(container)
}
