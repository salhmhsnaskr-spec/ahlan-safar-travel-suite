/** New focused offline checks only; dependency shells are not Auth/Storage services. */
import { beforeAll, afterAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFile } from 'node:fs/promises';
let db: PGlite;
const root = new URL('../', import.meta.url);
const office = '00000000-0000-0000-0000-000000000001';
const target = '00000000-0000-0000-0000-000000000002';
const other = '00000000-0000-0000-0000-000000000003';
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(await readFile(new URL('validation/managed-dependencies.sql', root), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  for (const file of Object.keys(manifest.sha256)) await db.exec(await readFile(new URL(`supabase/migrations/${file}`, root), 'utf8'));
  for (const file of ['20261030000700_least_privilege.sql','20261031000800_customer_delete_restrict.sql','20261031000900_permanent_deletion.sql','20261031001000_deletion_quarantine.sql','20261031001100_deletion_hardening.sql','20261102001200_work_scope.sql','20261102001300_customer_scope.sql']) await db.exec(await readFile(new URL(`security/${file}`, root), 'utf8'));
}, 60000);
afterAll(async () => { await db?.close(); });
it('unapplied overlay installs record/operation uniqueness and denies direct permission and membership writes', async () => {
  const result = await db.query(`SELECT has_table_privilege('authenticated','work_record_permissions','INSERT,UPDATE,DELETE') permission_write, has_any_column_privilege('authenticated','office_members','UPDATE') member_write, has_function_privilege('authenticated','set_work_permission(uuid,text,uuid,uuid,text,boolean)','EXECUTE') rpc`);
  expect(result.rows).toEqual([{ permission_write: false, member_write: false, rpc: true }]);
});
it('effective client TRUNCATE remains absent after new tables are added', async () => {
  expect((await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege('authenticated',c.oid,'TRUNCATE') OR has_table_privilege('anon',c.oid,'TRUNCATE'))`)).rows).toEqual([]);
});
it('customer job hides only its frozen closure, leaves office and other customer available', async () => {
  await db.exec('BEGIN');
  try {
    await db.exec(`INSERT INTO deletion_jobs(office_id,kind,target_id,entities) VALUES('${office}','customer','${target}','{"customers":["${target}"],"documents":[]}');`);
    expect((await db.query(`SELECT deletion_pending('${office}') office_pending, deletion_record_pending('${office}','customers','${target}') target_pending, deletion_record_pending('${office}','customers','${other}') other_pending`)).rows).toEqual([{ office_pending: false, target_pending: true, other_pending: false }]);
    await db.exec(`INSERT INTO deletion_jobs(office_id,kind,target_id,entities) VALUES('${office}','customer','${other}','{"customers":["${other}"]}');`);
    expect((await db.query('SELECT count(*)::int n FROM deletion_jobs')).rows).toEqual([{ n: 2 }]);
  } finally { await db.exec('ROLLBACK'); }
});
it('old unassigned rows remain unassigned and creator grants no inferred owner', async () => {
  await db.exec('BEGIN');
  try {
    // Explicit fixture bypass for an owner-less row, not a session or RLS acceptance test.
    await db.exec(`INSERT INTO offices(id,name,created_by) VALUES('${office}','offline','${other}'); INSERT INTO customers(id,office_id,full_name,created_by) VALUES('${target}','${office}','legacy','${other}');`);
    expect((await db.query(`SELECT work_owner('${office}','customers','${target}') owner_id`)).rows).toEqual([{ owner_id: null }]);
  } finally { await db.exec('ROLLBACK'); }
});const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b1';
async function asUser(id: string, sql: string) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${id}',true)`);
  return db.query(sql);
}
async function roleFixture() {
  await db.exec(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${A}','a@x',now()),('${B}','b@x',now()) ON CONFLICT DO NOTHING;
    INSERT INTO offices(id,name,created_by) VALUES('${office}','roles','${A}');
    INSERT INTO office_members(office_id,user_id,role) VALUES('${office}','${A}','admin'),('${office}','${B}','employee');`);
}
it('employee cannot change roles through the RPC', async () => {
  await db.exec('BEGIN');
  try { await roleFixture(); await expect(asUser(B, `SELECT set_member_role('${office}','${B}','admin')`)).rejects.toThrow(/Forbidden/); }
  finally { await db.exec('ROLLBACK'); }
});
it('admin promotes an employee and the change is audited once', async () => {
  await db.exec('BEGIN');
  try {
    await roleFixture();
    await asUser(A, `SELECT set_member_role('${office}','${B}','admin')`);
    expect((await db.query(`SELECT role FROM office_members WHERE user_id='${B}'`)).rows).toEqual([{ role: 'admin' }]);
    expect((await db.query(`SELECT count(*)::int n FROM activity_log WHERE action='role_changed' AND entity_id='${B}'`)).rows).toEqual([{ n: 1 }]);
  } finally { await db.exec('ROLLBACK'); }
});
it('sole admin cannot demote themselves', async () => {
  await db.exec('BEGIN');
  try { await roleFixture(); await expect(asUser(A, `SELECT set_member_role('${office}','${A}','employee')`)).rejects.toThrow(); }
  finally { await db.exec('ROLLBACK'); }
});
it('SQL rejects self-grants even for an office administrator', async () => {
  await db.exec('BEGIN');
  try {
    await roleFixture();
    await asUser(A, `INSERT INTO customers(id,office_id,full_name,assigned_to) VALUES('${target}','${office}','test','${A}')`);
    await expect(asUser(A, `SELECT set_work_permission('${office}','customers','${target}','${A}','delete',true)`)).rejects.toThrow(/Invalid permission/);
  } finally { await db.exec('ROLLBACK'); }
});
it('SQL disallows trip delegation even for an administrator', async () => {
  await db.exec('BEGIN');
  try {
    await roleFixture();
    await expect(asUser(A, `SELECT set_work_permission('${office}','umrah_trips','${target}','${B}','edit',true)`)).rejects.toThrow(/Invalid permission/);
  } finally { await db.exec('ROLLBACK'); }
});
it('derived document permission is erased permanently by reassignment', async () => {
  await db.exec('BEGIN');
  try {
    await roleFixture();
    await asUser(A, `INSERT INTO customers(id,office_id,full_name,assigned_to) VALUES('${target}','${office}','test','${A}')`);
    await asUser(A, `INSERT INTO documents(id,office_id,customer_id,file_name,storage_path,uploaded_by) VALUES('${other}','${office}','${target}','f','${office}/file','${B}')`);
    await asUser(A, `SELECT set_work_permission('${office}','documents','${other}','${B}','delete',true)`);
    expect((await db.query(`SELECT count(*)::int n FROM work_record_permissions`)).rows).toEqual([{n:1}]);
    await asUser(A, `UPDATE customers SET assigned_to='${B}' WHERE id='${target}'`);
    await asUser(A, `UPDATE customers SET assigned_to='${A}' WHERE id='${target}'`);
    expect((await db.query(`SELECT count(*)::int n FROM work_record_permissions`)).rows).toEqual([{n:0}]);
  } finally { await db.exec('ROLLBACK'); }
});
it('document path cannot be forged through an administrator update', async () => {
  await db.exec('BEGIN');
  try {
    await roleFixture();
    await asUser(A, `INSERT INTO documents(id,office_id,file_name,storage_path,uploaded_by) VALUES('${other}','${office}','f','${office}/file','${A}');`);
    await expect(asUser(A, `UPDATE documents SET storage_path='${office}/other' WHERE id='${other}'`)).rejects.toThrow(/Immutable document identity/);
  } finally { await db.exec('ROLLBACK'); }
});
