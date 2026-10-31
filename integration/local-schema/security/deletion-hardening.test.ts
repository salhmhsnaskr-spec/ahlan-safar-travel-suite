/** Offline SQL tests only. No auth.uid spoofing, real accounts, network or concurrent PostgreSQL sessions. */
import { beforeAll, afterAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localDeletionTransport } from '../../../src/lib/data/permanent-deletion.server';
let db:PGlite;
const root=new URL('../',import.meta.url);
const office='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002';
const doc='00000000-0000-0000-0000-000000000003', job='00000000-0000-0000-0000-000000000004';
beforeAll(async()=>{
 db=new PGlite({extensions:{pgcrypto,uuid_ossp}});
 await db.exec(await readFile(new URL('validation/managed-dependencies.sql',root),'utf8'));
 const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
 for(const [file,hash] of Object.entries(manifest.sha256)){
  const sql=await readFile(new URL(`supabase/migrations/${file}`,root),'utf8');
  expect(createHash('sha256').update(sql).digest('hex')).toBe(hash);await db.exec(sql);
 }
 for(const file of ['20261030000700_least_privilege.sql','20261031000800_customer_delete_restrict.sql','20261031000900_permanent_deletion.sql','20261031001000_deletion_quarantine.sql','20261031001100_deletion_hardening.sql'])
  await db.exec(await readFile(new URL(`security/${file}`,root),'utf8'));
},60000);
afterAll(async()=>{await db?.close();});
it('actual installed Storage SDK and deletion adapter accept HEAD 404 after remove (mock HTTP, no network)',async()=>{
 const methods:string[]=[];
 const client=createClient('http://127.0.0.1:54321','offline-test-key',{global:{fetch:async(input,init)=>{
  const url=String(input);methods.push(init?.method ?? 'GET');
  if(url.includes('/rpc/renew_deletion'))return new Response('null',{headers:{'Content-Type':'application/json'}});
  if(init?.method==='HEAD')return new Response(null,{status:404});
  return new Response('[]',{headers:{'Content-Type':'application/json'}});
 }},auth:{persistSession:false,autoRefreshToken:false}});
 await localDeletionTransport(client).remove([`${office}/f`],{id:job,office_id:office,target_id:doc,kind:'document',status:'running',attempts:1});
 expect(methods).toEqual(['DELETE','POST','HEAD']);
});
async function transaction(fn:()=>Promise<void>){await db.exec('BEGIN');try{await fn();}finally{await db.exec('ROLLBACK');}}
async function fixture(){await db.exec(`INSERT INTO profiles(id,full_name) VALUES('${other}','shared identity');
 INSERT INTO auth.users(id,email) VALUES('${other}','offline-fixture.invalid');
 INSERT INTO offices(id,name,created_by) VALUES('${office}','target','${other}'),('${other}','retained','${other}');
 INSERT INTO office_members(office_id,user_id,role) VALUES('${office}','${other}','admin'),('${other}','${other}','admin');
 INSERT INTO documents(id,office_id,file_name,storage_path) VALUES('${doc}','${office}','f','${office}/f');
 INSERT INTO storage.objects(id,bucket_id,name) VALUES('${doc}','documents','${office}/f'),('${other}','documents','${other}/f');`);}
