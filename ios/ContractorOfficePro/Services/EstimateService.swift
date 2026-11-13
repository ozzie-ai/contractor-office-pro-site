import Foundation

/// The AI + pricing backend (backend/app). Injected so previews and tests use FakeBackend.
protocol EstimateService: Sendable {
    func interpret(_ request: InterpretRequestBody) async throws -> InterpretResponseDTO
    func price(_ request: PriceRequestBody) async throws -> PriceResponseDTO
    func refine(_ request: RefineRequestBody) async throws -> RefineResponseDTO
    func materials(_ request: MaterialsRequestBody) async throws -> MaterialsResponseDTO
}

// MARK: - Wire types (snake_case on the wire; see backend/app/schemas.py)

nonisolated struct InterpretRequestBody: Encodable, Sendable {
    var description: String
    var language: String?
    var images: [ImageBody] = []

    struct ImageBody: Encodable, Sendable {
        var contentType: String
        var dataBase64: String
    }
}

nonisolated struct InterpretResponseDTO: Decodable, Sendable {
    var interpretation: InterpretationDTO
}

nonisolated struct InterpretationDTO: Decodable, Sendable {
    var trade: String
    var projectSummaryEn: String
    var projectSummaryEs: String
    var tasks: [WorkTaskDTO]
    var excludedWork: [String]
    var futureWork: [String]
    var unknownDetails: [String]
    var confidenceNotes: [String]
}

nonisolated struct WorkTaskDTO: Codable, Sendable {
    var taskCode: String?
    var category: String?
    var descriptionEn: String
    var descriptionEs: String
    var quantity: Double?
    var unit: String?
    var specifications: [String]?
    var status: String?
    var evidence: String?
}

nonisolated struct PriceRequestBody: Encodable, Sendable {
    var tasks: [WorkTaskDTO]
}

nonisolated struct RefineRequestBody: Encodable, Sendable {
    var notes: String
    var language: String?
    var currentLines: [CurrentLineBody]
    var answers: [QuestionAnswer]

    struct CurrentLineBody: Encodable, Sendable {
        var ref: Int
        var taskCode: String?
        var descriptionEn: String
        var quantity: Double?
        var unit: String?
    }
}

nonisolated struct QuestionAnswer: Codable, Sendable, Equatable {
    var question: String
    var answer: String
}

nonisolated struct RefineResponseDTO: Decodable, Sendable {
    var changes: RefinementDTO
}

nonisolated struct RefinementDTO: Decodable, Sendable {
    var add: [WorkTaskDTO]
    var update: [LineUpdateDTO]
    var exclusions: [String]
    var remainingQuestions: [String]
}

nonisolated struct LineUpdateDTO: Decodable, Sendable, Equatable {
    var ref: Int
    var quantity: Double?
    var unit: String?
    var reasonEn: String
}

nonisolated struct MaterialsRequestBody: Encodable, Sendable {
    var notes: String
    var language: String?
    var lines: [RefineRequestBody.CurrentLineBody]
}

nonisolated struct MaterialsResponseDTO: Decodable, Sendable {
    var materialsList: MaterialsListDTO
}

nonisolated struct MaterialsListDTO: Decodable, Sendable {
    var materials: [MaterialDTO]
    var assumptions: [String]
    var questions: [String]
}

nonisolated struct MaterialDTO: Decodable, Sendable {
    var nameEn: String
    var nameEs: String
    var category: String
    var quantity: Double?
    var unit: String?
    var specifications: [String]
    var forRefs: [Int]
    var searchQuery: String
    var evidence: String
    var noteEn: String
}

/// Decimals arrive as JSON strings ("2100.00") so cents stay exact.
nonisolated struct DecimalValue: Decodable, Sendable, Equatable {
    let value: Decimal

    init(_ value: Decimal) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let text = try? container.decode(String.self), let value = Decimal(string: text) {
            self.value = value
        } else {
            self.value = Decimal(try container.decode(Double.self))
        }
    }
}

nonisolated struct PricedLineDTO: Decodable, Sendable {
    var taskCode: String?
    var descriptionEn: String
    var descriptionEs: String
    var quantity: DecimalValue?
    var unit: String?
    var unitPrice: DecimalValue?
    var lineTotal: DecimalValue?
    var priceSource: String
    var preliminary: Bool
    var sourceName: String?
    var appliesTo: String?
    var note: String?
    var needs: [String]
}

nonisolated struct PriceResponseDTO: Decodable, Sendable {
    var regionCode: String
    var lines: [PricedLineDTO]
    var subtotal: DecimalValue
    var pricedLines: Int
    var unpricedLines: Int
    var preliminary: Bool
    var disclaimer: String
}

// MARK: - Errors

nonisolated enum BackendError: Error, Equatable {
    case offline
    case signedOut
    case busy
    case timedOut
    case nothingFound
    case server(code: String)
    case invalidResponse

    /// Maps the backend's {"error": code} to a case. Codes match backend/app/errors.py and the team pilot.
    static func from(code: String) -> BackendError {
        switch code {
        case "access_denied", "no_business": .signedOut
        case "ai_rate_limited", "rate_limited", "transcription_rate_limited": .busy
        case "ai_timeout", "transcription_timeout": .timedOut
        default: .server(code: code)
        }
    }
}

extension BackendError {
    @MainActor var message: LocalizedStringResource {
        switch self {
        case .offline: .aiErrorOffline
        case .signedOut: .aiErrorSignedOut
        case .busy: .aiErrorBusy
        case .timedOut: .aiErrorTimeout
        case .nothingFound: .aiErrorNothingFound
        case .server, .invalidResponse: .aiErrorGeneric
        }
    }
}

// MARK: - Live client

private nonisolated struct ErrorBody: Decodable { let error: String }

nonisolated struct BackendClient: EstimateService {
    let baseURL: URL
    let accessToken: @Sendable () async throws -> String
    var session: URLSession = .shared

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    func interpret(_ request: InterpretRequestBody) async throws -> InterpretResponseDTO {
        try await post("v1/interpret", body: request)
    }

    func price(_ request: PriceRequestBody) async throws -> PriceResponseDTO {
        try await post("v1/estimate/price", body: request)
    }

    func refine(_ request: RefineRequestBody) async throws -> RefineResponseDTO {
        try await post("v1/refine", body: request)
    }

    func materials(_ request: MaterialsRequestBody) async throws -> MaterialsResponseDTO {
        try await post("v1/materials", body: request)
    }

    private func post<Body: Encodable, Response: Decodable>(_ path: String, body: Body) async throws -> Response {
        let token: String
        do { token = try await accessToken() } catch { throw BackendError.signedOut }
        var request = URLRequest(url: baseURL.appending(path: path), timeoutInterval: 90)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try Self.encoder.encode(body)
        let data: Data, response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .timedOut {
            throw BackendError.timedOut
        } catch {
            throw BackendError.offline
        }
        return try Self.decode(data: data, status: (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    static func decode<Response: Decodable>(data: Data, status: Int) throws -> Response {
        guard status == 200 else {
            let code = (try? decoder.decode(ErrorBody.self, from: data))?.error ?? "http_\(status)"
            throw BackendError.from(code: code)
        }
        do { return try decoder.decode(Response.self, from: data) } catch { throw BackendError.invalidResponse }
    }
}
