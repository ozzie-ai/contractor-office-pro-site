import SwiftUI
import Testing
import UIKit
@testable import ContractorOfficePro

@Suite("Theme colors")
struct ThemeTests {
    /// Regression: dynamic colors are resolved off the main thread by SwiftUI's renderer.
    @Test func dynamicColorsResolveOffTheMainThread() async {
        let resolved = await Task.detached {
            let color = UIColor(Theme.canvas)
            let dark = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))
            let light = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
            var dw: CGFloat = 0, lw: CGFloat = 0
            dark.getWhite(&dw, alpha: nil)
            light.getWhite(&lw, alpha: nil)
            return (dw, lw)
        }.value
        #expect(resolved.0 < 0.12, "dark canvas is olive-black")
        #expect(resolved.1 > 0.9, "light canvas is cream")
    }
}
