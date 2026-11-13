import SwiftUI

/// Cold-launch wordmark: fades in large and blurred with wide tracking, then shrinks and settles.
/// Reduce Motion: a still wordmark that simply fades.
struct SplashView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Flipped on appear to start the keyframes (a non-repeating animator otherwise sits on its first frame).
    @State private var started = false

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            if reduceMotion {
                Wordmark(values: .settled)
            } else {
                KeyframeAnimator(initialValue: SplashValues.start, trigger: started) { values in
                    Wordmark(values: values)
                } keyframes: { _ in
                    KeyframeTrack(\.opacity) { LinearKeyframe(1, duration: 0.35) }
                    KeyframeTrack(\.blur) { CubicKeyframe(0, duration: 0.5) }
                    KeyframeTrack(\.scale) {
                        CubicKeyframe(1.3, duration: 0.3)
                        SpringKeyframe(1.0, duration: 0.75, spring: .smooth)
                    }
                    KeyframeTrack(\.tracking) {
                        CubicKeyframe(9, duration: 0.25)
                        SpringKeyframe(-0.6, duration: 0.8, spring: .smooth)
                    }
                    KeyframeTrack(\.markScale) {
                        LinearKeyframe(0.6, duration: 0.15)
                        SpringKeyframe(1.0, duration: 0.6, spring: .bouncy)
                    }
                    KeyframeTrack(\.taglineOpacity) {
                        LinearKeyframe(0, duration: 0.75)
                        LinearKeyframe(1, duration: 0.35)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
        .onAppear { started = true }
    }
}

struct SplashValues {
    var opacity = 0.0
    var blur = 10.0
    var scale = 1.3
    var tracking = 9.0
    var markScale = 0.6
    var taglineOpacity = 0.0

    static let start = SplashValues()
    static let settled = SplashValues(opacity: 1, blur: 0, scale: 1, tracking: -0.6, markScale: 1, taglineOpacity: 1)
}

private struct Wordmark: View {
    let values: SplashValues

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "hammer.fill")
                .font(.system(size: 30, weight: .semibold))
                .scaleEffect(values.markScale)
                .accessibilityHidden(true)
            Text(verbatim: "Contractor Office Pro")
                .font(.system(size: 30, weight: .semibold))
                .tracking(values.tracking)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text(.splashTagline)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .opacity(values.taglineOpacity)
        }
        .foregroundStyle(Theme.accent)
        .padding(.horizontal, 24)
        .scaleEffect(values.scale)
        .blur(radius: values.blur)
        .opacity(values.opacity)
    }
}

#if DEBUG
#Preview { SplashView() }
#endif
