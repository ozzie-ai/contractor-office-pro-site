import SwiftUI

/// "Job done? What's left over?" One card per material, big buttons: None / A little / Half / Most / All of it.
struct LeftoversSheet: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let estimate: Estimate
    /// Bought items first; items without a quantity can't be split, so they only offer None / All of it.
    let items: [MaterialItem]
    @State private var shares: [UUID: LeftoverShare] = [:]
    @State private var saveFailed = false

    init(estimate: Estimate, items: [MaterialItem]) {
        self.estimate = estimate
        self.items = items.sorted { ($0.purchased ? 0 : 1, $0.position) < ($1.purchased ? 0 : 1, $1.position) }
    }

    private func amount(for item: MaterialItem) -> Decimal {
        let share = shares[item.id] ?? .none
        if item.qty == 0 { return share == .none ? 0 : 1 }
        return share.amount(of: item.qty, unit: item.unit)
    }

    private var amounts: [UUID: Decimal] {
        Dictionary(uniqueKeysWithValues: items.map { ($0.id, amount(for: $0)) }.filter { $0.1 > 0 })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(.leftoversHint).font(.title3).fixedSize(horizontal: false, vertical: true)
                    ForEach(items) { item in card(item) }
                }
                .padding(20)
            }
            .background(Theme.canvas)
            .navigationTitle(Text(.leftoversTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Text(.commonCancel) } }
            }
            .safeAreaInset(edge: .bottom) {
                Button(action: save) {
                    Label { Text(.leftoversSave(count: amounts.count)) } icon: { Image(systemName: "shippingbox.fill") }
                        .font(.title3.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 56)
                }
                .primaryActionStyle()
                .disabled(amounts.isEmpty)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                .accessibilityIdentifier("leftovers-save")
            }
            .sensoryFeedback(.selection, trigger: shares)
            .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
        }
    }

    private func card(_ item: MaterialItem) -> some View {
        let options: [LeftoverShare] = item.qty == 0 ? [.none, .all] : LeftoverShare.allCases
        let left = amount(for: item)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.nameEn).font(.headline).fixedSize(horizontal: false, vertical: true)
                Spacer()
                if item.qty > 0 {
                    Text(verbatim: "\(item.qty.formatted()) \(item.unit)")
                        .font(.subheadline).fontDesign(.monospaced).foregroundStyle(Theme.muted)
                }
            }
            FlowLayout(spacing: 8) {
                ForEach(options, id: \.self) { share in
                    let isOn = (shares[item.id] ?? .none) == share
                    Button { shares[item.id] = share } label: {
                        Text(share.title)
                            .font(.headline)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 46)
                            .foregroundStyle(isOn ? Theme.onAccent : .primary)
                            .background(isOn ? Theme.accent : Theme.accentSoft, in: .capsule)
                            .contentShape(.capsule)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("leftover-\(item.nameEn)-\(String(describing: share))")
                    .accessibilityAddTraits(isOn ? .isSelected : [])
                }
            }
            if left > 0, item.qty > 0 {
                Text(.leftoversAbout(amount: "\(left.formatted()) \(item.unit)"))
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.success)
            }
        }
        .padding(16)
        .background(Theme.surface, in: .rect(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(left > 0 ? Theme.accent.opacity(0.5) : Theme.border))
        .animation(.snappy, value: left)
    }

    private func save() {
        do {
            try workspace.saveLeftovers(amounts, from: items, estimate: estimate)
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}
