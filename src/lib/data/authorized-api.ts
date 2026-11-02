import type { DataApi } from './api';
import { assertAssignmentUnchanged, canManageWork, type WorkEntity, type WorkRecord } from './work-permissions';

/** UX/API guard only: database policies remain the direct-access security boundary. */
export function authorizeWorkApi(api: DataApi, officeId: string): DataApi {
  const actor = { officeId, userId: api.userId, role: api.role, active: true };
  const lists = { customers: api.listCustomers, requests: api.listRequests, bookings: api.listBookings, tasks: api.listTasks };
  async function check(entity: keyof typeof lists, id: string, operation: 'edit' | 'delete') {
    const row = (await lists[entity]()).find(r => r.id === id);
    if (!row || !canManageWork(actor, entity, row, operation, await api.listWorkPermissions())) throw new Error('لا تملك إذن هذه العملية على هذا السجل.');
    return row;
  }
  function guardSave<I extends { id?: string }, O>(entity: keyof typeof lists, save: (input: I) => Promise<O>) {
    return async (input: I) => {
      if (input.id) {
        const row = await check(entity, input.id, 'edit');
        assertAssignmentUnchanged(actor, row, { ...row, ...input } as WorkRecord);
      } else if (actor.role !== 'admin') {
        const assignment = input as I & { assigned_to?: string | null; assigned_employee_id?: string | null };
        const id = assignment.assigned_employee_id ?? assignment.assigned_to;
        if (id && id !== actor.userId) throw new Error('إسناد العمل لزميل متاح لمدير المكتب فقط.');
      }
      return save(input);
    };
  }
  function guardDelete(entity: keyof typeof lists, remove: (id: string) => Promise<void>) {
    return async (id: string) => { await check(entity, id, 'delete'); await remove(id); };
  }
  return {
    ...api,
    saveCustomer: guardSave('customers', api.saveCustomer), saveRequest: guardSave('requests', api.saveRequest),
    saveBooking: guardSave('bookings', api.saveBooking), saveTask: guardSave('tasks', api.saveTask),
    deleteCustomer: guardDelete('customers', api.deleteCustomer), deleteRequest: guardDelete('requests', api.deleteRequest),
    deleteBooking: guardDelete('bookings', api.deleteBooking), deleteTask: guardDelete('tasks', api.deleteTask),
    deleteOffice: async () => { if (actor.role !== 'admin') throw new Error('حذف المكتب متاح لمديره فقط.'); await api.deleteOffice(); },
    setWorkPermission: async input => {
      await check(input.entity as WorkEntity & keyof typeof lists, input.recordId, input.operation);
      const row = (await lists[input.entity as keyof typeof lists]?.())?.find(r => r.id === input.recordId);
      if (!row || (actor.role !== 'admin' && (row.assigned_to ?? ('assigned_employee_id' in row ? row.assigned_employee_id : null)) !== actor.userId)) throw new Error('منح الإذن متاح للمسؤول الحالي أو مدير المكتب فقط.');
      await api.setWorkPermission(input);
    },
  };
}