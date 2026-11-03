import { beforeEach, expect, it } from 'vitest';
import { createDemoApi, resetDemoData } from '@/lib/data/demo';
beforeEach(() => { localStorage.clear(); resetDemoData(); });
const sara = () => createDemoApi({ userId: 'demo-emp-1', role: 'employee' });
const khaled = () => createDemoApi({ userId: 'demo-emp-2', role: 'employee' });
const admin = () => createDemoApi({ userId: 'demo-admin', role: 'admin' });
const file = () => new File(['x'], 'a.pdf', { type: 'application/pdf' });

it('employee cannot attach a document to a colleague customer but can to own', async () => {
  const customers = await sara().listCustomers();
  const own = customers.find(c => c.assigned_to === 'demo-emp-1')!;
  const other = customers.find(c => c.assigned_to === 'demo-emp-2')!;
  await expect(sara().uploadDocument(file(), { customer_id: other.id })).rejects.toThrow();
  await sara().uploadDocument(file(), { customer_id: own.id });
  expect((await sara().listDocuments()).some(d => d.customer_id === own.id)).toBe(true);
});
it('document delete follows the linked customer owner; edit permission alone does not allow delete', async () => {
  const own = (await sara().listCustomers()).find(c => c.assigned_to === 'demo-emp-1')!;
  await sara().uploadDocument(file(), { customer_id: own.id });
  const doc = (await sara().listDocuments()).find(d => d.customer_id === own.id)!;
  await expect(khaled().deleteDocument(doc)).rejects.toThrow();
  await sara().setWorkPermission({ entity: 'documents', recordId: doc.id, granteeId: 'demo-emp-2', operation: 'edit', allow: true });
  await expect(khaled().deleteDocument(doc)).rejects.toThrow();
  await sara().setWorkPermission({ entity: 'documents', recordId: doc.id, granteeId: 'demo-emp-2', operation: 'delete', allow: true });
  await khaled().deleteDocument(doc);
  expect((await sara().listDocuments()).some(d => d.id === doc.id)).toBe(false);
});
it('employees create and manage their own Umrah trips; colleagues need an explicit permission', async () => {
  const trip = await sara().saveTrip({ name: 'رحلة سارة' } as never);
  await sara().saveTrip({ id: trip.id, name: 'رحلة سارة المعدلة' } as never);
  await expect(khaled().saveTrip({ id: trip.id, name: 'x' } as never)).rejects.toThrow();
  await sara().setWorkPermission({ entity: 'umrah_trips', recordId: trip.id, granteeId: 'demo-emp-2', operation: 'edit', allow: true });
  await khaled().saveTrip({ id: trip.id, name: 'بإذن' } as never);
  await expect(khaled().deleteTrip(trip.id)).rejects.toThrow();
  await sara().deleteTrip(trip.id);
});
it('pilgrim add/remove follows the customer owner', async () => {
  const trip = await admin().saveTrip({ name: 'رحلة' } as never);
  const customers = await sara().listCustomers();
  const own = customers.find(c => c.assigned_to === 'demo-emp-1')!;
  const other = customers.find(c => c.assigned_to === 'demo-emp-2')!;
  await expect(sara().saveParticipant({ trip_id: trip.id, customer_id: other.id } as never)).rejects.toThrow();
  const p = await sara().saveParticipant({ trip_id: trip.id, customer_id: own.id } as never);
  await expect(khaled().deleteParticipant(p.id)).rejects.toThrow();
  await sara().deleteParticipant(p.id);
});
it('nobody grants a permission to themselves', async () => {
  const own = (await sara().listCustomers()).find(c => c.assigned_to === 'demo-emp-1')!;
  await expect(sara().setWorkPermission({ entity: 'customers', recordId: own.id, granteeId: 'demo-emp-1', operation: 'delete', allow: true })).rejects.toThrow();
});
