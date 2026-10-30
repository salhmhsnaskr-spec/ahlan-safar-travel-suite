// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { filterPerformance, performanceRange, csvCell, type PerformanceData } from '@/lib/performance';
const office='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002';
const creator='00000000-0000-0000-0000-000000000011', editor='00000000-0000-0000-0000-000000000012', completer='00000000-0000-0000-0000-000000000013', canceller='00000000-0000-0000-0000-000000000014';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE office_members(office_id uuid,user_id uuid,role text,status text);
 INSERT INTO office_members VALUES('${office}','${creator}','admin','active'),('${office}','${editor}','employee','active'),('${office}','${completer}','employee','removed'),('${office}','${canceller}','employee','active');
 CREATE FUNCTION is_office_member(o uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM office_members WHERE office_id=o AND user_id=auth.uid() AND status='active')$$;
 CREATE FUNCTION is_office_admin(o uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM office_members WHERE office_id=o AND user_id=auth.uid() AND status='active' AND role='admin')$$;
 CREATE TABLE profiles(id uuid,full_name text); INSERT INTO profiles VALUES('${completer}','Former employee');
 CREATE TABLE customers(id uuid DEFAULT gen_random_uuid(),office_id uuid,full_name text,created_by uuid,created_at timestamptz DEFAULT now());
 CREATE TABLE requests(id uuid DEFAULT gen_random_uuid(),office_id uuid,number bigint DEFAULT 1,status text,service_id uuid,created_by uuid,created_at timestamptz DEFAULT now(),completed_by uuid,completed_at timestamptz,cancelled_by uuid,cancelled_at timestamptz,assigned_to uuid);
 CREATE TABLE bookings(LIKE requests INCLUDING DEFAULTS); ALTER TABLE bookings RENAME COLUMN assigned_to TO assigned_employee_id;
 CREATE TABLE activity_log(id uuid DEFAULT gen_random_uuid(),office_id uuid,actor_id uuid,actor_name text,entity text,entity_id uuid,action text,summary text,new_values jsonb,result text,created_at timestamptz DEFAULT now());
 INSERT INTO requests(office_id,status,created_by,completed_by,completed_at) VALUES('${office}','completed','${creator}','${completer}','2026-10-30'),('${office}','completed',NULL,NULL,NULL),('${other}','completed','${creator}','${completer}','2026-10-30');
 INSERT INTO bookings(office_id,status,created_by,cancelled_by,cancelled_at) VALUES('${office}','cancelled','${creator}','${canceller}','2026-10-30');
 INSERT INTO activity_log(office_id,actor_id,entity,entity_id,action,result) SELECT '${office}','${editor}','requests',id,'updated','success' FROM requests WHERE office_id='${office}' AND created_by IS NOT NULL;
 `);
 await db.exec(readFileSync('src/test/fixtures/team-performance.sql','utf8'));
},30000);
afterAll(()=>db?.close());
async function asUser(user:string,fn:(get:()=>Promise<PerformanceData>)=>Promise<void>){
 await db.exec('BEGIN');try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await db.exec('SET LOCAL ROLE authenticated');await fn(async()=>{const r=await db.query<{report:PerformanceData}>(`SELECT team_performance('${office}') report`);return r.rows[0]?.report as PerformanceData;});}finally{await db.exec('ROLLBACK');}
}
it('separates creator, editor, completer and canceller and excludes other offices',async()=>{
 await asUser(creator,async get=>{const d=await get();expect(d.entries.filter(e=>e.metric==='requests_created'&&e.actor_id===creator)).toHaveLength(1);expect(d.entries.filter(e=>e.metric==='modifications').map(e=>e.actor_id)).toEqual([editor]);expect(d.entries.filter(e=>e.metric==='requests_completed'&&e.actor_id===completer)).toHaveLength(1);expect(d.entries.filter(e=>e.metric==='bookings_cancelled').map(e=>e.actor_id)).toEqual([canceller]);expect(d.entries.filter(e=>e.metric==='bookings_completed')).toHaveLength(0);});
});
it('former employee name and completion survive retained removed membership',async()=>{await asUser(creator,async get=>{const d=await get();expect(d.members.find(m=>m.user_id===completer)).toMatchObject({full_name:'Former employee',status:'removed'});});});
it('historical unattributed completion stays null, not credited to creator',async()=>{await asUser(creator,async get=>{expect((await get()).entries.filter(e=>e.metric==='requests_completed'&&e.actor_id===null)).toHaveLength(1);});});
it('employee receives only own metrics, profile and activity',async()=>{await asUser(editor,async get=>{const d=await get();expect(d.members.map(m=>m.user_id)).toEqual([editor]);expect(d.entries.map(e=>e.actor_id)).toEqual([editor]);expect(d.activity.map(e=>e.actor_id)).toEqual([editor]);});});
it('removed member is rejected',async()=>{await asUser(completer,async get=>{await expect(get()).rejects.toThrow('Not authorized');});});
it('other office RPC is rejected even for office admin',async()=>{await asUser(creator,async()=>{await expect(db.exec(`SELECT team_performance('${other}')`)).rejects.toThrow('Not authorized');});});
it('anonymous cannot execute report',async()=>{await db.exec('BEGIN; SET LOCAL ROLE anon');try{await expect(db.exec(`SELECT team_performance('${office}')`)).rejects.toThrow('permission denied');}finally{await db.exec('ROLLBACK');}});
it('repeated completion counts one; reopening removes it; new completer receives one; cancellation removes it',async()=>{
 await db.exec('BEGIN');try{
 const id=(await db.query<{id:string}>(`SELECT id FROM requests WHERE office_id='${office}' AND created_by IS NOT NULL`)).rows[0]?.id;
 const read=async()=>{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[creator]);const d=(await db.query<{r:PerformanceData}>(`SELECT team_performance('${office}') r`)).rows[0]?.r;return d?.entries.filter(e=>e.metric==='requests_completed'&&e.actor_id!==null)??[];};
 expect(await read()).toHaveLength(1);
 await db.query('UPDATE requests SET status=$1 WHERE id=$2',['completed',id]);expect(await read()).toHaveLength(1);
 await db.query('UPDATE requests SET status=$1,completed_by=NULL,completed_at=NULL WHERE id=$2',['in_progress',id]);expect(await read()).toHaveLength(0);
 await db.query('UPDATE requests SET status=$1,completed_by=$2,completed_at=now() WHERE id=$3',['completed',editor,id]);expect((await read()).map(e=>e.actor_id)).toEqual([editor]);
 await db.query('UPDATE requests SET status=$1,completed_by=NULL,completed_at=NULL,cancelled_by=$2,cancelled_at=now() WHERE id=$3',['cancelled',canceller,id]);expect(await read()).toHaveLength(0);
 }finally{await db.exec('ROLLBACK');}
});
it('inclusive UTC date range includes final millisecond and excludes next day',()=>{
 const entries=['2026-10-30T00:00:00Z','2026-10-30T23:59:59.999Z','2026-10-31T00:00:00Z'].map(at=>({metric:'requests_completed' as const,actor_id:editor,entity:'requests',entity_id:at,label:at,status:'completed',at,service_id:null}));
 expect(filterPerformance({entries,members:[],activity:[]},{from:'2026-10-30',to:'2026-10-30',actor:'',entity:'',status:'',service:''})).toHaveLength(2);
});
it('week is seven UTC dates; month and year start at boundaries',()=>{const now=new Date('2026-10-30T00:54:00Z');expect(performanceRange('week',now)).toEqual({from:'2026-10-24',to:'2026-10-30'});expect(performanceRange('month',now).from).toBe('2026-10-01');expect(performanceRange('year',now).from).toBe('2026-01-01');});
it('CSV neutralizes spreadsheet formula injection',()=>{expect(csvCell('=1+1')).toBe('"\'=1+1"');expect(csvCell('safe')).toBe('"safe"');});