import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Network bridge to versioned, authenticated server. Never embeds API keys,
/// stores private transcripts in logs, or performs estimate arithmetic in Swift.
struct EstimatingAPIClient {
    enum Failure: Error, Equatable {
        case invalidURL
        case invalidAccessToken
        case unexpectedResponse
        case requestFailed(String)
    }

    let baseURL: URL
    let accessToken: @Sendable () async throws -> String
    let session: URLSession

    init(baseURL: URL, session: URLSession = .shared,
         accessToken: @escaping @Sendable () async throws -> String) {
        self.baseURL = baseURL
        self.session = session
        self.accessToken = accessToken
    }

    struct InterpretationRequest: Encodable, Sendable {
        let description: String
    }

    struct InterpretationResponse: Decodable, Sendable {
        struct Task: Decodable, Sendable {
            let category: String
            let descriptionEn: String
            let descriptionEs: String
            let quantity: String?
            let unit: String?
            let specifications: [String]
            let status: String
            let taskCode: String?
        }
        struct Job: Decodable, Sendable {
            let trade: String
            let projectSummaryEn: String
            let projectSummaryEs: String
            let tasks: [Task]
            let excludedWork: [String]
            let futureWork: [String]
            let unknownDetails: [String]
            let confidenceNotes: [String]
        }
        let version: Int
        let interpretation: Job
        let pricingStatus: String
    }

    struct DirectCost: Encodable, Sendable {
        let laborHoursPerUnit: Decimal
        let loadedLaborRate: Decimal
        let materialCostPerUnit: Decimal
        let source: String // contractor_entered or planning_allowance only
    }

    struct WorkItem: Encodable, Sendable {
        let taskCode: String
        let scopeId: String?
        let descriptionEn: String
        let descriptionEs: String?
        let quantity: Decimal?
        let unit: String
        let directCost: DirectCost?
        let unitSellingPriceOverride: Decimal?
        let priceBookItemId: UUID?
        let excluded: Bool
    }

    struct PriceRequest: Encodable, Sendable {
        let items: [WorkItem]
        let overheadPct: Decimal
        let profitPct: Decimal
        let mobilizationDirectCost: Decimal
        let mobilizationSource: String?
        let regionCode: String?
        let customerLanguage: String
    }

    struct PriceResponse: Decodable, Sendable {
        struct Line: Decodable, Sendable {
            let taskCode: String
            let quantity: String?
            let unit: String
            let descriptionEn: String
            let descriptionEs: String?
            let directTotal: String?
            let sellingTotal: String?
            let source: String?
            let preliminary: Bool
            let missing: [String]
        }
        let status: String
        let preliminary: Bool
        let currency: String
        let customerLanguage: String
        let lines: [Line]
        let mobilizationSellingTotal: String?
        let directTotal: String?
        let sellingTotal: String?
        let missing: [String]
        let warning: String
    }

    struct PriceBookEntry: Decodable, Sendable {
        let id: String
        let kind: String
        let nameEn: String
        let nameEs: String?
        let unit: String
        let unitCost: String
        let unitPrice: String
        let category: String?
        let source: String
    }

    func interpret(_ description: String) async throws -> InterpretationResponse {
        try await post("v1/interpret", body: InterpretationRequest(description: description))
    }

    func price(_ draft: PriceRequest) async throws -> PriceResponse {
        try await post("v1/estimate/price", body: draft)
    }

    func pricebook() async throws -> [PriceBookEntry] {
        try await request("v1/pricebook", method: "GET", body: nil)
    }

    private func post<Input: Encodable, Output: Decodable>(_ path: String, body: Input) async throws -> Output {
        let data = try Self.encoder.encode(body)
        return try await request(path, method: "POST", body: data)
    }

    private func request<Output: Decodable>(_ path: String, method: String, body: Data?) async throws -> Output {
        guard baseURL.scheme?.lowercased() == "https" else { throw Failure.invalidURL }
        let token = try await accessToken()
        guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Failure.invalidAccessToken }
        var request = URLRequest(url: baseURL.appending(path: path), cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, rawResponse) = try await session.data(for: request)
        guard let response = rawResponse as? HTTPURLResponse else { throw Failure.unexpectedResponse }
        guard (200..<300).contains(response.statusCode) else {
            // Only allowlist the service error code. Never expose private response text.
            let error = try? Self.decoder.decode(ServiceError.self, from: data)
            throw Failure.requestFailed(error?.detail?.error ?? "request_failed")
        }
        return try Self.decoder.decode(Output.self, from: data)
    }

    private struct ServiceError: Decodable {
        struct Detail: Decodable { let error: String }
        let detail: Detail?
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}
