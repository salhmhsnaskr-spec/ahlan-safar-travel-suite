import { expect, it, vi } from 'vitest';
import { assertLocalDeletionEnvironment, processDeletion, type DeletionTransport } from '@/lib/data/permanent-deletion';
import { createDemoApi } from '@/lib/data/demo';
function transport() {
 const remaining = new Set(['office/file.pdf']);
 const state = { status: 'pending', attempts: 0 };
 const t: DeletionTransport = {
  claim: vi.fn(async () => ({id:'job',office_id:'office',target_id:'customer',kind:'customer' as const,...state,attempts:++state.attempts})),
  paths: vi.fn(async () => ['office/file.pdf']),
  remove: vi.fn(async (paths: string[]) => { paths.forEach(path => remaining.delete(path)); }),
  remaining: vi.fn(async () => [...remaining]),
  finish: vi.fn(async () => {state.status='completed';}),
  failed: vi.fn(async () => {state.status='pending';}),
 };
 return { t, remaining, state };
}
for (const url of ['https://production.example','http://evil.localhost','http://127.0.0.1.evil.test']) it(`rejects nonlocal endpoint ${url}`,()=>{
 expect(()=>assertLocalDeletionEnvironment('1',url)).toThrow();
});
it('allows explicitly enabled independent loopback only',()=>{
 expect(()=>assertLocalDeletionEnvironment('1','http://127.0.0.1:54321')).not.toThrow();
 expect(()=>assertLocalDeletionEnvironment(undefined,'http://127.0.0.1:54321')).toThrow();
});
it('retains pending job on Storage failure then completes a later retry',async()=>{
 const {t,state,remaining}=transport();
 vi.mocked(t.remove).mockRejectedValueOnce(new Error('Storage failed'));
 await expect(processDeletion('job',t)).rejects.toThrow('Storage failed');
 expect(t.finish).not.toHaveBeenCalled(); expect(state.status).toBe('pending'); expect(remaining.size).toBe(1);
 await processDeletion('job',t);
 expect(state.status).toBe('completed');expect(remaining.size).toBe(0);expect(state.attempts).toBe(2);
});
it('refuses false-success Storage removal',async()=>{
 const {t}=transport();vi.mocked(t.remove).mockResolvedValue(undefined);
 await expect(processDeletion('job',t)).rejects.toThrow('not confirmed');expect(t.finish).not.toHaveBeenCalled();
});
it('rejects another office path before removal',async()=>{
 const {t}=transport();vi.mocked(t.paths).mockResolvedValue(['another/file.pdf']);
 await expect(processDeletion('job',t)).rejects.toThrow('Invalid Storage scope');expect(t.remove).not.toHaveBeenCalled();
});
it('retries database finalization after successful file removal',async()=>{
 const {t,state}=transport();vi.mocked(t.finish).mockRejectedValueOnce(new Error('database failed'));
 await expect(processDeletion('job',t)).rejects.toThrow();expect(state.status).toBe('pending');
 await processDeletion('job',t);expect(state.status).toBe('completed');
});
it('demo cascade removes linked records without changing another customer or shared group',async()=>{
 window.localStorage.clear();const api=createDemoApi();
 const customer=(await api.listCustomers())[0];expect(customer).toBeDefined();if(!customer)throw new Error('Missing fixture');
 const before=(await api.listCustomers()).length;
 const trip=await api.saveTrip({name:'shared group'});
 await api.saveParticipant({trip_id:trip.id,customer_id:customer.id});
 await api.deleteCustomer(customer.id);
 expect((await api.listCustomers()).length).toBe(before-1);
 for(const rows of [await api.listRequests(),await api.listBookings(),await api.listTasks(),await api.listDocuments(),await api.listParticipants()])
 expect(rows.some(row=>row.customer_id===customer.id)).toBe(false);
 expect((await api.listTrips()).some(row=>row.id===trip.id)).toBe(true);
 expect((await api.listActivity()).some(row=>row.entity_id===customer.id)).toBe(false);
});
it('demo office erasure empties office collections but preserves shared services',async()=>{
 window.localStorage.clear();const api=createDemoApi();await api.deleteOffice();
 for(const rows of [await api.listCustomers(),await api.listRequests(),await api.listBookings(),await api.listTasks(),await api.listDocuments(),await api.listParticipants(),await api.listTrips(),await api.listMembers(),await api.listPartners(),await api.listActivity()]) expect(rows).toEqual([]);
 expect((await api.listServices()).every(row=>row.office_id===null)).toBe(true);
 expect((await api.listServices()).length).toBeGreaterThan(0);
});