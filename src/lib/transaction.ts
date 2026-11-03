import type { Customer, Service } from "@/lib/domain";

/** "request" = optional link to another request of the same customer whose service code is in `linkCodes`. */
export type TxField = { key: string; label: string; type: "text" | "date" | "number" | "select" | "datetime-local" | "request" | "textarea"; options?: string[]; ltr?: boolean; linkCodes?: string[]; required?: boolean;
  /** Shown only when another field of the same service has one of these values. */
  when?: { key: string; values: string[] } };

export const approvalStatuses = ["جديد", "قيد الإجراء", "موافَق عليه", "مرفوض", "ملغى"];
export type ServiceDetails = Record<string, string>;

/** Service-specific fields for a transaction, keyed by the base catalog service code. */
export const serviceFields: Record<string, TxField[]> = {
  flight: [
    { key: "passenger_name", label: "اسم المسافر كما في الجواز", type: "text", required: true },
    { key: "trip_type", label: "نوع الرحلة", type: "select", options: ["ذهاب فقط", "ذهاب وعودة", "متعدد الوجهات"], required: true },
    { key: "from", label: "من (مدينة / مطار)", type: "text", required: true },
    { key: "to", label: "إلى (مدينة / مطار)", type: "text", required: true },
    { key: "depart_date", label: "تاريخ الذهاب", type: "date", required: true },
    { key: "return_date", label: "تاريخ العودة", type: "date", required: true, when: { key: "trip_type", values: ["ذهاب وعودة"] } },
    { key: "passengers", label: "عدد المسافرين", type: "number" },
    { key: "cabin", label: "الدرجة", type: "select", options: ["سياحية", "سياحية مميزة", "رجال أعمال", "أولى"] },
    { key: "airline", label: "شركة الطيران", type: "text" },
    { key: "flight_number", label: "رقم الرحلة", type: "text", ltr: true },
    { key: "pnr", label: "رقم الحجز (PNR)", type: "text", ltr: true },
  ],
  hotel: [
    { key: "city", label: "المدينة", type: "text", required: true },
    { key: "hotel_name", label: "اسم الفندق", type: "text" },
    { key: "check_in", label: "تاريخ الدخول", type: "date", required: true },
    { key: "check_out", label: "تاريخ الخروج", type: "date", required: true },
    { key: "rooms", label: "عدد الغرف", type: "number" },
    { key: "guests", label: "عدد النزلاء", type: "number" },
    { key: "room_type", label: "نوع الغرفة", type: "select", options: ["مفردة", "مزدوجة", "ثلاثية", "رباعية", "جناح"] },
    { key: "board", label: "نوع الإقامة", type: "select", options: ["غرفة فقط", "مع إفطار", "نصف إقامة", "إقامة كاملة"] },
    { key: "confirmation_no", label: "رقم تأكيد الحجز", type: "text", ltr: true },
  ],
  visa: [
    { key: "country", label: "دولة التأشيرة", type: "text", required: true },
    { key: "visa_type", label: "نوع التأشيرة", type: "select", options: ["سياحية", "زيارة", "عمل", "دراسة", "علاج", "عبور"], required: true },
    { key: "applicants", label: "عدد المتقدمين", type: "number" },
    { key: "passport_expiry", label: "انتهاء الجواز", type: "date" },
    { key: "appointment_date", label: "موعد السفارة", type: "date" },
    { key: "university", label: "الجامعة / المعهد", type: "text", required: true, when: { key: "visa_type", values: ["دراسة"] } },
    { key: "acceptance_letter", label: "رقم خطاب القبول", type: "text", ltr: true, when: { key: "visa_type", values: ["دراسة"] } },
    { key: "employer", label: "جهة العمل / الكفيل", type: "text", required: true, when: { key: "visa_type", values: ["عمل"] } },
    { key: "job_title", label: "المسمى الوظيفي", type: "text", when: { key: "visa_type", values: ["عمل"] } },
    { key: "host_name", label: "اسم المضيف / الجهة الداعية", type: "text", when: { key: "visa_type", values: ["زيارة"] } },
    { key: "host_relation", label: "صلة القرابة", type: "text", when: { key: "visa_type", values: ["زيارة"] } },
    { key: "hospital", label: "المستشفى المعالج", type: "text", required: true, when: { key: "visa_type", values: ["علاج"] } },
    { key: "companions", label: "عدد المرافقين", type: "number", when: { key: "visa_type", values: ["علاج"] } },
    { key: "transit_country", label: "دولة العبور", type: "text", required: true, when: { key: "visa_type", values: ["عبور"] } },
    { key: "final_destination", label: "الوجهة النهائية", type: "text", when: { key: "visa_type", values: ["عبور"] } },
    { key: "travel_date", label: "تاريخ السفر المتوقع", type: "date", when: { key: "visa_type", values: ["سياحية"] } },
  ],
  umrah: [
    { key: "umrah_type", label: "نوع العمرة", type: "select", options: ["فردية", "ضمن رحلة جماعية"], required: true },
    { key: "pilgrims", label: "عدد المعتمرين", type: "number", required: true },
    { key: "group_name", label: "الرحلة الجماعية", type: "text", when: { key: "umrah_type", values: ["ضمن رحلة جماعية"] } },
    { key: "planned_departure", label: "تاريخ السفر المخطط", type: "date", required: true },
    { key: "planned_return", label: "تاريخ العودة المخطط", type: "date" },
    { key: "stay_days", label: "مدة الإقامة المطلوبة (أيام)", type: "number" },
    { key: "makkah_hotel", label: "فندق مكة", type: "text" },
    { key: "madinah_hotel", label: "فندق المدينة", type: "text" },
    { key: "companions", label: "عدد المرافقين", type: "number" },
  ],
  visit_visa: [
    { key: "country", label: "دولة التأشيرة", type: "text", required: true },
    { key: "host_name", label: "اسم المضيف", type: "text" },
    { key: "applicants", label: "عدد المتقدمين", type: "number" },
    { key: "passport_expiry", label: "انتهاء الجواز", type: "date" },
    { key: "appointment_date", label: "موعد السفارة", type: "date" },
  ],
  security_approval: [
    { key: "country", label: "الدولة المعنية", type: "text", required: true },
    { key: "ref_number", label: "رقم الطلب أو المعاملة", type: "text", ltr: true },
    { key: "submitted_date", label: "تاريخ تقديم الطلب", type: "date" },
    { key: "authority", label: "الجهة المُصدرة أو جهة المعالجة", type: "text" },
    { key: "approval_status", label: "حالة الموافقة", type: "select", options: approvalStatuses },
    { key: "decision_date", label: "تاريخ صدور القرار", type: "date" },
    { key: "linked_request_id", label: "طلب تأشيرة الزيارة المرتبط (اختياري)", type: "request", linkCodes: ["visit_visa", "visa"] },
  ],
  tour: [
    { key: "destination", label: "الوجهة", type: "text", required: true },
    { key: "start_date", label: "تاريخ البداية", type: "date", required: true },
    { key: "end_date", label: "تاريخ النهاية", type: "date" },
    { key: "travelers", label: "عدد المسافرين", type: "number" },
    { key: "package", label: "البرنامج / الباقة", type: "text" },
  ],
  airport_pickup: [
    { key: "airport", label: "المطار", type: "text", required: true },
    { key: "flight_number", label: "رقم الرحلة", type: "text", ltr: true, required: true },
    { key: "arrival_at", label: "تاريخ ووقت الوصول", type: "datetime-local", required: true },
    { key: "pickup_at", label: "موعد الاستقبال", type: "datetime-local" },
    { key: "passengers", label: "عدد الركاب", type: "number" },
    { key: "drop_off", label: "وجهة التوصيل", type: "text" },
    { key: "driver_name", label: "اسم السائق", type: "text" },
    { key: "driver_phone", label: "هاتف السائق", type: "text", ltr: true },
    { key: "vehicle", label: "السيارة / اللوحة", type: "text" },
  ],
  medical: [
    { key: "medical_service", label: "نوع الخدمة الطبية", type: "select", options: ["كشف", "علاج", "عملية جراحية", "متابعة", "تحاليل وأشعة", "أخرى"], required: true },
    { key: "hospital", label: "المستشفى / المركز", type: "text", required: true },
    { key: "specialty", label: "التخصص", type: "text" },
    { key: "doctor", label: "الطبيب المعالج", type: "text" },
    { key: "appointment_date", label: "موعد الكشف", type: "date" },
    { key: "condition", label: "وصف الحالة", type: "textarea" },
    { key: "companions", label: "عدد المرافقين", type: "number" },
  ],
  custom: [
    { key: "service_description", label: "وصف الخدمة المطلوبة", type: "textarea", required: true },
    { key: "service_location", label: "مكان تقديم الخدمة", type: "text" },
    { key: "requested_date", label: "التاريخ المطلوب", type: "date" },
    { key: "quantity", label: "العدد / الكمية", type: "number" },
  ],
};

