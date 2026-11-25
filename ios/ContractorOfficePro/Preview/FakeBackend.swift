#if DEBUG
import Foundation
import Supabase

/// In-memory stand-in for Supabase: accounts, the org RPC, and sync with the same last-write-wins
/// guard as the real trigger. Used by previews and unit tests so neither touches the network.
actor FakeBackend: AccountClient, SyncTransport, EstimateService {
    private(set) var tables: [String: [UUID: Row]] = [:]
    private var currentUser: UUID?
    private var offline: Bool
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)

    /// Simulated AI latency for demo mode/previews (tests keep zero).
    private let aiDelay: Duration

    init(signedInUser: UUID? = nil, offline: Bool = false, aiDelay: Duration = .zero) {
        currentUser = signedInUser
        self.offline = offline
        self.aiDelay = aiDelay
    }

    func setOffline(_ value: Bool) { offline = value }
    func row(in table: String, id: UUID) -> Row? { tables[table]?[id] }
    func count(in table: String) -> Int { tables[table]?.count ?? 0 }

    // MARK: AccountClient

    func currentUserID() async -> UUID? { currentUser }

    func signInAnonymously() async throws -> UUID {
        try checkOnline()
        let user = UUID()
        currentUser = user
        return user
    }

    func sendCode(to email: String) async throws { try checkOnline() }

    func verify(email: String, code: String) async throws -> UUID {
        try checkOnline()
        guard code == "123456" else { throw URLError(.userAuthenticationRequired) }
        return try await signInAnonymously()
    }

    func createOrganization(_ request: NewOrganization) async throws -> UUID {
        try checkOnline()
        guard let user = currentUser else { throw URLError(.userAuthenticationRequired) }
        if let existing = memberRow(for: user)?.uuid("org_id") { return existing }
        let now = J.t(clock)
        write(["id": J.u(request.orgID), "org_id": J.u(request.orgID), "name": J.s(request.name),
               "default_language": J.s(request.language.rawValue), "tax_rate": .integer(0),
               "created_at": now, "updated_at": now, "deleted_at": .null], into: "organizations")
        write(["id": J.u(request.memberID), "org_id": J.u(request.orgID), "user_id": J.u(user),
               "display_name": J.s(request.ownerName), "role": J.s("owner"),
               "preferred_language": J.s(request.language.rawValue),
               "created_at": now, "updated_at": now, "deleted_at": .null], into: "members")
        return request.orgID
    }

    func membership(for userID: UUID) async throws -> Membership? {
        try checkOnline()
        guard let member = memberRow(for: userID), let orgID = member.uuid("org_id"),
              let org = tables["organizations"]?[orgID] else { return nil }
        return Membership(organization: org, member: member)
    }

    func signOut() async { currentUser = nil }

    // MARK: SyncTransport

    func upsert(_ rows: [Row], into table: String) async throws {
        try checkOnline()
        for row in rows { write(row, into: table) }
    }

    func update(_ row: Row, id: UUID, in table: String) async throws {
        try checkOnline()
        guard tables[table]?[id] != nil else { return }
        var row = row
        row["id"] = J.u(id)
        write(row, into: table)
    }

    func changes(in table: String, orgID: UUID, since: Date, offset: Int, limit: Int) async throws -> [Row] {
        try checkOnline()
        let rows = (tables[table] ?? [:]).values
            .filter { $0.uuid("org_id") == orgID && ($0.date("server_updated_at") ?? .distantPast) > since }
            .sorted { ($0.string("server_updated_at") ?? "", $0.string("id") ?? "")
                    < ($1.string("server_updated_at") ?? "", $1.string("id") ?? "") }
        return Array(rows.dropFirst(offset).prefix(limit))
    }

    // MARK: EstimateService (canned, deterministic: modeled on the team's MIXED-002 scenario)

    private(set) var interpretCalls = 0
    var contractorPrices: [String: Decimal] = [:]

    func setContractorPrice(_ price: Decimal, for code: String) { contractorPrices[code] = price }

    func interpret(_ request: InterpretRequestBody) async throws -> InterpretResponseDTO {
        if offline { throw BackendError.offline }
        if aiDelay > .zero { try await Task.sleep(for: aiDelay) }
        interpretCalls += 1
        func task(_ code: String?, _ en: String, _ es: String, _ qty: Double?, _ unit: String?) -> WorkTaskDTO {
            WorkTaskDTO(taskCode: code, category: "electrical", descriptionEn: en, descriptionEs: es, quantity: qty,
                        unit: unit, specifications: [], status: "included_now", evidence: "stated")
        }
        return InterpretResponseDTO(interpretation: InterpretationDTO(
            trade: "electrical",
            projectSummaryEn: "Panel upgrade from 100A to 200A with an EV charger circuit.",
            projectSummaryEs: "Cambio de panel de 100A a 200A con circuito para cargador eléctrico.",
            tasks: [
                task("ELEC.PANEL.UPGRADE", "Replace the existing 100A panel with a new 200A panel", "Reemplazar el panel de 100A por uno nuevo de 200A", 1, "job"),
                task("ELEC.CIRCUIT.TRANSFER", "Transfer 20 existing circuits to the new panel", "Transferir 20 circuitos existentes al panel nuevo", 20, "each"),
                task("ELEC.CIRCUIT.NEW", "New 40A double-pole circuit for the EV charger", "Circuito nuevo bipolar de 40A para el cargador", 1, "each"),
                task("ELEC.WIRE.RUN", "Wire run to the EV charger location", "Tendido de cable hasta el cargador", 100, "linear ft"),
                task("ELEC.BREAKER.ONLY", "100A double-pole breaker reserved for a future subpanel", "Breaker bipolar de 100A reservado para un subpanel futuro", 1, "each"),
            ],
            excludedWork: ["Subpanel and feeder installation"], futureWork: ["Feed a future subpanel from the reserved 100A breaker"],
            unknownDetails: ["Is the EV charger supplied by the customer?", "Where is the panel located?"],
            confidenceNotes: []))
    }

    func price(_ request: PriceRequestBody) async throws -> PriceResponseDTO {
        if offline { throw BackendError.offline }
        let references: [String: (Decimal, String)] = [
            "ELEC.PANEL.UPGRADE": (2100, "200A panel"), "ELEC.CIRCUIT.TRANSFER": (35, "Per circuit"),
            "ELEC.BREAKER.ONLY": (220, "100A two-pole breaker")]
        var subtotal: Decimal = 0
        let lines = request.tasks.map { task -> PricedLineDTO in
            let code = task.taskCode ?? ""
            let qty = task.quantity.map { Decimal($0) }
            let (price, source, preliminary, name, applies): (Decimal?, String, Bool, String?, String?) =
                if let own = contractorPrices[code] { (own, "contractor", false, "Your price book", nil) }
                else if let ref = references[code] { (ref.0, "reference", true, "Pilot LA planning allowance (illustrative)", ref.1) }
                else { (nil, "none", true, nil, nil) }
            let total = price.flatMap { p in qty.map { EstimateCalculator.lineTotal(qty: $0, unitPrice: p) } }
            subtotal += total ?? 0
            return PricedLineDTO(taskCode: task.taskCode, descriptionEn: task.descriptionEn, descriptionEs: task.descriptionEs,
                                 quantity: qty.map(DecimalValue.init), unit: task.unit, unitPrice: price.map(DecimalValue.init),
                                 lineTotal: total.map(DecimalValue.init), priceSource: source, preliminary: preliminary,
                                 sourceName: name, appliesTo: applies, note: nil,
                                 needs: (price == nil ? ["price"] : []) + (qty == nil ? ["quantity"] : []))
        }
        return PriceResponseDTO(regionCode: "US-CA-LA", lines: lines, subtotal: DecimalValue(subtotal),
                                pricedLines: lines.filter { $0.lineTotal != nil }.count,
                                unpricedLines: lines.filter { $0.lineTotal == nil }.count,
                                preliminary: true, disclaimer: "Preliminary estimate.")
    }

    func materials(_ request: MaterialsRequestBody) async throws -> MaterialsResponseDTO {
        if offline { throw BackendError.offline }
        if aiDelay > .zero { try await Task.sleep(for: aiDelay) }
        func item(_ en: String, _ es: String, _ category: String, _ qty: Double?, _ unit: String, _ specs: [String],
                  _ query: String, _ evidence: String, _ note: String = "") -> MaterialDTO {
            MaterialDTO(nameEn: en, nameEs: es, category: category, quantity: qty, unit: unit, specifications: specs,
                        forRefs: [], searchQuery: query, evidence: evidence, noteEn: note)
        }
        return MaterialsResponseDTO(materialsList: MaterialsListDTO(materials: [
            item("200A main breaker load center", "Centro de carga 200A", "electrical", 1, "each", ["200A", "40 space"],
                 "200 amp main breaker load center", "stated"),
            item("40A double-pole breaker", "Breaker bipolar 40A", "electrical", 1, "each", ["40A", "2-pole"],
                 "40 amp double pole breaker", "stated"),
            item("8 AWG THHN copper wire", "Cable THHN 8 AWG", "electrical", 170, "ft", ["8 AWG", "copper"],
                 "8 AWG THHN copper wire", "inferred", "2 conductors × 85 ft"),
            item("3/4 in. EMT conduit", "Tubo EMT 3/4\"", "conduit_fittings", 90, "ft", ["3/4 in."],
                 "3/4 inch EMT conduit 10 ft", "inferred", "Size assumed; confirm"),
        ], assumptions: ["Copper conductors"], questions: ["What size conduit?"]))
    }

    func refine(_ request: RefineRequestBody) async throws -> RefineResponseDTO {
        if offline { throw BackendError.offline }
        if aiDelay > .zero { try await Task.sleep(for: aiDelay) }
        let wire = request.currentLines.first { $0.taskCode == "ELEC.WIRE.RUN" }
        return RefineResponseDTO(changes: RefinementDTO(
            add: [WorkTaskDTO(taskCode: "ELEC.EV.CHARGER.INSTALL", category: "electrical",
                              descriptionEn: "Install the customer-supplied EV charger",
                              descriptionEs: "Instalar el cargador suministrado por el cliente", quantity: 1, unit: "each",
                              specifications: ["customer-supplied"], status: "included_now", evidence: "stated")],
            update: wire.map { [LineUpdateDTO(ref: $0.ref, quantity: 85, unit: nil, reasonEn: "Answer: the run is 85 ft")] } ?? [],
            exclusions: ["EV charger hardware supplied by the customer"],
            remainingQuestions: []))
    }

    // MARK: Private

    private func checkOnline() throws {
        if offline { throw URLError(.notConnectedToInternet) }
    }

    private func memberRow(for user: UUID) -> Row? {
        tables["members"]?.values.first { $0.uuid("user_id") == user && $0["deleted_at"] == .null }
    }

    /// Mirrors the server: drop older writes (LWW), merge columns, stamp server_updated_at.
    private func write(_ incoming: Row, into table: String) {
        guard let id = incoming.uuid("id") else { return }
        let existing = tables[table]?[id]
        if let old = existing?.date("updated_at"), let new = incoming.date("updated_at"), new < old { return }
        var merged = existing ?? [:]
        for (key, value) in incoming { merged[key] = value }
        clock = clock.addingTimeInterval(0.001)
        merged["server_updated_at"] = J.t(clock)
        tables[table, default: [:]][id] = merged
    }
}
#endif
