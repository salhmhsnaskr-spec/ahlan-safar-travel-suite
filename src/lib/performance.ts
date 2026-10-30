export const metricLabels = {
  customers_created: "عملاء أنشأهم", requests_created: "طلبات أنشأها", bookings_created: "حجوزات أنشأها",
  requests_completed: "طلبات مكتملة حاليًا", bookings_completed: "حجوزات مكتملة حاليًا",
  requests_pending: "طلبات مسندة معلقة", bookings_pending: "حجوزات مسندة معلقة",
  requests_cancelled: "طلبات ملغاة", bookings_cancelled: "حجوزات ملغاة", modifications: "عمليات تعديل",
} as const;
export type Metric = keyof typeof metricLabels;
export type PerformanceEntry = { metric: Metric; actor_id: string | null; entity: string; entity_id: string; label: string; status: string | null; at: string; service_id: string | null };
export type PerformanceMember = { user_id: string; full_name: string | null; status: string; role: string; last_activity_at: string | null };
export type PerformanceEvent = { id: string; actor_id: string | null; actor_name: string | null; entity: string; entity_id: string | null; action: string; created_at: string };
export type PerformanceData = { members: PerformanceMember[]; entries: PerformanceEntry[]; activity: PerformanceEvent[] };
export type PerformanceFilters = { from: string; to: string; actor: string; entity: string; status: string; service: string };
export function filterPerformance(data: PerformanceData, f: PerformanceFilters) {
  const from = f.from ? Date.parse(f.from + "T00:00:00Z") : -Infinity;
  const to = f.to ? Date.parse(f.to + "T00:00:00Z") + 86400000 : Infinity;
  return data.entries.filter(e => {
    const time = Date.parse(e.at);
    return time >= from && time < to && (!f.actor || e.actor_id === f.actor) && (!f.entity || e.entity === f.entity) && (!f.status || e.status === f.status) && (!f.service || e.service_id === f.service);
  });
}
export function performanceRange(period: string, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
  if (period === "month") start.setUTCDate(1);
  if (period === "year") { start.setUTCMonth(0); start.setUTCDate(1); }
  return { from: start.toISOString().slice(0,10), to: end.toISOString().slice(0,10) };
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}