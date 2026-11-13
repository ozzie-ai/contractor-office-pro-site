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
