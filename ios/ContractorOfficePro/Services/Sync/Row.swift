import Foundation
import Supabase

/// A Supabase row as loose JSON. Mappings in SyncMappings.swift convert models <-> rows.
typealias Row = [String: AnyJSON]

enum SyncDate {
    nonisolated(unsafe) private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) private static let whole: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let day: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Postgres sends microseconds ("…:00.123456+00:00"); trim to milliseconds before parsing.
    static func parse(_ raw: String) -> Date? {
        let trimmed = raw.replacingOccurrences(of: #"(\.\d{3})\d+"#, with: "$1", options: .regularExpression)
        return fractional.date(from: trimmed) ?? whole.date(from: trimmed)
    }

    static func format(_ date: Date) -> String { fractional.string(from: date) }
    static func parseDay(_ raw: String) -> Date? { day.date(from: String(raw.prefix(10))) }
    static func formatDay(_ date: Date) -> String { day.string(from: date) }
}

extension Dictionary where Key == String, Value == AnyJSON {
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
        case .integer(let i): return i
        case .double(let d): return Int(d)
        default: return nil
        }
    }
    func double(_ key: String) -> Double? {
        switch self[key] {
        case .integer(let i): return Double(i)
        case .double(let d): return d
        case .string(let s): return Double(s)
        default: return nil
        }
    }
    /// Numeric columns arrive as JSON numbers; we send them as strings to keep exact cents.
    func decimal(_ key: String) -> Decimal? {
        switch self[key] {
        case .integer(let i): return Decimal(i)
        case .double(let d): return Decimal(string: String(d))
        case .string(let s): return Decimal(string: s)
        default: return nil
        }
    }
}

/// Encoders for row values. Optionals become JSON null.
enum J {
    static func s(_ v: String?) -> AnyJSON { v.map { .string($0) } ?? .null }
    static func u(_ v: UUID?) -> AnyJSON { v.map { .string($0.uuidString.lowercased()) } ?? .null }
    static func t(_ v: Date?) -> AnyJSON { v.map { .string(SyncDate.format($0)) } ?? .null }
    static func day(_ v: Date?) -> AnyJSON { v.map { .string(SyncDate.formatDay($0)) } ?? .null }
    static func b(_ v: Bool) -> AnyJSON { .bool(v) }
    static func i(_ v: Int) -> AnyJSON { .integer(v) }
    static func d(_ v: Double?) -> AnyJSON { v.map { .double($0) } ?? .null }
    static func dec(_ v: Decimal?) -> AnyJSON { v.map { .string(NSDecimalNumber(decimal: $0).stringValue) } ?? .null }
}
