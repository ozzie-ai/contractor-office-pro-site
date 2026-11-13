import SwiftUI

/// Siri-style flowing edge glow shown while the AI is drafting. Static gradient with Reduce Motion.
struct AIGlow: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let colors = [Theme.violet, Theme.info, Color.cyan, Color.pink, Color.orange, Theme.violet]

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let degrees = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3) * 120
            let gradient = AngularGradient(colors: colors, center: .center, angle: .degrees(degrees))
            ZStack {
                RoundedRectangle(cornerRadius: 36, style: .continuous).strokeBorder(gradient, lineWidth: 10).blur(radius: 14)
                RoundedRectangle(cornerRadius: 36, style: .continuous).strokeBorder(gradient, lineWidth: 2.5)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
