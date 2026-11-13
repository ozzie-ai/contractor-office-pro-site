import SwiftData
import SwiftUI

struct EstimateView: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    @Query private var estimates: [Estimate]
    @Query private var lines: [LineItem]
    @State private var editor: LineEditorRequest?
    @State private var confirmingDelete = false
    @State private var saveFailed = false

    init(estimateID: UUID) {
        _estimates = Query(filter: #Predicate<Estimate> { $0.id == estimateID && $0.deletedAt == nil })
        _lines = Query(filter: #Predicate<LineItem> { $0.estimateId == estimateID && $0.deletedAt == nil },
                       sort: \LineItem.position)
    }

    var body: some View {
        if let estimate = estimates.first {
            content(for: estimate)
        } else {
            ContentUnavailableView {
                Label { Text(.estimateNotFound) } icon: { Image(systemName: "trash") }
            }
        }
    }

    private func content(for estimate: Estimate) -> some View {
        let needsAttention = lines.contains { $0.preliminary || $0.needsPrice || $0.needsQuantity }
        return List {
            Section {
                TotalsView(estimate: estimate)
                if needsAttention {
                    Label { Text(.estimatePreliminaryBanner) } icon: { Image(systemName: "exclamationmark.triangle.fill") }
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
            }
            if let questions = estimate.openQuestions {
                Section {
                    ForEach(questions.split(separator: "\n").map(String.init), id: \.self) { question in
                        Label { Text(question) } icon: { Image(systemName: "questionmark.bubble") }
                    }
                } header: {
                    Text(.estimateQuestionsHeader)
                } footer: {
                    Label { Text(.estimatePrivateHint) } icon: { Image(systemName: "lock.fill") }
                }
            }
            Section {
                ForEach(lines) { line in
                    Button { editor = LineEditorRequest(line: line) } label: { LineRow(line: line) }
                        .buttonStyle(.plain)
                        .swipeActions {
                            Button(role: .destructive) {
                                do { try workspace.delete(line, from: estimate) } catch { saveFailed = true }
                            } label: { Text(.commonDelete) }
                        }
                }
                Button { editor = LineEditorRequest() } label: {
                    Label { Text(.estimateAddLine) } icon: { Image(systemName: "plus") }
                }
            } header: {
                Text(.estimateLinesHeader)
            }
            if let exclusions = estimate.exclusions {
                Section {
                    ForEach(exclusions.split(separator: "\n").map(String.init), id: \.self) { Text($0) }
                } header: {
                    Text(.estimateExclusionsHeader)
                }
            }
            if let notes = estimate.internalNotes {
                Section {
                    Text(notes).font(.callout).foregroundStyle(.secondary)
                } header: {
                    Text(.estimateNotesHeader)
                } footer: {
                    Label { Text(.estimatePrivateHint) } icon: { Image(systemName: "lock.fill") }
                }
            }
            Section {
                Button(role: .destructive) { confirmingDelete = true } label: { Text(.estimateDelete) }
            }
        }
        .navigationTitle(Text(.estimateTitle))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editor) { LineEditor(request: $0, estimate: estimate) }
        .confirmationDialog(Text(.estimateDeleteConfirm), isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button(role: .destructive) {
                if (try? workspace.delete(estimate)) != nil { dismiss() } else { saveFailed = true }
            } label: { Text(.commonDelete) }
        }
        .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
    }
}

private struct TotalsView: View {
    let estimate: Estimate

    var body: some View {
        VStack {
            LabeledContent { Text(estimate.subtotal, format: .currency(code: "USD")) } label: { Text(.estimateSubtotal) }
            if estimate.tax > 0 {
                LabeledContent { Text(estimate.tax, format: .currency(code: "USD")) } label: { Text(.estimateTax) }
            }
            LabeledContent {
                Text(estimate.total, format: .currency(code: "USD")).font(.title3.bold())
            } label: {
                Text(.estimateTotal).font(.headline)
            }
            .accessibilityIdentifier("estimate-total")
        }
    }
}

struct LineRow: View {
    let line: LineItem

    var body: some View {
        VStack(alignment: .leading) {
            Text(line.descriptionEn).font(.body)
            HStack {
                Text(verbatim: "\(line.qty.formatted()) \(line.unit) × \(line.unitPrice.formatted(.currency(code: "USD")))")
                    .font(.subheadline).foregroundStyle(.secondary)
                Spacer()
                Text(line.lineTotal, format: .currency(code: "USD")).font(.subheadline.bold())
            }
            HStack {
                PriceBadge(line: line)
                if line.source == .ai {
                    Label { Text(.estimateBadgeAi) } icon: { Image(systemName: "sparkles") }
                        .font(.caption2).foregroundStyle(.purple)
                }
            }
        }
        .contentShape(Rectangle())
    }
}

struct PriceBadge: View {
    let line: LineItem

    var body: some View {
        if line.needsQuantity {
            badge(.estimateBadgeNeedsQuantity, "number", .red)
        } else {
            switch line.priceSource {
            case .contractor: badge(.estimateBadgeYourPrice, "checkmark.seal.fill", .green)
            case .reference: badge(line.preliminary ? .estimateBadgeReferencePreliminary : .estimateBadgeReference, "book", .orange)
            case .manual: badge(.estimateBadgeEdited, "pencil", .blue)
            case .none: badge(.estimateBadgeNeedsPrice, "exclamationmark.circle.fill", .red)
            }
        }
    }

    private func badge(_ title: LocalizedStringResource, _ icon: String, _ color: Color) -> some View {
        Label { Text(title) } icon: { Image(systemName: icon) }
            .font(.caption2.weight(.medium))
            .foregroundStyle(color)
    }
}
