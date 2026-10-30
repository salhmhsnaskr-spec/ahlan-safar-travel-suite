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
export function buildDemoPerformance(db: { customers: import('./domain').Customer[]; requests: import('./domain').TravelRequest[]; bookings: import('./domain').Booking[]; members: import('./domain').Member[]; activity?: import('./domain').ActivityRow[] }): PerformanceData {
  const entries: PerformanceEntry[] = [];
  const activity = (db.activity ?? []).map(a => ({ id:a.id, actor_id:a.actor_id, actor_name:a.actor_name, entity:a.entity, entity_id:a.entity_id, action:a.action, created_at:a.created_at }));
  for (const [entity, rows] of [['customers',db.customers],['requests',db.requests],['bookings',db.bookings]] as const) {
    for (const row of rows) {
      const status = 'status' in row ? row.status : null;
      const service_id = 'service_id' in row ? row.service_id : null;
      const label = 'full_name' in row ? row.full_name : `${entity === 'requests' ? 'REQ' : 'BK'}-${String(row.number).padStart(4,'0')}`;
      const add = (suffix: string, actor_id: string | null, at: string) => entries.push({metric: `${entity}_${suffix}` as Metric, actor_id, at, entity, entity_id:row.id, label, status, service_id});
      add('created', row.created_by, row.created_at);
      if ('completed_by' in row && status === 'completed') add('completed',row.completed_by,row.completed_at ?? row.created_at);
      if ('cancelled_by' in row && status === 'cancelled') add('cancelled',row.cancelled_by,row.cancelled_at ?? row.created_at);
      if (status && status !== 'completed' && status !== 'cancelled') add('pending','assigned_to' in row ? row.assigned_to : 'assigned_employee_id' in row ? row.assigned_employee_id : null,row.created_at);
    }
  }
  for (const a of db.activity ?? []) {
    if (!a.entity_id || !['updated','status','completed','cancelled','reopened'].includes(a.action) || (a.result !== null && a.result !== 'success')) continue;
    const work = entries.find(e => e.entity === a.entity && e.entity_id === a.entity_id);
    entries.push({metric:'modifications',actor_id:a.actor_id,entity:a.entity,entity_id:a.entity_id,label:a.summary ?? a.entity,status:work?.status ?? null,service_id:work?.service_id ?? null,at:a.created_at});
  }
  return {entries,activity,members:db.members.map(m => ({user_id:m.user_id,full_name:m.full_name,status:m.status ?? 'active',role:m.role,last_activity_at:activity.filter(a=>a.actor_id===m.user_id).map(a=>a.created_at).sort().at(-1) ?? null}))};
}
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