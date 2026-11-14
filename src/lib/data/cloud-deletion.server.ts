import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { DeletionOutcome } from './cloud-deletion.functions';

/** Bounded legacy cleanup; optimistic fencing prevents stale results from overwriting a newer retry. */
export async function processDeletionJob(jobId: string): Promise<DeletionOutcome> {
  const job = await supabaseAdmin.from('deletion_jobs').select('id, office_id, remaining, status, attempts').eq('id', jobId).single();
  if (job.error || !job.data) throw new Error('عملية الحذف غير موجودة.');
  if (job.data.status === 'completed') return { jobId, completed: true, remaining: 0 };
  let remaining = [...(job.data.remaining ?? [])];
  let error: string | null = null;
  if (remaining.some(path => !path.startsWith(`${job.data.office_id}/`) || path.includes('..') || path.includes('\\'))) {
    throw new Error('مسارات الحذف لا تطابق المكتب؛ لم تُحذف ملفات.');
  }
  if (remaining.length) {
    const batch = remaining.slice(0, 100);
    // Even a valid office prefix cannot authorize removing a still-referenced shared object.
    const refs = await supabaseAdmin.from('documents').select('storage_path').in('storage_path', batch);
    if (refs.error) throw new Error('تعذّر التحقق من ارتباط الملفات؛ لم يبدأ حذفها.');
    const protectedPaths = new Set((refs.data ?? []).map(doc => doc.storage_path));
    const removable = batch.filter(path => !protectedPaths.has(path));
    const removed = removable.length ? await supabaseAdmin.storage.from('documents').remove(removable) : { error: null };
    if (removed.error) error = removed.error.message;
    const still: string[] = [...batch.filter(path => protectedPaths.has(path))];
    if (still.length) error = 'بعض الملفات ما زالت مرتبطة بوثائق؛ يلزم مراجعتها.';
    const deadline = Date.now() + 15_000;
    for (let i = 0; i < removable.length; i++) {
      if (Date.now() >= deadline) { still.push(...removable.slice(i)); break; }
      const path = removable[i];
      if (!path) continue;
      // Verify by listing the folder: a HEAD check on a missing object returns an ambiguous 400.
      const slash = path.lastIndexOf('/');
      const folder = path.slice(0, slash), name = path.slice(slash + 1);
      const listed = await supabaseAdmin.storage.from('documents').list(folder, { search: name, limit: 100 });
      if (listed.error) { still.push(path); error = listed.error.message; continue; }
      if ((listed.data ?? []).some(o => o.name === name)) { still.push(path); error = 'ملفات لم يتأكد حذفها'; }
    }
    remaining = [...still, ...remaining.slice(100)];
  }
  const completed = remaining.length === 0;
  const saved = await supabaseAdmin.from('deletion_jobs').update({
    remaining, status: completed ? 'completed' : 'storage_failed', attempts: (job.data.attempts ?? 0) + 1,
    last_error: completed ? null : (error ?? 'ملفات لم يتأكد حذفها').slice(0, 300), completed_at: completed ? new Date().toISOString() : null,
  }).eq('id', jobId).eq('attempts', job.data.attempts).eq('status', job.data.status).select('id').maybeSingle();
  if (saved.error || !saved.data) throw new Error('تعذّر حفظ نتيجة الحذف؛ ربما بدأت محاولة أحدث. أعد المحاولة للتحقق من الملفات.');
  return { jobId, completed, remaining: remaining.length };
}
