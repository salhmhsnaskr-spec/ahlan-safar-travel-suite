import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

let db: PGlite;
const office = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const record = '00000000-0000-0000-0000-000000000003';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''00000000-0000-0000-0000-000000000004''::uuid';
    CREATE TABLE public.customers(id uuid, office_id uuid);
    INSERT INTO public.customers VALUES ('${record}','${other}');
    CREATE TABLE public.work_record_permissions(office_id uuid,entity text,record_id uuid,operation text,grantee_id uuid,owner_id uuid);
    CREATE FUNCTION public.is_office_member(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION public.is_office_admin(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION public.work_owner(text,uuid) RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';`);
  await db.exec(await readFile(new URL('./fixtures/work-record-scope.sql', import.meta.url), 'utf8'));
});
afterAll(async () => { await db?.close(); });
async function allowed(o: string, entity: string, id: string, operation: string) {
  const result = await db.query<{ allowed: boolean }>('SELECT public.work_allowed($1,$2,$3,$4) AS allowed', [o, entity, id, operation]);
  return result.rows[0]?.allowed;
}
it('an office administrator cannot authorize a record belonging to another office', async () => {
  expect(await allowed(office, 'customers', record, 'delete')).toBe(false);
  expect(await allowed(other, 'customers', record, 'delete')).toBe(true);
});
it('rejects missing records and unsupported operations before administrator bypass', async () => {
  expect(await allowed(other, 'customers', office, 'edit')).toBe(false);
  expect(await allowed(other, 'customers', record, 'promote')).toBe(false);
  expect(await allowed(other, 'offices', record, 'delete')).toBe(false);
});