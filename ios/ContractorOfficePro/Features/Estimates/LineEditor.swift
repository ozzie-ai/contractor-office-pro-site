import SwiftUI

struct LineEditorRequest: Identifiable {
    let id = UUID()
    var line: LineItem?
}

struct LineEditor: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let request: LineEditorRequest
    let estimate: Estimate
    @State private var draft: LineDraft
    @State private var original: LineDraft
    @State private var rememberPrice = false
    @State private var saveFailed = false

    init(request: LineEditorRequest, estimate: Estimate) {
        self.request = request
        self.estimate = estimate
        let start = request.line.map(LineDraft.init) ?? LineDraft()
        _draft = State(initialValue: start)
        _original = State(initialValue: start)
    }

    private var canRemember: Bool { request.line?.taskCode != nil && draft.unitPrice > 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: .lineFieldDescriptionEn), text: $draft.descriptionEn, axis: .vertical)
                    TextField(String(localized: .lineFieldDescriptionEs), text: $draft.descriptionEs, axis: .vertical)
                }
                Section {
                    LabeledContent {
                        TextField(String(localized: .lineFieldQuantity), value: blankWhenZero($draft.qty), format: .number)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    } label: { Text(.lineFieldQuantity) }
                    LabeledContent {
                        TextField(String(localized: .lineFieldUnit), text: $draft.unit).multilineTextAlignment(.trailing)
                    } label: { Text(.lineFieldUnit) }
                    LabeledContent {
                        HStack(spacing: 2) {
                            Spacer()
                            Text(verbatim: "$").foregroundStyle(.secondary)
                            TextField(String(localized: .lineFieldUnitPrice), value: blankWhenZero($draft.unitPrice),
                                      format: .number.precision(.fractionLength(0...2)))
                                .keyboardType(.decimalPad)
                                .fixedSize()
                                .accessibilityIdentifier("line-unit-price")
                        }
                    } label: { Text(.lineFieldUnitPrice) }
                    LabeledContent {
                        Text(EstimateCalculator.lineTotal(qty: draft.qty, unitPrice: draft.unitPrice), format: .currency(code: "USD"))
                            .bold()
                    } label: { Text(.estimateTotal) }
                } footer: {
                    if let note = request.line?.priceNote { Text(note) }
                }
                if canRemember {
                    Section {
                        Toggle(isOn: $rememberPrice) { Text(.lineRememberPrice) }
                    } footer: {
                        Text(.lineRememberPriceHint)
                    }
                }
            }
            .themedList()
            .navigationTitle(Text(request.line == nil ? .estimateAddLine : .lineEditTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                EditorToolbar(canSave: draft.isValid && (draft != original || rememberPrice || request.line == nil),
                              onCancel: { dismiss() }, onSave: save)
            }
            .interactiveDismissDisabled(draft != original)
            .onChange(of: draft.unitPrice) { _, _ in if draft.priceChanged && canRemember { rememberPrice = true } }
            .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
        }
    }

    /// Zero shows as an empty field with a placeholder, so typing doesn't append to "0".
    private func blankWhenZero(_ value: Binding<Decimal>) -> Binding<Decimal?> {
        Binding(get: { value.wrappedValue == 0 ? nil : value.wrappedValue }, set: { value.wrappedValue = $0 ?? 0 })
    }

    private func save() {
        do {
            try workspace.save(draft, to: request.line, in: estimate, rememberPrice: rememberPrice && canRemember)
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}
