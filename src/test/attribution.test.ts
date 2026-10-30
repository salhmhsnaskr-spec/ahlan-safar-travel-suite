// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { stampDemoWork, safeAuditValues } from '@/lib/attribution';

const admin = '00000000-0000-0000-0000-000000000011';
const employee = '00000000-0000-0000-0000-000000000012';
const office = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE offices(id uuid PRIMARY KEY);
    INSERT INTO offices VALUES ('${office}'),('${other}');
    CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text);
    INSERT INTO profiles VALUES ('${admin}','Manager'),('${employee}','Employee');
    CREATE TABLE office_members(office_id uuid,user_id uuid,status text,role text);
    INSERT INTO office_members VALUES ('${office}','${admin}','active','admin'),('${office}','${employee}','active','employee');
    CREATE FUNCTION is_office_member(o uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM office_members WHERE office_id=o AND user_id=auth.uid() AND status='active') $$;
    CREATE FUNCTION is_office_admin(o uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM office_members WHERE office_id=o AND user_id=auth.uid() AND role='admin' AND status='active') $$;
    CREATE TABLE activity_log(id uuid DEFAULT gen_random_uuid(),office_id uuid,actor_id uuid,entity text,entity_id uuid,action text,summary text,created_at timestamptz DEFAULT now());
    ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY activity_read ON activity_log FOR SELECT TO authenticated USING(is_office_member(office_id) AND (is_office_admin(office_id) OR actor_id=auth.uid()));
    CREATE TABLE requests(id uuid DEFAULT gen_random_uuid(),office_id uuid,number bigint DEFAULT 1,status text DEFAULT 'new',created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),notes text,service_details jsonb);
    CREATE TABLE bookings(LIKE requests INCLUDING DEFAULTS);
    CREATE TABLE customers(id uuid DEFAULT gen_random_uuid(),office_id uuid,created_by uuid,created_at timestamptz DEFAULT now(),full_name text,passport_number text);
    CREATE TABLE tasks(LIKE requests INCLUDING DEFAULTS);
    ALTER TABLE tasks ADD COLUMN assigned_to uuid;
    CREATE TABLE umrah_trips(LIKE requests INCLUDING DEFAULTS);
    CREATE TABLE umrah_participants(LIKE requests INCLUDING DEFAULTS);
    CREATE FUNCTION guard_task_employee_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
      IF NOT is_office_admin(OLD.office_id) AND (to_jsonb(NEW)-ARRAY['status','notes','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','notes','updated_at']) THEN RAISE EXCEPTION 'Employees can only update task status and notes'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER tasks_guard BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION guard_task_employee_update();`);
  await db.exec(readFileSync('src/test/fixtures/staff-attribution.sql','utf8'));
  for (const table of ['requests','bookings','customers','tasks']) {
    await db.exec(`CREATE TRIGGER ${table}_activity AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION log_activity()`);
  }
},30000);
afterAll(async () => db?.close());
async function isolated(fn: () => Promise<void>) {
  await db.exec('BEGIN');
  try { await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[admin]); await fn(); }
  finally { await db.exec('ROLLBACK'); }
}
async function insert(table='requests') {
  return (await db.query<{id:string}>(`INSERT INTO ${table}(office_id,status,created_by) VALUES ('${office}','new','${employee}') RETURNING id`)).rows[0]?.id;
}
it.each(['requests','bookings'])('%s has separate trusted creator, updater and completer; repeated completion counts once', async (table) => isolated(async () => {
  const id=await insert(table);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[employee]);
  await db.exec(`UPDATE ${table} SET status='completed',completed_by='${admin}' WHERE id='${id}'`);
  const first=(await db.query<{created_by:string;updated_by:string;completed_by:string;completed_at:string}>(`SELECT created_by,updated_by,completed_by,completed_at FROM ${table}`)).rows[0];
  expect(first).toMatchObject({created_by:admin,updated_by:employee,completed_by:employee});
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[admin]);
  await db.exec(`UPDATE ${table} SET status='completed',completed_by='${admin}',completed_at='2000-01-01' WHERE id='${id}'`);
  expect((await db.query(`SELECT completed_by,completed_at FROM ${table}`)).rows[0]).toMatchObject({completed_by:employee,completed_at:first?.completed_at});
  expect((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE status='completed' AND completed_by='${employee}'`)).rows[0]).toEqual({n:1});
}));
it.each(['requests','bookings'])('%s reopening removes credit and recompletion credits only latest actor', async (table) => isolated(async () => {
  const id=await insert(table);
  await db.exec(`UPDATE ${table} SET status='completed' WHERE id='${id}'; UPDATE ${table} SET status='in_progress' WHERE id='${id}'`);
  expect((await db.query(`SELECT completed_by,completed_at FROM ${table}`)).rows[0]).toEqual({completed_by:null,completed_at:null});
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[employee]);
  await db.exec(`UPDATE ${table} SET status='completed' WHERE id='${id}'`);
  expect((await db.query(`SELECT completed_by FROM ${table}`)).rows[0]).toEqual({completed_by:employee});
  expect((await db.query<{action:string}>('SELECT action FROM activity_log ORDER BY ctid')).rows.map(r=>r.action)).toEqual(['created','completed','reopened','completed']);
}));
it('cancelled work is never completed and preserves cancellation actor/date', async () => isolated(async () => {
  const id=await insert(); await db.exec(`UPDATE requests SET status='completed' WHERE id='${id}'; UPDATE requests SET status='cancelled' WHERE id='${id}'`);
  expect((await db.query('SELECT completed_by,completed_at,cancelled_by,cancelled_at IS NOT NULL AS dated FROM requests')).rows[0]).toEqual({completed_by:null,completed_at:null,cancelled_by:admin,dated:true});
}));
it('old completed rows remain unattributed after unrelated edits',async () => isolated(async()=>{
  await db.exec(`ALTER TABLE requests DISABLE TRIGGER requests_provenance; INSERT INTO requests(office_id,status) VALUES ('${office}','completed'); ALTER TABLE requests ENABLE TRIGGER requests_provenance; UPDATE requests SET notes='edit'`);
  expect((await db.query('SELECT created_by,completed_by,cancelled_by FROM requests')).rows[0]).toEqual({created_by:null,completed_by:null,cancelled_by:null});
}));
it('before/after values retain status but omit secrets and record changed field names',async()=>isolated(async()=>{
  const id=await insert(); await db.exec(`UPDATE requests SET status='completed', notes='private password', service_details='{"token":"secret"}' WHERE id='${id}'`);
  const row=(await db.query<{old_values:Record<string,unknown>;new_values:Record<string,unknown>;changed_fields:string[];result:string}>('SELECT * FROM activity_log ORDER BY ctid DESC LIMIT 1')).rows[0];
  expect(row?.old_values['status']).toBe('new'); expect(row?.new_values['status']).toBe('completed');
  expect(row?.new_values).not.toHaveProperty('notes'); expect(row?.new_values).not.toHaveProperty('service_details');
  expect(row?.changed_fields).toContain('service_details'); expect(row?.result).toBe('success');
}));
it('historical name survives removal and subsequent profile renaming',async()=>isolated(async()=>{
  await insert(); await db.exec(`UPDATE office_members SET status='removed' WHERE user_id='${admin}'; UPDATE profiles SET full_name='Changed' WHERE id='${admin}'`);
  expect((await db.query('SELECT actor_name FROM activity_log')).rows[0]).toEqual({actor_name:'Manager'});
}));
it.each(['UPDATE activity_log SET summary=\'forged\'','DELETE FROM activity_log'])('audit history rejects privileged mutation: %s',async(sql)=>isolated(async()=>{
  await insert(); await expect(db.exec(sql)).rejects.toThrow('Activity history is immutable');
}));
it.each(['INSERT INTO activity_log(office_id) VALUES (NULL)','UPDATE activity_log SET summary=\'forged\'','DELETE FROM activity_log'])('authenticated users cannot forge/mutate history: %s',async(sql)=>isolated(async()=>{
  await insert(); await db.exec('SET LOCAL ROLE authenticated'); await expect(db.exec(sql)).rejects.toThrow('permission denied');
}));
it('employee reads only own events, no other office, and suspension immediately revokes reads',async()=>isolated(async()=>{
  await insert(); await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[employee]); await insert();
  await db.exec(`INSERT INTO requests(office_id) VALUES ('${other}')`); await db.exec('SET LOCAL ROLE authenticated');
  expect((await db.query('SELECT actor_id,office_id FROM activity_log')).rows).toEqual([{actor_id:employee,office_id:office}]);
  await db.exec(`RESET ROLE; UPDATE office_members SET status='suspended' WHERE user_id='${employee}'; SET LOCAL ROLE authenticated`);
  expect((await db.query('SELECT * FROM activity_log')).rows).toHaveLength(0);
}));
it('employee task status/notes still work and updated_by cannot be forged',async()=>isolated(async()=>{
  const id=await insert('tasks'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[employee]);
  await db.exec(`UPDATE tasks SET status='done',notes='done' WHERE id='${id}'`);
  expect((await db.query('SELECT updated_by FROM tasks')).rows[0]).toEqual({updated_by:employee});
  await expect(db.exec(`UPDATE tasks SET updated_by='${admin}' WHERE id='${id}'`)).rejects.toThrow('Employees can only update task status and notes');
}));
it('demo keeps terminal credit stable and excludes raw secret fields',()=>{
  const old={created_at:'2026-10-01',created_by:admin,status:'completed',completed_by:employee,completed_at:'2026-10-02'};
  expect(stampDemoWork(old,{...old,completed_by:admin},admin,'2026-10-30')).toMatchObject({completed_by:employee,completed_at:'2026-10-02'});
  expect(stampDemoWork(old,{...old,status:'new'},admin,'2026-10-30')).toMatchObject({completed_by:null,completed_at:null});
  expect(safeAuditValues({status:'new',password:'secret',service_details:{token:'secret'}})).toEqual({status:'new'});
});