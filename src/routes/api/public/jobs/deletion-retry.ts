import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { assertLocalDeletionEnvironment } from '@/lib/data/permanent-deletion';

export const Route = createFileRoute('/api/public/jobs/deletion-retry')({
  server: { handlers: { POST: async ({ request }) => {
    // No Auth, database or Storage request before the independent-environment gate.
    try {
      assertLocalDeletionEnvironment(process.env['LOCAL_PERMANENT_DELETION'], process.env['SUPABASE_URL']);
      assertLocalDeletionEnvironment(process.env['LOCAL_PERMANENT_DELETION'], import.meta.env['VITE_SUPABASE_URL']);
    } catch { return Response.json({ error: 'Deletion worker disabled' }, { status: 503 }); }
    const denied = await authenticateCronRequest(request);
    if (denied) return denied;
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return new Response(null, { status: 415 });
    let body: unknown;
    try { body = await request.json(); } catch { return new Response(null, { status: 400 }); }
    if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 || !('kind' in body) || body.kind !== 'deletion-retry') return new Response(null, { status: 400 });
    try {
      const { retryLocalDeletions } = await import('@/lib/data/permanent-deletion.server');
      return Response.json(await retryLocalDeletions());
    } catch { return Response.json({ error: 'Deletion retry deferred' }, { status: 503 }); }
  } } },
});