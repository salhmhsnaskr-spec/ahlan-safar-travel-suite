/** New SQL/ACL regressions only. NOT real Auth/Storage/session acceptance. */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(await readFile(new URL('validation/managed-dependencies.sql', root), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  for (const [file, hash] of Object.entries(manifest.sha256)) {
    const sql = await readFile(new URL(`supabase/migrations/${file}`, root), 'utf8');
    expect(createHash('sha256').update(sql).digest('hex')).toBe(hash);
    await db.exec(sql);
  }
  await db.exec(await readFile(new URL('security/20261030000700_least_privilege.sql', root), 'utf8'));
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('local-only least privilege', () => {
  it('denies TRUNCATE, TRIGGER, REFERENCES and MAINTAIN on every table to both client roles', async () => {
    const { rows } = await db.query(`SELECT r.rolname, c.relname, p.privilege
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN (VALUES ('TRUNCATE'),('TRIGGER'),('REFERENCES'),('MAINTAIN')) p(privilege)
      WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public' AND c.relkind='r'
      AND has_table_privilege(r.oid,c.oid,p.privilege)`);
    expect(rows).toEqual([]);
  });
  it('denies anonymous table access while keeping authenticated request CRUD', async () => {
    const { rows } = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')`);
    expect(rows).toEqual([]);
    for (const op of ['SELECT','INSERT','UPDATE','DELETE']) {
      const { rows: grants } = await db.query(`SELECT has_table_privilege('authenticated','public.requests',$1) allowed`, [op]);
      expect(grants).toEqual([{ allowed: true }]);
    }
  });
  it('keeps invitation metadata readable but denies hashes for both client roles', async () => {
    const { rows } = await db.query(`SELECT
      has_column_privilege('authenticated','public.office_invitations','email','SELECT') metadata,
      has_column_privilege('authenticated','public.office_invitations','token_hash','SELECT') auth_hash,
      has_column_privilege('anon','public.office_invitations','token_hash','SELECT') anon_hash,
      has_table_privilege('authenticated','public.office_invitations','SELECT') full_row`);
    expect(rows).toEqual([{ metadata: true, auth_hash: false, anon_hash: false, full_row: false }]);
  });
  it('allows role selection but denies membership identity/status writes and history deletion', async () => {
    for (const col of ['id','office_id','user_id','created_at','status']) {
      const { rows } = await db.query(`SELECT has_column_privilege('authenticated','public.office_members',$1,'UPDATE') allowed`, [col]);
      expect(rows).toEqual([{ allowed: false }]);
    }
    const { rows } = await db.query(`SELECT has_column_privilege('authenticated','public.office_members','role','UPDATE') role,
      has_table_privilege('authenticated','public.office_members','DELETE') deletion`);
    expect(rows).toEqual([{ role: true, deletion: false }]);
  });
  it('permits only preview RPC anonymously and the exact app RPC allowlist when authenticated', async () => {
    const query = `SELECT p.proname name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND has_function_privilege($1,p.oid,'EXECUTE') ORDER BY 1`;
    expect((await db.query(query, ['anon'])).rows).toEqual([{ name: 'invitation_preview' }]);
    expect((await db.query(query, ['authenticated'])).rows.map((x) => x.name)).toEqual([
      'accept_invitation','create_invitation','create_office','invitation_preview',
      'is_office_admin','is_office_member','is_platform_owner','mark_invitation_sent',
      'platform_stats','resend_invitation','revoke_invitation','set_member_status',
      'shares_office','team_last_activity','team_performance',
    ]);
  });
  it('removes CREATE from clients and sequence counter resets', async () => {
    const { rows } = await db.query(`SELECT has_schema_privilege('anon','public','CREATE') anon_create,
      has_schema_privilege('authenticated','public','CREATE') auth_create,
      has_sequence_privilege('authenticated','public.requests_number_seq','USAGE') usage,
      has_sequence_privilege('authenticated','public.requests_number_seq','UPDATE') reset`);
    expect(rows).toEqual([{ anon_create: false, auth_create: false, usage: true, reset: false }]);
  });
  it('new objects from each known creator are default-denied including global PUBLIC function execute', async () => {
    await db.exec('BEGIN');
    try {
      for (const owner of ['postgres','supabase_admin']) {
        await db.exec(`GRANT CREATE ON SCHEMA public TO ${owner}; SET ROLE ${owner};
          CREATE TABLE public.future_${owner} (id integer);
          CREATE SEQUENCE public.seq_${owner};
          CREATE FUNCTION public.fn_${owner}() RETURNS integer LANGUAGE sql AS 'SELECT 1'; RESET ROLE;`);
        for (const role of ['anon','authenticated']) {
          const { rows } = await db.query(`SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') table_access,
            has_sequence_privilege($1,$3,'USAGE,SELECT,UPDATE') sequence_access,
            has_function_privilege($1,$4,'EXECUTE') rpc_access`,
          [role, `public.future_${owner}`, `public.seq_${owner}`, `public.fn_${owner}()`]);
          expect(rows).toEqual([{ table_access: false, sequence_access: false, rpc_access: false }]);
        }
      }
    } finally { await db.exec('ROLLBACK'); }
  });
  it('rejects TRUNCATE even by the local owner without destroying audit or memberships', async () => {
    for (const table of ['office_members','activity_log']) {
      await db.exec('BEGIN');
      try {
        await expect(db.exec(`TRUNCATE public.${table} CASCADE`)).rejects.toMatchObject({ code: '42501' });
      } finally { await db.exec('ROLLBACK'); }
    }
  });
});