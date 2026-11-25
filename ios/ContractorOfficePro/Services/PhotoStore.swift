import Foundation
import UIKit

/// Job photos on disk (Application Support/Media). Private: never on customer documents, never logged.
/// Photos are downscaled once when added (≤ 2048 px) and again, smaller, when sent to the AI (≤ 1024 px, < 2 MB).
/// @unchecked Sendable: the only mutable state is NSCache, which is thread-safe; the directory URL is immutable.
nonisolated final class PhotoStore: @unchecked Sendable {
    static let shared = PhotoStore(directory: URL.applicationSupportDirectory.appending(path: "Media", directoryHint: .isDirectory))

    let directory: URL
    private let thumbnails = NSCache<NSString, UIImage>()

    init(directory: URL) {
        self.directory = directory
    }

    /// Camera/library data → a JPEG small enough to keep. Nil if it isn't an image.
    static func prepare(_ data: Data, maxSide: CGFloat = 2048, quality: CGFloat = 0.8) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        return downscaled(image, maxSide: maxSide).jpegData(compressionQuality: quality)
    }

    static func prepare(_ image: UIImage) -> Data? {
        downscaled(image, maxSide: 2048).jpegData(compressionQuality: 0.8)
    }

    func save(_ jpeg: Data) throws -> String {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let name = "\(UUID().uuidString).jpg"
        try jpeg.write(to: url(for: name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return name
    }

    func url(for name: String) -> URL { directory.appending(path: name) }

    func image(named name: String) -> UIImage? { UIImage(contentsOfFile: url(for: name).path) }

    func thumbnail(named name: String, side: CGFloat = 240) -> UIImage? {
        let key = "\(name)#\(Int(side))" as NSString
        if let cached = thumbnails.object(forKey: key) { return cached }
        guard let image = image(named: name) else { return nil }
        let thumb = Self.downscaled(image, maxSide: side)
        thumbnails.setObject(thumb, forKey: key)
        return thumb
    }

    func remove(_ name: String) {
        try? FileManager.default.removeItem(at: url(for: name))
        thumbnails.removeAllObjects()
    }

    /// A stored photo, prepared for /v1/interpret.
    func aiImage(named name: String) -> InterpretRequestBody.ImageBody? {
        guard let data = try? Data(contentsOf: url(for: name)) else { return nil }
        return Self.aiImage(from: data)
    }

    static func aiImage(from data: Data) -> InterpretRequestBody.ImageBody? {
        guard let jpeg = prepare(data, maxSide: 1024, quality: 0.6), jpeg.count < 2_000_000 else { return nil }
        return InterpretRequestBody.ImageBody(contentType: "image/jpeg", dataBase64: jpeg.base64EncodedString())
    }

    static func downscaled(_ image: UIImage, maxSide: CGFloat) -> UIImage {
        let longest = max(image.size.width, image.size.height)
        guard longest > maxSide, longest > 0 else { return image }
        let scale = maxSide / longest
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }
}
