import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export type DeletionOutcome = { jobId: string; completed: boolean; remaining: number };

/**
 * Authorization and the database part run as the caller (RLS + work_allowed inside the RPC).
 * Only after the caller's RPC succeeds does the service client remove the recorded file paths.
 */
export const cloudDelete = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ kind: z.enum(['customer', 'document']), targetId: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<DeletionOutcome> => {
    const caller: SupabaseClient = context.supabase;
    const rpc = data.kind === 'customer'
      ? await caller.rpc('begin_customer_deletion', { _customer: data.targetId })
      : await caller.rpc('begin_document_deletion', { _document: data.targetId });
    if (rpc.error || typeof rpc.data !== 'string') throw new Error(rpc.error?.message || 'تعذّر بدء الحذف.');
    const { processDeletionJob } = await import('./cloud-deletion.server');
    return processDeletionJob(rpc.data);
  });

export const retryCloudDeletion = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ jobId: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<DeletionOutcome> => {
    const caller: SupabaseClient = context.supabase;
    // RLS: only office admins or the job's creator can see (and therefore retry) it.
    const job = await caller.from('deletion_jobs').select('id').eq('id', data.jobId).maybeSingle();
    if (job.error || !job.data) throw new Error('لا تملك صلاحية إعادة محاولة هذه العملية.');
    const { processDeletionJob } = await import('./cloud-deletion.server');
    return processDeletionJob(data.jobId);
  });
