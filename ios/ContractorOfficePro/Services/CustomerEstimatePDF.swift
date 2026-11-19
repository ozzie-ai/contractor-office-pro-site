import Foundation
import UIKit

/// Customer PDF only consumes an allowlist of reviewed scope descriptions,
/// quantities and the approved selling total. Never pass a transcript or costs.
@MainActor
enum CustomerEstimatePDF {
    enum Failure: Error { case incompleteEstimate }

    static func create(from result: EstimatingAPIClient.PriceResponse,
                       approved: Bool) throws -> URL {
        guard approved, result.status == "ready_for_contractor_review",
              result.missing.isEmpty, !result.lines.isEmpty,
              result.lines.allSatisfy({ line in
                  line.missing.isEmpty
                    && !line.descriptionEn.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && (Decimal(string: line.quantity ?? "") ?? 0) > 0
                    && (Decimal(string: line.sellingTotal ?? "") ?? -1) >= 0
              }),
              let sellingTotal = result.sellingTotal,
              (Decimal(string: sellingTotal) ?? -1) >= 0 else {
            throw Failure.incompleteEstimate
        }
        let spanish = result.customerLanguage == "es"
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        let renderer = UIGraphicsPDFRenderer(bounds: page)
        let data = renderer.pdfData { context in
            context.beginPage()
            var y: CGFloat = 55
            let left: CGFloat = 50
            let width: CGFloat = page.width - 100

            func line(_ string: String, font: UIFont, spacing: CGFloat = 12) {
                let paragraph = NSMutableParagraphStyle()
                paragraph.lineBreakMode = .byWordWrapping
                let attributes: [NSAttributedString.Key: Any] = [
                    .font: font, .foregroundColor: UIColor.black,
                    .paragraphStyle: paragraph,
                ]
                let rect = (string as NSString).boundingRect(
                    with: CGSize(width: width, height: 500),
                    options: [.usesLineFragmentOrigin, .usesFontLeading],
                    attributes: attributes, context: nil
                )
                let height = max(20, ceil(rect.height) + 4)
                if y + height > page.height - 66 {
                    context.beginPage()
                    y = 55
                }
                (string as NSString).draw(
                    in: CGRect(x: left, y: y, width: width, height: height),
                    withAttributes: attributes
                )
                y += height + spacing
            }

            line(spanish ? "PRESUPUESTO PRELIMINAR" : "PRELIMINARY ESTIMATE",
                 font: .boldSystemFont(ofSize: 20), spacing: 20)
            line(spanish ? "Alcance del trabajo" : "Scope of work",
                 font: .boldSystemFont(ofSize: 14), spacing: 9)
            for entry in result.lines {
                let detail = spanish ? (entry.descriptionEs ?? entry.descriptionEn) : entry.descriptionEn
                let quantity = entry.quantity ?? "?"
                line("• \(quantity) \(entry.unit) — \(detail)",
                     font: .systemFont(ofSize: 11), spacing: 7)
            }

            if let mobilization = result.mobilizationSellingTotal,
               Decimal(string: mobilization) != nil {
                line(spanish ? "Se incluye movilización y traslado, cuando corresponda."
                             : "Mobilization and travel are included where applicable.",
                     font: .systemFont(ofSize: 10), spacing: 14)
            }
            line((spanish ? "TOTAL PROPUESTO: " : "PROPOSED TOTAL: ") + currency(sellingTotal),
                 font: .boldSystemFont(ofSize: 16), spacing: 20)
            line(spanish
                 ? "Este documento es un estimado preliminar. No es un contrato de mejoras al hogar. El alcance, las condiciones y los permisos requieren confirmación."
                 : "This document is a preliminary estimate, not a home-improvement contract. Scope, conditions and permits require confirmation.",
                 font: .systemFont(ofSize: 10), spacing: 0)
        }
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("ContractorOfficePro-Estimate-\(UUID().uuidString).pdf")
        try data.write(to: file, options: [.atomic, .completeFileProtectionUnlessOpen])
        return file
    }

    private static func currency(_ value: String) -> String {
        guard let decimal = Decimal(string: value) else { return value }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.locale = Locale(identifier: "en_US")
        return formatter.string(from: decimal as NSDecimalNumber) ?? "$" + value
    }
}
