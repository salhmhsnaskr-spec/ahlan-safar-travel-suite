import { createMiddleware, createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { assertLocalDeletionEnvironment } from './permanent-deletion';
import { z } from 'zod';

// Gate BEFORE authentication: even a direct RPC call cannot contact hosted Auth.
const independentOnly = createMiddleware().server(async ({ next }) => {
  assertLocalDeletionEnvironment(process.env['LOCAL_PERMANENT_DELETION'], process.env['SUPABASE_URL']);
  assertLocalDeletionEnvironment(process.env['LOCAL_PERMANENT_DELETION'], import.meta.env['VITE_SUPABASE_URL']);
  return next();
});

export const permanentDelete = createServerFn({ method: 'POST' })
  .middleware([independentOnly, requireSupabaseAuth])
  .inputValidator(z.object({ officeId: z.string().uuid(), targetId: z.string().uuid(), kind: z.enum(['customer', 'office']) }))
  .handler(async ({ data, context }) => {
    const { runLocalDeletion } = await import('./permanent-deletion.server');
    // Database authorization uses the caller session, never a role supplied by the browser.
    return runLocalDeletion(data, context.supabase);
  });