import type { ActivityRow, Booking, Customer, Member, Partner, Service, TravelRequest, UmrahParticipant, UmrahTrip } from "@/lib/domain";
import { activityActionLabels, activityEntityLabels, bookingCode, bookingStatusLabels, customerSourceLabels, requestCode, statusLabels } from "@/lib/domain";
import { pilgrimStatusLabels, stayDuration, tripStatusLabels } from "@/lib/umrah";
import { fieldsFor, visibleFields, type ServiceDetails, type TxField } from "@/lib/transaction";

/** Everything one office's reports are built from — identical shape for office users and the platform owner. */
export type ReportSource = {
  office: { id: string; name: string; is_partner: boolean; logo_url?: string | null };
  customers: Customer[]; requests: TravelRequest[]; bookings: Booking[]; services: Service[]; members: Member[];
  activity: ActivityRow[]; trips: UmrahTrip[]; participants: UmrahParticipant[]; partners: Partner[];
};

export type ReportFilters = { from?: string | undefined; to?: string | undefined; employee?: string | undefined; serviceId?: string | undefined; status?: string | undefined; action?: string | undefined };
export type ReportKind = "customers" | "requests" | "bookings" | "flights" | "umrah" | "staff" | "activity" | "partners";
export const reportKindLabels: Record<ReportKind, string> = {
  customers: "العملاء", requests: "الطلبات والمعاملات", bookings: "الحجوزات", flights: "تذاكر الطيران",
  umrah: "العمرة والمعتمرون", staff: "أداء الموظفين", activity: "نشاط المكتب", partners: "المكاتب الشريكة",
};

export type Column = { header: string; width: number; kind?: "text" | "date" | "number" | "phone" };
export type Sheet = { name: string; columns: Column[]; rows: (string | number | null)[][]; totals?: [string, string | number][] };

const UNKNOWN = "غير معروف";
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

/** Inclusive date window on an ISO timestamp; empty bounds are open. */
export function inPeriod(iso: string | null | undefined, f: Pick<ReportFilters, "from" | "to">) {
  const d = day(iso);
  if (!d) return !f.from && !f.to;
  return (!f.from || d >= f.from) && (!f.to || d <= f.to);
}

/** Preset windows: today, this week (Saturday start), this month, this year. */
export function presetPeriod(preset: "day" | "week" | "month" | "year", now = new Date()): { from: string; to: string } {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const to = iso(now);
  const start = new Date(now);
  if (preset === "week") start.setDate(now.getDate() - ((now.getDay() + 1) % 7));
  if (preset === "month") start.setDate(1);
  if (preset === "year") { start.setMonth(0); start.setDate(1); }
  return { from: iso(start), to };
}

export function reportContext(src: ReportSource) {
  const memberName = new Map(src.members.map((m) => [m.user_id, m.full_name || m.email || null]));
  const lastAction = new Map<string, ActivityRow>();
  for (const a of src.activity) {
    if (!a.entity_id) continue;
    if (a.office_id !== src.office.id || (a.result && a.result !== "success")) continue;
    const key = `${a.entity}:${a.entity_id}`;
    const prev = lastAction.get(key);
    if (!prev || prev.created_at < a.created_at) lastAction.set(key, a);
  }
  /** Names come from membership/profile records or the immutable actor-name snapshot; never guessed. */
  const person = (id: string | null | undefined) => (id ? memberName.get(id) ?? src.activity.find((a) => a.actor_id === id && a.actor_name)?.actor_name ?? UNKNOWN : "—");
  const lastActor = (entity: string, entityId: string) => {
    const a = lastAction.get(`${entity}:${entityId}`);
    if (!a) return "—";
    return a.actor_name || (a.actor_id ? person(a.actor_id) : UNKNOWN);
  };
  const service = new Map(src.services.map((s) => [s.id, s]));
  const customer = new Map(src.customers.map((c) => [c.id, c]));
  return { person, lastActor, service, customer };
}

const officeCols: Column[] = [{ header: "اسم المكتب", width: 22 }, { header: "تصنيف المكتب", width: 12 }];
const officeVals = (s: ReportSource) => [s.office.name, s.office.is_partner ? "شريك" : "غير شريك"];
const attrCols: Column[] = [
  { header: "أنشأه", width: 18 }, { header: "المسؤول الحالي", width: 18 }, { header: "منفذ آخر إجراء", width: 18 },
  { header: "تاريخ الإنشاء", width: 13, kind: "date" }, { header: "آخر تحديث", width: 13, kind: "date" }, { header: "ملاحظات", width: 30 },
];
const txType = (d: unknown) => {
  const v = (d ?? {}) as Record<string, string>;
  return v["visa_type"] || v["trip_type"] || v["umrah_type"] || v["medical_service"] || null;
};

