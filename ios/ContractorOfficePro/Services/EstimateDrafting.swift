import Foundation

/// AI step then pricing step. The model never prices: the second call is deterministic code on the server.
nonisolated struct EstimateDraft: Sendable {
    let interpretation: InterpretationDTO
    let pricing: PriceResponseDTO
}

/// What the contractor's answers would change, priced and ready for review. Nothing is applied yet.
nonisolated struct RefinementProposal: Sendable {
    let answers: [QuestionAnswer]
    let adds: [PricedLineDTO]
    let updates: [LineUpdateDTO]
    let exclusions: [String]
    let remainingQuestions: [OpenQuestion]

    var isEmpty: Bool { adds.isEmpty && updates.isEmpty && exclusions.isEmpty }
}

enum EstimateRefining {
    /// `lines` order defines each line's `ref`.
    static func propose(notes: String, language: AppLanguage, lines: [LineItem], answers: [QuestionAnswer],
                        service: any EstimateService) async throws -> RefinementProposal {
        let current = lines.enumerated().map { ref, line in
            RefineRequestBody.CurrentLineBody(ref: ref, taskCode: line.taskCode, descriptionEn: line.descriptionEn,
                                              quantity: line.qty == 0 ? nil : NSDecimalNumber(decimal: line.qty).doubleValue,
                                              unit: line.unit)
        }
        let changes = try await service.refine(RefineRequestBody(notes: notes, language: language.rawValue,
                                                                 currentLines: current, answers: answers)).changes
        let priced = changes.add.isEmpty ? [] : try await service.price(PriceRequestBody(tasks: changes.add)).lines
        return RefinementProposal(answers: answers, adds: priced,
                                  updates: changes.update.filter { lines.indices.contains($0.ref) },
                                  exclusions: changes.exclusions, remainingQuestions: changes.openQuestions)
    }
}

enum MaterialsDrafting {
    static func draft(for estimate: Estimate, lines: [LineItem], service: any EstimateService) async throws -> MaterialsListDTO {
        let body = MaterialsRequestBody(
            notes: estimate.internalNotes ?? "", language: estimate.language.rawValue,
            lines: lines.enumerated().map { ref, line in
                RefineRequestBody.CurrentLineBody(ref: ref, taskCode: line.taskCode, descriptionEn: line.descriptionEn,
                                                  quantity: line.qty == 0 ? nil : NSDecimalNumber(decimal: line.qty).doubleValue,
                                                  unit: line.unit)
            })
        let list = try await service.materials(body).materialsList
        guard !list.materials.isEmpty else { throw BackendError.nothingFound }
        return list
    }
}

enum EstimateDrafting {
    enum Phase: Equatable { case reading, pricing }

    /// `images`: job photos already downscaled for the AI (see PhotoStore.aiImage); at most 6 are sent.
    static func draft(notes: String, language: AppLanguage, trade: Trade? = nil,
                      images: [InterpretRequestBody.ImageBody] = [], service: any EstimateService,
                      onPhase: (Phase) -> Void = { _ in }) async throws -> EstimateDraft {
        onPhase(.reading)
        let interpretation = try await service.interpret(
            InterpretRequestBody(description: notes, language: language.rawValue, tradeHint: trade?.rawValue,
                                 images: Array(images.prefix(6)))).interpretation
        guard !interpretation.tasks.isEmpty else { throw BackendError.nothingFound }
        onPhase(.pricing)
        let pricing = try await service.price(PriceRequestBody(tasks: interpretation.tasks))
        return EstimateDraft(interpretation: interpretation, pricing: pricing)
    }
}
