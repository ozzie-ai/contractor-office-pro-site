import Foundation
import Supabase
import SwiftData

/// How a model maps to its Supabase table. Column lists mirror supabase/migrations.
protocol SyncRecord: Syncable {
    static var table: String { get }
    /// organizations/members are created only by create_org_for_user, so they sync with UPDATE, never INSERT.
    static var pushesWithUpdateOnly: Bool { get }
    /// Columns specific to this table (the shared ones are added by `row()`).
    var fields: Row { get }
    /// Copy table-specific columns from a server row.
    func applyFields(_ r: Row)
    /// Build a new local record from a server row (nil if required columns are missing).
    static func make(_ r: Row) -> Self?
}

extension SyncRecord {
    static var pushesWithUpdateOnly: Bool { false }

    func row() -> Row {
        var r = fields
        r["id"] = J.u(id)
        r["org_id"] = J.u(orgId)
        r["created_at"] = J.t(createdAt)
        r["updated_at"] = J.t(updatedAt)
        r["deleted_at"] = J.t(deletedAt)
        return r
    }

    /// Apply a server row as the new truth for this record and mark it clean.
    func apply(_ r: Row) {
        applyFields(r)
        if let u = r.date("updated_at") { updatedAt = u }
        serverUpdatedAt = r.date("server_updated_at")
        deletedAt = r.date("deleted_at")
        needsSync = false
    }
}

enum SyncRules {
    /// Last-write-wins on pull: keep a local unsynced edit only if it's newer than the server's copy.
    /// 1 ms tolerance because the server stores millisecond timestamps.
    static func shouldApplyRemote(localDirty: Bool, localUpdatedAt: Date, remoteUpdatedAt: Date) -> Bool {
        !localDirty || remoteUpdatedAt >= localUpdatedAt.addingTimeInterval(-0.001)
    }
}

private func base(_ r: Row) -> (id: UUID, org: UUID, created: Date)? {
    guard let id = r.uuid("id"), let org = r.uuid("org_id") else { return nil }
    return (id, org, r.date("created_at") ?? .now)
}

extension Organization: SyncRecord {
    static let table = "organizations"
    static var pushesWithUpdateOnly: Bool { true }
    var fields: Row {
        ["name": J.s(name), "cslb_license": J.s(cslbLicense), "address": J.s(address), "phone": J.s(phone),
         "email": J.s(email), "default_language": J.s(defaultLanguageRaw), "tax_rate": J.dec(taxRate)]
    }
    func applyFields(_ r: Row) {
        name = r.string("name") ?? name
        cslbLicense = r.string("cslb_license"); address = r.string("address")
        phone = r.string("phone"); email = r.string("email")
        defaultLanguageRaw = r.string("default_language") ?? defaultLanguageRaw
        taxRate = r.decimal("tax_rate") ?? taxRate
    }
    static func make(_ r: Row) -> Organization? {
        guard let b = base(r), let name = r.string("name") else { return nil }
        let o = Organization(id: b.id, name: name, now: b.created); o.apply(r); return o
    }
}

extension Member: SyncRecord {
    static let table = "members"
    static var pushesWithUpdateOnly: Bool { true }
    var fields: Row {
        ["user_id": J.u(userId), "display_name": J.s(displayName), "role": J.s(roleRaw), "phone": J.s(phone),
         "preferred_language": J.s(preferredLanguageRaw)]
    }
    func applyFields(_ r: Row) {
        userId = r.uuid("user_id"); displayName = r.string("display_name") ?? displayName
        roleRaw = r.string("role") ?? roleRaw; phone = r.string("phone")
        preferredLanguageRaw = r.string("preferred_language") ?? preferredLanguageRaw
    }
    static func make(_ r: Row) -> Member? {
        guard let b = base(r), let name = r.string("display_name") else { return nil }
        let m = Member(id: b.id, orgId: b.org, displayName: name, now: b.created); m.apply(r); return m
    }
}

extension Client: SyncRecord {
    static let table = "clients"
    var fields: Row {
        ["name": J.s(name), "phone": J.s(phone), "email": J.s(email), "address": J.s(address),
         "preferred_language": J.s(preferredLanguageRaw), "sms_consent": J.s(smsConsentRaw),
         "sms_consent_at": J.t(smsConsentAt), "is_senior_65_plus": J.b(isSenior65Plus), "notes": J.s(notes)]
    }
    func applyFields(_ r: Row) {
        name = r.string("name") ?? name; phone = r.string("phone"); email = r.string("email")
        address = r.string("address"); preferredLanguageRaw = r.string("preferred_language") ?? preferredLanguageRaw
        smsConsentRaw = r.string("sms_consent") ?? smsConsentRaw; smsConsentAt = r.date("sms_consent_at")
        isSenior65Plus = r.bool("is_senior_65_plus") ?? false; notes = r.string("notes")
    }
    static func make(_ r: Row) -> Client? {
        guard let b = base(r), let name = r.string("name") else { return nil }
        let c = Client(id: b.id, orgId: b.org, name: name, now: b.created); c.apply(r); return c
    }
}

