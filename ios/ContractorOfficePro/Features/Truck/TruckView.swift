import SwiftData
import SwiftUI

/// "My truck": leftover materials and tools, one tab, two big segments.
struct TruckView: View {
    enum Section: Hashable { case leftovers, tools }

    @State private var section: Section = .leftovers

    var body: some View {
        VStack(spacing: 0) {
            Picker(selection: $section) {
                Text(.truckLeftovers).tag(Section.leftovers)
                Text(.truckTools).tag(Section.tools)
            } label: { EmptyView() }
            .pickerStyle(.segmented)
            .controlSize(.large)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .accessibilityIdentifier("truck-section")
            switch section {
            case .leftovers: LeftoversList()
            case .tools: ToolsGrid()
            }
        }
        .background(Theme.canvas)
        .navigationTitle(Text(.truckTitle))
    }
}

// MARK: - Leftovers

private struct LeftoversList: View {
    @Environment(Workspace.self) private var workspace
    @Query(filter: #Predicate<StockItem> { $0.deletedAt == nil }, sort: \StockItem.nameEn) private var stock: [StockItem]
    @State private var editor: StockEditorRequest?
    @State private var saveFailed = false

    private var groups: [(category: String, items: [StockItem])] {
        Dictionary(grouping: stock, by: \.category).sorted { $0.key < $1.key }.map { ($0.key, $0.value) }
    }

    var body: some View {
        List {
            if stock.isEmpty {
                ContentUnavailableView {
                    Label { Text(.leftoversEmptyTitle) } icon: { Image(systemName: "shippingbox") }
                } description: {
                    Text(.leftoversEmptyHint)
                }
                .listRowBackground(Color.clear)
            }
            ForEach(groups, id: \.category) { group in
                SwiftUI.Section {
                    ForEach(group.items) { item in
                        Button { editor = StockEditorRequest(item: item) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(item.nameEn).font(.body.weight(.medium))
                                    if let specs = item.specifications {
                                        Text(specs.replacingOccurrences(of: "\n", with: " · "))
                                            .font(.caption).foregroundStyle(Theme.muted)
                                    }
                                }
                                Spacer()
                                Text(verbatim: "\(item.qty.formatted()) \(item.unit)")
                                    .font(.headline).fontDesign(.monospaced)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .swipeActions {
                            Button(role: .destructive) {
                                do { try workspace.delete(item) } catch { saveFailed = true }
                            } label: { Text(.leftoversUsedUp) }
                        }
                    }
                } header: {
                    Text(MaterialCategory.title(group.category))
                }
            }
            SwiftUI.Section {
                Button { editor = StockEditorRequest() } label: {
                    Label { Text(.leftoversAdd) } icon: { Image(systemName: "plus") }
                }
            } footer: {
                Text(.leftoversFooter)
            }
        }
        .themedList()
        .sheet(item: $editor) { StockEditor(request: $0) }
        .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
    }
}

struct StockEditorRequest: Identifiable {
    let id = UUID()
    var item: StockItem?
}

private struct StockEditor: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let request: StockEditorRequest
    @State private var draft: StockDraft
    @State private var original: StockDraft
    @State private var saveFailed = false

    init(request: StockEditorRequest) {
        self.request = request
        let start = request.item.map(StockDraft.init) ?? StockDraft()
        _draft = State(initialValue: start)
        _original = State(initialValue: start)
    }