it('denies direct document row deletion while its Storage object remains (even SQL owner)',async()=>transaction(async()=>{
 await fixture();await db.exec('SAVEPOINT attempted');
 await expect(db.exec(`DELETE FROM documents WHERE id='${doc}'`)).rejects.toMatchObject({code:'42501'});
 await db.exec('ROLLBACK TO attempted');
 expect((await db.query('SELECT count(*)::int n FROM documents')).rows).toEqual([{n:1}]);
 expect((await db.query('SELECT count(*)::int n FROM storage.objects')).rows).toEqual([{n:2}]);
}));
it('revokes direct document/membership writes including the formerly granted role column',async()=>{
 expect((await db.query(`SELECT has_table_privilege('authenticated','documents','DELETE') d,
 has_any_column_privilege('authenticated','office_members','UPDATE') u,
 has_table_privilege('authenticated','office_members','DELETE,INSERT') w,
 has_function_privilege('authenticated','set_member_role(uuid,uuid,app_role)','EXECUTE') rpc`)).rows).toEqual([{d:false,u:false,w:false,rpc:true}]);
});
it('admin decision accepts admin and rejects employee even when active membership returns true (mock authorization dependency)',async()=>transaction(async()=>{
 await db.exec(`CREATE OR REPLACE FUNCTION public.is_office_member(_office uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
 CREATE OR REPLACE FUNCTION public.is_office_admin(_office uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false'; SAVEPOINT employee;`);
 await expect(db.query('SELECT require_customer_deletion_admin($1)',[office])).rejects.toMatchObject({code:'42501'});
 await db.exec(`ROLLBACK TO employee; CREATE OR REPLACE FUNCTION public.is_office_admin(_office uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';`);
 await expect(db.query('SELECT require_customer_deletion_admin($1)',[office])).resolves.toBeDefined();
}));
it('rejects unrelated office policy RPC without fabricating auth identity',async()=>transaction(async()=>{
 await fixture();await db.exec('SET LOCAL ROLE authenticated');
 await expect(db.query('SELECT deletion_frozen($1)',[other])).rejects.toMatchObject({code:'42501'});
}));
it('lease renewal refuses stale attempt, accepts current and a repeated claim fails busy',async()=>transaction(async()=>{
 await fixture();await db.exec(`INSERT INTO deletion_jobs(id,office_id,kind,target_id) VALUES('${job}','${office}','document','${doc}');`);
 await db.query('SELECT claim_deletion($1)',[job]); await db.exec('SAVEPOINT stale');
 await expect(db.query('SELECT renew_deletion($1,0)',[job])).rejects.toMatchObject({code:'55000'});
 await db.exec('ROLLBACK TO stale');await db.query('SELECT renew_deletion($1,1)',[job]);await db.exec('SAVEPOINT busy');
 await expect(db.query('SELECT claim_deletion($1)',[job])).rejects.toThrow('busy');await db.exec('ROLLBACK TO busy');
 expect((await db.query('SELECT attempts,lease_until>now() alive FROM deletion_jobs')).rows).toEqual([{attempts:1,alive:true}]);
}));
it('expired lease is reclaimed with a new attempt and finalizer lock order is office then job with fail-fast trigger locks',async()=>transaction(async()=>{
 await fixture();await db.exec(`INSERT INTO deletion_jobs(id,office_id,kind,target_id,status,attempts,lease_until) VALUES('${job}','${office}','document','${doc}','running',1,now()-interval '1 minute');`);
 await db.query('SELECT claim_deletion($1)',[job]);
 expect((await db.query('SELECT attempts FROM deletion_jobs')).rows).toEqual([{attempts:2}]);
 const {rows}=await db.query<{body:string}>(`SELECT prosrc body FROM pg_proc WHERE oid='public.finish_deletion(uuid,integer)'::regprocedure`);
 const body=rows[0]?.body ?? '';
 expect(body.indexOf('id=j.office_id FOR UPDATE NOWAIT')).toBeGreaterThan(0);
 expect(body.indexOf('id=j.office_id FOR UPDATE NOWAIT')).toBeLessThan(body.indexOf('id=_job FOR UPDATE NOWAIT'));
 const trigger=(await db.query<{body:string}>(`SELECT prosrc body FROM pg_proc WHERE oid='public.guard_deletion_freeze()'::regprocedure`)).rows[0]?.body ?? '';
 expect(trigger).toContain('id=o FOR UPDATE NOWAIT');
}));
it('office finalization preserves populated other office, shared account/profile/membership and other Storage objects',async()=>transaction(async()=>{
 await fixture();
 // Dependency-shell catalog only: real file cleanup is deliberately NOT simulated as Storage acceptance.
 await db.exec(`DELETE FROM storage.objects WHERE name='${office}/f';
 INSERT INTO deletion_jobs(id,office_id,kind,target_id,status,attempts,lease_until,entities)
 VALUES('${job}','${office}','office','${office}','running',1,now()+interval '5 minutes',
 '{"customers":[],"requests":[],"bookings":[],"tasks":[],"umrah_participants":[],"documents":["${doc}"]}');`);
 await db.query('SELECT finish_deletion($1,1)',[job]);
 for(const table of ['profiles','auth.users'])expect((await db.query(`SELECT count(*)::int n FROM ${table} WHERE id=$1`,[other])).rows).toEqual([{n:1}]);
 expect((await db.query('SELECT office_id FROM office_members')).rows).toEqual([{office_id:other}]);
 expect((await db.query('SELECT name FROM storage.objects')).rows).toEqual([{name:`${other}/f`}]);
 expect((await db.query('SELECT id FROM offices')).rows).toEqual([{id:other}]);
}));
it('effective TRUNCATE remains denied for clients/PUBLIC and inheritance gate rejects added privilege paths',async()=>transaction(async()=>{
 expect((await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege('anon',c.oid,'TRUNCATE') OR has_table_privilege('authenticated',c.oid,'TRUNCATE'))`)).rows).toEqual([]);
 await db.exec('CREATE ROLE unsafe_parent; GRANT unsafe_parent TO authenticated;');
 // Run just the actual preflight block, not duplicate migrations.
 const sql=await readFile(new URL('security/20261031001100_deletion_hardening.sql',root),'utf8');
 const start=sql.indexOf('DO $$ BEGIN\n IF EXISTS(SELECT 1 FROM pg_auth_members');
 await expect(db.exec(sql.slice(start,sql.lastIndexOf('COMMIT;')))).rejects.toThrow('memberships require independent review');
}));