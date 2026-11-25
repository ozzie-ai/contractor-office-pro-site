import SwiftData
import SwiftUI

struct JobListView: View {
    @Environment(Workspace.self) private var workspace
    @Query(filter: #Predicate<Job> { $0.deletedAt == nil }, sort: \Job.updatedAt, order: .reverse)
    private var jobs: [Job]
    @Query(filter: #Predicate<Client> { $0.deletedAt == nil })
    private var clients: [Client]
    @State private var filter: JobFilter = .active
    @State private var editor: JobEditorRequest?
    @State private var quickEstimate = false
    @State private var openedEstimate: UUID?

    private var sections: [JobSection] { JobSection.make(from: jobs, filter: filter) }
    private var clientNames: [UUID: String] { Dictionary(uniqueKeysWithValues: clients.map { ($0.id, $0.name) }) }

    var body: some View {
        List {
            Section {
                DashboardHeader(memberID: workspace.memberID) { quickEstimate = true }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }
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
                        .zoomSource(.job(job.id))
                    }
                } header: {
                    StatusBadge(status: section.status)
                }
            }
        }
        .refreshable { await workspace.sync.syncNow() }
        .overlay {
            if sections.isEmpty { emptyState.padding(.top, 220) }
        }
        .themedList()
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
        .fullScreenCover(isPresented: $quickEstimate) {
            QuickEstimateFlow { openedEstimate = $0 }
        }
        .navigationDestination(item: $openedEstimate) { EstimateView(estimateID: $0) }
        .sensoryFeedback(.success, trigger: openedEstimate) { _, new in new != nil }
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
                Button { quickEstimate = true } label: { Text(.homeNewEstimate) }
                    .primaryActionStyle()
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
            Text(job.title).font(.body.weight(.semibold)).tracking(-0.2)
            if let clientName {
                Text(clientName).font(.subheadline)
            }
            if let address = job.address {
                Text(address).font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1)
            }
            if let start = job.scheduledStart {
                Text(start, format: .dateTime.weekday().month().day().hour().minute())
                    .font(.caption).fontDesign(.monospaced)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 2)
    }
}

#if DEBUG
#Preview {
    let (container, session) = PreviewData.ready(withSamples: true)
    return RootView().environment(session).modelContainer(container)
}
#endif
