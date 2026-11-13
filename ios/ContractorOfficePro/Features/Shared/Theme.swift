import SwiftUI
import UIKit

/// Monochrome, Vercel-inspired palette. Light: near-white canvas, black accent. Dark: pure black canvas, white accent.
/// nonisolated: SwiftUI may resolve colors off the main thread.
nonisolated enum Theme {
    static let canvas = Color(light: 0xFAFAFA, dark: 0x000000)
    static let surface = Color(light: 0xFFFFFF, dark: 0x0A0A0A)
    static let border = Color(light: 0xEAEAEA, dark: 0x262626)
    static let muted = Color(light: 0x666666, dark: 0x8F8F8F)
    static let accent = Color(light: 0x0A0A0A, dark: 0xFAFAFA)
    static let onAccent = Color(light: 0xFFFFFF, dark: 0x000000)
    static let success = Color(light: 0x0E9F6E, dark: 0x3DD68C)
    static let warning = Color(light: 0xB45309, dark: 0xF5A524)
    static let danger = Color(light: 0xDC2626, dark: 0xFF6166)
    static let info = Color(light: 0x0B63F6, dark: 0x52A8FF)
    static let violet = Color(light: 0x7C3AED, dark: 0xA78BFA)
}

nonisolated extension Color {
    /// The provider closure runs wherever UIKit/SwiftUI resolves the color (not always the main actor),
    /// so it must not inherit MainActor isolation — that crashed with an isolation assertion.
    init(light: UInt32, dark: UInt32) {
        self = Color(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        })
    }
}

extension View {
    /// Canvas background behind grouped lists/forms, card rows, and the iOS 26 soft scroll edge under glass bars.
    func themedList() -> some View {
        modifier(ThemedList())
    }

    /// High-emphasis action: prominent Liquid Glass on iOS 26, a solid accent pill before.
    func primaryActionStyle() -> some View {
        modifier(PrimaryActionStyle())
    }

    /// Tight, Vercel-style heading tracking.
    func headingStyle(_ font: Font = .title2) -> some View {
        self.font(font.weight(.semibold)).tracking(-0.4)
    }
}

private struct ThemedList: ViewModifier {
    func body(content: Content) -> some View {
        let base = content
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
        if #available(iOS 26, *) {
            base.scrollEdgeEffectStyle(.soft, for: .top)
        } else {
            base
        }
    }
}

private struct PrimaryActionStyle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.buttonStyle(.glassProminent).tint(Theme.accent)
        } else {
            content.buttonStyle(.borderedProminent).tint(Theme.accent)
        }
    }
}

/// "● Label" pill with a hairline border, like a deployment status badge.
struct Pill: View {
    let title: LocalizedStringResource
    let color: Color
    var systemImage: String?

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage {
                Image(systemName: systemImage).font(.caption2.weight(.semibold)).foregroundStyle(color)
            } else {
                Circle().fill(color).frame(width: 6, height: 6)
            }
            Text(title).font(.caption.weight(.medium)).foregroundStyle(.primary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Theme.surface, in: .capsule)
        .overlay(Capsule().strokeBorder(Theme.border))
        .accessibilityElement(children: .combine)
    }
}

/// Money in a monospaced face (tabular, reads like a ledger).
struct MoneyText: View {
    let amount: Decimal
    var font: Font = .body

    var body: some View {
        Text(amount, format: .currency(code: "USD"))
            .font(font)
            .fontDesign(.monospaced)
            .monospacedDigit()
    }
}
