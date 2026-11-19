import Foundation
import SwiftUI
import PhotosUI
import UIKit

/// A focused capture → review → price → approve workflow.
/// The backend is the authority for calculation; the user approves every quote.
struct EstimateBuilderView: View {
    let job: Job

    @Environment(\.dismiss) private var dismiss
    @Environment(Workspace.self) private var workspace
    @StateObject private var voice = JobVoiceRecorder()

    @State private var notes = ""
    @State private var notesBeforeRecording = ""
    @State private var dictationLanguage = "en"
    @State private var customerLanguage = "en"
    @State private var items: [EditableEstimateTask] = []
    @State private var book: [EstimatingAPIClient.PriceBookEntry] = []
    @State private var unknowns: [String] = []
    @State private var resolvedUnknowns: Set<String> = []
    @State private var exclusions: [String] = []
    @State private var overhead = "0"
    @State private var profit = "0"
    @State private var tripCost = "0"
    @State private var calculation: EstimatingAPIClient.PriceResponse?
    @State private var approved = false
    @State private var pdfURL: URL?
    @State private var busy = false
    @State private var message: String?
    @State private var photoSelection: [PhotosPickerItem] = []
    @State private var photoFiles: [URL] = []
    @State private var photoMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("estimate.speech_language", selection: $dictationLanguage) {
                        Text("English").tag("en")
                        Text("Español").tag("es")
                    }
                    .pickerStyle(.segmented)
                    TextEditor(text: $notes)
                        .frame(minHeight: 110)
                        .disabled(voice.isRecording || busy)
                        .accessibilityLabel(Text("estimate.voice_notes"))
                    Button {
                        if voice.isRecording {
                            voice.stop()
                        } else {
                            // Each speech session is incremental. Never overwrite
                            // earlier notes when a recognizer publishes partial text.
                            notesBeforeRecording = notes
                            Task { await voice.start(language: dictationLanguage) }
                        }
                    } label: {
                        if voice.isRecording {
                            Label("estimate.stop_record", systemImage: "stop.circle.fill")
                        } else {
                            Label("estimate.record", systemImage: "mic")
                        }
                    }
                    if let recorderMessage = voice.errorMessage {
                        Text(recorderMessage).font(.caption).foregroundStyle(.secondary)
                    }
                    Button {
                        Task { await analyze() }
                    } label: {
                        Label("estimate.analyze", systemImage: "sparkles")
                    }
                    .disabled(busy || voice.isRecording || notes.trimmingCharacters(in: .whitespacesAndNewlines).count < 10)
                    Button(role: .destructive) {
                        voice.stop()
                        notes = ""
                        PrivateJobDraftStore.clear(jobID: job.id)
                    } label: {
                        Text("estimate.clear_notes")
                    }
                    .disabled(notes.trimmingCharacters(in: .whitespacesAndNewlines).count < 10 || busy)
                } header: {
                    Text("estimate.voice_notes")
                } footer: {
                    Text("estimate.private_notes_notice")
                }

                Section {
                    PhotosPicker(selection: $photoSelection, maxSelectionCount: 8,
                                 matching: .images) {
                        Label(dictationLanguage == "es" ? "Agregar fotos del trabajo" : "Add jobsite photos",
                              systemImage: "photo.on.rectangle.angled")
                    }
                    .disabled(busy || photoFiles.count >= PrivateJobPhotoStore.maximumPhotos)
                    if photoFiles.isEmpty {
                        Text(dictationLanguage == "es"
                             ? "Las fotos permanecen privadas en este iPhone; todavía no se analizan con IA."
                             : "Photos stay private on this iPhone; AI photo analysis is not enabled yet.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(photoFiles, id: \.self) { url in
                        HStack {
                            if let data = try? Data(contentsOf: url),
                               let image = UIImage(data: data) {
                                Image(uiImage: image).resizable().scaledToFill()
                                    .frame(width: 64, height: 64).clipped().clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            Text(url.lastPathComponent.prefix(8) + "…")
                                .font(.caption)
                            Spacer()
                            Button(role: .destructive) {
                                do {
                                    try PrivateJobPhotoStore.remove(url, jobID: job.id)
                                    photoFiles = PrivateJobPhotoStore.files(jobID: job.id)
                                } catch {
                                    photoMessage = "Could not remove photo."
                                }
                            } label: { Image(systemName: "trash") }
                        }
                    }
                    if let photoMessage { Text(photoMessage).font(.caption).foregroundStyle(.orange) }
                } header: {
                    Text(dictationLanguage == "es" ? "Fotos del trabajo" : "Jobsite photos")
                } footer: {
                    Text(dictationLanguage == "es"
                         ? "No se envían al servidor ni se incluyen en el presupuesto del cliente."
                         : "Not uploaded to a server or included in the customer's PDF.")
                }

                if !items.isEmpty {
                    Section {
                        Picker("estimate.customer_language", selection: $customerLanguage) {
                            Text("English").tag("en")
                            Text("Español").tag("es")
                        }
                        .pickerStyle(.segmented)
                    }
                    ForEach($items) { $item in
                        Section {
                            TextField("estimate.description_en", text: $item.descriptionEn, axis: .vertical)
                            TextField("estimate.description_es", text: $item.descriptionEs, axis: .vertical)
                            TextField("estimate.location_optional", text: $item.scopeID)
                            HStack {
                                TextField("estimate.quantity", text: $item.quantity)
                                    .keyboardType(.decimalPad)
                                Picker("estimate.unit", selection: $item.unit) {
                                    Text("estimate.select_unit").tag("")
                                    ForEach(Self.units, id: \.self) { unit in
                                        Text(unit).tag(unit)
                                    }
                                }
                            }

                            let matchingRates = book.filter {
                                Self.unit($0.unit) == item.unit && UUID(uuidString: $0.id) != nil
                            }
                            if !matchingRates.isEmpty {
                                Picker("estimate.saved_rate", selection: $item.selectedRateID) {
                                    Text("estimate.manual_cost").tag("")
                                    ForEach(matchingRates, id: \.id) { rate in
                                        Text("\(rate.nameEn) — $\(rate.unitPrice)").tag(rate.id)
                                    }
                                }
                            }
                            if item.selectedRateID.isEmpty {
                                TextField("estimate.hours_per_unit", text: $item.laborHours)
                                    .keyboardType(.decimalPad)
                                TextField("estimate.loaded_rate", text: $item.laborRate)
                                    .keyboardType(.decimalPad)
                                TextField("estimate.material_per_unit", text: $item.materialCost)
                                    .keyboardType(.decimalPad)
                                Picker("estimate.price_source", selection: $item.priceSource) {
                                    Text("estimate.contractor_rate").tag("contractor_entered")
                                    Text("estimate.allowance").tag("planning_allowance")
                                }
                            }
                            if item.requiresConfirmation {
                                Toggle("estimate.confirm_scope", isOn: $item.confirmed)
                            }
                        } header: {
                            Text(item.descriptionEn.isEmpty ? item.taskCode : item.descriptionEn)
                        } footer: {
                            Text("estimate.private_costs")
                        }
                    }

                    if !unknowns.isEmpty {
                        Section {
                            ForEach(unknowns, id: \.self) { missing in
                                Toggle(isOn: Binding(
                                    get: { resolvedUnknowns.contains(missing) },
                                    set: { state in
                                        if state { resolvedUnknowns.insert(missing) }
                                        else { resolvedUnknowns.remove(missing) }
                                        invalidatePrice()
                                    }
                                )) {
                                    Text(missing)
                                }
                            }
                        } header: {
                            Text("estimate.open_questions")
                        } footer: {
                            Text("estimate.confirm_questions")
                        }
                    }
                    if !exclusions.isEmpty {
                        Section {
                            ForEach(exclusions, id: \.self) { exclusion in Text(exclusion) }
                        } header: {
                            Text("estimate.excluded")
                        }
                    }

                    Section {
                        TextField("estimate.overhead", text: $overhead).keyboardType(.decimalPad)
                        TextField("estimate.profit", text: $profit).keyboardType(.decimalPad)
                        TextField("estimate.trip", text: $tripCost).keyboardType(.decimalPad)
                        Button {
                            Task { await calculate() }
                        } label: {
                            Label("estimate.calculate", systemImage: "equal.square")
                        }
                        .disabled(busy || items.contains { !$0.confirmed || $0.unit.isEmpty ||
                            $0.descriptionEn.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 }
                            || !Set(unknowns).isSubset(of: resolvedUnknowns))
                    } header: {
                        Text("estimate.private_pricing")
                    }
                }

                if let calculated = calculation {
                    Section {
                        ForEach(calculated.lines.indices, id: \.self) { index in
                            let item = calculated.lines[index]
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.descriptionEn)
                                if let total = item.sellingTotal {
                                    Text("$\(total)").font(.caption).foregroundStyle(.secondary)
                                }
                                ForEach(item.missing, id: \.self) { missing in
                                    Text(missing).foregroundStyle(.red).font(.caption)
                                }
                            }
                        }
                        ForEach(calculated.missing, id: \.self) { missing in
                            Text(missing).font(.caption).foregroundStyle(.red)
                        }
                        if let total = calculated.sellingTotal,
                           calculated.status == "ready_for_contractor_review" {
                            Text("\(String(localized: "estimate.total")) $\(total)")
                                .font(.headline)
                            Text("estimate.preliminary").font(.caption).foregroundStyle(.secondary)
                            Toggle("estimate.approve", isOn: $approved)
                            Button {
                                Task { await saveApprovedRates() }
                            } label: {
                                Label("estimate.save_rates", systemImage: "square.and.arrow.down")
                            }
                            .disabled(busy || !items.contains {
                                $0.selectedRateID.isEmpty && $0.priceSource == "contractor_entered"
                            })
                            if let pdfURL {
                                ShareLink(item: pdfURL) {
                                    Label("estimate.share_pdf", systemImage: "square.and.arrow.up")
                                }
                            } else {
                                Button {
                                    do {
                                        let generated = try CustomerEstimatePDF.create(
                                            from: calculated, approved: approved
                                        )
                                        // Save to this job before presenting a share action.
                                        // Neither private notes nor internal costs are persisted as customer lines.
                                        try workspace.saveApprovedEstimate(
                                            calculated, for: job, approved: approved
                                        )
                                        pdfURL = generated
                                    } catch {
                                        message = String(localized: "estimate.pdf_failed")
                                    }
                                } label: {
                                    Label("estimate.make_pdf", systemImage: "doc.richtext")
                                }
                                .disabled(!approved)
                            }
                        } else {
                            Text("estimate.incomplete").foregroundStyle(.orange)
                        }
                    } header: {
                        Text("estimate.review")
                    }
                }

                if busy {
                    Section { ProgressView() }
                }
                if let message {
                    Section { Text(message).foregroundStyle(.orange) }
                }
            }
            .navigationTitle(Text("estimate.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("estimate.close") { voice.stop(); dismiss() }
                }
            }
            .onChange(of: photoSelection) { _, selected in
                Task { await importPhotos(selected) }
            }
            .onChange(of: voice.transcript) { _, text in
                // Partial recognition replaces ONLY this session's segment,
                // never the earlier dictated/typed work.
                if !text.isEmpty { notes = SpeechNoteComposer.compose(existing: notesBeforeRecording, segment: text) }
            }
            .onChange(of: notes) { _, newText in
                // Keep voice notes available on this device even without a server.
                PrivateJobDraftStore.save(newText, jobID: job.id)
                // Private dictation changed: do not share stale interpreted scope.
                items = []
                unknowns = []
                exclusions = []
                invalidatePrice()
            }
            .onChange(of: items) { _, _ in invalidatePrice() }
            .onChange(of: overhead) { _, _ in invalidatePrice() }
            .onChange(of: profit) { _, _ in invalidatePrice() }
            .onChange(of: tripCost) { _, _ in invalidatePrice() }
            .onChange(of: customerLanguage) { _, _ in invalidatePrice() }
            .task {
                notes = PrivateJobDraftStore.load(jobID: job.id)
                photoFiles = PrivateJobPhotoStore.files(jobID: job.id)
                await refreshRates()
            }
            .onDisappear { voice.stop() }
        }
    }

    private static let units = ["each", "job", "sq ft", "linear ft", "cu yd", "hr", "day"]

    private static func unit(_ raw: String?) -> String {
        switch (raw ?? "").lowercased() {
        case "ea", "each", "unit", "outlet", "receptacle": return "each"
        case "sf", "sqft", "sq ft": return "sq ft"
        case "ft", "lf", "linear ft", "feet": return "linear ft"
        case "cy", "cu yd": return "cu yd"
        case "hr", "hour", "hours": return "hr"
        case "day", "days": return "day"
        case "job": return "job"
        default: return ""
        }
    }

    private func api() throws -> EstimatingAPIClient {
        #if DEBUG
        // Sample-data mode must never contact a real customer account.
        if ProcessInfo.processInfo.arguments.contains("-demo") {
            throw BuilderFailure.apiNotConfigured
        }
        #endif
        guard let baseURL = AppConfig.estimatingAPIURL, let supabase = Backend.client else {
            throw BuilderFailure.apiNotConfigured
        }
        // Capture the main-actor initialized client before entering Sendable callback.
        return EstimatingAPIClient(baseURL: baseURL, accessToken: {
            try await supabase.auth.session.accessToken
        })
    }

    private func refreshRates() async {
        guard let api = try? api() else { return }
        if let saved = try? await api.pricebook() { book = saved }
    }

    private func importPhotos(_ selected: [PhotosPickerItem]) async {
        guard !selected.isEmpty else { return }
        photoMessage = nil
        for pickerItem in selected {
            guard photoFiles.count < PrivateJobPhotoStore.maximumPhotos else {
                photoMessage = "Photo limit reached (8)."
                break
            }
            do {
                guard let data = try await pickerItem.loadTransferable(type: Data.self),
                      UIImage(data: data) != nil else {
                    photoMessage = "A selected photo could not be read."
                    continue
                }
                try PrivateJobPhotoStore.save(data, jobID: job.id)
                photoFiles = PrivateJobPhotoStore.files(jobID: job.id)
            } catch {
                photoMessage = "A photo could not be saved. Only images under 10 MB are supported."
            }
        }
        photoSelection = []
    }

    private func analyze() async {
        voice.stop()
        busy = true
        message = nil
        defer { busy = false }
        do {
            let submittedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
            guard submittedNotes.count >= 10 else {
                message = "Describe the work before analyzing."
                return
            }
            let response = try await api().interpret(submittedNotes)
            // Never apply stale network results if the underlying private draft changed.
            guard notes.trimmingCharacters(in: .whitespacesAndNewlines) == submittedNotes else {
                message = "Job notes changed. Analyze the current description again."
                return
            }
            guard response.version == 2, response.pricingStatus == "not_priced",
                  !response.interpretation.tasks.isEmpty,
                  response.interpretation.tasks.count <= 100,
                  response.interpretation.tasks.allSatisfy({ !$0.descriptionEn.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
                message = "Scope requires review; no work items were changed."
                return
            }
            items = response.interpretation.tasks.enumerated().map {
                EditableEstimateTask($0.element, index: $0.offset, normalizeUnit: Self.unit)
            }
            unknowns = response.interpretation.unknownDetails
            resolvedUnknowns = []
            exclusions = response.interpretation.excludedWork + response.interpretation.futureWork
            invalidatePrice()
            if items.isEmpty { message = String(localized: "estimate.no_tasks") }
        } catch {
            message = String(localized: "estimate.service_error")
        }
    }

    private func calculate() async {
        busy = true
        message = nil
        approved = false
        pdfURL = nil
        defer { busy = false }
        do {
            let requests = items.map { item -> EstimatingAPIClient.WorkItem in
                let selected = UUID(uuidString: item.selectedRateID)
                let manual = selected == nil && !item.laborHours.isEmpty &&
                    !item.laborRate.isEmpty && !item.materialCost.isEmpty
                let cost = manual ? EstimatingAPIClient.DirectCost(
                    laborHoursPerUnit: Self.decimal(item.laborHours) ?? -1,
                    loadedLaborRate: Self.decimal(item.laborRate) ?? -1,
                    materialCostPerUnit: Self.decimal(item.materialCost) ?? -1,
                    source: item.priceSource
                ) : nil
                return EstimatingAPIClient.WorkItem(
                    taskCode: item.taskCode,
                    scopeId: item.scopeID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ? nil : item.scopeID,
                    descriptionEn: item.descriptionEn,
                    descriptionEs: item.descriptionEs.isEmpty ? nil : item.descriptionEs,
                    quantity: Self.decimal(item.quantity),
                    unit: item.unit, directCost: cost,
                    unitSellingPriceOverride: nil, priceBookItemId: selected, excluded: false
                )
            }
            let trip = Self.decimal(tripCost) ?? -1
            let request = EstimatingAPIClient.PriceRequest(
                items: requests,
                overheadPct: Self.decimal(overhead) ?? -1,
                profitPct: Self.decimal(profit) ?? -1,
                mobilizationDirectCost: trip,
                mobilizationSource: trip > 0 ? "contractor_entered" : nil,
                regionCode: nil, customerLanguage: customerLanguage
            )
            calculation = try await api().price(request)
        } catch {
            message = String(localized: "estimate.price_error")
        }
    }

    private func saveApprovedRates() async {
        guard approved, let calculation,
              calculation.status == "ready_for_contractor_review",
              calculation.missing.isEmpty, calculation.lines.count == items.count else {
            return
        }
        busy = true
        message = nil
        defer { busy = false }
        do {
            let service = try api()
            var saved = 0
            for (index, item) in items.enumerated() {
                guard item.selectedRateID.isEmpty, item.priceSource == "contractor_entered",
                      let qty = Self.decimal(item.quantity), qty > 0,
                      let directText = calculation.lines[index].directTotal,
                      let totalText = calculation.lines[index].sellingTotal,
                      let direct = Decimal(string: directText),
                      let total = Decimal(string: totalText) else { continue }
                let rate = EstimatingAPIClient.PriceBookCreate(
                    kind: "other", nameEn: item.descriptionEn,
                    nameEs: item.descriptionEs.isEmpty ? nil : item.descriptionEs,
                    unit: item.unit,
                    unitCost: direct / qty, unitPrice: total / qty,
                    category: "installed_work"
                )
                _ = try await service.saveRate(rate)
                saved += 1
            }
            book = try await service.pricebook()
            message = saved > 0
                ? String(localized: "estimate.saved_rates")
                : String(localized: "estimate.no_confirmed_rates")
        } catch {
            message = String(localized: "estimate.save_rates_error")
        }
    }

    private static func decimal(_ raw: String) -> Decimal? {
        Decimal(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: "."))
    }

    private func invalidatePrice() {
        calculation = nil
        approved = false
        pdfURL = nil
    }

    private enum BuilderFailure: Error { case apiNotConfigured }
}

private struct EditableEstimateTask: Identifiable, Equatable {
    let id = UUID()
    let taskCode: String
    var descriptionEn: String
    var descriptionEs: String
    var scopeID = ""  // contractor-entered room/location, never invented
    var quantity: String
    var unit: String
    var laborHours = ""
    var laborRate = ""
    var materialCost = ""
    var selectedRateID = ""
    var priceSource = "contractor_entered"
    var requiresConfirmation: Bool
    var confirmed: Bool

    init(_ source: EstimatingAPIClient.InterpretationResponse.Task, index: Int,
         normalizeUnit: (String?) -> String) {
        taskCode = source.taskCode?.isEmpty == false ? source.taskCode! : "UNMAPPED.\(index + 1)"
        descriptionEn = source.descriptionEn
        descriptionEs = source.descriptionEs
        quantity = source.quantity ?? ""
        unit = normalizeUnit(source.unit)
        requiresConfirmation = source.status == "allowance_to_confirm"
        confirmed = source.status != "allowance_to_confirm"
    }
}
