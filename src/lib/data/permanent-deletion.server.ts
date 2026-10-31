import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertStorageAbsent } from './storage-absence';
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
    return fetch(input, { ...init, headers, signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(init?.signal ? [init.signal] : [])]) });
  } } });
}

export function localDeletionTransport(admin: SupabaseClient): DeletionTransport {
  const rpc = async (name: string, id: string, attempt?: number) => {
    const result = await admin.rpc(name, { _job: id, ...(attempt === undefined ? {} : { _attempt: attempt }) });
    if (result.error) throw new Error('Deletion operation failed');
    return result.data;
  };
  return {
    renew: async job => { await rpc('renew_deletion', job.id, job.attempts); },
    claim: async id => await rpc('claim_deletion', id) as DeletionJob,
    paths: async job => {
      const paths: string[] = [];
      for (let offset = 0; ; offset += 500) {
        await rpc('renew_deletion', job.id, job.attempts);
        const result = await admin.rpc('deletion_paths', { _job: job.id }).range(offset, offset + 499);
        if (result.error || !Array.isArray(result.data)) throw new Error('Cannot enumerate Storage paths');
        paths.push(...result.data.map((row: { path: string }) => row.path));
        if (result.data.length < 500) break;
      }
      return paths;
    },
    remove: async (paths, job) => {
      const result = await admin.storage.from('documents').remove(paths);
      if (result.error) throw new Error('Storage removal failed');
      // Confirm through Storage itself as well as the database catalog.
      for (const path of paths) {
        await rpc('renew_deletion', job.id, job.attempts);
        const check = await admin.storage.from('documents').exists(path);
        assertStorageAbsent(check);
      }
    },
    remaining: async job => {
      await rpc('renew_deletion', job.id, job.attempts);
      const paths = await rpc('deletion_remaining', job.id) as { path: string }[];
      return paths.map(row => row.path);
    },
    finish: async (id, attempt) => { await rpc('finish_deletion', id, attempt); },
    failed: async (id, attempt) => { await rpc('fail_deletion', id, attempt); },
  };
}

export async function runLocalDeletion(input: { officeId: string; targetId: string; kind: 'customer' | 'office' | 'document' }, caller: SupabaseClient) {
  const admin = localAdmin();
  const result = input.kind === 'document'
    ? await caller.rpc('begin_document_deletion', { _office: input.officeId, _document: input.targetId })
    : await caller.rpc('begin_permanent_deletion', { _office: input.officeId, _kind: input.kind, _target: input.targetId });
  if (result.error || typeof result.data !== 'string') throw new Error('تعذّر بدء الحذف؛ تحقق من الصلاحية أو العملية المعلقة.');
  try { await processDeletion(result.data, localDeletionTransport(admin)); }
  catch { throw new Error('الحذف لم يكتمل. حُفظت العملية لإعادة المحاولة؛ لا تُعد البيانات محذوفة بالكامل.'); }
  return { completed: true, jobId: result.data };
}

/** Invoked by the independent local worker, not by browser page load or production cron. */
export async function retryLocalDeletions() {
  const admin = localAdmin();
  const now=new Date().toISOString();
  const result = await admin.from('deletion_jobs').select('id').neq('status', 'completed').lte('retry_at', now).or(`lease_until.is.null,lease_until.lte.${now}`).order('retry_at').limit(100);
  if (result.error) throw new Error('Cannot read independent deletion queue');
  for (const job of result.data ?? []) {
    try { await processDeletion(job.id, localDeletionTransport(admin)); }
    catch { /* persisted pending state or lease recovery; never report completion */ }
  }
  return result.data?.length ?? 0;
}