extension Job: SyncRecord {
    static let table = "jobs"
    var fields: Row {
        ["client_id": J.u(clientId), "title": J.s(title), "address": J.s(address), "status": J.s(statusRaw),
         "assigned_to": J.u(assignedTo), "scheduled_start": J.t(scheduledStart),
         "scheduled_end": J.t(scheduledEnd), "notes": J.s(notes)]
    }
    func applyFields(_ r: Row) {
        clientId = r.uuid("client_id"); title = r.string("title") ?? title; address = r.string("address")
        statusRaw = r.string("status") ?? statusRaw; assignedTo = r.uuid("assigned_to")
        scheduledStart = r.date("scheduled_start"); scheduledEnd = r.date("scheduled_end"); notes = r.string("notes")
    }
    static func make(_ r: Row) -> Job? {
        guard let b = base(r), let title = r.string("title") else { return nil }
        let j = Job(id: b.id, orgId: b.org, title: title, assignedTo: nil, now: b.created); j.apply(r); return j
    }
}

extension TimeEntry: SyncRecord {
    static let table = "time_entries"
    var fields: Row {
        ["job_id": J.u(jobId), "member_id": J.u(memberId), "clock_in": J.t(clockIn),
         "clock_out": J.t(clockOut), "notes": J.s(notes)]
    }
    func applyFields(_ r: Row) {
        jobId = r.uuid("job_id") ?? jobId; memberId = r.uuid("member_id")
        clockIn = r.date("clock_in") ?? clockIn; clockOut = r.date("clock_out"); notes = r.string("notes")
    }
    static func make(_ r: Row) -> TimeEntry? {
        guard let b = base(r), let job = r.uuid("job_id"), let start = r.date("clock_in") else { return nil }
        let t = TimeEntry(id: b.id, orgId: b.org, jobId: job, memberId: nil, clockIn: start, now: b.created)
        t.apply(r); return t
    }
}

extension PriceBookItem: SyncRecord {
    static let table = "price_book_items"
    var fields: Row {
        ["kind": J.s(kindRaw), "name_en": J.s(nameEn), "name_es": J.s(nameEs), "unit": J.s(unit),
         "unit_cost": J.dec(unitCost), "unit_price": J.dec(unitPrice), "markup_pct": J.dec(markupPct),
         "category": J.s(category)]
    }
    func applyFields(_ r: Row) {
        kindRaw = r.string("kind") ?? kindRaw; nameEn = r.string("name_en") ?? nameEn; nameEs = r.string("name_es")
        unit = r.string("unit") ?? unit; unitCost = r.decimal("unit_cost") ?? unitCost
        unitPrice = r.decimal("unit_price") ?? unitPrice; markupPct = r.decimal("markup_pct"); category = r.string("category")
    }
    static func make(_ r: Row) -> PriceBookItem? {
        guard let b = base(r), let name = r.string("name_en") else { return nil }
        let p = PriceBookItem(id: b.id, orgId: b.org, kind: .other, nameEn: name, now: b.created); p.apply(r); return p
    }
}

extension Estimate: SyncRecord {
    static let table = "estimates"
    var fields: Row {
        ["job_id": J.u(jobId), "number": J.s(number), "status": J.s(statusRaw), "language": J.s(languageRaw),
         "subtotal": J.dec(subtotal), "tax": J.dec(tax), "total": J.dec(total),
         "deposit_amount": J.dec(depositAmount), "sent_at": J.t(sentAt), "accepted_at": J.t(acceptedAt)]
    }
    func applyFields(_ r: Row) {
        jobId = r.uuid("job_id") ?? jobId; number = r.string("number"); statusRaw = r.string("status") ?? statusRaw
        languageRaw = r.string("language") ?? languageRaw; subtotal = r.decimal("subtotal") ?? 0
        tax = r.decimal("tax") ?? 0; total = r.decimal("total") ?? 0; depositAmount = r.decimal("deposit_amount")
        sentAt = r.date("sent_at"); acceptedAt = r.date("accepted_at")
    }
    static func make(_ r: Row) -> Estimate? {
        guard let b = base(r), let job = r.uuid("job_id") else { return nil }
        let e = Estimate(id: b.id, orgId: b.org, jobId: job, now: b.created); e.apply(r); return e
    }
}

