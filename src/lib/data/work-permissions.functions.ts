import { createMiddleware, createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { assertLocalDeletionEnvironment } from './permanent-deletion';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkPermission } from './work-permissions';

const independentOnly = createMiddleware().server(async ({ next }) => {
  assertLocalDeletionEnvironment(process.env['LOCAL_PERMANENT_DELETION'], process.env['SUPABASE_URL']);
  assertLocalDeletionEnvironment(process.env['LOCAL_PERMANENT_DELETION'], import.meta.env['VITE_SUPABASE_URL']);
  return next();
});
export const workPermissions = createServerFn({ method: 'POST' }).middleware([independentOnly, requireSupabaseAuth])
  .inputValidator(z.object({ officeId: z.string().uuid() })).handler(async ({ data, context }) => {
    const client: SupabaseClient = context.supabase;
    const result = await client.from('work_record_permissions').select('office_id,entity,record_id,operation,grantee_id,granted_by,owner_id').eq('office_id', data.officeId);
    if (result.error) throw new Error('تعذّر التحقق من الأذونات.');
    return result.data as WorkPermission[];
  });
export const setWorkPermission = createServerFn({ method: 'POST' }).middleware([independentOnly, requireSupabaseAuth])
  .inputValidator(z.object({ officeId: z.string().uuid(), entity: z.enum(['customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips']), recordId: z.string().uuid(), granteeId: z.string().uuid(), operation: z.enum(['edit','delete']), allow: z.boolean() }))
  .handler(async ({ data, context }) => {
    const client: SupabaseClient = context.supabase;
    const result = await client.rpc('set_work_permission', { _office: data.officeId, _entity: data.entity, _record: data.recordId, _grantee: data.granteeId, _operation: data.operation, _allow: data.allow });
    if (result.error) throw new Error('تعذّر تغيير الإذن؛ تحقق من صلاحيتك.');
    return { ok: true };
  });