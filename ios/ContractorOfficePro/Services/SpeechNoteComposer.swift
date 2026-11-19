import Foundation

/// Pure note composition for successive speech recognition sessions.
/// Each recognizer update replaces the current segment, not prior job notes.
nonisolated enum SpeechNoteComposer {
    static func compose(existing: String, segment: String) -> String {
        let trimmed = segment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return existing }
        guard !existing.isEmpty else { return trimmed }
        let separator = existing.last?.isWhitespace == true ? "" : "\n"
        return existing + separator + trimmed
    }
}
