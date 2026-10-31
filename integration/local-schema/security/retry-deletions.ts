/** Independent runtime only. Never run with hosted credentials. */
import { retryLocalDeletions } from '../../../src/lib/data/permanent-deletion.server';
import { assertLocalDeletionEnvironment } from '../../../src/lib/data/permanent-deletion';
import { runRetryLoop } from './retry-loop';
assertLocalDeletionEnvironment(process.env['LOCAL_PERMANENT_DELETION'],process.env['SUPABASE_URL']);
if(!process.env['LOCAL_DELETION_SERVICE_KEY'])throw new Error('Independent local credentials required');
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
await runRetryLoop(retryLocalDeletions,()=>stopping,ms=>new Promise(resolve=>setTimeout(resolve,ms)),()=>console.error('Independent deletion queue unavailable; retrying.'));