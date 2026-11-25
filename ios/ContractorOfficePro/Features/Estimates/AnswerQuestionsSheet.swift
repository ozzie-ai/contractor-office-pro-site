import SwiftUI

/// Answer the AI's questions → the AI proposes changes → the contractor picks which to apply.
struct AnswerQuestionsSheet: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let estimate: Estimate
    let lines: [LineItem]
    let questions: [OpenQuestion]
    /// Tapped choice per question (`notSure` = skipped on purpose).
    @State private var picks: [Int: String] = [:]
    /// Questions answered in the contractor's own words.
    @State private var typing: Set<Int> = []
    @State private var typed: [Int: String] = [:]
    @State private var thinking = false
    @State private var proposal: RefinementProposal?
    @State private var selectedAdds: Set<Int> = []
    @State private var selectedUpdates: Set<Int> = []
    @State private var failure: BackendError?
    @State private var saveFailed = false
    @FocusState private var focusedAnswer: Int?
    private static let notSure = "\u{0}not-sure"

    init(estimate: Estimate, lines: [LineItem]) {
        self.estimate = estimate
        self.lines = lines
        let questions = OpenQuestion.decode(estimate.openQuestions)
        self.questions = questions
        // Questions without choices go straight to typing.
        _typing = State(initialValue: Set(questions.indices.filter { questions[$0].choices.isEmpty }))
    }

    private func answer(for index: Int) -> String? {
        if typing.contains(index) { return typed[index]?.nilIfBlank }
        guard let pick = picks[index], pick != Self.notSure else { return nil }
        return pick
    }

    private var answered: [QuestionAnswer] {
        questions.indices.compactMap { i in answer(for: i).map { QuestionAnswer(question: questions[i].question, answer: $0) } }
    }

    private var touched: Int { questions.indices.filter { answer(for: $0) != nil || picks[$0] == Self.notSure }.count }

    var body: some View {
        NavigationStack {
            Group {
                if let proposal {
                    review(proposal)
                } else {
                    answerForm
                }
            }
            .navigationTitle(Text(proposal == nil ? .answersTitle : .answersReviewTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.commonCancel) }.disabled(thinking)
                }
            }
            .interactiveDismissDisabled(thinking || !answered.isEmpty)
            .animation(.snappy, value: typing)
            .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
        }
        .overlay { if thinking { AIGlow().transition(.opacity) } }
        .animation(.smooth(duration: 0.4), value: thinking)
        .animation(.smooth, value: proposal == nil)
    }

    // MARK: Step 1: answer (tap a choice; typing is the exception)

    private var answerForm: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(.answersHint).font(.title3).fixedSize(horizontal: false, vertical: true)
                    Text(.answersProgress(answered: touched, total: questions.count))
                        .font(.subheadline.weight(.medium)).foregroundStyle(Theme.muted)
                        .contentTransition(.numericText())
                        .animation(.snappy, value: touched)
                }
                ForEach(questions.indices, id: \.self) { index in
                    questionCard(index)
                }
                if let failure {
                    Text(failure.message).foregroundStyle(Theme.danger)
                }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas)
        .safeAreaInset(edge: .bottom) {
            Button(action: propose) {
                HStack {
                    Image(systemName: "sparkles").symbolEffect(.variableColor.iterative, isActive: thinking)
                    Text(thinking ? .answersThinking : .answersUpdate)
                }
                .font(.title3.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 56)
            }
            .primaryActionStyle()
            .disabled(answered.isEmpty || thinking || workspace.estimateService == nil)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .accessibilityIdentifier("answers-update")
        }
        .sensoryFeedback(.selection, trigger: picks)
    }

    private func questionCard(_ index: Int) -> some View {
        let question = questions[index]
        let done = answer(for: index) != nil
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: done ? "checkmark.circle.fill" : "questionmark.circle")
                    .foregroundStyle(done ? Theme.success : Theme.accent)
                    .contentTransition(.symbolEffect(.replace))
                Text(question.question).font(.title3.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            }
            FlowLayout(spacing: 8) {
                ForEach(question.choices, id: \.self) { choice in
                    chip(Text(choice), selected: !typing.contains(index) && picks[index] == choice,
                         id: "answer-\(index)-\(choice)") {
                        typing.remove(index)
                        picks[index] = choice
                    }
                }
                chip(Text(.answersNotSure), selected: !typing.contains(index) && picks[index] == Self.notSure,
                     id: "answer-\(index)-not-sure") {
                    typing.remove(index)
                    picks[index] = Self.notSure
                }
                if !question.choices.isEmpty {
                    chip(Text(.answersSomethingElse), selected: typing.contains(index), id: "answer-\(index)-other") {
                        typing.insert(index)
                        picks[index] = nil
                        focusedAnswer = index
                    }
                }
            }
            if typing.contains(index) {
                TextField(String(localized: .answersPlaceholder), text: Binding(get: { typed[index] ?? "" },
                                                                               set: { typed[index] = $0 }), axis: .vertical)
                    .lineLimit(1...4)
                    .font(.body)
                    .padding(12)
                    .background(Theme.canvas, in: .rect(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border))
                    .focused($focusedAnswer, equals: index)
                    .accessibilityIdentifier("answer-\(index)")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: .rect(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(done ? Theme.accent.opacity(0.5) : Theme.border))
        .animation(.snappy, value: done)
    }

    private func chip(_ title: Text, selected: Bool, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            title
                .font(.headline)
                .padding(.horizontal, 18)
                .frame(minHeight: 48)
                .foregroundStyle(selected ? Theme.onAccent : .primary)
                .background(selected ? Theme.accent : Theme.accentSoft, in: .capsule)
                .overlay(Capsule().strokeBorder(selected ? Color.clear : Theme.border))
                .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Step 2: review

    private func review(_ proposal: RefinementProposal) -> some View {
        reviewList(proposal).themedList()
    }

    private func reviewList(_ proposal: RefinementProposal) -> some View {
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
                                switch add.priceSource {
                                case "contractor": Pill(title: .estimateBadgeYourPrice, color: Theme.success)
                                case "reference": Pill(title: .estimateBadgeReferencePreliminary, color: Theme.warning)
                                case "ai_estimate": Pill(title: .estimateBadgeAiBallpark, color: Theme.violet, systemImage: "sparkles")
                                default: Pill(title: .estimateBadgeNeedsPrice, color: Theme.danger)
                                }
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
                    ForEach(proposal.remainingQuestions, id: \.self) { Text($0.question) }
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
