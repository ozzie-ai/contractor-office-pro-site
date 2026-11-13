import XCTest

/// Taps through the main screens in demo mode (sample data, fake server) and attaches screenshots.
final class SmokeUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor
    func testTourAndCreateClient() {
        let app = XCUIApplication()
        app.launchArguments = ["-demo", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()

        let panelJob = app.staticTexts["Panel upgrade 100A → 200A"]
        XCTAssertTrue(panelJob.waitForExistence(timeout: 10))
        snap("1-jobs")

        panelJob.tap()
        XCTAssertTrue(app.staticTexts["Ana López"].waitForExistence(timeout: 5))
        snap("2-job-detail")

        app.tabBars.buttons["Clients"].tap()
        let ana = app.staticTexts["Ana López"]
        XCTAssertTrue(ana.waitForExistence(timeout: 5))
        snap("3-clients")

        ana.tap()
        XCTAssertTrue(app.buttons["Call"].waitForExistence(timeout: 5))
        snap("4-client-detail")

        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["New client"].firstMatch.tap()
        let name = app.textFields["Name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap()
        name.typeText("Carlos Ruiz")
        snap("5-new-client-form")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Carlos Ruiz"].waitForExistence(timeout: 5), "new client appears in the list")
        snap("6-client-saved")

        app.tabBars.buttons["Settings"].tap()
        XCTAssertTrue(app.staticTexts["Flores Construction"].waitForExistence(timeout: 5))
        snap("7-settings")
    }

    @MainActor
    func testDraftEstimateWithAI() {
        let app = XCUIApplication()
        app.launchArguments = ["-demo", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()

        let job = app.staticTexts["Bathroom remodel"]
        XCTAssertTrue(job.waitForExistence(timeout: 10))
        job.tap()
        app.buttons["New estimate with AI"].tap()
        let notes = app.textViews["draft-notes"].exists ? app.textViews["draft-notes"] : app.textFields["draft-notes"]
        XCTAssertTrue(notes.waitForExistence(timeout: 5))
        notes.typeText("Cambiar panel de 100 a 200 amperios, transferir 20 circuitos, circuito de 40A para cargador.")
        snap("9-draft-notes")
        app.buttons["Draft estimate"].tap()

        XCTAssertTrue(app.staticTexts["Needs price"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Reference · preliminary"].firstMatch.exists)
        snap("10-estimate")

        let wireRow = app.buttons.containing(NSPredicate(format: "label CONTAINS 'Wire run'")).firstMatch
        for _ in 0..<4 where !wireRow.isHittable { app.swipeUp() }
        wireRow.tap()
        let price = app.textFields["line-unit-price"]
        XCTAssertTrue(price.waitForExistence(timeout: 5))
        price.tap()
        price.typeText("3.50")
        snap("11-line-editor")
        app.buttons["Save"].tap()
        let saved = app.buttons.containing(NSPredicate(format: "label CONTAINS 'Wire run' AND label CONTAINS 'Your price'")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 5), "price saved to the price book")
        snap("12-estimate-after-edit")
    }

    @MainActor
    func testSpanish() {
        let app = XCUIApplication()
        app.launchArguments = ["-demo", "-AppleLanguages", "(es)", "-AppleLocale", "es_US"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Trabajos"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.tabBars.buttons["Clientes"].exists)
        snap("8-jobs-spanish")
    }

    @MainActor
    private func snap(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
