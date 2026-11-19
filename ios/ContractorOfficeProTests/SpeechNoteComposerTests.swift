import XCTest
@testable import ContractorOfficePro

final class SpeechNoteComposerTests: XCTestCase {
    @MainActor
    func testFreshRecording() {
        XCTAssertEqual(SpeechNoteComposer.compose(existing: "", segment: "  Replace two outlets  "), "Replace two outlets")
    }

    @MainActor
    func testSecondRecordingAppendsWithoutDestroyingEarlierScope() {
        XCTAssertEqual(
            SpeechNoteComposer.compose(existing: "Replace two switches", segment: "Add three GFCI outlets"),
            "Replace two switches\nAdd three GFCI outlets"
        )
    }

    @MainActor
    func testPartialResultsReplaceOnlyCurrentSegment() {
        let baseline = "Two standard outlets and one switch"
        XCTAssertEqual(
            SpeechNoteComposer.compose(existing: baseline, segment: "and three GFCI outlets"),
            "Two standard outlets and one switch\nand three GFCI outlets"
        )
        XCTAssertEqual(
            SpeechNoteComposer.compose(existing: baseline, segment: "and three GFCI outlets in the kitchen"),
            "Two standard outlets and one switch\nand three GFCI outlets in the kitchen"
        )
    }

    @MainActor
    func testEmptyRecognitionNeverDeletesSavedDraft() {
        XCTAssertEqual(SpeechNoteComposer.compose(existing: "Kitchen is 10 by 12", segment: "   "), "Kitchen is 10 by 12")
    }

    @MainActor
    func testWhitespaceSeparatedBaselineAvoidsExtraNewline() {
        XCTAssertEqual(SpeechNoteComposer.compose(existing: "Bathroom demo\n", segment: "New shower"), "Bathroom demo\nNew shower")
    }
}
