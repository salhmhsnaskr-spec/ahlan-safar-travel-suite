// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Isolated PostgreSQL engine with simulated identities; not real auth sessions.
const office = "00000000-0000-0000-0000-000000000001";
const admin = "00000000-0000-0000-0000-000000000011";
const admin2 = "00000000-0000-0000-0000-000000000012";
const employee = "00000000-0000-0000-0000-000000000013";
const inv = "00000000-0000-0000-0000-000000000041";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION extensions.gen_random_bytes(int) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5(random()::text) || md5(random()::text), 'hex') $$;
    CREATE FUNCTION extensions.digest(text, text) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5($1), 'hex') $$;
    CREATE FUNCTION public._invite_hash(_token text) RETURNS text LANGUAGE sql AS $$ SELECT encode(extensions.digest(_token, 'sha256'), 'hex') $$;
    CREATE TABLE public.offices (id uuid PRIMARY KEY);
    CREATE TABLE public.office_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL, user_id uuid NOT NULL, role text NOT NULL, status text NOT NULL DEFAULT 'active');
    CREATE FUNCTION public.is_office_admin(_office uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM public.office_members WHERE office_id = _office AND user_id = auth.uid() AND role = 'admin' AND status = 'active') $$;
    CREATE TABLE public.activity_log (office_id uuid, actor_id uuid, entity text, entity_id uuid, action text, summary text);
    CREATE TABLE public.office_invitations (id uuid PRIMARY KEY, office_id uuid NOT NULL, email text NOT NULL, role text NOT NULL DEFAULT 'employee',
      token_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending', expires_at timestamptz NOT NULL, invited_by uuid,
      send_status text NOT NULL DEFAULT 'pending', send_error text, send_attempts int NOT NULL DEFAULT 0, last_sent_at timestamptz,
      failed_accepts int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
    CREATE UNIQUE INDEX office_invitations_one_pending ON public.office_invitations (office_id, lower(email)) WHERE status = 'pending';
  `);
  await db.exec(readFileSync("src/test/fixtures/invitation-rotation.sql", "utf8"));
  await db.exec(readFileSync("src/test/fixtures/last-admin-guard.sql", "utf8"));
  await db.exec(`INSERT INTO public.offices VALUES ('${office}');
    INSERT INTO public.office_members (office_id, user_id, role) VALUES ('${office}', '${admin}', 'admin'), ('${office}', '${employee}', 'employee');`);
}, 30000);
afterAll(async () => { await db?.close(); });

async function as(user: string, action: () => Promise<void>) {
  await db.exec("BEGIN");
  try { await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user]); await action(); }
  finally { await db.exec("ROLLBACK"); }
}
const addInvite = (createdAgo = "2 minutes") => db.exec(`INSERT INTO public.office_invitations (id, office_id, email, token_hash, expires_at, created_at)
  VALUES ('${inv}', '${office}', 'a@x.com', 'old-hash', now() + interval '1 day', now() - interval '${createdAgo}')`);
const resend = async () => (await db.query<{ r: { token?: string; error?: string } }>(`SELECT public.resend_invitation('${inv}') r`)).rows[0]!.r;
const age = (sql: string) => db.exec(`UPDATE public.office_invitations SET ${sql} WHERE id = '${inv}'`);

describe("Invitation link rotation", () => {
  it("rotates once, invalidates the previous link, and blocks an immediate second rotation", async () => {
    await as(admin, async () => {
      await addInvite();
      const first = await resend();
      expect(first.token).toHaveLength(64);
      const row = (await db.query<{ token_hash: string; rotation_count: number }>(`SELECT token_hash, rotation_count FROM public.office_invitations WHERE id = '${inv}'`)).rows[0]!;
      expect(row.token_hash).not.toBe("old-hash");
      expect(row.rotation_count).toBe(1);
      expect((await resend()).error).toBe("too_soon");
    });
  });
  it("blocks rotation within 60 seconds of creation", async () => {
    await as(admin, async () => { await addInvite("10 seconds"); expect((await resend()).error).toBe("too_soon"); });
  });
  it("stops after five rotations even when the cooldown has passed", async () => {
    await as(admin, async () => {
      await addInvite();
      for (let i = 0; i < 5; i++) { expect((await resend()).token).toBeTruthy(); await age("last_rotated_at = now() - interval '2 minutes'"); }
      expect((await resend()).error).toBe("rotation_limit");
    });
  });
  it("rejects employees and non-pending invitations", async () => {
    await as(employee, async () => { await addInvite(); await expect(resend()).rejects.toThrow("Not allowed"); });
    await as(admin, async () => { await addInvite(); await age("status = 'revoked'"); expect((await resend()).error).toBe("not_pending"); });
  });
  it("still allows only one pending invitation per email per office", async () => {
    await as(admin, async () => {
      await addInvite();
      await expect(db.exec(`INSERT INTO public.office_invitations (id, office_id, email, token_hash, expires_at) VALUES (gen_random_uuid(), '${office}', 'A@X.com', 'h2', now() + interval '1 day')`)).rejects.toThrow();
    });
  });
});

describe("Invitation delivery states", () => {
  it.each(["manual_link", "not_configured", "send_attempted", "failed"])("lets an admin record %s", async (s) => {
    await as(admin, async () => {
      await addInvite();
      await db.query(`SELECT public.mark_invitation_sent('${inv}', $1)`, [s]);
      expect((await db.query<{ send_status: string }>(`SELECT send_status FROM public.office_invitations WHERE id = '${inv}'`)).rows[0]!.send_status).toBe(s);
    });
  });
  it.each(["provider_accepted", "delivered", "sent"])("refuses %s from the browser", async (s) => {
    await as(admin, async () => { await addInvite(); await expect(db.query(`SELECT public.mark_invitation_sent('${inv}', $1)`, [s])).rejects.toThrow("Invalid status"); });
  });
});

describe("Last active administrator", () => {
  it.each([
    ["suspension", "status = 'suspended'"],
    ["removal", "status = 'removed'"],
    ["demotion", "role = 'employee'"],
  ])("rejects %s of the only active admin", async (_l, set) => {
    await as(admin, async () => {
      await expect(db.exec(`UPDATE public.office_members SET ${set} WHERE user_id = '${admin}'`)).rejects.toThrow("آخر مدير نشط");
    });
  });
  it("does not count a suspended admin as a remaining admin", async () => {
    await as(admin, async () => {
      await db.exec(`INSERT INTO public.office_members (office_id, user_id, role, status) VALUES ('${office}', '${admin2}', 'admin', 'suspended')`);
      await expect(db.exec(`UPDATE public.office_members SET status = 'removed' WHERE user_id = '${admin}'`)).rejects.toThrow("آخر مدير نشط");
    });
  });
  it("allows suspending one of two active admins, then blocks the second (sequential race outcome)", async () => {
    await as(admin, async () => {
      await db.exec(`INSERT INTO public.office_members (office_id, user_id, role) VALUES ('${office}', '${admin2}', 'admin')`);
      await db.exec(`UPDATE public.office_members SET status = 'suspended' WHERE user_id = '${admin}'`);
      await expect(db.exec(`UPDATE public.office_members SET status = 'suspended' WHERE user_id = '${admin2}'`)).rejects.toThrow("آخر مدير نشط");
    });
  });
  it("rejects suspending both admins in one statement", async () => {
    await as(admin, async () => {
      await db.exec(`INSERT INTO public.office_members (office_id, user_id, role) VALUES ('${office}', '${admin2}', 'admin')`);
      await expect(db.exec(`UPDATE public.office_members SET status = 'suspended' WHERE role = 'admin'`)).rejects.toThrow("آخر مدير نشط");
    });
  });
});
