import { processDeletion, type DeletionTransport } from './permanent-deletion';

export interface DeletionQueue { due(limit: number): Promise<string[]> }
/** One bounded invocation. Failures remain durable; the queue is read server-side only. */
export async function runDeletionBatch(queue: DeletionQueue, transport: DeletionTransport, now = Date.now) {
  const deadline = now() + 20_000;
  const ids = await queue.due(3);
  let completed = 0, deferred = 0;
  for (const id of ids.slice(0, 3)) {
    if (now() >= deadline) break;
    try { await processDeletion(id, transport, { maxPaths: 100, deadline, now }); completed++; }
    catch { deferred++; }
  }
  return { completed, deferred };
}