import XCTest

/// Taps through the main screens in demo mode (sample data, fake server) and attaches screenshots.
final class SmokeUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor
    func testTourAndCreateClient() {
        let app = XCUIApplication()
        app.launchArguments = ["-demo", "-noSplash", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
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
        app.launchArguments = ["-demo", "-noSplash", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()

        let job = app.staticTexts["Bathroom remodel"]
        XCTAssertTrue(job.waitForExistence(timeout: 10))
        job.tap()
        XCTAssertTrue(app.buttons["New estimate with AI"].waitForExistence(timeout: 5)); Thread.sleep(forTimeInterval: 0.8)
        snap("8b-job-detail-buttons")
        app.buttons["New estimate with AI"].tap()
        let notes = app.textViews["draft-notes"].exists ? app.textViews["draft-notes"] : app.textFields["draft-notes"]
        XCTAssertTrue(notes.waitForExistence(timeout: 5))
        notes.typeText("Cambiar panel de 100 a 200 amperios, transferir 20 circuitos, circuito de 40A para cargador.")
        snap("9-draft-notes")
        app.buttons["Draft estimate"].tap()
        Thread.sleep(forTimeInterval: 0.7)
        snap("9b-ai-glow")

        XCTAssertTrue(app.staticTexts["estimate-total"].waitForExistence(timeout: 10))
        snap("10a-estimate-top")
        let ballpark = element(in: app, labeled: "AI ballpark")
        for _ in 0..<4 where !ballpark.exists { app.swipeUp() }
        XCTAssertTrue(ballpark.exists, "unpriced lines get a labeled AI ballpark")
        XCTAssertTrue(element(in: app, labeled: "Reference · preliminary").exists)
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
    func testAnswerAIQuestionsAndApply() {
        let app = XCUIApplication()
        app.launchArguments = ["-demo", "-noSplash", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        app.staticTexts["Bathroom remodel"].tap()
        XCTAssertTrue(app.buttons["New estimate with AI"].waitForExistence(timeout: 5))
        app.buttons["New estimate with AI"].tap()
        let notes = app.textViews["draft-notes"].exists ? app.textViews["draft-notes"] : app.textFields["draft-notes"]
        XCTAssertTrue(notes.waitForExistence(timeout: 5))
        notes.typeText("Cambiar panel de 100 a 200 amperios y circuito de 40A para cargador.")
        app.buttons["Draft estimate"].tap()

        let answerButton = app.buttons["answer-questions"]
        XCTAssertTrue(answerButton.waitForExistence(timeout: 10))
        answerButton.tap()
        let yes = app.buttons["answer-0-Yes"]
        XCTAssertTrue(yes.waitForExistence(timeout: 5), "questions come with tap answers")
        XCTAssertTrue(app.buttons["answer-0-not-sure"].exists && app.buttons["answer-0-other"].exists)
        yes.tap()
        app.buttons["answer-1-85 ft"].tap()
        XCTAssertTrue(element(in: app, labeled: "2 of 2 answered").waitForExistence(timeout: 2))
        snap("13-answer-questions")
        app.buttons["answers-update"].tap()

        let apply = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Apply'")).firstMatch
        XCTAssertTrue(apply.waitForExistence(timeout: 10))
        snap("14-proposed-changes")
        apply.tap()

        let added = element(in: app, labeled: "Install the customer-supplied EV charger")
        for _ in 0..<5 where !added.exists { app.swipeUp() }
        XCTAssertTrue(added.exists, "approved line was added")
        snap("15-estimate-after-answers")
    }

    @MainActor
    func testBuildMaterialsListAndShop() {
        let app = XCUIApplication()
        app.launchArguments = ["-demo", "-noSplash", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        app.staticTexts["Bathroom remodel"].tap()
        XCTAssertTrue(app.buttons["New estimate with AI"].waitForExistence(timeout: 5))
        app.buttons["New estimate with AI"].tap()
        let notes = app.textViews["draft-notes"].exists ? app.textViews["draft-notes"] : app.textFields["draft-notes"]
        XCTAssertTrue(notes.waitForExistence(timeout: 5))
        notes.typeText("Cambiar panel de 100 a 200 amperios y circuito de 40A para cargador.")
        app.buttons["Draft estimate"].tap()
        XCTAssertTrue(app.staticTexts["estimate-total"].waitForExistence(timeout: 10))

        let build = app.buttons["Build materials list with AI"]
        for _ in 0..<5 where !build.isHittable { app.swipeUp() }
        build.tap()

        let wire = element(in: app, labeled: "8 AWG THHN copper wire")
        XCTAssertTrue(wire.waitForExistence(timeout: 10), "materials list opens")
        XCTAssertTrue(element(in: app, labeled: "0 of 4 bought").exists)
        snap("16-materials")
        app.buttons["Mark as bought"].firstMatch.tap()
        XCTAssertTrue(element(in: app, labeled: "1 of 4 bought").waitForExistence(timeout: 3))
        app.buttons["shop-8 AWG THHN copper wire"].tap()
        XCTAssertTrue(app.buttons["Home Depot"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Lowe's"].exists && app.buttons["Amazon"].exists)
        snap("17-shop-menu")
    }

    @MainActor
    func testGuidedNewEstimateAndSend() {
        let app = XCUIApplication()
        app.launchArguments = ["-demo", "-noSplash", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        snap("18-home")
        app.buttons["home-new-estimate"].tap()
        XCTAssertTrue(app.buttons["trade-electrical"].waitForExistence(timeout: 5))
        snap("19-what-kind")
        app.buttons["trade-electrical"].tap()

        XCTAssertTrue(app.buttons["New client"].waitForExistence(timeout: 5))
        snap("20-who-for")
        app.buttons["New client"].tap()
        let name = app.textFields["Name"]
        XCTAssertTrue(name.waitForExistence(timeout: 3))
        name.tap(); name.typeText("Rosa Martínez")
        app.buttons["Continue"].tap()

        XCTAssertTrue(app.buttons["pick-Panel upgrade"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["photo-choose"].exists, "photos can be added in the flow")
        app.buttons["pick-Panel upgrade"].tap()
        app.buttons["pick-EV charger"].tap()
        XCTAssertEqual(app.textFields["quick-notes"].value as? String ?? app.textViews["quick-notes"].value as? String,
                       "Panel upgrade, EV charger")
        snap("21-tell-me")
        app.buttons["make-estimate"].tap()

        XCTAssertTrue(app.staticTexts["estimate-total"].waitForExistence(timeout: 15), "estimate opens after drafting")
        snap("22-estimate-with-send")
        // One-tap "looks right" on an AI ballpark.
        let circuit = app.buttons.containing(NSPredicate(format: "label CONTAINS 'New 40A double-pole circuit'")).firstMatch
        for _ in 0..<4 where !circuit.isHittable { app.swipeUp() }
        circuit.tap()
        let confirm = app.buttons["line-confirm-price"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        snap("23-ballpark-line")
        confirm.tap()

        app.buttons["send-to-customer"].tap()
        XCTAssertTrue(app.buttons["send-es"].waitForExistence(timeout: 5), "AI ballparks don't block sending")
        XCTAssertTrue(element(in: app, labeled: "AI ballpark").exists, "but the contractor is reminded to check them")
        snap("24-send-ready")
        app.buttons["send-es"].tap()
        let shareSheet = app.otherElements["ActivityListView"]
        XCTAssertTrue(shareSheet.waitForExistence(timeout: 8) || app.navigationBars["UIActivityContentView"].waitForExistence(timeout: 2),
                      "share sheet with the Spanish PDF opens")
        snap("25-share-sheet")
    }

    @MainActor
    func testSplashSettlesIntoTheApp() {
        let app = XCUIApplication()
        app.launchArguments = ["-demo", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        Thread.sleep(forTimeInterval: 0.25); snap("splash-a")
        Thread.sleep(forTimeInterval: 0.45); snap("splash-b")
        Thread.sleep(forTimeInterval: 0.6); snap("splash-c")
        XCTAssertTrue(app.staticTexts["Fence repair"].waitForExistence(timeout: 5), "app appears after the splash")
        Thread.sleep(forTimeInterval: 0.6); snap("splash-d-app")
    }

    @MainActor
    func testSpanish() {
        let app = XCUIApplication()
        app.launchArguments = ["-demo", "-noSplash", "-AppleLanguages", "(es)", "-AppleLocale", "es_US"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Trabajos"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.tabBars.buttons["Clientes"].exists)
        snap("8-jobs-spanish")
    }

    /// Badges are combined accessibility elements, so match any element whose label contains the text.
    @MainActor
    private func element(in app: XCUIApplication, labeled text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    @MainActor
    private func snap(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
