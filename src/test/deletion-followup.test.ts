import { expect,it,vi } from 'vitest';
import { runRetryLoop } from '../../integration/local-schema/security/retry-loop';
it('supervised loop survives a queue failure then runs the next retry and stops cleanly',async()=>{
 let stop=false;const warn=vi.fn();const wait=vi.fn(async()=>{});
 const tick=vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async()=>{stop=true;});
 await runRetryLoop(tick,()=>stop,wait,warn);
 expect(tick).toHaveBeenCalledTimes(2);expect(warn).toHaveBeenCalledOnce();expect(wait).toHaveBeenCalledWith(2000);
});