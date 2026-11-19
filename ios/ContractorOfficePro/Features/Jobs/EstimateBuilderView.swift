import Foundation
import SwiftUI
import PhotosUI
import UIKit
import PDFKit
import UniformTypeIdentifiers

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
    @State private var restoringDraft = false
    @State private var photoSelection: [PhotosPickerItem] = []
    @State private var photoFiles: [URL] = []
    @State private var photoMessage: String?
    @State private var pendingPhotoInspection: URL?
    @State private var photoObservations: EstimatingAPIClient.PhotoInspectionResponse?
    @State private var showBlueprintImporter = false
    @State private var blueprintURL: URL?
    @State private var blueprintMessage: String?
    @State private var showBlueprintConsent = false

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
                            Text(String(url.lastPathComponent.prefix(8)) + "…")
                                .font(.caption)
                            Spacer()
                            Button {
                                pendingPhotoInspection = url
                            } label: { Image(systemName: "sparkles") }
                                .disabled(busy)
                                .accessibilityLabel("Review photo with AI (requires consent)")
                            Button(role: .destructive) {
                                do {
                                    photoObservations = nil
                                    try PrivateJobPhotoStore.remove(url, jobID: job.id)
                                    photoFiles = PrivateJobPhotoStore.files(jobID: job.id)
                                } catch {
                                    photoMessage = "Could not remove photo."
                                }
                            } label: { Image(systemName: "trash") }
                        }
                    }
                    if let insight = photoObservations {
                        Text("AI VISUAL OBSERVATIONS — NOT VERIFIED").font(.caption).bold()
                        ForEach(insight.observations.visibleConditions, id: \.self) { Text("Visible: " + $0) }
                        ForEach(insight.observations.possibleWork, id: \.self) { Text("Possible: " + $0) }
                        ForEach(insight.observations.missingInformation, id: \.self) { Text("Verify: " + $0) }
                        ForEach(insight.observations.limitations, id: \.self) { Text("Limit: " + $0) }
                        Text("Photo observations are not added to the estimate automatically.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if let photoMessage { Text(photoMessage).font(.caption).foregroundStyle(.orange) }
                } header: {
                    Text(dictationLanguage == "es" ? "Fotos del trabajo" : "Jobsite photos")
                } footer: {
                    Text(dictationLanguage == "es"
                         ? "No se envían al servidor ni se incluyen en el presupuesto del cliente."
                         : "Not uploaded to a server or included in the customer's PDF.")
                }

                Section {
                    Button {
                        showBlueprintImporter = true
                    } label: {
                        Label(dictationLanguage == "es" ? "Adjuntar plano PDF" : "Attach blueprint PDF",
                              systemImage: "doc.richtext")
                    }
                    if let blueprintURL {
                        HStack {
                            Label(dictationLanguage == "es" ? "Plano guardado en este iPhone" : "Blueprint saved on this iPhone",
                                  systemImage: "doc.text")
                            Spacer()
                            Button {
                                showBlueprintConsent = true
                            } label: { Image(systemName: "sparkles") }
                                .disabled(busy)
                                .accessibilityLabel("Review first blueprint page with AI (requires consent)")
                            Button(role: .destructive) {
                                PrivateBlueprintStore.clear(jobID: job.id)
                                self.blueprintURL = nil
                                photoObservations = nil
                            } label: { Image(systemName: "trash") }
                        }
                        Text(blueprintURL.lastPathComponent)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if let blueprintMessage {
                        Text(blueprintMessage).font(.caption).foregroundStyle(.orange)
                    }
                } header: {
                    Text(dictationLanguage == "es" ? "Planos" : "Blueprints")
                } footer: {
                    Text(dictationLanguage == "es"
                         ? "Se guarda localmente. La IA solo analizará una imagen de la primera página si lo autorizas; no calcula mediciones definitivas."
                         : "Stored locally. AI only reviews an image of the first page with your consent; this is not an accurate automatic takeoff.")
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
                                TextField("Equipment per unit / Equipo por unidad", text: $item.equipmentCost)
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
            .fileImporter(isPresented: $showBlueprintImporter, allowedContentTypes: [.pdf]) { result in
                switch result {
                case .success(let url): importBlueprint(url)
                case .failure: blueprintMessage = "Blueprint selection failed."
                }
            }
            .confirmationDialog("Send the first blueprint page to AI for review?",
                                isPresented: $showBlueprintConsent,
                                titleVisibility: .visible) {
                Button("Send first blueprint page for AI observations") {
                    if let blueprintURL { Task { await inspectBlueprintPage(blueprintURL) } }
                }
                Button("Keep blueprint private", role: .cancel) {}
            } message: {
                Text("Only a raster image of page 1 is uploaded when enabled; the PDF remains private. Printed dimensions and quantities must be independently checked.")
            }
            .confirmationDialog("Send this jobsite photo to AI for review?",
                                isPresented: Binding(
                                    get: { pendingPhotoInspection != nil },
                                    set: { if !$0 { pendingPhotoInspection = nil } }
                                ),
                                titleVisibility: .visible) {
                Button("Send selected photo for AI observations") {
                    if let url = pendingPhotoInspection { Task { await inspectSelectedPhoto(url) } }
                    pendingPhotoInspection = nil
                }
                Button("Keep photo private", role: .cancel) { pendingPhotoInspection = nil }
            } message: {
                Text("This uploads only the selected photo to an external AI provider. It may incur usage charges when enabled. All conclusions need verification.")
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
                guard !restoringDraft else { return }
                PrivateJobDraftStore.save(newText, jobID: job.id)
                // New dictation invalidates any previously extracted scope.
                items = []
                unknowns = []
                resolvedUnknowns = []
                exclusions = []
                invalidatePrice()
                persistReview()
            }
            .onChange(of: items) { _, _ in invalidatePrice(); persistReview() }
            .onChange(of: unknowns) { _, _ in persistReview() }
            .onChange(of: resolvedUnknowns) { _, _ in persistReview() }
            .onChange(of: exclusions) { _, _ in persistReview() }
            .onChange(of: overhead) { _, _ in invalidatePrice(); persistReview() }
            .onChange(of: profit) { _, _ in invalidatePrice(); persistReview() }
            .onChange(of: tripCost) { _, _ in invalidatePrice(); persistReview() }
            .onChange(of: customerLanguage) { _, _ in invalidatePrice(); persistReview() }
            .task {
                restoringDraft = true
                notes = PrivateJobDraftStore.load(jobID: job.id)
                if let review = PrivateEstimateReviewStore.load(jobID: job.id) {
                    items = review.items.map(EditableEstimateTask.init)
                    unknowns = review.unknowns
                    resolvedUnknowns = Set(review.resolvedUnknowns)
                    exclusions = review.exclusions
                    overhead = review.overhead
                    profit = review.profit
                    tripCost = review.tripCost
                    customerLanguage = review.customerLanguage == "es" ? "es" : "en"
                }
                photoFiles = PrivateJobPhotoStore.files(jobID: job.id)
                blueprintURL = PrivateBlueprintStore.load(jobID: job.id)
                await refreshRates()
                await Task.yield()
                restoringDraft = false
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

    private func importBlueprint(_ source: URL) {
        blueprintMessage = nil
        let access = source.startAccessingSecurityScopedResource()
        defer { if access { source.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: source)
            guard let document = PDFDocument(data: data), document.pageCount > 0 else {
                blueprintMessage = "Invalid or unreadable blueprint PDF."
                return
            }
            blueprintURL = try PrivateBlueprintStore.save(data, jobID: job.id)
            photoObservations = nil
        } catch {
            blueprintMessage = "Could not save the blueprint. PDF limit: 15 MB."
        }
    }

    private func inspectBlueprintPage(_ url: URL) async {
        busy = true
        blueprintMessage = nil
        photoObservations = nil
        defer { busy = false }
        do {
            guard PrivateBlueprintStore.load(jobID: job.id) == url,
                  let data = try? Data(contentsOf: url),
                  let document = PDFDocument(data: data),
                  let firstPage = document.page(at: 0) else {
                blueprintMessage = "Could not read the first blueprint page."
                return
            }
            let image = firstPage.thumbnail(of: CGSize(width: 1280, height: 1656), for: .cropBox)
            guard let jpeg = image.jpegData(compressionQuality: 0.65) else {
                blueprintMessage = "Could not prepare a blueprint preview."
                return
            }
            let inspected = try await api().inspectPhoto(jpegData: jpeg,
                context: "Raster preview of page 1 from blueprint PDF. Only printed dimensions may be quoted and must be verified; do not infer scale or prices.")
            // A removed/replaced blueprint must never display observations from
            // an earlier upload after the network request finishes.
            guard PrivateBlueprintStore.load(jobID: job.id) == url, blueprintURL == url else {
                blueprintMessage = "Blueprint changed while inspecting. Select the current file again."
                return
            }
            photoObservations = inspected
        } catch {
            blueprintMessage = "AI blueprint review unavailable. The stored PDF is unchanged."
        }
    }

    private func inspectSelectedPhoto(_ url: URL) async {
        busy = true
        photoMessage = nil
        photoObservations = nil
        defer { busy = false }
        do {
            guard PrivateJobPhotoStore.files(jobID: job.id).contains(url),
                  let image = UIImage(data: try Data(contentsOf: url)),
                  let jpeg = image.jpegData(compressionQuality: 0.65) else {
                photoMessage = "Cannot read the selected job photo."
                return
            }
            // Never upload private transcription or pricing with the photo.
            let inspected = try await api().inspectPhoto(jpegData: jpeg, context: "")
            // Do not present analysis of a photo that was deleted or replaced
            // during the network request.
            guard PrivateJobPhotoStore.files(jobID: job.id).contains(url),
                  photoFiles.contains(url) else {
                photoMessage = "Photo changed during inspection. Choose the current photo again."
                return
            }
            photoObservations = inspected
        } catch {
            photoMessage = "AI photo review is unavailable. The local photo and estimate are unchanged."
        }
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
        // Never leave a previous total on screen when a new request fails.
        calculation = nil
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
                    equipmentCostPerUnit: item.equipmentCost.isEmpty ? 0 : (Self.decimal(item.equipmentCost) ?? -1),
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

    private func persistReview() {
        guard !restoringDraft else { return }
        let snapshot = EstimateReviewDraft(
            items: items.map(\.reviewSnapshot),
            unknowns: unknowns,
            resolvedUnknowns: resolvedUnknowns.sorted(),
            exclusions: exclusions,
            overhead: overhead, profit: profit, tripCost: tripCost,
            customerLanguage: customerLanguage
        )
        if !PrivateEstimateReviewStore.save(snapshot, jobID: job.id) {
            message = "Could not save estimate draft. Keep this job open."
        }
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
    var equipmentCost = ""
    var selectedRateID = ""
    var priceSource = "contractor_entered"
    var requiresConfirmation: Bool
    var confirmed: Bool

    var reviewSnapshot: EstimateReviewDraft.Item {
        EstimateReviewDraft.Item(taskCode: taskCode, descriptionEn: descriptionEn,
            descriptionEs: descriptionEs, scopeID: scopeID, quantity: quantity,
            unit: unit, laborHours: laborHours, laborRate: laborRate,
            materialCost: materialCost, equipmentCost: equipmentCost,
            selectedRateID: selectedRateID,
            priceSource: priceSource, requiresConfirmation: requiresConfirmation,
            confirmed: confirmed)
    }

    init(_ stored: EstimateReviewDraft.Item) {
        taskCode = stored.taskCode
        descriptionEn = stored.descriptionEn
        descriptionEs = stored.descriptionEs
        scopeID = stored.scopeID
        quantity = stored.quantity
        unit = stored.unit
        laborHours = stored.laborHours
        laborRate = stored.laborRate
        materialCost = stored.materialCost
        equipmentCost = stored.equipmentCost ?? ""
        selectedRateID = stored.selectedRateID
        priceSource = stored.priceSource
        requiresConfirmation = stored.requiresConfirmation
        confirmed = stored.confirmed
    }

    init(_ source: EstimatingAPIClient.InterpretationResponse.Task, index: Int,
         normalizeUnit: (String?) -> String) {
        taskCode = source.taskCode?.isEmpty == false ? source.taskCode! : "UNMAPPED.\(index + 1)"
        descriptionEn = source.descriptionEn
        descriptionEs = source.descriptionEs
        quantity = source.quantity ?? ""
        unit = normalizeUnit(source.unit)
        // The AI may leave quantity/unit unknown. Such tasks cannot be
        // treated as automatically confirmed, even if status says included.
        requiresConfirmation = source.status == "allowance_to_confirm"
            || source.quantity == nil || normalizeUnit(source.unit).isEmpty
        confirmed = !requiresConfirmation
    }
}
