import SwiftUI
import UIKit

/// Warm olive palette: friendly, earthy, easy on the eyes outdoors. Light: cream canvas, deep olive accent.
/// Dark: olive-black canvas, soft sage accent. Contrast of text on canvas/surface and of onAccent on accent ≥ 4.5:1.
/// nonisolated: SwiftUI may resolve colors off the main thread.
nonisolated enum Theme {
    static let canvas = Color(light: 0xF4F1E6, dark: 0x13160F)
    static let surface = Color(light: 0xFFFDF6, dark: 0x1D2118)
    static let border = Color(light: 0xE0DBC8, dark: 0x30362A)
    static let muted = Color(light: 0x66644F, dark: 0xA6AA94)
    static let accent = Color(light: 0x556B2F, dark: 0xB7C88A)
    static let onAccent = Color(light: 0xFFFFFF, dark: 0x13160F)
    /// Soft olive wash for selected chips and highlights.
    static let accentSoft = Color(light: 0xE5EAD2, dark: 0x2A3320)
    static let success = Color(light: 0x2F7D4F, dark: 0x6FD39A)
    static let warning = Color(light: 0xA35A08, dark: 0xF2B24C)
    static let danger = Color(light: 0xC0392B, dark: 0xFF7A6E)
    static let info = Color(light: 0x2C6A8F, dark: 0x7FBFE3)
    static let violet = Color(light: 0x7A4FB5, dark: 0xBFA2EE)
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

    /// Tight heading tracking.
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

/// The accent is dark olive in light mode and light sage in dark mode, so the label must use onAccent;
/// the system default label color is white, which vanished on the light dark-mode button.
private struct PrimaryActionStyle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.buttonStyle(.glassProminent).tint(Theme.accent).foregroundStyle(Theme.onAccent)
        } else {
            content.buttonStyle(.borderedProminent).tint(Theme.accent).foregroundStyle(Theme.onAccent)
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
