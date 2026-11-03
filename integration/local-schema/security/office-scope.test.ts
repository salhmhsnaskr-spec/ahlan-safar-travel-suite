/** Offline PGlite check of the applied office-scope migration (0011) on the reconstructed schema. Not a live Auth/Storage test. */
import { beforeAll, afterAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFile } from 'node:fs/promises';

let db: PGlite;
const root = new URL('../', import.meta.url);
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [O1, O2, A, B, C, X] = [id(1), id(2), id(11), id(12), id(13), id(14)];
const [CB, CC, RB, BB, DB, CX] = [id(21), id(22), id(31), id(41), id(51), id(61)];

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(await readFile(new URL('validation/managed-dependencies.sql', root), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  for (const file of Object.keys(manifest.sha256)) await db.exec(await readFile(new URL(`supabase/migrations/${file}`, root), 'utf8'));
  await db.exec(await readFile(new URL('../../drizzle/migrations/0011_office_scope_permissions_owner_deletion.sql', root), 'utf8'));
  await db.exec(`
    INSERT INTO offices(id,name,created_by) VALUES ('${O1}','مكتب 1','${A}'),('${O2}','مكتب 2','${X}');
    INSERT INTO office_members(office_id,user_id,role) VALUES ('${O1}','${A}','admin'),('${O1}','${B}','employee'),('${O1}','${C}','employee'),('${O2}','${X}','admin');
    ALTER TABLE customers DISABLE TRIGGER USER; ALTER TABLE requests DISABLE TRIGGER USER; ALTER TABLE bookings DISABLE TRIGGER USER; ALTER TABLE documents DISABLE TRIGGER USER;
    INSERT INTO customers(id,office_id,full_name,created_by,assigned_to) VALUES ('${CB}','${O1}','عميل باسم','${B}',NULL),('${CC}','${O1}','عميل زميل','${B}','${C}'),('${CX}','${O2}','عميل مكتب آخر','${X}',NULL);
    INSERT INTO requests(id,office_id,customer_id,created_by,assigned_to) VALUES ('${RB}','${O1}','${CB}','${C}','${C}');
    INSERT INTO bookings(id,office_id,customer_id,request_id,created_by) VALUES ('${BB}','${O1}','${CB}','${RB}','${C}');
    INSERT INTO documents(id,office_id,customer_id,booking_id,file_name,storage_path,uploaded_by) VALUES ('${DB}','${O1}','${CB}','${BB}','a.pdf','${O1}/a.pdf','${C}');
    ALTER TABLE customers ENABLE TRIGGER USER; ALTER TABLE requests ENABLE TRIGGER USER; ALTER TABLE bookings ENABLE TRIGGER USER; ALTER TABLE documents ENABLE TRIGGER USER;`);
}, 60000);
afterAll(async () => { await db?.close(); });

async function as<T>(user: string, fn: () => Promise<T>) {
  await db.exec('BEGIN');
  try {
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${user}',true); SET LOCAL ROLE authenticated;`);
    return await fn();
  } finally { await db.exec('ROLLBACK'); }
}
const rows = async (sql: string) => (await db.query(sql)).rows as Record<string, unknown>[];

it('employee reads all of their office and nothing of another office', async () => {
  const seen = await as(B, () => rows('SELECT id FROM customers ORDER BY id'));
  expect(seen.map(r => r['id'])).toEqual([CB, CC]);
});

it('employee edits own (creator, unassigned) work but not a colleague-assigned record without permission', async () => {
  await as(B, async () => {
    expect((await rows(`UPDATE customers SET notes='x' WHERE id='${CB}' RETURNING id`)).length).toBe(1);
    expect((await rows(`UPDATE customers SET notes='x' WHERE id='${CC}' RETURNING id`)).length).toBe(0);
    expect((await rows(`DELETE FROM customers WHERE id='${CC}' RETURNING id`)).length).toBe(0);
  });
});

