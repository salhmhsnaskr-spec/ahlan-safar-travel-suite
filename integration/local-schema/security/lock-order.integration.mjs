/** Two real PostgreSQL connections, disposable local Unix socket only.
 * This is isolated lock testing, NOT Auth/Storage integration acceptance.
 * Run only against a newly initialized disposable database; never supply hosted URLs.
 */
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const socket=process.env.DELETION_TEST_SOCKET;
if(!socket?.startsWith('/tmp/ahlan-lock-'))throw new Error('Disposable Unix socket required');
const options={host:socket,port:55439,user:'lovable',database:'postgres',max:1};
const a=postgres(options),b=postgres(options);
try{
 const sql=await readFile(new URL('./20261031001100_deletion_hardening.sql',import.meta.url),'utf8');
 const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_deletion_freeze');
 const guard=sql.slice(start,sql.indexOf('END $$;',start)+8);
 await a.unsafe(`CREATE TABLE offices(id uuid PRIMARY KEY); CREATE TABLE customers(id uuid PRIMARY KEY,office_id uuid,name text);
 CREATE FUNCTION deletion_internal(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';
 CREATE FUNCTION deletion_frozen(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';
 ${guard}
 CREATE TRIGGER a_deletion_freeze BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION guard_deletion_freeze();
 INSERT INTO offices VALUES('00000000-0000-0000-0000-000000000001');
 INSERT INTO customers VALUES('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','before');`);
 // A holds office, B already obtains customer row before its BEFORE trigger.
 // Actual trigger NOWAIT must abort B immediately, not create a waiting cycle.
 await a.unsafe('BEGIN; SELECT id FROM offices FOR UPDATE');
 await b.unsafe('BEGIN');
 const started=Date.now();
 await assert.rejects(b.unsafe("UPDATE customers SET name='retry'"),e=>e.code==='55P03');
 assert.ok(Date.now()-started<2000,'lock conflict must fail fast');
 await b.unsafe('ROLLBACK');await a.unsafe('COMMIT');
 await b.unsafe("UPDATE customers SET name='retry'");
 assert.equal((await b`SELECT name FROM customers`)[0]?.name,'retry');
 console.log('PASS: two real connections, trigger lock conflict 55P03, rollback and retry success');
}finally{await a.end();await b.end();}