    var body: some View {
        NavigationStack {
            Form {
                SwiftUI.Section {
                    TextField(String(localized: .materialFieldName), text: $draft.nameEn, axis: .vertical)
                }
                SwiftUI.Section {
                    LabeledContent {
                        TextField(String(localized: .lineFieldQuantity), value: $draft.qty, format: .number)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .accessibilityIdentifier("stock-qty")
                    } label: { Text(.lineFieldQuantity) }
                    LabeledContent {
                        TextField(String(localized: .lineFieldUnit), text: $draft.unit).multilineTextAlignment(.trailing)
                    } label: { Text(.lineFieldUnit) }
                    TextField(String(localized: .toolFieldNotes), text: $draft.note, axis: .vertical)
                }
                if let item = request.item {
                    SwiftUI.Section {
                        Button(role: .destructive) {
                            do { try workspace.delete(item); dismiss() } catch { saveFailed = true }
                        } label: { Text(.leftoversUsedUp) }
                    }
                }
            }
            .themedList()
            .navigationTitle(Text(request.item == nil ? .leftoversAdd : .leftoversEdit))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                EditorToolbar(canSave: draft.isValid && (draft != original || request.item == nil),
                              onCancel: { dismiss() }, onSave: save)
            }
            .interactiveDismissDisabled(draft != original)
            .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
        }
    }

    private func save() {
        do {
            try workspace.save(draft, to: request.item)
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}

// MARK: - Tools

private struct ToolsGrid: View {
    @Environment(Workspace.self) private var workspace
    @Query(filter: #Predicate<Tool> { $0.deletedAt == nil }, sort: \Tool.nameEn) private var tools: [Tool]
    @State private var adding = false
    @State private var editing: ToolEditorRequest?
    @State private var search = ""

    private var shown: [Tool] {
        let query = search.trimmed.lowercased()
        guard !query.isEmpty else { return tools }
        return tools.filter { tool in
            [tool.nameEn, tool.nameEs, tool.brand ?? "", tool.holder ?? "", tool.serialNumber ?? ""]
                .contains { $0.lowercased().contains(query) }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Button { adding = true } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "camera.viewfinder").font(.system(size: 30, weight: .semibold))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(.toolsAddFromPhotos).font(.title3.weight(.semibold))
                            Text(.toolsAddFromPhotosHint).font(.subheadline).opacity(0.85)
                        }
                        Spacer()
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, minHeight: 84)
                }
                .primaryActionStyle()
                .accessibilityIdentifier("tools-add-photos")

                if tools.isEmpty {
                    Text(.toolsEmptyHint).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                } else {
                    Text(.toolsCount(count: tools.count)).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                        ForEach(shown) { tool in
                            Button { editing = ToolEditorRequest(tool: tool) } label: { ToolCard(tool: tool) }
                                .buttonStyle(.plain)
                        }
                    }
                }
                Button { editing = ToolEditorRequest() } label: {
                    Label { Text(.toolsAddByHand) } icon: { Image(systemName: "plus") }
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.accent)
            }
            .padding(16)
        }
        .searchable(text: $search, prompt: Text(.toolsSearch))
        .sheet(isPresented: $adding) { AddToolsSheet() }
        .sheet(item: $editing) { ToolEditor(request: $0) }
    }
}

struct ToolCard: View {
    let tool: Tool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                Theme.accentSoft
                if let name = tool.photoFileName, let image = PhotoStore.shared.thumbnail(named: name, side: 400) {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    Image(systemName: ToolCategory.systemImage(tool.category))
                        .font(.system(size: 34, weight: .semibold)).foregroundStyle(Theme.accent)
                }
            }
            .frame(height: 110)
            .frame(maxWidth: .infinity)
            .clipShape(.rect(cornerRadius: 12))
            Text(tool.nameEn).font(.headline).lineLimit(2).multilineTextAlignment(.leading)
            if let brand = tool.brand {
                Text(brand).font(.caption).foregroundStyle(Theme.muted)
            }
            HStack(spacing: 4) {
                Image(systemName: tool.holder == nil ? "shippingbox.fill" : "person.fill")
                if let holder = tool.holder { Text(verbatim: holder).lineLimit(1) } else { Text(.toolsInTruck) }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(tool.holder == nil ? Theme.muted : Theme.warning)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: .rect(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.border))
        .contentShape(.rect(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("tool-\(tool.nameEn)")
    }
}

struct ToolEditorRequest: Identifiable {
    let id = UUID()
    var tool: Tool?
}

