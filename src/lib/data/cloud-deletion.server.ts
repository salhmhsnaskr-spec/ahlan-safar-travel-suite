import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { DeletionOutcome } from './cloud-deletion.functions';
import { assertStorageAbsent } from './storage-absence';

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
      try { assertStorageAbsent(check); }
      catch { still.push(path); error = check.error?.message ?? 'ملفات لم يتأكد حذفها'; }
    }
    remaining = still;
  }
  const completed = remaining.length === 0;
  const saved = await supabaseAdmin.from('deletion_jobs').update({
    remaining, status: completed ? 'completed' : 'storage_failed', attempts: (job.data.attempts ?? 0) + 1,
    last_error: completed ? null : (error ?? 'ملفات لم يتأكد حذفها').slice(0, 300), completed_at: completed ? new Date().toISOString() : null,
  }).eq('id', jobId);
  if (saved.error) throw new Error('تعذّر حفظ نتيجة الحذف؛ أعد المحاولة للتحقق من الملفات.');
  return { jobId, completed, remaining: remaining.length };
}
