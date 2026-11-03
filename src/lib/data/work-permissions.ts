import type { AppRole } from '@/lib/domain';

export type WorkEntity = 'customers' | 'requests' | 'bookings' | 'tasks' | 'documents' | 'umrah_participants' | 'umrah_trips';
export type WorkOperation = 'edit' | 'delete';
export type WorkPermission = { office_id: string; entity: WorkEntity; record_id: string; operation: WorkOperation; grantee_id: string; granted_by: string; owner_id: string | null };
export type WorkRecord = { id: string; office_id: string; assigned_to?: string | null; assigned_employee_id?: string | null; created_by?: string | null };
export type WorkActor = { userId: string; officeId: string; role: AppRole; active: boolean };

/** Current assignee manages the work; unassigned work belongs to whoever created it (mirrors public.work_owner). */
export function workOwner(record: WorkRecord): string | null {
  return record.assigned_employee_id ?? record.assigned_to ?? record.created_by ?? null;
}

export function canReadWork(actor: WorkActor, record: WorkRecord): boolean {
  return actor.active && actor.officeId === record.office_id;
}

export function canManageWork(actor: WorkActor, entity: WorkEntity, record: WorkRecord, operation: WorkOperation, permissions: readonly WorkPermission[]): boolean {
  if (!canReadWork(actor, record)) return false;
  if (actor.role === 'admin' || workOwner(record) === actor.userId) return true;
  return permissions.some(p => p.office_id === record.office_id && p.entity === entity && p.record_id === record.id && p.operation === operation && p.grantee_id === actor.userId && p.owner_id === workOwner(record));
}

export function assertAssignmentUnchanged(actor: WorkActor, before: WorkRecord, after: WorkRecord) {
  if (actor.role !== 'admin' && workOwner(before) !== workOwner(after)) throw new Error('إعادة الإسناد متاحة لمدير المكتب فقط.');
}