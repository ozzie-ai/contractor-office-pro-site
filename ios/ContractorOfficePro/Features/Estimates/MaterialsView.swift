import SwiftData
import SwiftUI

/// Bill of materials for one estimate: grouped by category, check off what's bought, shop each item.
struct MaterialsView: View {
    @Environment(Workspace.self) private var workspace
    @Query private var estimates: [Estimate]
    @Query private var items: [MaterialItem]
    @State private var editor: MaterialEditorRequest?
    @State private var saveFailed = false

    init(estimateID: UUID) {
        _estimates = Query(filter: #Predicate<Estimate> { $0.id == estimateID })
        _items = Query(filter: #Predicate<MaterialItem> { $0.estimateId == estimateID && $0.deletedAt == nil },
                       sort: \MaterialItem.position)
    }

    private var groups: [(category: String, items: [MaterialItem])] {
        let order = ["electrical", "conduit_fittings", "plumbing", "lumber", "drywall", "paint", "concrete",
                     "hardware", "fixtures", "consumables", "rental", "other"]
        return Dictionary(grouping: items, by: \.category)
            .sorted { (order.firstIndex(of: $0.key) ?? 99) < (order.firstIndex(of: $1.key) ?? 99) }
            .map { ($0.key, $0.value) }
    }

    private var boughtCount: Int { items.filter(\.purchased).count }

    private var shareText: String {
        items.map { item in
            let qty = item.qty == 0 ? "?" : item.qty.formatted()
            let specs = item.specifications.map { " (" + $0.replacingOccurrences(of: "\n", with: ", ") + ")" } ?? ""
            return "\(item.purchased ? "☑︎" : "☐") \(qty) \(item.unit) – \(item.nameEn)\(specs)"
        }.joined(separator: "\n")
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(.materialsProgress(bought: boughtCount, total: items.count))
                        .font(.subheadline.weight(.semibold))
                        .contentTransition(.numericText())
                    ProgressView(value: Double(boughtCount), total: Double(max(items.count, 1)))
                        .tint(Theme.success)
                    Text(.materialsDisclaimer).font(.caption).foregroundStyle(Theme.muted)
                }
                .padding(.vertical, 4)
            }
            ForEach(groups, id: \.category) { group in
                Section {
                    ForEach(group.items) { item in
                        MaterialRow(item: item,
                                    onToggle: { do { try workspace.togglePurchased(item) } catch { saveFailed = true } },
                                    onEdit: { editor = MaterialEditorRequest(item: item) })
                            .swipeActions {
                                Button(role: .destructive) {
                                    do { try workspace.delete(item) } catch { saveFailed = true }
                                } label: { Text(.commonDelete) }
                            }
                    }
                } header: {
                    Text(MaterialCategory.title(group.category))
                }
            }
            Section {
                Button { editor = MaterialEditorRequest() } label: {
                    Label { Text(.materialsAdd) } icon: { Image(systemName: "plus") }
                }
            }
        }
        .themedList()
        .animation(.snappy, value: boughtCount)
        .sensoryFeedback(.selection, trigger: boughtCount)
        .navigationTitle(Text(.materialsTitle))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                ShareLink(item: shareText) {
                    Label { Text(.materialsShare) } icon: { Image(systemName: "square.and.arrow.up") }
                }
                .disabled(items.isEmpty)
            }
        }
        .sheet(item: $editor) { request in
            if let estimate = estimates.first { MaterialEditor(request: request, estimate: estimate) }
        }
        .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
    }
}

enum MaterialCategory {
    static func title(_ raw: String) -> LocalizedStringResource {
        switch raw {
        case "electrical": .materialCategoryElectrical
        case "conduit_fittings": .materialCategoryConduit
        case "plumbing": .materialCategoryPlumbing
        case "lumber": .materialCategoryLumber
        case "drywall": .materialCategoryDrywall
        case "paint": .materialCategoryPaint
        case "concrete": .materialCategoryConcrete
        case "hardware": .materialCategoryHardware
        case "fixtures": .materialCategoryFixtures
        case "consumables": .materialCategoryConsumables
        case "rental": .materialCategoryRental
        default: .materialCategoryOther
        }
    }
}

struct MaterialRow: View {
    @Environment(\.openURL) private var openURL
    let item: MaterialItem
    let onToggle: () -> Void
    let onEdit: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: onToggle) {
                Image(systemName: item.purchased ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(item.purchased ? Theme.success : Theme.muted)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(item.purchased ? .materialsMarkNotBought : .materialsMarkBought))

            VStack(alignment: .leading, spacing: 4) {
                Button(action: onEdit) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.nameEn)
                            .strikethrough(item.purchased, color: Theme.muted)
                            .foregroundStyle(item.purchased ? Theme.muted : .primary)
                        Text(verbatim: "\(item.qty == 0 ? "?" : item.qty.formatted()) \(item.unit)")
                            .font(.caption).fontDesign(.monospaced).foregroundStyle(Theme.muted)
                        if let specs = item.specifications {
                            Text(specs.replacingOccurrences(of: "\n", with: " · ")).font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                HStack(spacing: 6) {
                    if item.evidence == .inferred {
                        Pill(title: .materialsInferred, color: Theme.warning)
                    }
                    if item.qty == 0 {
                        Pill(title: .estimateBadgeNeedsQuantity, color: Theme.danger)
                    }
                    Spacer()
                    Menu {
                        ForEach(StoreLinks.Store.allCases) { store in
                            if let url = StoreLinks.url(for: store, query: item.searchQuery) {
                                Button { openURL(url) } label: { Label(store.name, systemImage: store.systemImage) }
                            }
                        }
                    } label: {
                        Label { Text(.materialsShop) } icon: { Image(systemName: "cart") }
                            .font(.caption.weight(.semibold))
                    }
                    .accessibilityIdentifier("shop-\(item.nameEn)")
                }
                if let note = item.note {
                    Text(note).font(.caption2).foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct MaterialEditorRequest: Identifiable {
    let id = UUID()
    var item: MaterialItem?
}

struct MaterialEditor: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let request: MaterialEditorRequest
    let estimate: Estimate
    @State private var draft: MaterialDraft
    @State private var original: MaterialDraft
    @State private var saveFailed = false

    init(request: MaterialEditorRequest, estimate: Estimate) {
        self.request = request
        self.estimate = estimate
        let start = request.item.map(MaterialDraft.init) ?? MaterialDraft()
        _draft = State(initialValue: start)
        _original = State(initialValue: start)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: .materialFieldName), text: $draft.nameEn, axis: .vertical)
                    TextField(String(localized: .materialFieldNameEs), text: $draft.nameEs, axis: .vertical)
                }
                Section {
                    LabeledContent {
                        TextField(String(localized: .lineFieldQuantity), value: $draft.qty, format: .number)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    } label: { Text(.lineFieldQuantity) }
                    LabeledContent {
                        TextField(String(localized: .lineFieldUnit), text: $draft.unit).multilineTextAlignment(.trailing)
                    } label: { Text(.lineFieldUnit) }
                    TextField(String(localized: .materialFieldSpecs), text: $draft.specifications, axis: .vertical)
                        .lineLimit(1...4)
                }
                Section {
                    TextField(String(localized: .materialFieldSearch), text: $draft.searchQuery)
                        .textInputAutocapitalization(.never)
                } footer: {
                    Text(.materialFieldSearchHint)
                }
            }
            .themedList()
            .navigationTitle(Text(request.item == nil ? .materialsAdd : .materialsEdit))
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
            try workspace.save(draft, to: request.item, in: estimate)
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}
