import SwiftUI

/// The kind of work, chosen with one big tile. Sent to the AI as a hint; also names the job.
enum Trade: String, CaseIterable, Identifiable, Sendable {
    case electrical, plumbing, painting, concrete, handyman, remodel, cleaning
    var id: Self { self }

    var title: LocalizedStringResource {
        switch self {
        case .electrical: .tradeElectrical
        case .plumbing: .tradePlumbing
        case .painting: .tradePainting
        case .concrete: .tradeConcrete
        case .handyman: .tradeHandyman
        case .remodel: .tradeRemodel
        case .cleaning: .tradeCleaning
        }
    }

    var systemImage: String {
        switch self {
        case .electrical: "bolt.fill"
        case .plumbing: "drop.fill"
        case .painting: "paintbrush.fill"
        case .concrete: "square.stack.3d.up.fill"
        case .handyman: "wrench.and.screwdriver.fill"
        case .remodel: "house.fill"
        case .cleaning: "sparkles"
        }
    }

    /// One-tap phrases that start the description, so nobody has to type much.
    var quickPicks: [LocalizedStringResource] {
        switch self {
        case .electrical: [.pickPanelUpgrade, .pickEvCharger, .pickOutlets, .pickGfci, .pickRecessedLights, .pickCeilingFan, .pickBreaker, .pickPermit]
        case .plumbing: [.pickWaterHeater, .pickFaucet, .pickToilet, .pickLeak, .pickDrain, .pickDisposal, .pickShowerValve]
        case .painting: [.pickInteriorWalls, .pickCeilings, .pickExterior, .pickTrimDoors, .pickCabinets, .pickPatchRepair]
        case .concrete: [.pickSlab, .pickDriveway, .pickSidewalk, .pickPatio, .pickDemolition, .pickFootings]
        case .handyman: [.pickDrywallPatch, .pickDoorRepair, .pickTvMount, .pickShelves, .pickFenceRepair, .pickSmallFixes]
        case .remodel: [.pickBathroom, .pickKitchen, .pickFlooring, .pickTile, .pickDemolition, .pickCabinets]
        case .cleaning: [.pickHouseClean, .pickOfficeClean, .pickMoveOut, .pickAfterConstruction, .pickDeepClean, .pickWindows]
        }
    }
}

/// Wrapping row of big, friendly pill buttons.
struct QuickPickChips: View {
    let picks: [LocalizedStringResource]
    let onPick: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(picks.indices, id: \.self) { index in
                let label = String(localized: picks[index])
                Button { onPick(label) } label: {
                    Label(label, systemImage: "plus")
                        .font(.callout.weight(.medium))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Theme.surface, in: .capsule)
                        .overlay(Capsule().strokeBorder(Theme.border))
                        .contentShape(.capsule)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("pick-\(label)")
            }
        }
    }
}

/// Left-to-right wrapping layout for chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: min(maxX, width), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// Notes box with a big microphone button. Dictation is appended; typing still works.
struct VoiceNotesField: View {
    @Binding var notes: String
    let language: AppLanguage
    @State private var recorder = VoiceRecorder()
    @State private var baseNotes = ""

    var body: some View {
        VStack(spacing: 14) {
            Button {
                Task {
                    if recorder.isRecording {
                        recorder.stop()
                    } else {
                        baseNotes = notes
                        await recorder.start(language: language)
                    }
                }
            } label: {
                VStack(spacing: 8) {
                    Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill")
                        .font(.system(size: 34, weight: .semibold))
                        .frame(width: 84, height: 84)
                        .background(recorder.isRecording ? Theme.danger : Theme.accent, in: .circle)
                        .foregroundStyle(recorder.isRecording ? Color.white : Theme.onAccent)
                        .symbolEffect(.pulse, isActive: recorder.isRecording)
                    Text(recorder.isRecording ? .voiceTapToStop : .voiceTapToTalk)
                        .font(.headline)
                        .foregroundStyle(.primary)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("voice-button")
            .sensoryFeedback(.impact, trigger: recorder.isRecording)

            if let failure = recorder.failure {
                Text(message(for: failure)).font(.footnote).foregroundStyle(Theme.danger).multilineTextAlignment(.center)
            }

            TextField(String(localized: .voiceNotesPlaceholder), text: $notes, axis: .vertical)
                .lineLimit(4...10)
                .font(.body)
                .padding(14)
                .background(Theme.surface, in: .rect(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.border))
                .accessibilityIdentifier("quick-notes")
        }
        .onChange(of: recorder.transcript) { _, words in
            notes = NoteComposer.append(words, to: baseNotes)
        }
        .onDisappear { recorder.stop() }
    }

    private func message(for failure: VoiceRecorder.Failure) -> LocalizedStringResource {
        switch failure {
        case .speechDenied, .micDenied: .voiceErrorPermission
        case .unavailable, .offlineUnsupported: .voiceErrorUnavailable
        case .microphone: .voiceErrorMicrophone
        }
    }
}
