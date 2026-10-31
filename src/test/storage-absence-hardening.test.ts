import { expect, it, vi } from 'vitest';
import { assertStorageAbsent } from '@/lib/data/storage-absence';
import { processDeletion, type DeletionTransport } from '@/lib/data/permanent-deletion';

it('removes file then accepts the installed Storage SDK 404 response and finalizes', async () => {
  const calls: string[] = [];
  const transport: DeletionTransport = {
    claim: async () => ({ id:'j',office_id:'o',target_id:'d',kind:'document',status:'running',attempts:1 }),
    paths: async () => ['o/file'],
    remove: async () => { calls.push('remove'); assertStorageAbsent({data:false,error:{status:404,message:'Object not found'}}); },
    remaining: async () => [], finish: async () => {calls.push('finish');}, failed: vi.fn(),
  };
  await processDeletion('j', transport);
  expect(calls).toEqual(['remove','finish']); expect(transport.failed).not.toHaveBeenCalled();
});
it('accepts only exact legacy object-not-found 400 and explicit error-free absence', () => {
  expect(() => assertStorageAbsent({data:false,error:{statusCode:'400',message:'Object not found'}})).not.toThrow();
  expect(() => assertStorageAbsent({data:false,error:null})).not.toThrow();
});
for(const error of [{status:401,message:'Object not found'},{status:403,message:'Object not found'},
  {status:500,message:'Object not found'},{status:400,message:'Bad request'},
  {message:'Object not found'}, {message:'Failed to fetch'}, {name:'AbortError'}]) {
  it(`keeps retry pending for ${JSON.stringify(error)}`, async () => {
    const failed=vi.fn(); const finish=vi.fn();
    const t: DeletionTransport={claim:async()=>({id:'j',office_id:'o',target_id:'d',kind:'document',status:'running',attempts:1}),
      paths:async()=>['o/f'],remove:async()=>assertStorageAbsent({data:false,error}),remaining:async()=>[],finish,failed};
    await expect(processDeletion('j',t)).rejects.toThrow(); expect(failed).toHaveBeenCalledWith('j',1);expect(finish).not.toHaveBeenCalled();
  });
}
it('still rejects an existing file and stops before removal when lease renewal fails',async()=>{
  expect(()=>assertStorageAbsent({data:true,error:null})).toThrow();
  const remove=vi.fn();const failed=vi.fn();
  const t:DeletionTransport={claim:async()=>({id:'j',office_id:'o',target_id:'d',kind:'document',status:'running',attempts:1}),
    paths:async()=>['o/f'],renew:async()=>{throw new Error('lost lease');},remove,remaining:async()=>[],finish:vi.fn(),failed};
  await expect(processDeletion('j',t)).rejects.toThrow('lost lease');expect(remove).not.toHaveBeenCalled();expect(failed).toHaveBeenCalledOnce();
});
it('a lock-conflict finalization retains retry state and a later attempt completes without foreign-office removal',async()=>{
  const state={attempt:0,removed:false};const failed=vi.fn();const finish=vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error('lock unavailable'),{code:'55P03'})).mockResolvedValue(undefined);
  const t:DeletionTransport={claim:async()=>({id:'j',office_id:'o',target_id:'d',kind:'document',status:'running',attempts:++state.attempt}),
    paths:async()=>['o/f'],remove:async paths=>{expect(paths).toEqual(['o/f']);state.removed=true;},remaining:async()=>[],finish,failed};
  await expect(processDeletion('j',t)).rejects.toThrow('lock unavailable');
  expect(state.removed).toBe(true);expect(failed).toHaveBeenCalledWith('j',1);
  await processDeletion('j',t);expect(finish).toHaveBeenLastCalledWith('j',2);
});