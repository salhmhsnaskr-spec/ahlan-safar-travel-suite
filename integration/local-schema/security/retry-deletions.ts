/** Independent runtime only. Never run with hosted credentials. */
import { retryLocalDeletions } from '../../../src/lib/data/permanent-deletion.server';
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
while (!stopping) {
  await retryLocalDeletions();
  // Local worker only: durable retry_at and leases survive restarts.
  await new Promise(resolve => setTimeout(resolve, 2000));
}