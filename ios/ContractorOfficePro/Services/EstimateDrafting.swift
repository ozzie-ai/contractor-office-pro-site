import Foundation

/// AI step then pricing step. The model never prices: the second call is deterministic code on the server.
nonisolated struct EstimateDraft: Sendable {
    let interpretation: InterpretationDTO
    let pricing: PriceResponseDTO
}

enum EstimateDrafting {
    enum Phase: Equatable { case reading, pricing }

    static func draft(notes: String, language: AppLanguage, service: any EstimateService,
                      onPhase: (Phase) -> Void = { _ in }) async throws -> EstimateDraft {
        onPhase(.reading)
        let interpretation = try await service.interpret(
            InterpretRequestBody(description: notes, language: language.rawValue)).interpretation
        guard !interpretation.tasks.isEmpty else { throw BackendError.nothingFound }
        onPhase(.pricing)
        let pricing = try await service.price(PriceRequestBody(tasks: interpretation.tasks))
        return EstimateDraft(interpretation: interpretation, pricing: pricing)
    }
}
