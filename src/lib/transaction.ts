import type { Customer, Service } from "@/lib/domain";

export type TxField = { key: string; label: string; type: "text" | "date" | "number" | "select" | "datetime-local"; options?: string[]; ltr?: boolean };
export type ServiceDetails = Record<string, string>;

/** Service-specific fields for a transaction, keyed by the base catalog service code. */
export const serviceFields: Record<string, TxField[]> = {
  flight: [
    { key: "trip_type", label: "نوع الرحلة", type: "select", options: ["ذهاب فقط", "ذهاب وعودة", "متعدد الوجهات"] },
    { key: "from", label: "من (مدينة / مطار)", type: "text" },
    { key: "to", label: "إلى (مدينة / مطار)", type: "text" },
    { key: "depart_date", label: "تاريخ الذهاب", type: "date" },
    { key: "return_date", label: "تاريخ العودة", type: "date" },
    { key: "passengers", label: "عدد المسافرين", type: "number" },
    { key: "cabin", label: "الدرجة", type: "select", options: ["سياحية", "سياحية مميزة", "رجال أعمال", "أولى"] },
    { key: "airline", label: "شركة الطيران المفضلة", type: "text" },
  ],
  hotel: [
    { key: "city", label: "المدينة", type: "text" },
    { key: "hotel_name", label: "اسم الفندق", type: "text" },
    { key: "check_in", label: "تاريخ الدخول", type: "date" },
    { key: "check_out", label: "تاريخ الخروج", type: "date" },
    { key: "rooms", label: "عدد الغرف", type: "number" },
    { key: "guests", label: "عدد النزلاء", type: "number" },
    { key: "board", label: "نوع الإقامة", type: "select", options: ["غرفة فقط", "مع إفطار", "نصف إقامة", "إقامة كاملة"] },
  ],
  visa: [
    { key: "country", label: "دولة التأشيرة", type: "text" },
    { key: "visa_type", label: "نوع التأشيرة", type: "select", options: ["سياحية", "زيارة", "عمل", "دراسة", "علاج", "عبور"] },
    { key: "applicants", label: "عدد المتقدمين", type: "number" },
    { key: "passport_expiry", label: "انتهاء الجواز", type: "date" },
    { key: "appointment_date", label: "موعد السفارة", type: "date" },
  ],
  tour: [
    { key: "destination", label: "الوجهة", type: "text" },
    { key: "start_date", label: "تاريخ البداية", type: "date" },
    { key: "end_date", label: "تاريخ النهاية", type: "date" },
    { key: "travelers", label: "عدد المسافرين", type: "number" },
    { key: "package", label: "البرنامج / الباقة", type: "text" },
  ],
  airport_pickup: [
    { key: "airport", label: "المطار", type: "text" },
    { key: "flight_number", label: "رقم الرحلة", type: "text", ltr: true },
    { key: "arrival_at", label: "تاريخ ووقت الوصول", type: "datetime-local" },
    { key: "passengers", label: "عدد الركاب", type: "number" },
    { key: "drop_off", label: "وجهة التوصيل", type: "text" },
  ],
  medical: [
    { key: "hospital", label: "المستشفى / المركز", type: "text" },
    { key: "specialty", label: "التخصص", type: "text" },
    { key: "appointment_date", label: "موعد الكشف", type: "date" },
    { key: "companions", label: "عدد المرافقين", type: "number" },
  ],
};

export const fieldsFor = (service: Pick<Service, "code"> | undefined) => (service ? serviceFields[service.code] ?? [] : []);

/** First filled date field becomes the transaction's service date when none was set explicitly. */
export function deriveServiceDate(fields: TxField[], d: ServiceDetails) {
  for (const f of fields) if ((f.type === "date" || f.type === "datetime-local") && d[f.key]) return d[f.key]!.slice(0, 10);
  return null;
}

/** Keep only non-empty values of fields belonging to the chosen service. */
export function cleanDetails(fields: TxField[], d: ServiceDetails): ServiceDetails {
  const out: ServiceDetails = {};
  for (const f of fields) { const v = d[f.key]?.trim(); if (v) out[f.key] = v; }
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
