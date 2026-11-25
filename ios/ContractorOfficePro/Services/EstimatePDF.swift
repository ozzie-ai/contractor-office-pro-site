import Foundation
import UIKit

/// What still blocks sending, in plain words.
nonisolated enum EstimateReadiness: Equatable {
    case ready
    case empty
    case missing(prices: Int, quantities: Int)

    @MainActor static func check(_ lines: [LineItem]) -> EstimateReadiness {
        guard !lines.isEmpty else { return .empty }
        let prices = lines.filter(\.needsPrice).count
        let quantities = lines.filter(\.needsQuantity).count
        return prices + quantities == 0 ? .ready : .missing(prices: prices, quantities: quantities)
    }
}

/// Customer-facing PDF (built on the team's CustomerEstimatePDF renderer). Allowlist only: business details,
/// client name/address, line descriptions in the chosen language, quantities, prices, totals, exclusions.
/// Never: private notes, AI questions, price sources, preliminary flags or costs.
@MainActor
enum EstimatePDF {
    struct Input {
        var businessName: String
        var cslbLicense: String?
        var businessPhone: String?
        var businessEmail: String?
        var businessAddress: String?
        var clientName: String?
        var clientAddress: String?
        var jobTitle: String
        var number: String
        var date: Date
        var lines: [(description: String, qty: Decimal, unit: String, unitPrice: Decimal, total: Decimal)]
        var subtotal: Decimal
        var tax: Decimal
        var total: Decimal
        var exclusions: [String]
    }

    static func input(estimate: Estimate, lines: [LineItem], organization: Organization?, client: Client?, job: Job?,
                      language: AppLanguage) -> Input {
        Input(
            businessName: organization?.name ?? "",
            cslbLicense: organization?.cslbLicense, businessPhone: organization?.phone,
            businessEmail: organization?.email, businessAddress: organization?.address,
            clientName: client?.name, clientAddress: job?.address ?? client?.address,
            jobTitle: "", number: String(estimate.id.uuidString.prefix(8)).uppercased(),
            date: .now,
            lines: lines.map { line in
                let text = language == .es ? (line.descriptionEs.nilIfBlank ?? line.descriptionEn) : line.descriptionEn
                return (text, line.qty, unitLabel(line.unit, language: language), line.unitPrice, line.lineTotal)
            },
            subtotal: estimate.subtotal, tax: estimate.tax, total: estimate.total,
            exclusions: (estimate.exclusions ?? "").split(separator: "\n").map(String.init))
    }

