import SwiftData
import SwiftUI

/// Guided new estimate: one question per screen, big buttons, no navigation to learn.
/// Trade → client → describe (voice or quick picks) → AI draft → the estimate opens.
struct QuickEstimateFlow: View {
    enum Step: Int, CaseIterable { case trade, client, describe }

    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    @Query(filter: #Predicate<Client> { $0.deletedAt == nil }, sort: \Client.updatedAt, order: .reverse)
    private var clients: [Client]
    let onCreated: (UUID) -> Void
    @State private var step: Step = .trade
    @State private var trade: Trade?
    @State private var client: Client?
    @State private var addingClient = false
    @State private var newName = ""
    @State private var newPhone = ""
    @State private var notes = ""
    @State private var language: AppLanguage = .en
    @State private var phase: EstimateDrafting.Phase?
    @State private var failure: BackendError?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                StepDots(current: step.rawValue, total: Step.allCases.count)
                    .padding(.vertical, 12)
                ScrollView {
                    Group {
                        switch step {
                        case .trade: tradeStep
                        case .client: clientStep
                        case .describe: describeStep
                        }
                    }
                    .padding(20)
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                            removal: .move(edge: .leading).combined(with: .opacity)))
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .background(Theme.canvas)
            .animation(.smooth(duration: 0.35), value: step)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if step == .trade {
                        Button { dismiss() } label: { Text(.commonCancel) }
                    } else {
                        Button { go(back: true) } label: { Label { Text(.quickBack) } icon: { Image(systemName: "chevron.left") } }
                            .disabled(phase != nil)
                    }
                }
            }
            .interactiveDismissDisabled(phase != nil)
        }
        .overlay { if phase != nil { AIGlow().transition(.opacity) } }
        .animation(.smooth(duration: 0.4), value: phase != nil)
        .sensoryFeedback(.selection, trigger: step)
    }

    // MARK: Step 1

    private var tradeStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(.quickWhatKind).headingStyle(.largeTitle)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(Trade.allCases) { option in
                    Button {
                        trade = option
                        go()
                    } label: {
                        VStack(spacing: 10) {
                            Image(systemName: option.systemImage).font(.system(size: 34, weight: .semibold))
                            Text(option.title).font(.headline).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity, minHeight: 112)
                        .foregroundStyle(trade == option ? Theme.onAccent : .primary)
                        .background(trade == option ? Theme.accent : Theme.surface, in: .rect(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Theme.border))
                        .contentShape(.rect(cornerRadius: 18))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("trade-\(option.rawValue)")
                }
            }
        }
    }

    // MARK: Step 2

    private var clientStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(.quickWhoFor).headingStyle(.largeTitle)
            if addingClient {
                VStack(spacing: 12) {
                    bigField(.clientFieldName, text: $newName).textContentType(.name)
                    bigField(.clientFieldPhone, text: $newPhone).textContentType(.telephoneNumber).keyboardType(.phonePad)
                    Button {
                        client = nil
                        go()
                    } label: { bigLabel(.quickContinue) }
                    .primaryActionStyle()
                    .disabled(newName.trimmed.isEmpty)
                }
            } else {
                Button { addingClient = true } label: {
                    Label { Text(.quickNewClient) } icon: { Image(systemName: "person.badge.plus") }
                        .font(.title3.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 64)
                }
                .primaryActionStyle()
                ForEach(clients.prefix(6)) { existing in
                    Button {
                        client = existing
                        language = existing.preferredLanguage
                        go()
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(existing.name).font(.title3.weight(.semibold))
                                if let phone = existing.phone { Text(phone).font(.subheadline).foregroundStyle(Theme.muted) }
                            }
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .background(Theme.surface, in: .rect(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.border))
                        .contentShape(.rect(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                }
            }
            Button {
                client = nil
                newName = ""
                go()
            } label: {
                Text(.quickSkip).font(.headline).frame(maxWidth: .infinity, minHeight: 48)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.muted)
        }
    }

    // MARK: Step 3

    private var describeStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(.quickTellMe).headingStyle(.largeTitle)
            if let trade {
                QuickPickChips(picks: trade.quickPicks) { phrase in notes = NoteComposer.append(phrase, to: notes) }
            }
            VoiceNotesField(notes: $notes, language: language)
            Picker(selection: $language) {
                ForEach(AppLanguage.allCases, id: \.self) { Text($0.title).tag($0) }
            } label: { Text(.estimateDraftLanguage) }
            .pickerStyle(.segmented)
            if let failure {
                Text(failure.message).foregroundStyle(Theme.danger)
            }
            Button(action: makeEstimate) {
                HStack {
                    Image(systemName: "sparkles").symbolEffect(.variableColor.iterative, isActive: phase != nil)
                    if let phase {
                        Text(phase == .reading ? .estimateDraftReading : .estimateDraftPricing)
                    } else {
                        Text(.quickMakeEstimate)
                    }
                }
                .font(.title3.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 60)
            }
            .primaryActionStyle()
            .disabled(notes.trimmed.count < 5 || phase != nil || workspace.estimateService == nil)
            .accessibilityIdentifier("make-estimate")
            if workspace.estimateService == nil {
                Text(.aiErrorNotConfigured).font(.footnote).foregroundStyle(Theme.warning)
            }
        }
    }

    // MARK: Helpers

    private func bigField(_ title: LocalizedStringResource, text: Binding<String>) -> some View {
        TextField(String(localized: title), text: text)
            .font(.title3)
            .padding(16)
            .background(Theme.surface, in: .rect(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.border))
    }

    private func bigLabel(_ title: LocalizedStringResource) -> some View {
        Text(title).font(.title3.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 56)
    }

    private func go(back: Bool = false) {
        failure = nil
        if let next = Step(rawValue: step.rawValue + (back ? -1 : 1)) { step = next }
    }

    private func makeEstimate() {
        guard let service = workspace.estimateService, let trade else { return }
        failure = nil
        Task {
            defer { phase = nil }
            do {
                let draft = try await EstimateDrafting.draft(notes: notes, language: language, trade: trade, service: service) { phase = $0 }
                let estimate = try workspace.createQuickEstimate(
                    trade: trade, client: client, newClientName: addingClient ? newName : nil,
                    newClientPhone: addingClient ? newPhone : nil, notes: notes, language: language, draft: draft)
                dismiss()
                onCreated(estimate.id)
            } catch {
                failure = error as? BackendError ?? .invalidResponse
            }
        }
    }
}

/// "● ● ○" progress so the user always knows how far along they are.
struct StepDots: View {
    let current: Int
    let total: Int

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<total, id: \.self) { index in
                Capsule()
                    .fill(index <= current ? Theme.accent : Theme.border)
                    .frame(width: index == current ? 28 : 10, height: 10)
            }
        }
        .animation(.snappy, value: current)
        .accessibilityElement()
        .accessibilityLabel(Text(.quickStepOf(step: current + 1, total: total)))
    }
}