it('edit permission from the record owner does not grant delete, and employees cannot reassign', async () => {
  await db.exec('BEGIN');
  try {
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${C}',true); SET LOCAL ROLE authenticated;`);
    await db.exec(`SELECT set_work_permission('${O1}','customers','${CC}','${B}','edit',true)`);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${B}',true)`);
    expect((await rows(`UPDATE customers SET notes='ok' WHERE id='${CC}' RETURNING id`)).length).toBe(1);
    expect((await rows(`DELETE FROM customers WHERE id='${CC}' RETURNING id`)).length).toBe(0);
    await expect(db.exec(`UPDATE customers SET assigned_to='${B}' WHERE id='${CB}'`)).rejects.toThrow('إعادة الإسناد');
  } finally { await db.exec('ROLLBACK'); }
});

it('only admins change roles; employees cannot promote themselves', async () => {
  await as(B, async () => { await expect(db.exec(`SELECT set_member_role('${O1}','${B}','admin')`)).rejects.toThrow('Only office admins'); });
  await as(B, async () => { expect((await rows(`UPDATE office_members SET role='admin' WHERE user_id='${B}' RETURNING id`)).length).toBe(0); });
  await as(A, async () => { await db.exec(`SELECT set_member_role('${O1}','${B}','admin')`); expect(await rows(`SELECT role FROM office_members WHERE user_id='${B}'`)).toEqual([{ role: 'admin' }]); });
});

it('customer cascade: owner employee removes customer, colleague request/booking/document, and records the file path', async () => {
  await as(B, async () => {
    const job = (await rows(`SELECT begin_customer_deletion('${CB}') AS j`))[0]!['j'];
    expect(await rows(`SELECT count(*)::int n FROM customers WHERE id='${CB}'`)).toEqual([{ n: 0 }]);
    expect(await rows(`SELECT count(*)::int n FROM requests WHERE id='${RB}'`)).toEqual([{ n: 0 }]);
    expect(await rows(`SELECT count(*)::int n FROM documents WHERE id='${DB}'`)).toEqual([{ n: 0 }]);
    expect(await rows(`SELECT remaining, status FROM deletion_jobs WHERE id='${job}'`)).toEqual([{ remaining: [`${O1}/a.pdf`], status: 'storage_pending' }]);
    expect(await rows(`SELECT count(*)::int n FROM customers WHERE id='${CC}'`)).toEqual([{ n: 1 }]);
  });
  await as(B, async () => { await expect(db.exec(`SELECT begin_customer_deletion('${CC}')`)).rejects.toThrow('لا تملك إذن'); });
  await as(X, async () => { await expect(db.exec(`SELECT begin_customer_deletion('${CB}')`)).rejects.toThrow('لا تملك إذن'); });
});

it('platform-owner functions refuse office admins and app roles hold no TRUNCATE', async () => {
  await as(A, async () => { await expect(db.exec(`SELECT owner_offices_overview()`)).rejects.toThrow('Forbidden'); });
  await as(A, async () => { await expect(db.exec(`SELECT owner_office_detail('${O1}')`)).rejects.toThrow('Forbidden'); });
  expect(await rows(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege('authenticated',c.oid,'TRUNCATE') OR has_table_privilege('anon',c.oid,'TRUNCATE'))`)).toEqual([]);
});

it('employee creates a trip they manage; colleagues cannot edit it', async () => {
  await db.exec('BEGIN');
  try {
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${B}',true); SET LOCAL ROLE authenticated;`);
    const t = (await rows(`INSERT INTO umrah_trips(office_id,name) VALUES ('${O1}','رحلة') RETURNING id, created_by`))[0]!;
    expect(t['created_by']).toBe(B);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${C}',true)`);
    expect((await rows(`UPDATE umrah_trips SET name='x' WHERE id='${t['id']}' RETURNING id`)).length).toBe(0);
  } finally { await db.exec('ROLLBACK'); }
});
