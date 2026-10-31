import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertLocalDeletionEnvironment, processDeletion, type DeletionJob, type DeletionTransport } from './permanent-deletion';

function localAdmin() {
  const url = process.env['SUPABASE_URL'];
  assertLocalDeletionEnvironment(process.env['LOCAL_PERMANENT_DELETION'], url);
  const key = process.env['LOCAL_DELETION_SERVICE_KEY'];
  if (!key || !url) throw new Error('Independent local service credentials required');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
    headers.set('apikey', key);
    return fetch(input, { ...init, headers });
  } } });
}

export function localDeletionTransport(admin: SupabaseClient): DeletionTransport {
  const rpc = async (name: string, id: string) => {
    const result = await admin.rpc(name, { _job: id });
    if (result.error) throw new Error('Deletion operation failed');
    return result.data;
  };
  return {
    claim: async id => await rpc('claim_deletion', id) as DeletionJob,
    paths: async job => (await rpc('deletion_paths', job.id) as { path: string }[]).map(row => row.path),
    remove: async paths => {
      const result = await admin.storage.from('documents').remove(paths);
      if (result.error) throw new Error('Storage removal failed');
    },
    remaining: async job => {
      // Actual Storage catalog, not public list pagination or remove() response length.
      const paths = await rpc('deletion_paths', job.id) as { path: string }[];
      const result = await admin.schema('storage').from('objects').select('name').in('name', paths.map(row => row.path)).eq('bucket_id', 'documents');
      if (result.error) throw new Error('Storage absence unverified');
      return (result.data ?? []).map(row => row.name as string);
    },
    finish: async id => { await rpc('finish_deletion', id); },
    failed: async id => { await rpc('fail_deletion', id); },
  };
}

export async function runLocalDeletion(input: { officeId: string; targetId: string; kind: 'customer' | 'office' }, caller: SupabaseClient) {
  const admin = localAdmin();
  const result = await caller.rpc('begin_permanent_deletion', { _office: input.officeId, _kind: input.kind, _target: input.targetId });
  if (result.error || typeof result.data !== 'string') throw new Error('تعذّر بدء الحذف؛ تحقق من الصلاحية أو العملية المعلقة.');
  try { await processDeletion(result.data, localDeletionTransport(admin)); }
  catch { throw new Error('الحذف لم يكتمل. حُفظت العملية لإعادة المحاولة؛ لا تُعد البيانات محذوفة بالكامل.'); }
  return { completed: true, jobId: result.data };
}

/** Invoked by the independent local worker, not by browser page load or production cron. */
export async function retryLocalDeletions() {
  const admin = localAdmin();
  const result = await admin.from('deletion_jobs').select('id').neq('status', 'completed').lte('retry_at', new Date().toISOString());
  if (result.error) throw new Error('Cannot read independent deletion queue');
  for (const job of result.data ?? []) {
    try { await processDeletion(job.id, localDeletionTransport(admin)); }
    catch { /* persisted pending state or lease recovery; never report completion */ }
  }
  return result.data?.length ?? 0;
}