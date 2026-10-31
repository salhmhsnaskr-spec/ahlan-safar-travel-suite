import { createMiddleware, createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { assertLocalDeletionEnvironment } from './permanent-deletion';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

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

export const deletionStatus = createServerFn({method:'POST'})
 .middleware([independentOnly,requireSupabaseAuth])
 .inputValidator(z.object({officeId:z.string().uuid()}))
 .handler(async({data,context})=>{
  const client:SupabaseClient=context.supabase;
  const result=await client.rpc('deletion_status',{_office:data.officeId});
  if(result.error)throw new Error('تعذّر التحقق من حالة الحذف');
  return result.data as unknown as {pending:boolean;status:string|null};
 });

export const ownerDeletionOffices=createServerFn({method:'POST'})
 .middleware([independentOnly,requireSupabaseAuth])
 .handler(async({context})=>{
  const client:SupabaseClient=context.supabase;
  const result=await client.rpc('owner_deletion_offices');
  if(result.error)throw new Error('تعذّر تحميل المكاتب');
  return result.data as {id:string;name:string}[];
 });