import type { DataApi, DocumentLinks } from './api';
import type { DocumentRow, UmrahParticipant } from '@/lib/domain';
import { assertAssignmentUnchanged, canManageWork, workOwner, type WorkEntity, type WorkOperation, type WorkRecord } from './work-permissions';
import { documentWorkOwner } from './derived-owner';

const DENIED = 'لا تملك إذن هذه العملية على هذا السجل.';

/** UX/API guard only: database policies remain the direct-access security boundary. Mirrors work_owner/work_allowed in the staged SQL. */
export function authorizeWorkApi(api: DataApi, officeId: string): DataApi {
  const actor = { officeId, userId: api.userId, role: api.role, active: true };
  const lists = { customers: api.listCustomers, requests: api.listRequests, bookings: api.listBookings, tasks: api.listTasks };
  type Direct = keyof typeof lists;
  const permissions = () => api.listWorkPermissions();

  async function find(entity: Direct, id: string): Promise<WorkRecord | undefined> {
    return (await lists[entity]()).find(r => r.id === id);
  }
  async function check(entity: Direct, id: string, operation: WorkOperation) {
    const row = await find(entity, id);
    if (!row || !canManageWork(actor, entity, row, operation, await permissions())) throw new Error(DENIED);
    return row;
  }
  /** Document owner: booking assignee, else request assignee, else customer assignee; unlinked files belong to their uploader. */
  async function documentOwner(links: DocumentLinks & { uploaded_by?: string | null }): Promise<string | null> {
    const [customers, requests, bookings] = await Promise.all([api.listCustomers(), api.listRequests(), api.listBookings()]);
    return documentWorkOwner(officeId, links, { customers, requests, bookings });
  }
  async function participantOwner(customerId: string) {
    const customer = await find('customers', customerId);
    if (!customer) throw new Error(DENIED);
    return workOwner(customer);
  }
  async function derived(entity: WorkEntity, id: string, owner: string | null, operation: WorkOperation) {
    if (!canManageWork(actor, entity, { id, office_id: officeId, assigned_to: owner }, operation, await permissions())) throw new Error(DENIED);
  }
  async function tripOwner(id: string) {
    const trip = (await api.listTrips()).find(t => t.id === id && t.office_id === officeId);
    if (!trip) throw new Error(DENIED);
    return trip.created_by ?? null;
  }
  /** Pilgrim work is manageable by the pilgrim's (customer's) manager or by the trip's manager. */
  async function participantAllowed(entity: WorkEntity, id: string, customerId: string, tripId: string, operation: WorkOperation) {
    const perms = await permissions();
    const viaCustomer = canManageWork(actor, entity, { id, office_id: officeId, assigned_to: await participantOwner(customerId) }, operation, perms);
    const viaTrip = canManageWork(actor, 'umrah_trips', { id: tripId, office_id: officeId, assigned_to: await tripOwner(tripId) }, operation, perms);
    if (!viaCustomer && !viaTrip) throw new Error(DENIED);
  }
  function adminOnly(message: string) { if (actor.role !== 'admin') throw new Error(message); }

  function guardSave<I extends { id?: string | undefined }, O>(entity: Direct, save: (input: I) => Promise<O>) {
    return async (input: I) => {
      if (input.id) {
        const row = await check(entity, input.id, 'edit');
        assertAssignmentUnchanged(actor, row, { ...row, ...input } as WorkRecord);
        if (actor.role !== 'admin') {
          const before = row as WorkRecord & DocumentLinks;
          const after = input as I & DocumentLinks;
          for (const field of ['customer_id', 'request_id', 'booking_id'] as const) {
            if (Object.prototype.hasOwnProperty.call(after, field) && after[field] !== before[field]) throw new Error('تغيير علاقات العمل متاح لمدير المكتب فقط.');
          }
        }
      } else if (actor.role !== 'admin') {
        const assignment = input as I & { assigned_to?: string | null; assigned_employee_id?: string | null };
        const id = assignment.assigned_employee_id ?? assignment.assigned_to;
        if (id && id !== actor.userId) throw new Error('إسناد العمل لزميل متاح لمدير المكتب فقط.');
      }
      return save(input);
    };
  }
  function guardDelete(entity: Direct, remove: (id: string) => Promise<void>) {
    return async (id: string) => { await check(entity, id, 'delete'); await remove(id); };
  }

  return {
    ...api,
    saveCustomer: guardSave('customers', api.saveCustomer), saveRequest: guardSave('requests', api.saveRequest),
    saveBooking: guardSave('bookings', api.saveBooking), saveTask: guardSave('tasks', api.saveTask),
    deleteCustomer: guardDelete('customers', api.deleteCustomer), deleteRequest: guardDelete('requests', api.deleteRequest),
    deleteBooking: guardDelete('bookings', api.deleteBooking), deleteTask: guardDelete('tasks', api.deleteTask),
    deleteOffice: async () => { adminOnly('حذف المكتب متاح لمديره فقط.'); await api.deleteOffice(); },
    uploadDocument: async (file, links) => {
      if (links.customer_id || links.request_id || links.booking_id) await documentOwner(links);
      if (actor.role !== 'admin' && (links.customer_id || links.request_id || links.booking_id)) {
        const owner = await documentOwner(links);
        if (owner !== actor.userId) {
          const parent: [Direct, string] = links.booking_id ? ['bookings', links.booking_id] : links.request_id ? ['requests', links.request_id] : ['customers', links.customer_id as string];
          await check(parent[0], parent[1], 'edit');
        }
      }
      await api.uploadDocument(file, links);
    },
    deleteDocument: async (doc: DocumentRow) => {
      const stored = (await api.listDocuments()).find(d => d.id === doc.id && d.office_id === officeId);
      if (!stored) throw new Error(DENIED);
      await derived('documents', stored.id, await documentOwner(stored), 'delete');
      await api.deleteDocument(stored);
    },
    saveTrip: async input => {
      if (input.id) await derived('umrah_trips', input.id, await tripOwner(input.id), 'edit');
      return api.saveTrip(input);
    },
    deleteTrip: async id => { await derived('umrah_trips', id, await tripOwner(id), 'delete'); await api.deleteTrip(id); },
    saveParticipant: async input => {
      const existing = input.id ? (await api.listParticipants()).find(p => p.id === input.id) : undefined;
      if (input.id && !existing) throw new Error(DENIED);
      const customerId = existing?.customer_id ?? input.customer_id;
      if (existing && input.customer_id && input.customer_id !== existing.customer_id) adminOnly('نقل المعتمر لعميل آخر متاح لمدير المكتب فقط.');
      await participantAllowed(existing ? 'umrah_participants' : 'customers', existing?.id ?? customerId, customerId, existing?.trip_id ?? input.trip_id, 'edit');
      return api.saveParticipant(input);
    },
    deleteParticipant: async id => {
      const row: UmrahParticipant | undefined = (await api.listParticipants()).find(p => p.id === id);
      if (!row) throw new Error(DENIED);
      await participantAllowed('umrah_participants', id, row.customer_id, row.trip_id, 'delete');
      await api.deleteParticipant(id);
    },
    saveOffice: async input => { adminOnly('إعدادات المكتب متاحة للمدير فقط.'); await api.saveOffice(input); },
    uploadLogo: async file => { adminOnly('إعدادات المكتب متاحة للمدير فقط.'); await api.uploadLogo(file); },
    removeLogo: async () => { adminOnly('إعدادات المكتب متاحة للمدير فقط.'); await api.removeLogo(); },
    setWorkPermission: async input => {
      if (input.granteeId === actor.userId) throw new Error('لا يمكن منح إذن لنفسك.');
      let owner: string | null;
      if (input.entity === 'customers' || input.entity === 'requests' || input.entity === 'bookings' || input.entity === 'tasks') {
        const row = await find(input.entity, input.recordId);
        if (!row) throw new Error(DENIED);
        owner = workOwner(row);
      } else if (input.entity === 'documents') {
        const doc = (await api.listDocuments()).find(d => d.id === input.recordId);
        if (!doc) throw new Error(DENIED);
        owner = await documentOwner(doc);
      } else if (input.entity === 'umrah_participants') {
        const p = (await api.listParticipants()).find(x => x.id === input.recordId);
        if (!p) throw new Error(DENIED);
        owner = await participantOwner(p.customer_id);
      } else owner = await tripOwner(input.recordId);
      if (actor.role !== 'admin' && owner !== actor.userId) throw new Error('منح الإذن متاح للمسؤول الحالي أو مدير المكتب فقط.');
      await api.setWorkPermission({ ...input, ownerId: owner });
    },
  };
}