export function buildSheet(kind: ReportKind, src: ReportSource, f: ReportFilters): Sheet {
  const ctx = reportContext(src);
  const byEmp = (owner: string | null | undefined, creator: string | null | undefined) => !f.employee || owner === f.employee || creator === f.employee;
  const custCells = (id: string) => { const c = ctx.customer.get(id); return [c?.full_name ?? UNKNOWN, c?.phone ?? null, c ? c.id.slice(0, 8).toUpperCase() : null]; };
  const custCols: Column[] = [{ header: "اسم العميل", width: 22 }, { header: "رقم الهاتف", width: 16, kind: "phone" }, { header: "مرجع العميل", width: 12 }];

  if (kind === "customers") {
    const reqCount = new Map<string, number>();
    src.requests.forEach((r) => reqCount.set(r.customer_id, (reqCount.get(r.customer_id) ?? 0) + 1));
    const rows = src.customers.filter((c) => inPeriod(c.created_at, f) && byEmp(c.assigned_to, c.created_by))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"))
      .map((c) => [...officeVals(src), ...custCells(c.id), customerSourceLabels[c.source], reqCount.get(c.id) ?? 0, ctx.person(c.created_by), ctx.person(c.assigned_to), ctx.lastActor("customers", c.id), day(c.created_at), day(c.updated_at), c.notes]);
    return { name: "العملاء", columns: [...officeCols, ...custCols, { header: "المصدر", width: 14 }, { header: "عدد الطلبات", width: 10, kind: "number" }, ...attrCols], rows, totals: [["عدد العملاء", rows.length]] };
  }
  if (kind === "requests" || kind === "flights") {
    const list = src.requests.filter((r) => inPeriod(r.created_at, f) && byEmp(r.assigned_to, r.created_by)
      && (!f.serviceId || r.service_id === f.serviceId) && (!f.status || r.status === f.status)
      && (kind !== "flights" || ctx.service.get(r.service_id ?? "")?.code === "flight"))
      .sort((a, b) => b.number - a.number);
    if (kind === "flights") {
      const rows = list.map((r) => { const d = (r.service_details ?? {}) as Record<string, string>; return [...officeVals(src), requestCode(r.number), ...custCells(r.customer_id), d["passenger_name"] ?? null, d["from"] ?? null, d["to"] ?? null, d["depart_date"] ?? null, d["return_date"] ?? null, d["airline"] ?? null, d["flight_number"] ?? null, d["pnr"] ?? null, statusLabels[r.status], ctx.person(r.created_by), ctx.person(r.assigned_to), ctx.lastActor("requests", r.id), day(r.created_at), day(r.updated_at), r.notes]; });
      return { name: "تذاكر الطيران", columns: [...officeCols, { header: "رقم الطلب", width: 11 }, ...custCols, { header: "اسم المسافر", width: 20 }, { header: "من", width: 14 }, { header: "إلى", width: 14 }, { header: "الذهاب", width: 12, kind: "date" }, { header: "العودة", width: 12, kind: "date" }, { header: "شركة الطيران", width: 14 }, { header: "رقم الرحلة", width: 11 }, { header: "PNR", width: 10 }, { header: "الحالة", width: 13 }, ...attrCols], rows, totals: [["عدد التذاكر", rows.length]] };
    }
    const detailFields = new Map<string, TxField>();
    for (const r of list) {
      const details = (r.service_details ?? {}) as ServiceDetails;
      for (const field of visibleFields(fieldsFor(ctx.service.get(r.service_id ?? "")), details)) detailFields.set(field.key, field);
    }
    const fields = [...detailFields.values()];
    const rows = list.map((r) => {
      const details = (r.service_details ?? {}) as ServiceDetails;
      const allowed = new Set(visibleFields(fieldsFor(ctx.service.get(r.service_id ?? "")), details).map((field) => field.key));
      return [...officeVals(src), requestCode(r.number), ...custCells(r.customer_id), ctx.service.get(r.service_id ?? "")?.name ?? "—", txType(r.service_details), statusLabels[r.status],
        ...fields.map((field) => allowed.has(field.key) ? details[field.key] ?? null : null),
        ctx.person(r.created_by), ctx.person(r.assigned_to), ctx.lastActor("requests", r.id), day(r.created_at), day(r.updated_at), r.notes];
    });
    const completed = list.filter((r) => r.status === "completed").length;
    return { name: "الطلبات والمعاملات", columns: [...officeCols, { header: "رقم الطلب", width: 11 }, ...custCols, { header: "نوع الخدمة", width: 16 }, { header: "نوع المعاملة", width: 14 }, { header: "الحالة", width: 14 }, ...fields.map((field): Column => ({ header: field.label, width: 20, kind: field.type === "date" ? "date" : field.type === "number" ? "number" : field.key.endsWith("phone") ? "phone" : "text" })), ...attrCols], rows,
      totals: [["عدد الطلبات", rows.length], ["المكتملة", completed], ["الملغاة", list.filter((r) => r.status === "cancelled").length]] };
  }
  if (kind === "bookings") {
    const list = src.bookings.filter((b) => inPeriod(b.created_at, f) && byEmp(b.assigned_employee_id, b.created_by) && (!f.serviceId || b.service_id === f.serviceId) && (!f.status || b.status === f.status)).sort((a, b) => b.number - a.number);
    const rows = list.map((b) => [...officeVals(src), bookingCode(b.number), ...custCells(b.customer_id), ctx.service.get(b.service_id ?? "")?.name ?? "—", b.provider, b.external_ref, bookingStatusLabels[b.status], b.service_date, ctx.person(b.created_by), ctx.person(b.assigned_employee_id), ctx.lastActor("bookings", b.id), day(b.created_at), day(b.updated_at), b.notes]);
    return { name: "الحجوزات", columns: [...officeCols, { header: "رقم الحجز", width: 11 }, ...custCols, { header: "نوع الخدمة", width: 16 }, { header: "المزود", width: 16 }, { header: "مرجع الحجز", width: 13 }, { header: "الحالة", width: 14 }, { header: "تاريخ الخدمة", width: 12, kind: "date" }, ...attrCols], rows, totals: [["عدد الحجوزات", rows.length]] };
  }
  if (kind === "umrah") {
    const trip = new Map(src.trips.map((t) => [t.id, t]));
    const today = new Date().toISOString().slice(0, 10);
    const rows = src.participants.filter((p) => inPeriod(p.created_at, f) && (!f.employee || ctx.customer.get(p.customer_id)?.assigned_to === f.employee || trip.get(p.trip_id)?.created_by === f.employee))
      .map((p) => { const t = trip.get(p.trip_id); const s = stayDuration(p.actual_entry, p.actual_exit, today); return [...officeVals(src), t?.name ?? "—", t ? tripStatusLabels[t.status] : "—", ...custCells(p.customer_id), pilgrimStatusLabels[p.status], p.planned_entry, p.planned_exit, p.actual_entry, p.actual_exit, s.kind === "none" ? null : s.days, s.kind === "final" ? "نهائية" : s.kind === "so_far" ? "حتى الآن" : "—", ctx.person(t?.created_by), ctx.person(ctx.customer.get(p.customer_id)?.assigned_to), ctx.lastActor("umrah_participants", p.id), day(p.created_at), day(p.updated_at), p.notes]; });
    return { name: "العمرة", columns: [...officeCols, { header: "الرحلة", width: 18 }, { header: "حالة الرحلة", width: 12 }, ...custCols, { header: "حالة المعتمر", width: 14 }, { header: "الدخول المخطط", width: 12, kind: "date" }, { header: "المغادرة المخططة", width: 12, kind: "date" }, { header: "الدخول الفعلي", width: 12, kind: "date" }, { header: "المغادرة الفعلية", width: 12, kind: "date" }, { header: "أيام الإقامة", width: 10, kind: "number" }, { header: "نوع المدة", width: 10 }, ...attrCols], rows,
      totals: [["عدد المعتمرين", rows.length], ["عدد الرحلات", src.trips.length]] };
  }
  if (kind === "staff") {
    const rows = src.members.filter((m) => !f.employee || m.user_id === f.employee).map((m) => {
      const mine = <T extends { created_at: string; created_by: string | null }>(l: T[]) => l.filter((x) => x.created_by === m.user_id && inPeriod(x.created_at, f)).length;
      const done = src.requests.filter((r) => r.completed_by === m.user_id && inPeriod(r.completed_at, f)).length + src.bookings.filter((b) => b.completed_by === m.user_id && inPeriod(b.completed_at, f)).length;
      const acts = src.activity.filter((a) => a.actor_id === m.user_id && inPeriod(a.created_at, f));
      const pending = src.requests.filter((r) => r.assigned_to === m.user_id && r.status !== "completed" && r.status !== "cancelled").length;
      return [...officeVals(src), m.full_name || m.email || UNKNOWN, m.role === "admin" ? "مدير" : "موظف", m.status === "active" || !m.status ? "نشط" : m.status === "suspended" ? "موقوف" : "مُزال", mine(src.customers), mine(src.requests), mine(src.bookings), done, pending, acts.length, day(acts[0]?.created_at ?? src.activity.find((a) => a.actor_id === m.user_id)?.created_at)];
    });
    return { name: "أداء الموظفين", columns: [...officeCols, { header: "الموظف", width: 22 }, { header: "الدور", width: 9 }, { header: "الحالة", width: 9 }, { header: "عملاء أنشأهم", width: 11, kind: "number" }, { header: "طلبات أنشأها", width: 11, kind: "number" }, { header: "حجوزات أنشأها", width: 11, kind: "number" }, { header: "إنجازات", width: 10, kind: "number" }, { header: "طلبات مفتوحة مسندة", width: 13, kind: "number" }, { header: "إجراءات في الفترة", width: 12, kind: "number" }, { header: "آخر نشاط", width: 12, kind: "date" }], rows, totals: [["عدد الموظفين", rows.length]] };
  }
  if (kind === "activity") {
    const rows = src.activity.filter((a) => inPeriod(a.created_at, f) && (!f.employee || a.actor_id === f.employee) && (!f.action || a.action === f.action))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((a) => [...officeVals(src), a.created_at.slice(0, 16).replace("T", " "), a.actor_name || (a.actor_id ? ctx.person(a.actor_id) : "غير منسوب"), activityEntityLabels[a.entity] ?? a.entity, activityActionLabels[a.action] ?? a.action, a.summary]);
    return { name: "نشاط المكتب", columns: [...officeCols, { header: "التاريخ والوقت", width: 17 }, { header: "المنفذ", width: 20 }, { header: "نوع السجل", width: 12 }, { header: "الإجراء", width: 14 }, { header: "الوصف", width: 30 }], rows, totals: [["عدد الإجراءات", rows.length]] };
  }
  const rows = src.partners.map((p) => [...officeVals(src), p.name, p.status === "active" ? "نشط" : "غير نشط", [p.city, p.country].filter(Boolean).join("، ") || null, p.contact_person, p.phone, src.requests.filter((r) => r.referring_partner_id === p.id && inPeriod(r.created_at, f)).length, src.customers.filter((c) => c.referring_partner_id === p.id).length, p.notes]);
  return { name: "المكاتب الشريكة", columns: [...officeCols, { header: "المكتب الشريك", width: 22 }, { header: "الحالة", width: 10 }, { header: "المدينة", width: 16 }, { header: "جهة الاتصال", width: 16 }, { header: "الهاتف", width: 16, kind: "phone" }, { header: "طلبات محالة", width: 11, kind: "number" }, { header: "عملاء محالون", width: 11, kind: "number" }, { header: "ملاحظات", width: 26 }], rows, totals: [["عدد المكاتب الشريكة", rows.length]] };
}

