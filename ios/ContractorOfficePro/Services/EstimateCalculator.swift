import Foundation

/// Deterministic estimate math (CLAUDE.md principle 5: LLMs interpret, code computes).
/// Each line is rounded to cents, then tax is computed on the taxable subtotal and rounded half-up.
nonisolated enum EstimateCalculator {
    struct Totals: Equatable, Sendable {
        var subtotal: Decimal
        var tax: Decimal
        var total: Decimal
    }

    struct Line: Sendable {
        var qty: Decimal
        var unitPrice: Decimal
        var taxable: Bool
    }

    static func lineTotal(qty: Decimal, unitPrice: Decimal) -> Decimal {
        roundCents(qty * unitPrice)
    }

    static func totals(lines: [Line], taxRate: Decimal) -> Totals {
        var subtotal: Decimal = 0
        var taxable: Decimal = 0
        for line in lines {
            let amount = lineTotal(qty: line.qty, unitPrice: line.unitPrice)
            subtotal += amount
            if line.taxable { taxable += amount }
        }
        let tax = roundCents(taxable * taxRate)
        return Totals(subtotal: subtotal, tax: tax, total: subtotal + tax)
    }

    @MainActor
    /// Recomputes and stores totals on the estimate from its live (non-deleted) line items.
    static func apply(to estimate: Estimate, lineItems: [LineItem], taxRate: Decimal, now: Date = .now) {
        let live = lineItems.filter { $0.estimateId == estimate.id && $0.deletedAt == nil }
        let t = totals(lines: live.map { Line(qty: $0.qty, unitPrice: $0.unitPrice, taxable: $0.taxable) },
                       taxRate: taxRate)
        estimate.subtotal = t.subtotal
        estimate.tax = t.tax
        estimate.total = t.total
        estimate.touch(now: now)
    }

    static func roundCents(_ value: Decimal) -> Decimal {
        var input = value
        var result = Decimal()
        NSDecimalRound(&result, &input, 2, .plain)
        return result
    }
}
