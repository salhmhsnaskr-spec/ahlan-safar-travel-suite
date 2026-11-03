import { beforeEach, expect, it } from 'vitest';
import { createDemoApi, resetDemoData } from '@/lib/data/demo';
import { canManageWork, canReadWork, type WorkPermission } from '@/lib/data/work-permissions';
import { customerClosure } from '@/lib/data/customer-closure';
const actor = { userId: 'B', officeId: 'one', role: 'employee' as const, active: true };
const row = { id: 'customer', office_id: 'one', assigned_to: 'C', created_by: 'B' };
const permission: WorkPermission = { office_id: 'one', entity: 'customers', record_id: 'customer', operation: 'edit', grantee_id: 'B', granted_by: 'C', owner_id: 'C' };
beforeEach(() => { localStorage.clear(); resetDemoData(); });
it('reads colleague work but never another office', () => {
  expect(canReadWork(actor, row)).toBe(true);
  expect(canReadWork(actor, { ...row, office_id: 'two' })).toBe(false);
});
it('current assignee wins over creator; unassigned work belongs to its creator; unknown owner only to admin', () => {
  expect(canManageWork(actor, 'customers', row, 'edit', [])).toBe(false);
  expect(canManageWork(actor, 'customers', { ...row, assigned_to: null }, 'delete', [])).toBe(true);
  expect(canManageWork(actor, 'customers', { ...row, assigned_to: null, created_by: null }, 'edit', [])).toBe(false);
  expect(canManageWork({ ...actor, role: 'admin' }, 'customers', { ...row, assigned_to: null, created_by: null }, 'delete', [])).toBe(true);
});
it('edit permission does not grant delete or another record', () => {
  expect(canManageWork(actor, 'customers', row, 'edit', [permission])).toBe(true);
  expect(canManageWork(actor, 'customers', row, 'delete', [permission])).toBe(false);
  expect(canManageWork(actor, 'customers', { ...row, id: 'other' }, 'edit', [permission])).toBe(false);
});
it('reassignment invalidates old owner delegation and inactive actors have no authority', () => {
  expect(canManageWork(actor, 'customers', { ...row, assigned_to: 'D' }, 'edit', [permission])).toBe(false);
  expect(canManageWork({ ...actor, active: false }, 'customers', { ...row, assigned_to: 'B' }, 'edit', [])).toBe(false);
});
it('demo owner grants edit only, cannot delegate again, revocation denies subsequent editing', async () => {
  const owner = createDemoApi({ userId: 'demo-emp-1', role: 'employee' });
  const colleague = createDemoApi({ userId: 'demo-emp-2', role: 'employee' });
  const own = (await owner.listCustomers()).find(c => c.assigned_to === owner.userId);
  if (!own) throw new Error('fixture missing');
  await expect(colleague.saveCustomer({ id: own.id, full_name: 'denied' })).rejects.toThrow();
  await owner.setWorkPermission({ entity: 'customers', recordId: own.id, granteeId: colleague.userId, operation: 'edit', allow: true });
  await colleague.saveCustomer({ id: own.id, full_name: 'permitted' });
  expect((await owner.listCustomers()).find(c => c.id === own.id)?.full_name).toBe('permitted');
  await expect(colleague.deleteCustomer(own.id)).rejects.toThrow();
  await expect(colleague.setWorkPermission({ entity: 'customers', recordId: own.id, granteeId: owner.userId, operation: 'edit', allow: true })).rejects.toThrow();
  await owner.setWorkPermission({ entity: 'customers', recordId: own.id, granteeId: colleague.userId, operation: 'edit', allow: false });
  await expect(colleague.saveCustomer({ id: own.id, full_name: 'revoked' })).rejects.toThrow();
});
it('assigned demo employee deletes customer with colleagues dependents and keeps other customers usable', async () => {
  const employee = createDemoApi({ userId: 'demo-emp-2', role: 'employee' });
  const before = await employee.listCustomers();
  const own = before.find(c => c.assigned_to === employee.userId);
  if (!own) throw new Error('fixture missing');
  await employee.deleteCustomer(own.id);
  expect((await employee.listCustomers()).length).toBe(before.length - 1);
  expect((await employee.listBookings()).some(b => b.customer_id === own.id)).toBe(false);
  const retained = (await employee.listCustomers()).find(c => c.assigned_to === employee.userId);
  if (!retained) throw new Error('retained fixture missing');
  await employee.saveCustomer({ id: retained.id, full_name: 'still usable' });
  await expect(employee.deleteOffice()).rejects.toThrow();
});
it('employees cannot reassign their own work', async () => {
  const employee = createDemoApi({ userId: 'demo-emp-1', role: 'employee' });
  const own = (await employee.listCustomers()).find(c => c.assigned_to === employee.userId);
  if (!own) throw new Error('fixture missing');
  await expect(employee.saveCustomer({ id: own.id, full_name: own.full_name, assigned_to: 'demo-emp-2' })).rejects.toThrow('إعادة الإسناد');
});
it('closure includes exclusively linked files by any uploader but excludes independent files', () => {
  const closure = customerClosure('one', 'customer', { requests: [], bookings: [], tasks: [], participants: [], documents: [{ id: 'linked', office_id: 'one', customer_id: 'customer', storage_path: 'one/file' }, { id: 'independent', office_id: 'one', storage_path: 'one/independent' }] });
  expect([...closure.documents]).toEqual(['linked']);
});
it('closure refuses shared paths and conflicting customer links before cleanup', () => {
  const data = { requests: [], bookings: [], tasks: [], participants: [], documents: [{ id: 'linked', office_id: 'one', customer_id: 'customer', storage_path: 'one/file' }, { id: 'shared', office_id: 'one', customer_id: 'other', storage_path: 'one/file' }] };
  expect(() => customerClosure('one', 'customer', data)).toThrow('ملف مشترك');
  expect(() => customerClosure('one', 'customer', { ...data, documents: [], tasks: [{ id: 'bad', office_id: 'two', customer_id: 'customer' }] })).toThrow('علاقات');
});