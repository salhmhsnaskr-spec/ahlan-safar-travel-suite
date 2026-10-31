/** New quarantine regressions only; no real Auth, no spoofed identity, no production. */
import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {readFile} from 'node:fs/promises';
let db:PGlite;
const root=new URL('../',import.meta.url);
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
beforeAll(async()=>{
 db=new PGlite({extensions:{pgcrypto,uuid_ossp}});
 await db.exec(await readFile(new URL('validation/managed-dependencies.sql',root),'utf8'));
 const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
 for(const file of Object.keys(manifest.sha256))await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));
 for(const file of ['20261030000700_least_privilege.sql','20261031000900_permanent_deletion.sql','20261031001000_deletion_quarantine.sql'])await db.exec(await readFile(new URL('security/'+file,root),'utf8'));
 await db.exec(`INSERT INTO offices(id,name,created_by) VALUES('${a}','pending','${a}'),('${b}','other','${b}');
 INSERT INTO customers(id,office_id,full_name) VALUES('${a}','${a}','hidden'),('${b}','${b}','visible');
 INSERT INTO deletion_jobs(office_id,kind,target_id,status,entities) VALUES('${a}','office','${a}','pending',jsonb_build_object('customers',jsonb_build_array('${a}')));
 CREATE POLICY test_only_read ON customers FOR SELECT TO authenticated USING(true);`);
},60000);
afterAll(async()=>{await db?.close();});
it('restrictive quarantine hides pending rows while preserving another office without forged auth claims',async()=>{
 await db.exec('SET ROLE authenticated');try{
  expect((await db.query('SELECT id FROM customers')).rows).toEqual([{id:b}]);
 }finally{await db.exec('RESET ROLE');}
});
it('pending snapshot remains durable with customer rows retained for retry',async()=>{
 expect((await db.query('SELECT entities,status FROM deletion_jobs')).rows).toEqual([{entities:{customers:[a]},status:'pending'}]);
 expect((await db.query('SELECT count(*)::int n FROM customers')).rows).toEqual([{n:2}]);
});
it('covers all office business reads and Storage select with restrictive policies',async()=>{
 const rows=(await db.query(`SELECT tablename FROM pg_policies WHERE policyname='deletion_read_quarantine' ORDER BY tablename`)).rows;
 expect(rows.map(r=>r.tablename)).toEqual(['activity_log','bookings','customers','documents','offices','partner_offices','requests','services','tasks','umrah_participants','umrah_trips']);
 expect((await db.query(`SELECT permissive FROM pg_policies WHERE policyname='deletion_storage_read_quarantine'`)).rows).toEqual([{permissive:'RESTRICTIVE'}]);
});
it('definer performance and owner reports refuse pending data',async()=>{
 await expect(db.query('SELECT team_performance($1)',[a])).rejects.toThrow('Office deletion pending');
 await expect(db.query('SELECT platform_stats()')).rejects.toThrow('Office deletion pending');
});
it('status RPC requires authentication; normal clients cannot write pending jobs',async()=>{
 await expect(db.query('SELECT deletion_status($1)',[a])).rejects.toMatchObject({code:'42501'});
 expect((await db.query(`SELECT has_table_privilege('authenticated','deletion_jobs','UPDATE') allowed`)).rows).toEqual([{allowed:false}]);
});