/// Edit a tool and, mostly, say who has it with one tap.
struct ToolEditor: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let request: ToolEditorRequest
    @State private var draft: ToolDraft
    @State private var original: ToolDraft
    @State private var newPhoto: Data?
    @State private var holders: [String] = []
    @State private var typingHolder = false
    @State private var confirmingDelete = false
    @State private var saveFailed = false

    init(request: ToolEditorRequest) {
        self.request = request
        let start = request.tool.map(ToolDraft.init) ?? ToolDraft()
        _draft = State(initialValue: start)
        _original = State(initialValue: start)
    }

    private var photo: UIImage? {
        if let newPhoto { return UIImage(data: newPhoto) }
        return request.tool?.photoFileName.flatMap { PhotoStore.shared.thumbnail(named: $0, side: 800) }
    }

    var body: some View {
        NavigationStack {
            Form {
                SwiftUI.Section {
                    if let photo {
                        Image(uiImage: photo).resizable().scaledToFit().frame(maxHeight: 220)
                            .clipShape(.rect(cornerRadius: 12)).frame(maxWidth: .infinity)
                    }
                    PhotoAddButtons(remaining: 1) { added in newPhoto = added.first }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
                SwiftUI.Section {
                    FlowLayout(spacing: 8) {
                        holderChip(Text(.toolsInTruck), selected: draft.holder.trimmed.isEmpty) {
                            draft.holder = ""; typingHolder = false
                        }
                        ForEach(holders, id: \.self) { name in
                            holderChip(Text(verbatim: name), selected: draft.holder == name) {
                                draft.holder = name; typingHolder = false
                            }
                        }
                        holderChip(Text(.toolsSomeoneElse), selected: typingHolder) {
                            typingHolder = true; draft.holder = ""
                        }
                    }
                    .padding(.vertical, 4)
                    if typingHolder {
                        TextField(String(localized: .toolsHolderPlaceholder), text: $draft.holder)
                            .textContentType(.name)
                            .accessibilityIdentifier("tool-holder")
                    }
                } header: {
                    Text(.toolsWhoHasIt)
                }
                SwiftUI.Section {
                    TextField(String(localized: .toolFieldName), text: $draft.nameEn)
                    TextField(String(localized: .toolFieldNameEs), text: $draft.nameEs)
                    Picker(selection: $draft.category) {
                        ForEach(ToolCategory.all, id: \.self) { Text(ToolCategory.title($0)).tag($0) }
                    } label: { Text(.toolFieldCategory) }
                }
                SwiftUI.Section {
                    TextField(String(localized: .toolFieldBrand), text: $draft.brand)
                    TextField(String(localized: .toolFieldModel), text: $draft.model)
                    TextField(String(localized: .toolFieldSerial), text: $draft.serialNumber)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    TextField(String(localized: .toolFieldNotes), text: $draft.notes, axis: .vertical)
                } footer: {
                    Text(.toolFieldSerialHint)
                }
                if request.tool != nil {
                    SwiftUI.Section {
                        Button(role: .destructive) { confirmingDelete = true } label: { Text(.toolsDelete) }
                    }
                }
            }
            .themedList()
            .navigationTitle(Text(request.tool == nil ? .toolsAddByHand : .toolsEdit))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                EditorToolbar(canSave: draft.isValid && (draft != original || newPhoto != nil || request.tool == nil),
                              onCancel: { dismiss() }, onSave: save)
            }
            .interactiveDismissDisabled(draft != original || newPhoto != nil)
            .onAppear {
                holders = workspace.toolHolders()
                if !draft.holder.isEmpty && !holders.contains(draft.holder) { holders.insert(draft.holder, at: 0) }
            }
            .confirmationDialog(Text(.toolsDeleteConfirm), isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button(role: .destructive) {
                    if let tool = request.tool, (try? workspace.delete(tool)) != nil { dismiss() } else { saveFailed = true }
                } label: { Text(.commonDelete) }
            }
            .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
        }
    }

    private func holderChip(_ title: Text, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            title.font(.headline)
                .padding(.horizontal, 16).frame(minHeight: 44)
                .foregroundStyle(selected ? Theme.onAccent : .primary)
                .background(selected ? Theme.accent : Theme.accentSoft, in: .capsule)
                .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func save() {
        do {
            try workspace.save(draft, to: request.tool, photo: newPhoto)
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}
