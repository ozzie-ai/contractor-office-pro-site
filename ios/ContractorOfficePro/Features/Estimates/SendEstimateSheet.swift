import SwiftData
import SwiftUI
import UIKit

/// Two big buttons: English PDF / PDF Español → share sheet → the estimate is marked Sent.
struct SendEstimateSheet: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let estimate: Estimate
    let lines: [LineItem]
    let job: Job?
    let client: Client?
    @State private var shareItem: ShareItem?
    @State private var saveFailed = false

    var body: some View {
        NavigationStack {
            ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                switch EstimateReadiness.check(lines) {
                case .ready:
                    Text(.sendTitle).headingStyle(.title)
                    Text(.sendSubtitle).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    languageButton(.en, title: .sendEnglish)
                    languageButton(.es, title: .sendSpanish)
                    Label { Text(.sendPrivacy).fixedSize(horizontal: false, vertical: true) } icon: { Image(systemName: "lock.fill") }
                        .font(.footnote).foregroundStyle(Theme.muted)
                case .empty:
                    blocked(.sendBlockedEmpty)
                case .missing(let prices, let quantities):
                    blocked(prices > 0 ? .sendBlockedPrices(count: prices) : .sendBlockedQuantities(count: quantities))
                }
            }
            .padding(20)
            }
            .background(Theme.canvas)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Text(.commonCancel) } }
            }
            .sheet(item: $shareItem) { item in
                ActivityView(items: [item.url]) { completed in
                    shareItem = nil
                    guard completed else { return }
                    do {
                        try workspace.markSent(estimate, language: item.language)
                        dismiss()
                    } catch { saveFailed = true }
                }
                .ignoresSafeArea()
            }
            .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
        }
        .presentationDetents([.fraction(0.62), .large])
    }

    private func languageButton(_ language: AppLanguage, title: LocalizedStringResource) -> some View {
        Button { share(in: language) } label: {
            Label { Text(title) } icon: { Image(systemName: "doc.richtext") }
                .font(.title3.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 60)
        }
        .primaryActionStyle()
        .accessibilityIdentifier("send-\(language.rawValue)")
    }

    private func blocked(_ message: LocalizedStringResource) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Label { Text(.sendBlockedTitle) } icon: { Image(systemName: "exclamationmark.triangle.fill") }
                .font(.title2.weight(.semibold)).foregroundStyle(Theme.warning)
            Text(message).font(.title3).fixedSize(horizontal: false, vertical: true)
            Button { dismiss() } label: {
                Text(.sendFixNow).font(.title3.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 56)
            }
            .primaryActionStyle()
        }
    }

    private func share(in language: AppLanguage) {
        let input = EstimatePDF.input(estimate: estimate, lines: lines, organization: workspace.organization,
                                      client: client, job: job, language: language)
        do {
            let url = try EstimatePDF.write(EstimatePDF.render(input, language: language), language: language, number: input.number)
            shareItem = ShareItem(url: url, language: language)
        } catch {
            saveFailed = true
        }
    }
}

struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
    let language: AppLanguage
}

/// UIKit share sheet so we know whether the estimate was actually sent (completion handler).
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]
    let onComplete: (Bool) -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        controller.completionWithItemsHandler = { _, completed, _, _ in onComplete(completed) }
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
