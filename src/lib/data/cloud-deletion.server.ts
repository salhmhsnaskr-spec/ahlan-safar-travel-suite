import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { DeletionOutcome } from './cloud-deletion.functions';

/** Removes the job's remaining Storage paths and records only confirmed removals. Safe to re-run. */
export async function processDeletionJob(jobId: string): Promise<DeletionOutcome> {
  const job = await supabaseAdmin.from('deletion_jobs').select('id, remaining, status, attempts').eq('id', jobId).single();
  if (job.error || !job.data) throw new Error('عملية الحذف غير موجودة.');
  let remaining = [...(job.data.remaining ?? [])];
  let error: string | null = null;
  if (remaining.length) {
    const removed = await supabaseAdmin.storage.from('documents').remove(remaining);
    if (removed.error) error = removed.error.message;
    const still: string[] = [];
    for (const path of remaining) {
      const check = await supabaseAdmin.storage.from('documents').exists(path);
      // Only a definite "not found" counts as removed; any other failure keeps the path for retry.
      if (check.error) {
        const status = (check.error as { status?: number; statusCode?: string | number }).status ?? Number((check.error as { statusCode?: string | number }).statusCode);
        if (status === 404 || status === 400) continue;
        still.push(path); error = check.error.message;
      } else if (check.data) still.push(path);
    }
    remaining = still;
  }
  const completed = remaining.length === 0;
  await supabaseAdmin.from('deletion_jobs').update({
    remaining, status: completed ? 'completed' : 'storage_failed', attempts: (job.data.attempts ?? 0) + 1,
    last_error: completed ? null : (error ?? 'ملفات لم يتأكد حذفها').slice(0, 300), completed_at: completed ? new Date().toISOString() : null,
  }).eq('id', jobId);
  return { jobId, completed, remaining: remaining.length };
}
