/** Offline structural/regression proof only. NOT Auth/Storage integration acceptance. */
import { beforeAll, afterAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
let db: PGlite;
const root = new URL('../', import.meta.url);
const office = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const customer = '00000000-0000-0000-0000-000000000003';
const job = '00000000-0000-0000-0000-000000000004';
const request = '00000000-0000-0000-0000-000000000005';
const document = '00000000-0000-0000-0000-000000000006';
beforeAll(async () => {
 db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
 await db.exec(await readFile(new URL('validation/managed-dependencies.sql', root), 'utf8'));
 const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
 for (const [file, hash] of Object.entries(manifest.sha256)) {
  const sql = await readFile(new URL(`supabase/migrations/${file}`, root), 'utf8');
  expect(createHash('sha256').update(sql).digest('hex')).toBe(hash);
  await db.exec(sql);
 }
 for (const file of ['20261030000700_least_privilege.sql','20261031000800_customer_delete_restrict.sql','20261031000900_permanent_deletion.sql'])
  await db.exec(await readFile(new URL(`security/${file}`,root),'utf8'));
},60_000);
afterAll(async () => { await db?.close(); });
async function fixture(kind: 'customer' | 'office', withFile=false) {
 await db.exec(`INSERT INTO offices(id,name,created_by) VALUES('${office}','isolated','${other}'),('${other}','untouched','${other}');
 INSERT INTO customers(id,office_id,full_name) VALUES('${customer}','${office}','test');
 INSERT INTO requests(id,office_id,customer_id) VALUES('${request}','${office}','${customer}');
 INSERT INTO documents(id,office_id,request_id,file_name,storage_path) VALUES('${document}','${office}','${request}','test.pdf','${office}/test.pdf');
 INSERT INTO office_members(office_id,user_id,role) VALUES('${office}','${other}','admin');
 INSERT INTO umrah_trips(office_id,name) VALUES('${office}','group');
 INSERT INTO umrah_participants(office_id,trip_id,customer_id) SELECT '${office}',id,'${customer}' FROM umrah_trips;
 INSERT INTO deletion_jobs(id,office_id,kind,target_id,status,attempts,lease_until,entities) VALUES('${job}','${office}','${kind}','${kind==='office'?office:customer}','running',1,now()+interval '5 minutes',
 jsonb_build_object('customers',jsonb_build_array('${customer}'),'requests',jsonb_build_array('${request}'),'documents',jsonb_build_array('${document}'),'bookings','[]'::jsonb,'tasks','[]'::jsonb,'umrah_participants',(SELECT jsonb_agg(id) FROM umrah_participants)));`);
 if(withFile) await db.exec(`INSERT INTO storage.objects(id,bucket_id,name) VALUES('${job}','documents','${office}/test.pdf');`);
}
for (const kind of ['customer','office'] as const) it(`permanently finalizes ${kind} closure and preserves another office`,async()=>{
 await db.exec('BEGIN');
 try {
  await fixture(kind);
  await db.query('SELECT finish_deletion($1,1)',[job]);
  for(const table of ['customers','requests','documents','umrah_participants','activity_log']) {
   const expected=table==='activity_log' && kind==='customer' ? 1 : 0; // shared trip's audit is not customer-owned
   expect((await db.query(`SELECT count(*)::int n FROM ${table} WHERE office_id=$1`,[office])).rows,table).toEqual([{n:expected}]);
  }
  expect((await db.query('SELECT count(*)::int n FROM offices WHERE id=$1',[other])).rows).toEqual([{n:1}]);
  expect((await db.query('SELECT count(*)::int n FROM offices WHERE id=$1',[office])).rows).toEqual([{n:kind==='office'?0:1}]);
  expect((await db.query('SELECT count(*)::int n FROM office_members WHERE office_id=$1',[office])).rows).toEqual([{n:kind==='office'?0:1}]);
  expect((await db.query('SELECT status,office_id,target_id,entities FROM deletion_jobs')).rows).toEqual([{status:'completed',office_id:null,target_id:null,entities:{}}]);
 }finally {await db.exec('ROLLBACK');}
});
it('refuses finalization with remaining Storage object without deleting metadata',async()=>{
 await db.exec('BEGIN'); try {
  await fixture('customer',true); await db.exec('SAVEPOINT attempt');
  await expect(db.query('SELECT finish_deletion($1,1)',[job])).rejects.toThrow('Storage objects remain');
  await db.exec('ROLLBACK TO attempt');
  expect((await db.query('SELECT count(*)::int n FROM documents')).rows).toEqual([{n:1}]);
 }finally {await db.exec('ROLLBACK');}
});
it('freezes writes and direct customer deletion while a job is pending',async()=>{
 await db.exec('BEGIN');try {
  await fixture('customer');
  for(const sql of [`DELETE FROM customers WHERE id='${customer}'`,`INSERT INTO customers(office_id,full_name) VALUES('${office}','late')`]) {
   await db.exec('SAVEPOINT attempt'); await expect(db.exec(sql)).rejects.toMatchObject({code:'42501'}); await db.exec('ROLLBACK TO attempt');
  }
 }finally {await db.exec('ROLLBACK');}
});
it('persists retry deadline and refuses stale attempt finalization',async()=>{
 await db.exec('BEGIN');try {
  await fixture('customer');
  await db.query('SELECT fail_deletion($1,1)',[job]);
  expect((await db.query(`SELECT status,last_error IS NOT NULL logged,retry_at>now() delayed FROM deletion_jobs`)).rows).toEqual([{status:'pending',logged:true,delayed:true}]);
  await expect(db.query('SELECT finish_deletion($1,0)',[job])).rejects.toThrow();
 }finally {await db.exec('ROLLBACK');}
});
it('denies client finalizer/scope writes and anonymous job creation',async()=>{
 expect((await db.query(`SELECT has_function_privilege('authenticated','finish_deletion(uuid,integer)','EXECUTE') finalize,
 has_table_privilege('authenticated','deletion_scope','INSERT') scope,
 has_function_privilege('anon','begin_permanent_deletion(uuid,text,uuid)','EXECUTE') anonymous`)).rows).toEqual([{finalize:false,scope:false,anonymous:false}]);
});
it('rejects absent identity without inventing auth.uid',async()=>{
 await expect(db.query('SELECT begin_permanent_deletion($1,$2,$3)',[office,'office',office])).rejects.toMatchObject({code:'42501'});
});