export const fieldsFor = (service: Pick<Service, "code"> | undefined) => (service ? serviceFields[service.code] ?? serviceFields["custom"]! : []);

/** Fields relevant to the current values: conditional fields appear only when their trigger matches. */
export function visibleFields(fields: TxField[], d: ServiceDetails) {
  return fields.filter((f) => !f.when || f.when.values.includes(d[f.when.key] ?? ""));
}

/** Labels of required visible fields that are still empty. */
export function missingRequired(fields: TxField[], d: ServiceDetails) {
  return visibleFields(fields, d).filter((f) => f.required && !(d[f.key] ?? "").trim()).map((f) => f.label);
}

/** First filled date field becomes the transaction's service date when none was set explicitly. */
export function deriveServiceDate(fields: TxField[], d: ServiceDetails) {
  for (const f of fields) if ((f.type === "date" || f.type === "datetime-local") && d[f.key]) return d[f.key]!.slice(0, 10);
  return null;
}

/** Keep only non-empty values of fields belonging to the chosen service. */
export function cleanDetails(fields: TxField[], d: ServiceDetails): ServiceDetails {
  const out: ServiceDetails = {};
  for (const f of visibleFields(fields, d)) { const v = d[f.key]?.trim(); if (v) out[f.key] = v; }
  return out;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const low = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Existing customer that matches by phone (last 9 digits), email or passport — used to prevent duplicates. */
export function findDuplicateCustomer(list: Customer[], c: { phone?: string; email?: string; passport_number?: string }) {
  const p = digits(c.phone).slice(-9), e = low(c.email), pp = low(c.passport_number);
  return list.find((x) =>
    (p.length >= 7 && digits(x.phone).slice(-9) === p) || (!!e && low(x.email) === e) || (!!pp && low(x.passport_number) === pp),
  );
}

export function searchCustomers(list: Customer[], q: string) {
  const t = low(q), d = digits(q);
  if (!t) return [];
  return list.filter((c) => low(c.full_name).includes(t) || (d.length >= 3 && digits(c.phone).includes(d)) || low(c.email).includes(t) || low(c.passport_number) === t).slice(0, 8);
}
