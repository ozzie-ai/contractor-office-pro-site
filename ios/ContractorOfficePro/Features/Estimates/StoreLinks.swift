import Foundation

/// Store search pages for a material. Links only: no scraping, the contractor compares prices in the store's own site/app.
enum StoreLinks {
    enum Store: String, CaseIterable, Identifiable {
        case homeDepot, lowes, amazon, googleShopping
        var id: Self { self }

        var name: String {
            switch self {
            case .homeDepot: "Home Depot"
            case .lowes: "Lowe's"
            case .amazon: "Amazon"
            case .googleShopping: "Google Shopping"
            }
        }

        var systemImage: String {
            switch self {
            case .homeDepot, .lowes: "building.2"
            case .amazon: "shippingbox"
            case .googleShopping: "magnifyingglass"
            }
        }
    }

    static func url(for store: Store, query: String) -> URL? {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return nil }
        var components: URLComponents
        switch store {
        case .homeDepot:
            // Home Depot puts the query in the path.
            guard let path = q.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) else { return nil }
            return URL(string: "https://www.homedepot.com/s/\(path)")
        case .lowes:
            components = URLComponents(string: "https://www.lowes.com/search")!
            components.queryItems = [URLQueryItem(name: "searchTerm", value: q)]
        case .amazon:
            components = URLComponents(string: "https://www.amazon.com/s")!
            components.queryItems = [URLQueryItem(name: "k", value: q)]
        case .googleShopping:
            components = URLComponents(string: "https://www.google.com/search")!
            components.queryItems = [URLQueryItem(name: "tbm", value: "shop"), URLQueryItem(name: "q", value: q)]
        }
        return components.url
    }
}