extension LineItem: SyncRecord {
    static let table = "line_items"
    var fields: Row {
        ["estimate_id": J.u(estimateId), "price_book_item_id": J.u(priceBookItemId), "position": J.i(position),
         "description_en": J.s(descriptionEn), "description_es": J.s(descriptionEs), "qty": J.dec(qty),
         "unit": J.s(unit), "unit_price": J.dec(unitPrice), "taxable": J.b(taxable), "source": J.s(sourceRaw)]
    }
    func applyFields(_ r: Row) {
        estimateId = r.uuid("estimate_id") ?? estimateId; priceBookItemId = r.uuid("price_book_item_id")
        position = r.int("position") ?? 0; descriptionEn = r.string("description_en") ?? ""
        descriptionEs = r.string("description_es") ?? ""; qty = r.decimal("qty") ?? 1; unit = r.string("unit") ?? "ea"
        unitPrice = r.decimal("unit_price") ?? 0; taxable = r.bool("taxable") ?? true
        sourceRaw = r.string("source") ?? sourceRaw
    }
    static func make(_ r: Row) -> LineItem? {
        guard let b = base(r), let est = r.uuid("estimate_id") else { return nil }
        let l = LineItem(id: b.id, orgId: b.org, estimateId: est, now: b.created); l.apply(r); return l
    }
}

extension Receipt: SyncRecord {
    static let table = "receipts"
    var fields: Row {
        ["job_id": J.u(jobId), "store": J.s(store), "purchased_on": J.day(purchasedOn), "subtotal": J.dec(subtotal),
         "tax": J.dec(tax), "total": J.dec(total), "image_path": J.s(imagePath), "ocr_text": J.s(ocrText)]
    }
    func applyFields(_ r: Row) {
        jobId = r.uuid("job_id"); store = r.string("store"); purchasedOn = r.day("purchased_on")
        subtotal = r.decimal("subtotal"); tax = r.decimal("tax"); total = r.decimal("total")
        imagePath = r.string("image_path"); ocrText = r.string("ocr_text")
    }
    static func make(_ r: Row) -> Receipt? {
        guard let b = base(r) else { return nil }
        let x = Receipt(id: b.id, orgId: b.org, now: b.created); x.apply(r); return x
    }
}

extension ReceiptLineItem: SyncRecord {
    static let table = "receipt_line_items"
    var fields: Row {
        ["receipt_id": J.u(receiptId), "sku": J.s(sku), "description": J.s(itemDescription), "qty": J.dec(qty),
         "unit_price": J.dec(unitPrice)]
    }
    func applyFields(_ r: Row) {
        receiptId = r.uuid("receipt_id") ?? receiptId; sku = r.string("sku")
        itemDescription = r.string("description") ?? itemDescription; qty = r.decimal("qty") ?? 1
        unitPrice = r.decimal("unit_price") ?? 0
    }
    static func make(_ r: Row) -> ReceiptLineItem? {
        guard let b = base(r), let rec = r.uuid("receipt_id"), let d = r.string("description") else { return nil }
        let x = ReceiptLineItem(id: b.id, orgId: b.org, receiptId: rec, description: d, now: b.created); x.apply(r); return x
    }
}

extension Expense: SyncRecord {
    static let table = "expenses"
    var fields: Row {
        ["job_id": J.u(jobId), "receipt_id": J.u(receiptId), "category": J.s(category),
         "description": J.s(expenseDescription), "amount": J.dec(amount), "spent_on": J.day(spentOn)]
    }
    func applyFields(_ r: Row) {
        jobId = r.uuid("job_id"); receiptId = r.uuid("receipt_id"); category = r.string("category") ?? category
        expenseDescription = r.string("description"); amount = r.decimal("amount") ?? amount
        spentOn = r.day("spent_on") ?? spentOn
    }
    static func make(_ r: Row) -> Expense? {
        guard let b = base(r), let amount = r.decimal("amount") else { return nil }
        let x = Expense(id: b.id, orgId: b.org, amount: amount, now: b.created); x.apply(r); return x
    }
}

extension Media: SyncRecord {
    static let table = "media"
    var fields: Row {
        ["job_id": J.u(jobId), "kind": J.s(kindRaw), "storage_path": J.s(storagePath),
         "upload_state": J.s(uploadStateRaw), "duration_seconds": J.d(durationSeconds),
         "transcript": J.s(transcript), "transcript_language": J.s(transcriptLanguageRaw),
         "captured_at": J.t(capturedAt)]
    }
    func applyFields(_ r: Row) {
        jobId = r.uuid("job_id"); kindRaw = r.string("kind") ?? kindRaw; storagePath = r.string("storage_path")
        uploadStateRaw = r.string("upload_state") ?? uploadStateRaw; durationSeconds = r.double("duration_seconds")
        transcript = r.string("transcript"); transcriptLanguageRaw = r.string("transcript_language")
        capturedAt = r.date("captured_at") ?? capturedAt
        // localFileName is device-only and never overwritten by the server.
    }
    static func make(_ r: Row) -> Media? {
        guard let b = base(r) else { return nil }
        let m = Media(id: b.id, orgId: b.org, jobId: nil, kind: .photo, localFileName: nil, now: b.created)
        m.apply(r); return m
    }
}