export type OfficeOverview = { id: string; name: string; is_partner: boolean; city: string | null; country: string | null; customers: number; requests: number; transactions: number; bookings: number; admins: number; employees: number; last_activity_at: string | null; created_at: string };

export function overviewSheet(list: OfficeOverview[]): Sheet {
  const rows = list.map((o) => [o.name, o.is_partner ? "شريك" : "غير شريك", [o.city, o.country].filter(Boolean).join("، ") || null, o.customers, o.requests, o.transactions, o.bookings, o.admins, o.employees, isActive(o.last_activity_at) ? "نشط" : "غير نشط", day(o.last_activity_at), day(o.created_at)]);
  const sum = (k: keyof OfficeOverview) => list.reduce((n, o) => n + Number(o[k] ?? 0), 0);
  return { name: "مقارنة المكاتب", columns: [{ header: "اسم المكتب", width: 24 }, { header: "التصنيف", width: 11 }, { header: "الموقع", width: 16 }, { header: "العملاء", width: 9, kind: "number" }, { header: "الطلبات", width: 9, kind: "number" }, { header: "معاملات بتفاصيل خدمة", width: 12, kind: "number" }, { header: "الحجوزات", width: 9, kind: "number" }, { header: "المديرون", width: 9, kind: "number" }, { header: "الموظفون", width: 9, kind: "number" }, { header: "الحالة", width: 9 }, { header: "آخر نشاط", width: 12, kind: "date" }, { header: "تاريخ التسجيل", width: 12, kind: "date" }], rows,
    totals: [["عدد المكاتب", list.length], ["إجمالي العملاء", sum("customers")], ["إجمالي الطلبات", sum("requests")], ["إجمالي الحجوزات", sum("bookings")]] };
}

/** An office is "active" when it has any recorded activity in the last 30 days. */
export function isActive(last: string | null | undefined, now = Date.now()) {
  return !!last && now - new Date(last).getTime() <= 30 * 86_400_000;
}

export type OfficeFilters = { search?: string; kind?: string; state?: string };
export function filterOffices<T extends OfficeOverview>(list: T[], filters: OfficeFilters, now = Date.now()): T[] {
  const query = filters.search?.trim().toLocaleLowerCase() ?? "";
  return list.filter((office) => (!query || [office.name, office.city ?? ""].some((value) => value.toLocaleLowerCase().includes(query)))
    && (!filters.kind || (filters.kind === "partner") === office.is_partner)
    && (!filters.state || (filters.state === "active") === isActive(office.last_activity_at, now)));
}
