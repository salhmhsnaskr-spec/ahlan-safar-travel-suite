/** Browser-safe orchestration. Adapters own authorization, durable state and file verification. */
export type DeletionJob = { id: string; office_id: string | null; kind: "customer" | "office"; target_id: string | null; status: string; attempts: number };
export interface DeletionTransport {
  claim(id: string): Promise<DeletionJob>;
  paths(job: DeletionJob): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
  remaining(job: DeletionJob): Promise<string[]>;
  finish(id: string): Promise<void>;
  failed(id: string): Promise<void>;
}

export function assertLocalDeletionEnvironment(enabled: string | undefined, url: string | undefined) {
  if (enabled !== "1" || !url) throw new Error("الحذف الشامل غير مفعّل؛ يلزم تجهيز البيئة المستقلة أولًا.");
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("الحذف الشامل مسموح في البيئة المحلية المستقلة فقط.");
  }
}

export async function processDeletion(id: string, transport: DeletionTransport) {
  const job = await transport.claim(id);
  if (job.status === 'completed') return;
  try {
    if (!job.office_id || !job.target_id) throw new Error('Invalid deletion scope');
    const paths = await transport.paths(job);
    for (let offset = 0; offset < paths.length; offset += 100) {
      const batch = paths.slice(offset, offset + 100);
      if (batch.some(path => !path.startsWith(`${job.office_id}/`) || path.includes('..') || path.includes('\\'))) throw new Error('Invalid Storage scope');
      await transport.remove(batch);
    }
    if ((await transport.remaining(job)).length) throw new Error('Storage deletion not confirmed');
    await transport.finish(id);
  } catch (error) {
    // Durable retry state is mandatory; never swallow failure to persist it.
    await transport.failed(id);
    throw error;
  }
}