import type { Json } from '@/integrations/supabase/types';

export const emptyWorkAttribution = { updated_by: null };
export const emptyTerminalAttribution = { completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null };

/** Current terminal state counts once; history is retained separately, never summed. */
export function stampDemoWork<T extends { status?: string; created_by?: string | null; created_at: string }>(
  old: T | undefined, next: T, actor: string, now: string,
) {
  const stamped = { ...next, created_by: old?.created_by ?? actor, created_at: old?.created_at ?? next.created_at, updated_by: old ? actor : null };
  if (!('status' in next) || next.status === 'done') return stamped;
  if (old && old.status === next.status) return {
    ...stamped,
    ...Object.fromEntries(Object.keys(emptyTerminalAttribution).map((key) => [key, (old as Record<string, unknown>)[key] ?? null])),
  };
  return { ...stamped, ...emptyTerminalAttribution,
    ...(next.status === 'completed' ? { completed_by: actor, completed_at: now } : {}),
    ...(next.status === 'cancelled' ? { cancelled_by: actor, cancelled_at: now } : {}),
  };
}

export function auditAction(old: Record<string, unknown> | undefined, next: Record<string, unknown> | undefined) {
  if (!old) return 'created';
  if (!next) return 'deleted';
  if (old.status === next.status) return 'updated';
  if (next.status === 'completed' || next.status === 'done') return 'completed';
  if (next.status === 'cancelled') return 'cancelled';
  if (old.status === 'completed' || old.status === 'done') return 'reopened';
  return 'status';
}

const safeFields = new Set(['id','office_id','number','status','role','user_id','source','priority','assigned_to','assigned_employee_id','customer_id','request_id','booking_id','service_id','referring_partner_id','trip_id','task_type','service_date','due_at','arrival_at','planned_start','planned_end','planned_entry','planned_exit','actual_entry','actual_exit','created_by','updated_by','completed_by','completed_at','cancelled_by','cancelled_at','created_at','updated_at','status_changed_at','is_active','sort_order','size_bytes','mime_type']);
export function safeAuditValues(row: Record<string, unknown> | undefined): Json {
  return row ? Object.fromEntries(Object.entries(row).filter(([key]) => safeFields.has(key))) as Json : null;
}

export function auditObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}