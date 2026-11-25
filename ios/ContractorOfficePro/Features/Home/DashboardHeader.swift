import SwiftData
import SwiftUI

/// Home header for less technical users: greeting, one big "New estimate" button, and one plain
/// attention line only when something needs doing.
struct DashboardHeader: View {
    @Query(filter: #Predicate<Estimate> { $0.deletedAt == nil }) private var estimates: [Estimate]
    @Query(filter: #Predicate<LineItem> { $0.deletedAt == nil && $0.priceSourceRaw == "none" }) private var unpriced: [LineItem]
    @Query private var members: [Member]
    let onNewEstimate: () -> Void

    init(memberID: UUID, onNewEstimate: @escaping () -> Void) {
        self.onNewEstimate = onNewEstimate
        _members = Query(filter: #Predicate<Member> { $0.id == memberID })
    }

    private var firstName: String {
        members.first?.displayName.split(separator: " ").first.map(String.init) ?? ""
    }

    private var estimatesNeedingPrices: Int {
        let drafts = Set(estimates.filter { $0.status == .draft }.map(\.id))
        return Set(unpriced.map(\.estimateId).filter { drafts.contains($0) }).count
    }

    private var greeting: LocalizedStringResource {
        switch Calendar.current.component(.hour, from: .now) {
        case ..<12: .homeGreetingMorning(name: firstName)
        case ..<18: .homeGreetingAfternoon(name: firstName)
        default: .homeGreetingEvening(name: firstName)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(greeting).headingStyle(.title2)
            Button(action: onNewEstimate) {
                HStack(spacing: 14) {
                    Image(systemName: "mic.fill")
                        .font(.title2.weight(.semibold))
                        .frame(width: 52, height: 52)
                        .background(Theme.onAccent.opacity(0.15), in: .circle)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(.homeNewEstimate).font(.title2.weight(.bold))
                        Text(.homeNewEstimateHint).font(.subheadline).opacity(0.75)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.headline)
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity)
            }
            .primaryActionStyle()
            .accessibilityIdentifier("home-new-estimate")
            if estimatesNeedingPrices > 0 {
                Label { Text(.homeNeedPrices(count: estimatesNeedingPrices)) } icon: {
                    Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Theme.warning)
                }
                .font(.subheadline.weight(.medium))
            }
        }
        .padding(.vertical, 4)
    }
}
