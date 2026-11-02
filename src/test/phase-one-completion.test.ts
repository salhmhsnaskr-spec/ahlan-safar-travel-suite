import { beforeEach, expect, it, vi } from 'vitest';
import { documentWorkOwner } from '@/lib/data/derived-owner';
import { createDemoApi, resetDemoData } from '@/lib/data/demo';
import { runDeletionBatch } from '@/lib/data/deletion-worker';
import type { DeletionJob, DeletionTransport } from '@/lib/data/permanent-deletion';
const rows = {
  customers: [{ id: 'c', office_id: 'o', assigned_to: 'customer-owner' }],
  requests: [{ id: 'r', office_id: 'o', customer_id: 'c', assigned_to: 'request-owner' }],
  bookings: [{ id: 'b', office_id: 'o', customer_id: 'c', request_id: 'r', assigned_employee_id: null }],
};
beforeEach(() => { localStorage.clear(); resetDemoData(); });
it('booking-only document falls back to its linked request owner, not customer or uploader', () => {
  expect(documentWorkOwner('o', { booking_id: 'b', uploaded_by: 'uploader' }, rows)).toBe('request-owner');
});
it('missing and cross-office document parents fail closed', () => {
  expect(() => documentWorkOwner('other-office', { booking_id: 'b' }, rows)).toThrow();
  expect(() => documentWorkOwner('o', { request_id: 'missing' }, rows)).toThrow();
});
it('contradictory customer links fail before file changes', () => {
  expect(() => documentWorkOwner('o', { booking_id: 'b', customer_id: 'other' }, { ...rows, customers: [...rows.customers, { id: 'other', office_id: 'o', assigned_to: 'other' }] })).toThrow();
});
it('delete uses canonical document metadata, ignoring a forged storage path', async () => {
  const api = createDemoApi();
  await api.uploadDocument(new File(['x'], 'safe.txt'), {});
  const doc = (await api.listDocuments()).find(d => d.file_name === 'safe.txt');
  if (!doc) throw new Error('fixture missing');
  await api.deleteDocument({ ...doc, storage_path: 'forged/path', uploaded_by: 'forged-user' });
  expect((await api.listDocuments()).some(d => d.id === doc.id)).toBe(false);
});
it('employee cannot reparent an assigned request to a colleague customer', async () => {
  const api = createDemoApi({ userId: 'demo-emp-1', role: 'employee' });
  const own = (await api.listRequests()).find(r => r.assigned_to === api.userId);
  const other = (await api.listCustomers()).find(c => c.assigned_to === 'demo-emp-2');
  if (!own || !other) throw new Error('fixtures missing');
  await expect(api.saveRequest({ id: own.id, customer_id: other.id })).rejects.toThrow('تغيير علاقات العمل');
  expect((await api.listRequests()).find(r => r.id === own.id)?.customer_id).toBe(own.customer_id);
});
function transport(paths: string[]): DeletionTransport {
  const job: DeletionJob = { id: 'j', office_id: 'o', target_id: 'c', kind: 'customer', status: 'running', attempts: 2 };
  const remaining = new Set(paths);
  return { claim: vi.fn(async () => job), paths: async () => paths,
    remove: vi.fn(async batch => { batch.forEach(p => remaining.delete(p)); }),
    remaining: async () => [...remaining], renew: vi.fn(async () => {}), finish: vi.fn(async () => {}), failed: vi.fn(async () => {}) };
}
it('worker resumes a 101-file job without repeating already removed files', async () => {
  const t = transport(Array.from({ length: 101 }, (_, i) => `o/${i}`));
  const queue = { due: vi.fn(async () => ['j']) };
  expect(await runDeletionBatch(queue, t, () => 0)).toEqual({ completed: 0, deferred: 1 });
  expect(t.finish).not.toHaveBeenCalled();
  expect(t.failed).toHaveBeenCalledWith('j', 2);
  expect(await runDeletionBatch(queue, t, () => 0)).toEqual({ completed: 1, deferred: 0 });
  expect(t.remove).toHaveBeenLastCalledWith(['o/100'], expect.objectContaining({ attempts: 2 }));
  expect(t.finish).toHaveBeenCalledOnce();
});
it('worker processes at most three jobs per invocation', async () => {
  const t = transport([]);
  await runDeletionBatch({ due: async () => ['1','2','3','4'] }, t, () => 0);
  expect(t.claim).toHaveBeenCalledTimes(3);
});
it('storage failure cannot announce completion and remains deferred', async () => {
  const t = transport(['o/file']);
  t.remove = vi.fn(async () => { throw new Error('network'); });
  expect(await runDeletionBatch({ due: async () => ['j'] }, t, () => 0)).toEqual({ completed: 0, deferred: 1 });
  expect(t.finish).not.toHaveBeenCalled();
  expect(t.failed).toHaveBeenCalledOnce();
});
it('worker rejects paths not declared in the frozen job', async () => {
  const t = transport(['o/file']);
  t.remaining = async () => ['o/unrelated'];
  expect(await runDeletionBatch({ due: async () => ['j'] }, t, () => 0)).toEqual({ completed: 0, deferred: 1 });
  expect(t.remove).not.toHaveBeenCalled();
});