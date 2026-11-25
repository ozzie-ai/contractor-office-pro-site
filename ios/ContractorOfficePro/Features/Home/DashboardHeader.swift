import SwiftData
import SwiftUI

/// Greeting + live stats at the top of Jobs. Numbers roll when they change.
struct DashboardHeader: View {
    @Query(filter: #Predicate<Job> { $0.deletedAt == nil }) private var jobs: [Job]
    @Query(filter: #Predicate<Estimate> { $0.deletedAt == nil }) private var estimates: [Estimate]
    @Query(filter: #Predicate<LineItem> { $0.deletedAt == nil && $0.priceSourceRaw == "none" }) private var unpriced: [LineItem]
    @Query private var members: [Member]

    init(memberID: UUID) {
        _members = Query(filter: #Predicate<Member> { $0.id == memberID })
    }

    private var firstName: String {
        members.first?.displayName.split(separator: " ").first.map(String.init) ?? ""
    }

    private var activeJobs: Int { jobs.filter { JobFilter.active.statuses.contains($0.status) }.count }

    private var openValue: Decimal {
        estimates.filter { $0.status == .draft || $0.status == .sent }.reduce(0) { $0 + $1.total }
    }

    private var linesNeedingPrice: Int {
        let drafts = Set(estimates.filter { $0.status == .draft }.map(\.id))
        return unpriced.filter { drafts.contains($0.estimateId) }.count
    }

    private var greeting: LocalizedStringResource {
        switch Calendar.current.component(.hour, from: .now) {
        case ..<12: .homeGreetingMorning(name: firstName)
        case ..<18: .homeGreetingAfternoon(name: firstName)
        default: .homeGreetingEvening(name: firstName)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(greeting).headingStyle(.title3)
                Text(Date.now, format: .dateTime.weekday(.wide).month(.wide).day())
                    .font(.subheadline).foregroundStyle(Theme.muted)
            }
            HStack(spacing: 10) {
                StatTile(label: .homeStatActive) {
                    Text(activeJobs, format: .number).contentTransition(.numericText(value: Double(activeJobs)))
                }
                StatTile(label: .homeStatOpenEstimates) {
                    Text(openValue, format: .currency(code: "USD").notation(.compactName))
                        .contentTransition(.numericText())
                }
                StatTile(label: .homeStatNeedsPrice, tint: linesNeedingPrice > 0 ? Theme.danger : nil) {
                    Text(linesNeedingPrice, format: .number).contentTransition(.numericText(value: Double(linesNeedingPrice)))
                }
            }
            .animation(.snappy, value: activeJobs)
            .animation(.snappy, value: openValue)
            .animation(.snappy, value: linesNeedingPrice)
        }
        .padding(.vertical, 4)
    }
}

private struct StatTile<Value: View>: View {
    let label: LocalizedStringResource
    var tint: Color?
    @ViewBuilder let value: Value

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            value
                .font(.title2.weight(.semibold))
                .fontDesign(.monospaced)
                .foregroundStyle(tint ?? .primary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .lineLimit(2, reservesSpace: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: .rect(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.border))
        .accessibilityElement(children: .combine)
    }
}
