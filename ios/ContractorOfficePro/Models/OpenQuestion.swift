import Foundation

/// A question the AI couldn't answer from the notes, with tap-to-answer choices.
/// Stored on `Estimate.openQuestions` as JSON; older estimates hold one plain question per line.
nonisolated struct OpenQuestion: Codable, Sendable, Equatable, Hashable {
    var question: String
    var choices: [String]

    init(question: String, choices: [String] = []) {
        self.question = question
        self.choices = choices
    }

    static func decode(_ stored: String?) -> [OpenQuestion] {
        guard let stored = stored?.nilIfBlank else { return [] }
        if stored.hasPrefix("["), let data = stored.data(using: .utf8),
           let questions = try? JSONDecoder().decode([OpenQuestion].self, from: data) {
            return questions
        }
        return stored.split(separator: "\n").map { OpenQuestion(question: String($0)) }
    }

    static func encode(_ questions: [OpenQuestion]) -> String? {
        let kept = questions.filter { !$0.question.trimmed.isEmpty }
        guard !kept.isEmpty, let data = try? JSONEncoder().encode(kept) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
