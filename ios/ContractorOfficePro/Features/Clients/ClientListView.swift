import SwiftData
import SwiftUI

struct ClientListView: View {
    @State private var search = ""
    @State private var editor: ClientEditorRequest?

    var body: some View {
        ClientList(search: search, onAdd: { editor = ClientEditorRequest() })
            .searchable(text: $search, prompt: Text(.clientsSearch))
            .navigationTitle(Text(.clientsTitle))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { editor = ClientEditorRequest() } label: {
                        Label { Text(.clientsNew) } icon: { Image(systemName: "plus") }
                    }
                }
            }
            .sheet(item: $editor) { ClientEditor(request: $0) }
    }
}

/// Separate view so the @Query is rebuilt when the search text changes.
private struct ClientList: View {
    @Query private var clients: [Client]
    let search: String
    let onAdd: () -> Void

    init(search: String, onAdd: @escaping () -> Void) {
        self.search = search
        self.onAdd = onAdd
        let term = search.trimmed
        _clients = Query(filter: #Predicate<Client> {
            $0.deletedAt == nil && (term.isEmpty || $0.name.localizedStandardContains(term))
        }, sort: \Client.name)
    }

    var body: some View {
        List(clients) { client in
            NavigationLink(value: AppRoute.client(client.id)) {
                ClientRow(client: client)
            }
        }
        .overlay {
            if clients.isEmpty {
                if search.trimmed.isEmpty {
                    ContentUnavailableView {
                        Label { Text(.clientsEmptyTitle) } icon: { Image(systemName: "person.2") }
                    } description: {
                        Text(.clientsEmptyMessage)
                    } actions: {
                        Button(action: onAdd) { Text(.clientsNew) }.buttonStyle(.borderedProminent)
                    }
                } else {
                    ContentUnavailableView.search(text: search)
                }
            }
        }
    }
}

struct ClientRow: View {
    let client: Client

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(client.name).font(.headline)
                if let phone = client.phone {
                    Text(phone).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if client.preferredLanguage == .es {
                Text(verbatim: "ES")
                    .font(.caption.bold())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.tint.opacity(0.15), in: .capsule)
                    .accessibilityLabel(Text(.languageEs))
            }
        }
    }
}

#Preview {
    let (container, session) = PreviewData.ready(withSamples: true)
    return RootView().environment(session).modelContainer(container)
}
