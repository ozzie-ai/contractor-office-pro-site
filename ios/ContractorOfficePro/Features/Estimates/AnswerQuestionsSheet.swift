import SwiftUI

/// Answer the AI's questions → the AI proposes changes → the contractor picks which to apply.
struct AnswerQuestionsSheet: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let estimate: Estimate
    let lines: [LineItem]
    let questions: [String]
    @State private var answers: [String]
    @State private var thinking = false
    @State private var proposal: RefinementProposal?
    @State private var selectedAdds: Set<Int> = []
    @State private var selectedUpdates: Set<Int> = []
    @State private var failure: BackendError?
    @State private var saveFailed = false
    @FocusState private var focusedAnswer: Int?

    init(estimate: Estimate, lines: [LineItem]) {
        self.estimate = estimate
        self.lines = lines
        let questions = (estimate.openQuestions ?? "").split(separator: "\n").map(String.init)
        self.questions = questions
        _answers = State(initialValue: Array(repeating: "", count: questions.count))
    }

    private var answered: [QuestionAnswer] {
        zip(questions, answers).compactMap { q, a in a.nilIfBlank.map { QuestionAnswer(question: q, answer: $0) } }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let proposal {
                    review(proposal)
                } else {
                    answerForm
                }
            }
            .themedList()
            .navigationTitle(Text(proposal == nil ? .answersTitle : .answersReviewTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.commonCancel) }.disabled(thinking)
                }
            }
            .interactiveDismissDisabled(thinking || !answered.isEmpty)
            .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
        }
        .overlay { if thinking { AIGlow().transition(.opacity) } }
        .animation(.smooth(duration: 0.4), value: thinking)
        .animation(.smooth, value: proposal == nil)
    }

    // MARK: Step 1: answer

    private var answerForm: some View {
        Form {
            ForEach(questions.indices, id: \.self) { index in
                Section {
                    TextField(String(localized: .answersPlaceholder), text: $answers[index], axis: .vertical)
                        .lineLimit(1...5)
                        .accessibilityIdentifier("answer-\(index)")
                        .focused($focusedAnswer, equals: index)
                } header: {
                    Label { Text(questions[index]).textCase(nil) } icon: { Image(systemName: "questionmark.bubble") }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                }
            }
            if let failure {
                Section { Text(failure.message).foregroundStyle(Theme.danger) }
            }
            Section {
                Button(action: propose) {
                    HStack {
                        Image(systemName: "sparkles").symbolEffect(.variableColor.iterative, isActive: thinking)
                        Text(thinking ? .answersThinking : .answersUpdate)
                    }
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .primaryActionStyle()
                .disabled(answered.isEmpty || thinking || workspace.estimateService == nil)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            } footer: {
                Text(.answersHint)
            }
        }
    }

    // MARK: Step 2: review

    private func review(_ proposal: RefinementProposal) -> some View {
        List {
            if proposal.isEmpty {
                Section { Text(.answersNoChanges).foregroundStyle(Theme.muted) }
            }
            if !proposal.adds.isEmpty {
                Section {
                    ForEach(proposal.adds.indices, id: \.self) { index in
                        let add = proposal.adds[index]
                        Toggle(isOn: binding(index, in: $selectedAdds)) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(add.descriptionEn)
                                HStack {
                                    Text(verbatim: "\((add.quantity?.value ?? 0).formatted()) \(add.unit ?? "ea")")
                                        .font(.caption).fontDesign(.monospaced).foregroundStyle(Theme.muted)
                                    if let price = add.unitPrice?.value {
                                        MoneyText(amount: price, font: .caption)
                                    }
                                }
                                Pill(title: add.priceSource == "contractor" ? .estimateBadgeYourPrice
                                     : add.priceSource == "reference" ? .estimateBadgeReferencePreliminary : .estimateBadgeNeedsPrice,
                                     color: add.priceSource == "contractor" ? Theme.success
                                     : add.priceSource == "reference" ? Theme.warning : Theme.danger)
                            }
                        }
                    }
                } header: {
                    Label { Text(.answersNewLines) } icon: { Image(systemName: "plus.circle") }
                }
            }
            if !proposal.updates.isEmpty {
                Section {
                    ForEach(proposal.updates.indices, id: \.self) { index in
                        let update = proposal.updates[index]
                        let line = lines[update.ref]
                        Toggle(isOn: binding(index, in: $selectedUpdates)) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(line.descriptionEn)
                                Text(verbatim: "\(line.qty.formatted()) \(line.unit) → \(update.quantity.map { $0.formatted() } ?? line.qty.formatted()) \(update.unit ?? line.unit)")
                                    .font(.caption).fontDesign(.monospaced)
                                Text(update.reasonEn).font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                } header: {
                    Label { Text(.answersChanges) } icon: { Image(systemName: "arrow.triangle.2.circlepath") }
                }
            }
            if !proposal.exclusions.isEmpty {
                Section {
                    ForEach(proposal.exclusions, id: \.self) { Text($0) }
                } header: {
                    Text(.estimateExclusionsHeader)
                }
            }
            if !proposal.remainingQuestions.isEmpty {
                Section {
                    ForEach(proposal.remainingQuestions, id: \.self) { Text($0) }
                } header: {
                    Text(.answersStillOpen)
                }
            }
            Section {
                Button(action: { applyChanges(proposal) }) {
                    Text(.answersApply(count: selectedAdds.count + selectedUpdates.count))
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .primaryActionStyle()
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            } footer: {
                Text(.answersApplyHint)
            }
        }
    }

    private func binding(_ index: Int, in set: Binding<Set<Int>>) -> Binding<Bool> {
        Binding(get: { set.wrappedValue.contains(index) },
                set: { on in if on { set.wrappedValue.insert(index) } else { set.wrappedValue.remove(index) } })
    }

    // MARK: Actions

    private func propose() {
        guard let service = workspace.estimateService else { return }
        focusedAnswer = nil
        thinking = true
        failure = nil
        Task {
            defer { thinking = false }
            do {
                let result = try await EstimateRefining.propose(
                    notes: estimate.internalNotes ?? "", language: estimate.language, lines: lines,
                    answers: answered, service: service)
                selectedAdds = Set(result.adds.indices)
                selectedUpdates = Set(result.updates.indices)
                proposal = result
            } catch {
                failure = error as? BackendError ?? .invalidResponse
            }
        }
    }

    private func applyChanges(_ proposal: RefinementProposal) {
        do {
            try workspace.apply(proposal, to: estimate, lines: lines, addIndexes: selectedAdds, updateIndexes: selectedUpdates)
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}
