// A schema-only compile and catalog comparison. No network, users, sessions or business tests.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const source = JSON.parse(await readFile(new URL('schema-catalog.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
const results=[];
const check=(name,actual,expected)=>{
 const normalize=x=>JSON.stringify(x);
 if(normalize(actual)!==normalize(expected)) throw new Error(`${name} mismatch\nACTUAL ${normalize(actual)}\nEXPECTED ${normalize(expected)}`);
 results.push({name,status:'passed',count:actual.length});
};
const rows=async sql=>(await db.query(sql)).rows;
try {
 await db.exec(await readFile(new URL('validation/managed-dependencies.sql',root),'utf8'));
 const dir=new URL('supabase/migrations/',root);
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
  const sql=await readFile(new URL(file,dir),'utf8');
  if(createHash('sha256').update(sql).digest('hex')!==manifest.sha256[file])throw new Error('Checksum mismatch '+file);
  await db.exec(sql);
  results.push({name:file,status:'applied'});
 }
 check('tables and RLS',await rows(`SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1`),source.tables.map(({name,rls,force_rls})=>({name,rls,force_rls})));
 check('columns/defaults/identity',await rows(`SELECT c.relname table_name,a.attname name,a.attnum::int position,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,a.attidentity identity,a.attgenerated generated,pg_get_expr(d.adbin,d.adrelid) default_expr FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,3`),source.columns.map(({table_name,name,position,type,not_null,identity,generated,default_expr})=>({table_name,name,position,type,not_null,identity,generated,default_expr})));
 check('constraints',await rows(`SELECT c.relname table_name,k.conname name,k.contype type,pg_get_constraintdef(k.oid,true) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY 1,2`),source.constraints);
 check('indexes',await rows(`SELECT c.relname table_name,i.relname name,pg_get_indexdef(i.oid) definition,EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=i.oid) constraint_owned FROM pg_index ix JOIN pg_class c ON c.oid=ix.indrelid JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY 1,2`),source.indexes);
 check('enums',await rows(`SELECT t.typname name,array_agg(e.enumlabel ORDER BY e.enumsortorder) labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' GROUP BY 1 ORDER BY 1`),source.enums);
 check('functions exact definitions/owners',await rows(`SELECT p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY 1,2`),source.functions);
 check('triggers',await rows(`SELECT n.nspname schema,c.relname table_name,t.tgname name,pg_get_triggerdef(t.oid,true) definition,t.tgenabled enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' ORDER BY 1,2,3`),source.triggers);
 check('policies',await rows(`SELECT schemaname schema,tablename table_name,policyname name,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3`),source.policies.map(({schema,table_name,name,permissive,roles,cmd,qual,with_check})=>({schema,table_name,name,permissive,roles,cmd,qual,with_check})));
 check('relation ACL',await rows(`SELECT c.relname name,c.relkind kind,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,a.privilege_type privilege,a.is_grantable grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE n.nspname='public' AND c.relkind IN ('r','S') ORDER BY 1,3,4`),source.relation_acl);
 check('function ACL',await rows(`SELECT p.proname name,pg_get_function_identity_arguments(p.oid) args,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,a.privilege_type privilege,a.is_grantable grantable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='public' ORDER BY 1,2,3`),source.function_acl);
 check('column ACL',await rows(`SELECT c.relname table_name,a.attname column_name,CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END grantee,acl.privilege_type privilege,acl.is_grantable grantable FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE n.nspname='public' AND a.attnum>0 ORDER BY 1,2,3,4`),source.column_acl.map(({table_name,column_name,grantee,privilege,grantable})=>({table_name,column_name,grantee,privilege,grantable})));
 for(const t of source.tables){const [{count}]=await rows(`SELECT count(*)::int count FROM public."${t.name}"`);if(count!==0)throw new Error('Unexpected data '+t.name);}
 results.push({name:'all application tables empty',status:'passed',count:15});
 console.log(JSON.stringify({status:'schema-only validation passed',results,limits:['Managed dependencies are empty schema shells, not Auth/Storage services.','No real session, function-body execution, concurrency or Supabase full-stack rebuild verified.']},null,2));
 await writeFile(new URL('validation/result.json',root),JSON.stringify({status:'partial validation passed',results,full_supabase_rebuild_verified:false},null,2)+'\n');
} finally {await db.close();}
