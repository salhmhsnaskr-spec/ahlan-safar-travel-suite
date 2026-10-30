// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
import { activityIsRecent, canManageOffice } from "@/lib/staff";

const office = "00000000-0000-0000-0000-000000000001";
const otherOffice = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000011";
const employee = "00000000-0000-0000-0000-000000000012";
const former = "00000000-0000-0000-0000-000000000013";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE office_members (office_id uuid, user_id uuid, role text, status text);
    CREATE FUNCTION is_office_member(o uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM office_members WHERE office_id=o AND user_id=auth.uid() AND status='active') $$;
    CREATE FUNCTION is_office_admin(o uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM office_members WHERE office_id=o AND user_id=auth.uid() AND status='active' AND role='admin') $$;
    CREATE TABLE activity_log (office_id uuid, actor_id uuid, created_at timestamptz);
    GRANT SELECT ON activity_log TO authenticated;
    ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "activity select" ON activity_log FOR SELECT TO authenticated USING(is_office_member(office_id));
    CREATE TABLE services (id int, office_id uuid, name text);
    GRANT SELECT,INSERT,UPDATE,DELETE ON services TO authenticated;
    ALTER TABLE services ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "services select" ON services FOR SELECT TO authenticated USING(office_id IS NULL OR is_office_member(office_id));
    CREATE POLICY "services insert" ON services FOR INSERT TO authenticated WITH CHECK(is_office_member(office_id));
    CREATE POLICY "services update" ON services FOR UPDATE TO authenticated USING(is_office_member(office_id));
    CREATE POLICY "services delete" ON services FOR DELETE TO authenticated USING(is_office_member(office_id));
    INSERT INTO office_members VALUES ('${office}','${admin}','admin','active'),('${office}','${employee}','employee','active'),('${office}','${former}','employee','removed');
    INSERT INTO activity_log VALUES ('${office}','${admin}','2026-10-01'),('${office}','${employee}','2026-10-02'),('${office}','${former}','2026-09-01'),('${otherOffice}','${employee}','2026-10-29');
    INSERT INTO services VALUES (1,'${office}','Local'),(2,NULL,'Base');
  `);
  await db.exec(readFileSync("src/test/fixtures/staff-workspace.sql", "utf8"));
}, 30000);
afterAll(async () => db?.close());
async function asUser(user: string, fn: () => Promise<void>) {
  await db.exec("BEGIN");
  try { await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]); await db.exec("SET LOCAL ROLE authenticated"); await fn(); }
  finally { await db.exec("ROLLBACK"); }
}
it("employee sees only own operations within their active office", async () => {
  await asUser(employee, async () => {
    const r = await db.query<{ actor_id: string; office_id: string }>("SELECT actor_id,office_id FROM activity_log");
    expect(r.rows).toEqual([{ actor_id: employee, office_id: office }]);
  });
});
it("admin sees all office actors including former members but not another office", async () => {
  await asUser(admin, async () => {
    const r = await db.query("SELECT actor_id FROM activity_log ORDER BY actor_id");
    expect(r.rows).toEqual([admin, employee, former].map((actor_id) => ({ actor_id })));
  });
});
it("team last activity preserves former members and excludes other-office events", async () => {
  await asUser(admin, async () => {
    const r = await db.query<{ user_id: string; at: string }>(`SELECT user_id, to_char(last_activity_at,'YYYY-MM-DD') AS at FROM team_last_activity('${office}') ORDER BY user_id`);
    expect(r.rows).toEqual([{ user_id: admin, at: "2026-10-01" },{ user_id: employee, at: "2026-10-02" },{ user_id: former, at: "2026-09-01" }]);
  });
});
it("employee cannot request team activity directly", async () => {
  await asUser(employee, async () => { await expect(db.exec(`SELECT * FROM team_last_activity('${office}')`)).rejects.toThrow("Not authorized"); });
});
it("admin cannot request another office's team activity", async () => {
  await asUser(admin, async () => { await expect(db.exec(`SELECT * FROM team_last_activity('${otherOffice}')`)).rejects.toThrow("Not authorized"); });
});
it("removed members cannot read activity even with a session", async () => {
  await asUser(former, async () => { expect((await db.query("SELECT * FROM activity_log")).rows).toHaveLength(0); });
});
it("employee can read service catalog but cannot insert a service", async () => {
  await asUser(employee, async () => {
    expect((await db.query("SELECT id FROM services")).rows).toHaveLength(2);
    await expect(db.exec(`INSERT INTO services VALUES (3,'${office}','Unauthorized')`)).rejects.toThrow("row-level security");
  });
});
it("employee cannot update or delete office services", async () => {
  await asUser(employee, async () => {
    expect((await db.query("UPDATE services SET name='Unauthorized' WHERE id=1 RETURNING id")).rows).toHaveLength(0);
    expect((await db.query("DELETE FROM services WHERE id=1 RETURNING id")).rows).toHaveLength(0);
  });
});
it("admin can manage own services but not shared base services", async () => {
  await asUser(admin, async () => {
    expect((await db.query("UPDATE services SET name='Allowed' WHERE id=1 RETURNING name")).rows).toEqual([{ name: "Allowed" }]);
    expect((await db.query("UPDATE services SET name='Forbidden' WHERE id=2 RETURNING id")).rows).toHaveLength(0);
  });
});
it("activity uses exactly 30 elapsed days and no login-derived activity", () => {
  const now = Date.parse("2026-10-30T00:00:00Z");
  expect(activityIsRecent("2026-09-30T00:00:00Z", now)).toBe(true);
  expect(activityIsRecent("2026-09-29T23:59:59Z", now)).toBe(false);
  expect(activityIsRecent(null, now)).toBe(false);
  expect(activityIsRecent("2026-10-31T00:00:00Z", now)).toBe(false);
});
it("only admins have office management controls", () => {
  expect(canManageOffice("admin")).toBe(true);
  expect(canManageOffice("employee")).toBe(false);
});