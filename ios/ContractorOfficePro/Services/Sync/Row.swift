import Foundation
import Supabase

/// A Supabase row as loose JSON. Mappings in SyncMappings.swift convert models <-> rows.
typealias Row = [String: AnyJSON]

/// Timestamp/date conversions for the wire format. FormatStyles are Sendable, so no unsafe statics.
nonisolated enum SyncDate {
    private static let fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let whole = Date.ISO8601FormatStyle()
    private static let day = Date.ISO8601FormatStyle(timeZone: .current).year().month().day().dateSeparator(.dash)

    /// Postgres sends microseconds and "+00:00" ("…:30.123456+00:00"); normalize to "…:30.123Z" first.
    static func parse(_ raw: String) -> Date? {
        var s = raw.replacingOccurrences(of: #"(\.\d{3})\d+"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\+00:?00$"#, with: "Z", options: .regularExpression)
        return (try? fractional.parse(s)) ?? (try? whole.parse(s))
    }

    static func format(_ date: Date) -> String { fractional.format(date) }
    static func parseDay(_ raw: String) -> Date? { try? day.parse(String(raw.prefix(10))) }
    static func formatDay(_ date: Date) -> String { day.format(date) }
}

nonisolated extension Dictionary where Key == String, Value == AnyJSON {
    func string(_ key: String) -> String? {
        if case .string(let s) = self[key] { return s }
        return nil
    }
    func uuid(_ key: String) -> UUID? { string(key).flatMap(UUID.init(uuidString:)) }
    func date(_ key: String) -> Date? { string(key).flatMap(SyncDate.parse) }
    func day(_ key: String) -> Date? { string(key).flatMap(SyncDate.parseDay) }
    func bool(_ key: String) -> Bool? {
        if case .bool(let b) = self[key] { return b }
        return nil
    }
    func int(_ key: String) -> Int? {
        switch self[key] {
        case .integer(let i): i
        case .double(let d): Int(d)
        default: nil
        }
    }
    func double(_ key: String) -> Double? {
        switch self[key] {
        case .integer(let i): Double(i)
        case .double(let d): d
        case .string(let s): Double(s)
        default: nil
        }
    }
    /// Numeric columns arrive as JSON numbers; we send them as strings to keep exact cents.
    func decimal(_ key: String) -> Decimal? {
        switch self[key] {
        case .integer(let i): Decimal(i)
        case .double(let d): Decimal(string: String(d))
        case .string(let s): Decimal(string: s)
        default: nil
        }
    }
}

/// Encoders for row values. Optionals become JSON null.
nonisolated enum J {
    static func s(_ v: String?) -> AnyJSON { v.map { .string($0) } ?? .null }
    static func u(_ v: UUID?) -> AnyJSON { v.map { .string($0.uuidString.lowercased()) } ?? .null }
    static func t(_ v: Date?) -> AnyJSON { v.map { .string(SyncDate.format($0)) } ?? .null }
    static func day(_ v: Date?) -> AnyJSON { v.map { .string(SyncDate.formatDay($0)) } ?? .null }
    static func b(_ v: Bool) -> AnyJSON { .bool(v) }
    static func i(_ v: Int) -> AnyJSON { .integer(v) }
    static func d(_ v: Double?) -> AnyJSON { v.map { .double($0) } ?? .null }
    static func dec(_ v: Decimal?) -> AnyJSON { v.map { .string(NSDecimalNumber(decimal: $0).stringValue) } ?? .null }
}
