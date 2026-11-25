import SwiftUI

/// Bulk tool inventory: snap or pick up to 20 photos → the AI lists the tools → uncheck mistakes → add them all.
struct AddToolsSheet: View {
    static let maxPhotos = 20

    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    @State private var photos: [PendingPhoto] = []
    @State private var picks: [ToolPick]?
    @State private var selected: Set<UUID> = []
    @State private var finding = false
    @State private var progress = 0
    @State private var failure: BackendError?
    @State private var saveFailed = false

    var body: some View {
        NavigationStack {
            Group {
                if let picks {
                    review(picks)
                } else {
                    pickPhotos
                }
            }
            .background(Theme.canvas)
            .navigationTitle(Text(.toolsAddFromPhotos))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.commonCancel) }.disabled(finding)
                }
            }
            .interactiveDismissDisabled(finding || !photos.isEmpty)
        }
        .overlay { if finding { AIGlow().transition(.opacity) } }
        .animation(.smooth(duration: 0.4), value: finding)
        .animation(.smooth, value: picks == nil)
    }

    // MARK: Step 1: photos

    private var pickPhotos: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(.toolsPhotosHint).font(.title3).fixedSize(horizontal: false, vertical: true)
                if !photos.isEmpty {
                    PhotoStrip(photos: photos.map { PhotoThumb(id: $0.id, image: $0.thumbnail) }) { id in
                        photos.removeAll { $0.id == id }
                    }
                    Text(.toolsPhotoCount(count: photos.count, max: Self.maxPhotos))
                        .font(.subheadline).foregroundStyle(Theme.muted)
                }
                PhotoAddButtons(remaining: Self.maxPhotos - photos.count) { added in
                    withAnimation(.snappy) { photos += added.prefix(Self.maxPhotos - photos.count).map(PendingPhoto.init) }
                }
                if let failure {
                    Text(failure.message).foregroundStyle(Theme.danger)
                }
                if workspace.estimateService == nil {
                    Text(.aiErrorNotConfigured).font(.footnote).foregroundStyle(Theme.warning)
                }
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            Button(action: find) {
                HStack {
                    Image(systemName: "sparkles").symbolEffect(.variableColor.iterative, isActive: finding)
                    if finding {
                        Text(.toolsFinding(done: progress, total: photos.count))
                    } else {
                        Text(.toolsFind)
                    }
                }
                .font(.title3.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 56)
            }
            .primaryActionStyle()
            .disabled(photos.isEmpty || finding || workspace.estimateService == nil)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .accessibilityIdentifier("tools-find")
        }
    }

    // MARK: Step 2: review

    private func review(_ picks: [ToolPick]) -> some View {
        List {
            Section {
                ForEach(picks.indices, id: \.self) { index in
                    pickRow(index)
                }
            } header: {
                Text(.toolsFoundHeader(count: picks.count))
            } footer: {
                Text(.toolsReviewHint)
            }
        }
        .themedList()
        .safeAreaInset(edge: .bottom) {
            Button(action: addSelected) {
                Text(.toolsAddCount(count: selectedCount))
                    .font(.title3.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 56)
            }
            .primaryActionStyle()
            .disabled(selectedCount == 0)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .accessibilityIdentifier("tools-add-selected")
        }
        .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
    }

    private var selectedCount: Int {
        (picks ?? []).filter { selected.contains($0.id) }.reduce(0) { $0 + max($1.quantity, 1) }
    }

    private func pickRow(_ index: Int) -> some View {
        let pick = picks![index]
        let isOn = selected.contains(pick.id)
        return HStack(spacing: 12) {
            Button {
                if isOn { selected.remove(pick.id) } else { selected.insert(pick.id) }
            } label: {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(isOn ? Theme.accent : Theme.muted)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("tool-pick-\(pick.nameEn)")
            if photos.indices.contains(pick.photoIndex) {
                Image(uiImage: photos[pick.photoIndex].thumbnail)
                    .resizable().scaledToFill().frame(width: 52, height: 52).clipShape(.rect(cornerRadius: 10))
            }
            VStack(alignment: .leading, spacing: 3) {
                TextField(String(localized: .toolFieldName), text: Binding(get: { picks?[index].nameEn ?? "" },
                                                                           set: { picks?[index].nameEn = $0 }))
                    .font(.body.weight(.medium))
                HStack(spacing: 6) {
                    if pick.quantity > 1 { Text(verbatim: "×\(pick.quantity)").font(.caption.weight(.bold)) }
                    if let brand = pick.brand { Text(brand).font(.caption) }
                    Text(ToolCategory.title(pick.category)).font(.caption)
                }
                .foregroundStyle(Theme.muted)
                if !pick.note.isEmpty {
                    Text(pick.note).font(.caption2).foregroundStyle(Theme.warning)
                }
            }
        }
        .opacity(isOn ? 1 : 0.5)
    }

    // MARK: Actions

    private func find() {
        guard let service = workspace.estimateService else { return }
        failure = nil
        progress = 0
        finding = true
        Task {
            defer { finding = false }
            do {
                let found = try await ToolFinding.find(in: photos.map(\.data), language: workspace.organization?.defaultLanguage ?? .en,
                                                       service: service) { progress = $0 }
                selected = Set(found.map(\.id))
                picks = found
            } catch {
                failure = error as? BackendError ?? .invalidResponse
            }
        }
    }

    private func addSelected() {
        let chosen = (picks ?? []).filter { selected.contains($0.id) && !$0.nameEn.trimmed.isEmpty }
        do {
            try workspace.addTools(chosen, photos: photos.map(\.data))
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}
