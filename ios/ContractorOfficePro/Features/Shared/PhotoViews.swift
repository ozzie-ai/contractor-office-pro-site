import PhotosUI
import SwiftUI
import UIKit

/// A photo shown in a strip: either saved on a job (Media id) or still pending in the guided flow.
struct PhotoThumb: Identifiable {
    let id: UUID
    let image: UIImage
}

/// Two big buttons: Take photo (camera) and Choose photos (library). Hands back JPEG data, already downscaled.
struct PhotoAddButtons: View {
    /// How many more photos may be added (the AI looks at up to 6).
    var remaining = 6
    let onAdd: ([Data]) -> Void
    @State private var picked: [PhotosPickerItem] = []
    @State private var showingCamera = false

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        HStack(spacing: 12) {
            if cameraAvailable {
                Button { showingCamera = true } label: {
                    PhotoButtonLabel(title: .photosTake, systemImage: "camera.fill")
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("photo-take")
            }
            PhotosPicker(selection: $picked, maxSelectionCount: max(1, remaining), matching: .images) {
                PhotoButtonLabel(title: .photosChoose, systemImage: "photo.on.rectangle")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("photo-choose")
        }
        .disabled(remaining <= 0)
        .opacity(remaining <= 0 ? 0.5 : 1)
        .onChange(of: picked) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var added: [Data] = []
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let jpeg = PhotoStore.prepare(data) {
                        added.append(jpeg)
                    }
                }
                picked = []
                if !added.isEmpty { onAdd(added) }
            }
        }
        .fullScreenCover(isPresented: $showingCamera) {
            CameraPicker { image in
                if let jpeg = PhotoStore.prepare(image) { onAdd([jpeg]) }
            }
            .ignoresSafeArea()
        }
    }
}

/// A struct (not a method) because PhotosPicker builds its label outside the main actor.
private struct PhotoButtonLabel: View {
    let title: LocalizedStringResource
    let systemImage: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: systemImage).font(.title2.weight(.semibold))
            Text(title).font(.headline).lineLimit(1).minimumScaleFactor(0.7)
        }
        .foregroundStyle(Theme.accent)
        .frame(maxWidth: .infinity, minHeight: 76)
        .background(Theme.accentSoft, in: .rect(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.border))
        .contentShape(.rect(cornerRadius: 16))
    }
}

/// Horizontal row of thumbnails. Tap to see full screen; the × removes it.
struct PhotoStrip: View {
    let photos: [PhotoThumb]
    let onRemove: (UUID) -> Void
    @State private var viewing: PhotoThumb?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(photos) { photo in
                    Button { viewing = photo } label: {
                        Image(uiImage: photo.image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 96, height: 96)
                            .clipShape(.rect(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.border))
                    }
                    .buttonStyle(.plain)
                    .overlay(alignment: .topTrailing) {
                        Button { withAnimation(.snappy) { onRemove(photo.id) } } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title2)
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(.white, .black.opacity(0.6))
                        }
                        .buttonStyle(.plain)
                        .padding(4)
                        .accessibilityLabel(Text(.photosRemove))
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.vertical, 2)
        }
        .accessibilityIdentifier("photo-strip")
        .fullScreenCover(item: $viewing) { photo in
            PhotoViewer(image: photo.image)
        }
    }
}

private struct PhotoViewer: View {
    @Environment(\.dismiss) private var dismiss
    let image: UIImage

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: .infinity)
            Button { dismiss() } label: {
                Text(.commonDone).font(.headline).padding(.horizontal, 18).padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.white.opacity(0.2))
            .padding()
        }
    }
}

/// UIKit camera (SwiftUI has no camera view). Only shown where a camera exists.
struct CameraPicker: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onCapture(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// A job's saved photos as an editable strip plus add buttons. Used on the job screen.
struct JobPhotosSection: View {
    @Environment(Workspace.self) private var workspace
    let job: Job
    let photos: [Media]
    @State private var saveFailed = false

    private var thumbs: [PhotoThumb] {
        photos.compactMap { media in
            media.localFileName.flatMap { PhotoStore.shared.thumbnail(named: $0) }.map { PhotoThumb(id: media.id, image: $0) }
        }
    }

    var body: some View {
        Section {
            if !thumbs.isEmpty {
                PhotoStrip(photos: thumbs) { id in
                    if let media = photos.first(where: { $0.id == id }) {
                        do { try workspace.delete(media) } catch { saveFailed = true }
                    }
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
            }
            PhotoAddButtons(remaining: 30 - photos.count) { added in
                do { for jpeg in added { try workspace.addPhoto(jpeg, to: job) } } catch { saveFailed = true }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        } header: {
            Text(.photosHeader)
        } footer: {
            Label { Text(.photosHint) } icon: { Image(systemName: "lock.fill") }
        }
        .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
    }
}
