/** Offline SQL behavior only. No auth identities/sessions or production access. */
import { beforeAll, afterAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE customers(id uuid PRIMARY KEY);
    CREATE TABLE requests(id uuid PRIMARY KEY, customer_id uuid, CONSTRAINT requests_customer_id_fkey FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE);`);
  for (const name of ['bookings','documents','tasks']) {
    await db.exec(`CREATE TABLE ${name}(id uuid PRIMARY KEY, customer_id uuid,
      CONSTRAINT ${name}_customer_id_fkey FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE);`);
  }
  await db.exec(`CREATE TABLE umrah_participants(id uuid PRIMARY KEY, customer_id uuid REFERENCES customers(id));`);
  await db.exec(await readFile(new URL('./20261031000800_customer_delete_restrict.sql', import.meta.url), 'utf8'));
  // Exercise the exact prepared identity trigger, without running old ACL tests.
  const overlay = await readFile(new URL('./20261030000700_least_privilege.sql', import.meta.url), 'utf8');
  await db.exec(`CREATE TABLE office_members(id uuid PRIMARY KEY, office_id uuid, user_id uuid, created_at timestamptz, role text, status text);`);
  await db.exec(overlay.slice(overlay.indexOf('CREATE FUNCTION public.guard_membership_identity()'), overlay.indexOf('REVOKE ALL ON FUNCTION public.guard_membership_identity()')));
  await db.exec(`CREATE TRIGGER members_identity_immutable BEFORE UPDATE OR DELETE ON office_members FOR EACH ROW EXECUTE FUNCTION guard_membership_identity();`);
});
afterAll(async () => { await db?.close(); });

const id = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
for (const table of ['requests','bookings','documents','tasks','umrah_participants']) {
  it(`database refuses customer deletion with ${table} without removing child`, async () => {
    await db.exec('BEGIN');
    try {
      await db.exec(`INSERT INTO customers VALUES('${id}'); INSERT INTO ${table} VALUES('${other}','${id}'); SAVEPOINT attempt;`);
      await expect(db.exec(`DELETE FROM customers WHERE id='${id}'`)).rejects.toMatchObject({ code: table === 'umrah_participants' ? '23503' : '23001' });
      await db.exec('ROLLBACK TO attempt');
      expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows).toEqual([{ n: 1 }]);
      expect((await db.query(`SELECT count(*)::int n FROM customers`)).rows).toEqual([{ n: 1 }]);
    } finally { await db.exec('ROLLBACK'); }
  });
}
for (const field of ['id','office_id','user_id','created_at','delete']) {
  it(`prepared membership guard rejects ${field}`, async () => {
    await db.exec('BEGIN');
    try {
      await db.exec(`INSERT INTO office_members VALUES('${id}','${id}','${id}',now(),'employee','active'); SAVEPOINT attempt;`);
      const sql = field === 'delete' ? 'DELETE FROM office_members' :
        `UPDATE office_members SET ${field}=${field === 'created_at' ? "now() + interval '1 day'" : `'${other}'`}`;
      await expect(db.exec(sql)).rejects.toMatchObject({ code: '42501' });
    } finally { await db.exec('ROLLBACK'); }
  });
}
it('permits role/status changes without replacing retained membership identity', async () => {
  await db.exec('BEGIN');
  try {
    await db.exec(`INSERT INTO office_members VALUES('${id}','${id}','${id}',now(),'employee','active');
      UPDATE office_members SET role='admin',status='suspended';`);
    expect((await db.query('SELECT id,role,status FROM office_members')).rows).toEqual([{ id, role: 'admin', status: 'suspended' }]);
  } finally { await db.exec('ROLLBACK'); }
});