    static func render(_ input: Input, language: AppLanguage) -> Data {
        let t = Strings(language)
        let locale = Locale(identifier: language == .es ? "es_US" : "en_US")
        let money: (Decimal) -> String = { $0.formatted(.currency(code: "USD").locale(Locale(identifier: "en_US"))) }
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        let left: CGFloat = 50, right: CGFloat = 562, width = right - left
        return UIGraphicsPDFRenderer(bounds: page).pdfData { context in
            var y: CGFloat = 0

            func newPage() { context.beginPage(); y = 50 }
            func ensure(_ height: CGFloat) { if y + height > page.height - 60 { newPage() } }
            @discardableResult
            func text(_ string: String, x: CGFloat = left, width w: CGFloat = width, font: UIFont,
                      color: UIColor = .black, align: NSTextAlignment = .left, advance: Bool = true) -> CGFloat {
                let style = NSMutableParagraphStyle(); style.alignment = align; style.lineBreakMode = .byWordWrapping
                let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .paragraphStyle: style]
                let h = ceil((string as NSString).boundingRect(with: CGSize(width: w, height: 1000),
                                                               options: [.usesLineFragmentOrigin, .usesFontLeading],
                                                               attributes: attrs, context: nil).height)
                ensure(h)
                (string as NSString).draw(in: CGRect(x: x, y: y, width: w, height: h), withAttributes: attrs)
                if advance { y += h }
                return h
            }
            func rule(_ gray: CGFloat = 0.85) {
                UIColor(white: gray, alpha: 1).setFill()
                UIRectFill(CGRect(x: left, y: y, width: width, height: 0.75))
            }

            newPage()
            // Header: business on the left, document title on the right.
            text(input.businessName, font: .boldSystemFont(ofSize: 20), advance: false)
            text(t["pdf.title"], x: left + width / 2, width: width / 2, font: .boldSystemFont(ofSize: 14),
                 color: .darkGray, align: .right)
            y += 4
            let details = [input.cslbLicense.map { "\(t["pdf.cslb"]) \($0)" }, input.businessPhone, input.businessEmail,
                           input.businessAddress].compactMap { $0?.nilIfBlank }
            if !details.isEmpty { text(details.joined(separator: "  ·  "), font: .systemFont(ofSize: 9.5), color: .darkGray) }
            y += 14; rule(0.2); y += 14

            // For / date / number
            let leftBlock = [t["pdf.for"], input.clientName, input.clientAddress, input.jobTitle.nilIfBlank]
                .compactMap { $0?.nilIfBlank }.joined(separator: "\n")
            let rightBlock = "\(t["pdf.date"]) \(input.date.formatted(.dateTime.month(.wide).day().year().locale(locale)))\n\(t["pdf.number"]) \(input.number)"
            let top = y
            let hLeft = text(leftBlock, width: width * 0.6, font: .systemFont(ofSize: 11), advance: false)
            let hRight = text(rightBlock, x: left + width * 0.6, width: width * 0.4, font: .systemFont(ofSize: 10),
                              color: .darkGray, align: .right, advance: false)
            y = top + max(hLeft, hRight) + 20

            // Line items
            let colQty = left + width * 0.58, colPrice = left + width * 0.72, colTotal = left + width * 0.86
            func row(_ a: String, _ b: String, _ c: String, _ d: String, font: UIFont, color: UIColor = .black) {
                let top = y
                let h = text(a, width: width * 0.56, font: font, color: color, advance: false)
                text(b, x: colQty, width: width * 0.13, font: font, color: color, align: .right, advance: false)
                text(c, x: colPrice, width: width * 0.13, font: font, color: color, align: .right, advance: false)
                text(d, x: colTotal, width: width * 0.14, font: font, color: color, align: .right, advance: false)
                y = top + h + 7
            }
            row(t["pdf.description"], t["pdf.qty"], t["pdf.unit_price"], t["pdf.amount"],
                font: .boldSystemFont(ofSize: 9.5), color: .darkGray)
            rule(); y += 7
            for line in input.lines {
                row(line.description, "\(line.qty.formatted(.number.locale(locale))) \(line.unit)", money(line.unitPrice),
                    money(line.total), font: .systemFont(ofSize: 10.5))
            }
            rule(); y += 10

            // Totals
            func total(_ label: String, _ value: Decimal, bold: Bool = false) {
                let font: UIFont = bold ? .boldSystemFont(ofSize: 14) : .systemFont(ofSize: 11)
                let top = y
                text(label, x: colPrice - 80, width: 150, font: font, align: .right, advance: false)
                let h = text(money(value), x: colTotal, width: width * 0.14, font: font, align: .right, advance: false)
                y = top + h + 6
            }
            total(t["pdf.subtotal"], input.subtotal)
            if input.tax > 0 { total(t["pdf.tax"], input.tax) }
            total(t["pdf.total"], input.total, bold: true)
            y += 16

            if !input.exclusions.isEmpty {
                text(t["pdf.not_included"], font: .boldSystemFont(ofSize: 11)); y += 4
                for item in input.exclusions { text("•  \(item)", font: .systemFont(ofSize: 10)); y += 2 }
                y += 12
            }
            text(t["pdf.validity"], font: .systemFont(ofSize: 9.5), color: .darkGray); y += 6
            text(t["pdf.disclaimer"], font: .systemFont(ofSize: 9), color: .gray)
        }
    }

    /// Customer-facing unit names (the AI and catalog use English units).
    static func unitLabel(_ unit: String, language: AppLanguage) -> String {
        guard language == .es else { return unit }
        let map = ["each": "pza", "ea": "pza", "job": "trabajo", "linear ft": "pies lin.", "ft": "pies", "feet": "pies",
                   "sq ft": "pies²", "cu yd": "yd³", "hr": "h", "hour": "h", "hours": "h", "day": "día", "days": "días"]
        return map[unit.lowercased()] ?? unit
    }

    static func write(_ data: Data, language: AppLanguage, number: String) throws -> URL {
        let name = (language == .es ? "Presupuesto" : "Estimate") + "-\(number).pdf"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen])
        return url
    }

    /// Looks strings up in the customer's language, not the phone's.
    struct Strings {
        private let bundle: Bundle
        init(_ language: AppLanguage) {
            bundle = Bundle.main.path(forResource: language.rawValue, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        }
        subscript(key: String) -> String { bundle.localizedString(forKey: key, value: key, table: nil) }
    }
}
