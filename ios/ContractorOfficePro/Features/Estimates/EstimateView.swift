import SwiftData
import SwiftUI

struct EstimateView: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    @Query private var estimates: [Estimate]
    @Query private var lines: [LineItem]
    @Query private var materials: [MaterialItem]
    @State private var buildingMaterials = false
    @State private var materialsFailure: BackendError?
    @State private var openMaterials: UUID?
    @State private var sending = false
    @Query private var jobs: [Job]
    @Query private var clients: [Client]
    @State private var editor: LineEditorRequest?
    @State private var answeringQuestions = false
    @State private var confirmingDelete = false
    @State private var saveFailed = false

    init(estimateID: UUID) {
        _estimates = Query(filter: #Predicate<Estimate> { $0.id == estimateID && $0.deletedAt == nil })
        _lines = Query(filter: #Predicate<LineItem> { $0.estimateId == estimateID && $0.deletedAt == nil },
                       sort: \LineItem.position)
        _materials = Query(filter: #Predicate<MaterialItem> { $0.estimateId == estimateID && $0.deletedAt == nil })
        _jobs = Query()
        _clients = Query()
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
                if estimate.status == .sent, let sentAt = estimate.sentAt {
                    Label { Text(.sendSentOn(date: sentAt.formatted(date: .abbreviated, time: .shortened))) } icon: {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.success)
                    }
                    .font(.subheadline.weight(.semibold))
                }
                TotalsView(estimate: estimate)
                if needsAttention {
                    Label { Text(.estimatePreliminaryBanner) } icon: { Image(systemName: "exclamationmark.triangle.fill") }
                        .font(.footnote)
                        .foregroundStyle(Theme.warning)
                }
            }
            if let questions = estimate.openQuestions {
                Section {
                    ForEach(questions.split(separator: "\n").map(String.init), id: \.self) { question in
                        Label { Text(question) } icon: { Image(systemName: "questionmark.bubble") }
                    }
                    Button { answeringQuestions = true } label: {
                        Label { Text(.answersOpen) } icon: { Image(systemName: "sparkles") }
                            .font(.body.weight(.semibold))
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
            Section {
                if !materials.isEmpty {
                    NavigationLink(value: AppRoute.materials(estimate.id)) {
                        LabeledContent {
                            Text(.materialsProgress(bought: materials.filter(\.purchased).count, total: materials.count))
                                .font(.caption).foregroundStyle(Theme.muted)
                        } label: {
                            Label { Text(.materialsTitle) } icon: { Image(systemName: "shippingbox") }
                        }
                    }
                }
                Button { buildMaterials(for: estimate) } label: {
                    HStack {
                        Image(systemName: "sparkles").symbolEffect(.variableColor.iterative, isActive: buildingMaterials)
                        Text(buildingMaterials ? .materialsBuilding : (materials.isEmpty ? .materialsBuild : .materialsRebuild))
                    }
                }
                .disabled(buildingMaterials || lines.isEmpty || workspace.estimateService == nil)
                if let materialsFailure {
                    Text(materialsFailure.message).font(.footnote).foregroundStyle(Theme.danger)
                }
            } header: {
                Text(.materialsHeader)
            } footer: {
                Text(.materialsFooter)
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
        .themedList()
        .navigationTitle(Text(.estimateTitle))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editor) { LineEditor(request: $0, estimate: estimate) }
        .sheet(isPresented: $answeringQuestions) { AnswerQuestionsSheet(estimate: estimate, lines: lines) }
        .navigationDestination(item: $openMaterials) { MaterialsView(estimateID: $0) }
        .safeAreaInset(edge: .bottom) {
            Button { sending = true } label: {
                Label { Text(estimate.status == .sent ? .sendAgain : .sendToCustomer) } icon: { Image(systemName: "paperplane.fill") }
                    .font(.title3.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 56)
            }
            .primaryActionStyle()
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .accessibilityIdentifier("send-to-customer")
        }
        .sheet(isPresented: $sending) {
            let job = jobs.first { $0.id == estimate.jobId }
            SendEstimateSheet(estimate: estimate, lines: lines, job: job,
                              client: job?.clientId.flatMap { id in clients.first { $0.id == id } })
        }
        .overlay { if buildingMaterials { AIGlow().transition(.opacity) } }
        .animation(.smooth(duration: 0.4), value: buildingMaterials)
        .sensoryFeedback(.success, trigger: lines.count)
        .confirmationDialog(Text(.estimateDeleteConfirm), isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button(role: .destructive) {
                if (try? workspace.delete(estimate)) != nil { dismiss() } else { saveFailed = true }
            } label: { Text(.commonDelete) }
        }
        .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
    }
}

extension EstimateView {
    fileprivate func buildMaterials(for estimate: Estimate) {
        guard let service = workspace.estimateService else { return }
        buildingMaterials = true
        materialsFailure = nil
        Task {
            defer { buildingMaterials = false }
            do {
                let list = try await MaterialsDrafting.draft(for: estimate, lines: lines, service: service)
                try workspace.replaceMaterials(of: estimate, with: list)
                openMaterials = estimate.id
            } catch {
                materialsFailure = error as? BackendError ?? .invalidResponse
            }
        }
    }
}

private struct TotalsView: View {
    let estimate: Estimate

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(.estimateTotal).font(.caption.weight(.medium)).foregroundStyle(Theme.muted).textCase(.uppercase)
            MoneyText(amount: estimate.total, font: .system(size: 38, weight: .semibold))
                .contentTransition(.numericText())
                .animation(.smooth, value: estimate.total)
                .accessibilityIdentifier("estimate-total")
            Divider()
            LabeledContent { MoneyText(amount: estimate.subtotal, font: .subheadline) } label: {
                Text(.estimateSubtotal).font(.subheadline).foregroundStyle(Theme.muted)
            }
            if estimate.tax > 0 {
                LabeledContent { MoneyText(amount: estimate.tax, font: .subheadline) } label: {
                    Text(.estimateTax).font(.subheadline).foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct LineRow: View {
    let line: LineItem

    var body: some View {
        VStack(alignment: .leading) {
            Text(line.descriptionEn).font(.body)
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: "\(line.qty.formatted()) \(line.unit) × \(line.unitPrice.formatted(.currency(code: "USD")))")
                    .font(.caption).fontDesign(.monospaced).foregroundStyle(Theme.muted)
                Spacer()
                MoneyText(amount: line.lineTotal, font: .subheadline.weight(.semibold))
            }
            HStack(spacing: 6) {
                PriceBadge(line: line)
                if line.source == .ai {
                    Pill(title: .estimateBadgeAi, color: Theme.violet, systemImage: "sparkles")
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
            badge(.estimateBadgeNeedsQuantity, "number", Theme.danger)
        } else {
            switch line.priceSource {
            case .contractor: badge(.estimateBadgeYourPrice, "checkmark.seal.fill", Theme.success)
            case .reference: badge(line.preliminary ? .estimateBadgeReferencePreliminary : .estimateBadgeReference, "book", Theme.warning)
            case .manual: badge(.estimateBadgeEdited, "pencil", Theme.info)
            case .none: badge(.estimateBadgeNeedsPrice, "exclamationmark.circle.fill", Theme.danger)
            }
        }
    }

    private func badge(_ title: LocalizedStringResource, _ icon: String, _ color: Color) -> some View {
        Pill(title: title, color: color)
    }
}
