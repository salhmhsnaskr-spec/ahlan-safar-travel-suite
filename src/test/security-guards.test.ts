// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Execute the preserved security SQL on an isolated PostgreSQL engine. No cloud
// fixtures or application data are created by these regression tests.
const migration = readFileSync("src/test/fixtures/office-security-guards.sql", "utf8");
const officeA = "00000000-0000-0000-0000-000000000001";
const officeB = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000011";
const employee = "00000000-0000-0000-0000-000000000012";
const otherAdmin = "00000000-0000-0000-0000-000000000013";
const memberId = "00000000-0000-0000-0000-000000000021";
const taskId = "00000000-0000-0000-0000-000000000031";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.offices (id uuid PRIMARY KEY);
    CREATE TABLE public.office_members (id uuid PRIMARY KEY, office_id uuid NOT NULL REFERENCES public.offices, user_id uuid NOT NULL, role text NOT NULL);
    CREATE FUNCTION public.is_office_admin(_office uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
      $$ SELECT EXISTS (SELECT 1 FROM public.office_members WHERE office_id = _office AND user_id = auth.uid() AND role = 'admin') $$;
    CREATE TABLE public.tasks (id uuid PRIMARY KEY, office_id uuid NOT NULL, assigned_to uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), title text, status text, notes text, future_field text);
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
    CREATE TRIGGER tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  `);
  await db.exec(migration);
  await db.exec(`
    CREATE TRIGGER tasks_guard BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.guard_task_employee_update();
    INSERT INTO public.offices VALUES ('${officeA}'), ('${officeB}');
    INSERT INTO public.office_members VALUES ('${memberId}', '${officeA}', '${admin}', 'admin'),
      ('00000000-0000-0000-0000-000000000022', '${officeA}', '${employee}', 'employee'),
      ('00000000-0000-0000-0000-000000000023', '${officeB}', '${otherAdmin}', 'admin');
    INSERT INTO public.tasks (id, office_id, assigned_to, created_by, title, status) VALUES ('${taskId}', '${officeA}', '${employee}', '${admin}', 'Original', 'new');
  `);
}, 30000);
afterAll(async () => { await db?.close(); });

async function transaction(user: string, action: () => Promise<void>) {
  await db.exec("BEGIN");
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user]);
    await action();
  } finally {
    await db.exec("ROLLBACK");
  }
}

describe("Employee task update guard", () => {
  it("allows status and notes while overriding a supplied system timestamp", async () => {
    await transaction(employee, async () => {
      await db.exec(`UPDATE public.tasks SET status = 'done', notes = 'Completed', updated_at = '2000-01-01' WHERE id = '${taskId}'`);
      const result = await db.query<{ status: string; notes: string; timestamp_valid: boolean }>(`SELECT status, notes, updated_at = now() AS timestamp_valid FROM public.tasks WHERE id = '${taskId}'`);
      expect(result.rows[0]).toEqual({ status: "done", notes: "Completed", timestamp_valid: true });
    });
  });
  it.each([
    ["id", "'00000000-0000-0000-0000-000000000099'"],
    ["created_by", `'${employee}'`],
    ["created_at", "'2000-01-01'"],
    ["office_id", `'${officeB}'`],
    ["title", "'Changed'"],
    ["future_field", "'Changed'"],
  ])("rejects an employee changing %s", async (column, value) => {
    await transaction(employee, async () => {
      await expect(db.exec(`UPDATE public.tasks SET ${column} = ${value} WHERE id = '${taskId}'`)).rejects.toThrow("Employees can only update task status and notes");
    });
  });
  it("allows the office administrator to change the task title", async () => {
    await transaction(admin, async () => {
      await db.exec(`UPDATE public.tasks SET title = 'Admin change' WHERE id = '${taskId}'`);
      const result = await db.query<{ title: string }>(`SELECT title FROM public.tasks WHERE id = '${taskId}'`);
      expect(result.rows[0]?.title).toBe("Admin change");
    });
  });
});

describe("Last office administrator guard", () => {
  it.each([
    ["demotion", `UPDATE public.office_members SET role = 'employee' WHERE id = '${memberId}'`],
    ["deletion", `DELETE FROM public.office_members WHERE id = '${memberId}'`],
    ["moving offices", `UPDATE public.office_members SET office_id = '${officeB}' WHERE id = '${memberId}'`],
  ])("rejects last administrator %s even when another office has an admin", async (_label, sql) => {
    await transaction(admin, async () => {
      await expect(db.exec(sql)).rejects.toThrow("آخر مدير للمكتب");
    });
  });
  it("allows demotion when another administrator remains in the same office", async () => {
    await transaction(admin, async () => {
      await db.exec(`INSERT INTO public.office_members VALUES ('00000000-0000-0000-0000-000000000024', '${officeA}', '${otherAdmin}', 'admin'); UPDATE public.office_members SET role = 'employee' WHERE id = '${memberId}'`);
      const result = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.office_members WHERE office_id = '${officeA}' AND role = 'admin'`);
      expect(result.rows[0]?.count).toBe(1);
    });
  });
  it("rejects demoting all administrators in one statement", async () => {
    await transaction(admin, async () => {
      await db.exec(`INSERT INTO public.office_members VALUES ('00000000-0000-0000-0000-000000000024', '${officeA}', '${otherAdmin}', 'admin')`);
      await expect(db.exec(`UPDATE public.office_members SET role = 'employee' WHERE office_id = '${officeA}' AND role = 'admin'`)).rejects.toThrow("آخر مدير للمكتب");
    });
  });
});