// Disposable PostgreSQL fixtures only; no credentials or remote services.
import assert from 'node:assert/strict'
import { execFileSync, execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
const bin = process.argv[process.argv.indexOf('--pg-bin') + 1]
if (!bin?.includes('/')) throw new Error('Pass --pg-bin /path/to/postgres/bin')
const root = mkdtempSync(join(tmpdir(), 'symphony-beta-security-'))
const args = ['-h',root,'-p','55448','-U','postgres','-d','postgres','-X','-At','-v','ON_ERROR_STOP=1']
const sql = q => execFileSync(join(bin,'psql'),[...args,'-c',`select 1;\n${q}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split('\n').at(-1)
const migration = name => sql(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002', C='00000000-0000-0000-0000-000000000003'
const as = (u,q) => `set role authenticated; set request.jwt.claim.sub='${u}'; ${q}`
let count=0, started=false
const check=(name,fn)=>{fn();count++;console.log('PASS '+name)}
try {
  execFileSync(join(bin,'initdb'),['-D',join(root,'data'),'-U','postgres','--auth=trust','--no-locale'],{stdio:'ignore'})
  execFileSync(join(bin,'pg_ctl'),['-D',join(root,'data'),'-l',join(root,'server.log'),'-o',`-k ${root} -h '' -p 55448`,'-w','start'],{stdio:'ignore'}); started=true
  sql(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage; grant usage on schema auth,storage to authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key); insert into auth.users values('${A}'),('${B}'),('${C}');
    create function public.users_share_household(a uuid,b uuid) returns boolean language sql stable as $$select a=b or (a in ('${A}','${B}') and b in ('${A}','${B}'))$$;
    create table public.tasks(id uuid primary key,user_id uuid,scope text);
    create table public.projects(like public.tasks);create table public.notes(like public.tasks);create table public.routines(like public.tasks);
    grant select on public.tasks,public.projects,public.notes,public.routines to authenticated;
    create table public.attachments(id uuid primary key default gen_random_uuid(),user_id uuid,entity_type text,entity_id text,storage_path text,document_status text,document_scope text default 'private');
    alter table public.attachments enable row level security;
    create policy "Users can view own attachments" on public.attachments for select using(user_id=auth.uid());
    create policy own_insert on public.attachments for insert with check(user_id=auth.uid());
    create policy own_update on public.attachments for update using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy private_docs on public.attachments as restrictive for select using(document_status is distinct from 'kept' or document_scope is distinct from 'private' or user_id=auth.uid());
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create policy owner_read on storage.objects for select using(bucket_id='attachments' and split_part(name,'/',1)=auth.uid()::text);
    grant select,insert,update on public.attachments to authenticated;grant select on storage.objects to authenticated;
    insert into public.tasks values('${A}','${A}','compound');
    insert into storage.objects(bucket_id,name) values('attachments','${A}/private.pdf'),('attachments','${A}/shared.txt');
    insert into public.attachments(user_id,entity_type,entity_id,storage_path,document_status) values('${A}','task','${A}','${A}/private.pdf','kept'),('${A}','task','${A}','${A}/shared.txt',null);`)
  migration('2026-08-03_attachments_household_visibility.sql')
  check('baseline reproduces foreign-path metadata bypass',()=>{
    assert.equal(sql(as(C,`select count(*) from storage.objects where name='${A}/private.pdf'`)),'0')
    sql(as(C,`insert into public.attachments(user_id,entity_type,entity_id,storage_path) values('${C}','document','${C}','${A}/private.pdf')`))
    assert.equal(sql(as(C,`select count(*) from storage.objects where name='${A}/private.pdf'`)),'1')
  })
  migration('20261016093500_attachment_object_ownership.sql')
  check('existing forged metadata cannot grant private object access',()=>assert.equal(sql(as(C,`select count(*) from storage.objects where name='${A}/private.pdf'`)),'0'))
  check('uploader can read own file; household sees shared but not private file',()=>{
    assert.equal(sql(as(A,'select count(*) from storage.objects')),'2')
    assert.equal(sql(as(B,'select count(*) from storage.objects')),'1')
    assert.equal(sql(as(C,'select count(*) from storage.objects')),'0')
  })
  check('cannot create metadata pointing at another uploader',()=>assert.throws(()=>sql(as(C,`insert into public.attachments(user_id,entity_type,entity_id,storage_path) values('${C}','document','${C}','${A}/shared.txt')`))))
  check('cannot repoint own legitimate metadata to another uploader',()=>{
    sql(as(C,`insert into public.attachments(user_id,entity_type,entity_id,storage_path) values('${C}','document','${C}','${C}/own.txt')`))
    assert.throws(()=>sql(as(C,`update public.attachments set storage_path='${A}/shared.txt' where storage_path='${C}/own.txt'`)))
  })
  migration('20261016093000_oauth_transactions.sql')
  const nonce='10000000-0000-0000-0000-000000000001', redirect='https://app.symphony-os.com/calendar-callback'
  const consume=(who=A,url=redirect)=>`set role service_role; select public.consume_oauth_transaction('${nonce}','${who}','google','${url}')`
  sql(`insert into public.oauth_transactions values('${nonce}','${A}','google','${redirect}',now()+interval '10 minutes',null)`)
  check('wrong user and redirect cannot consume a valid sign-in',()=>{assert.equal(sql(consume(B)),'f');assert.equal(sql(consume(A,'https://wrong.test')),'f')})
  const exec=promisify(execFile)
  const raced=await Promise.all(Array.from({length:8},()=>exec(join(bin,'psql'),[...args,'-c',consume()],{encoding:'utf8'}).then(r=>r.stdout.trim().split('\n').at(-1))))
  check('only one of eight simultaneous callbacks can consume the transaction',()=>assert.equal(raced.filter(x=>x==='t').length,1))
  check('replay is refused',()=>assert.equal(sql(consume()),'f'))
  check('expired transaction is refused',()=>{
    sql(`update public.oauth_transactions set consumed_at=null,expires_at=now()-interval '1 second'`)
    assert.equal(sql(consume()),'f')
  })
  check('ordinary clients cannot create, inspect, or consume server transactions',()=>{
    assert.throws(()=>sql(as(A,'select * from public.oauth_transactions')))
    assert.throws(()=>sql(as(A,`select public.consume_oauth_transaction('${nonce}','${A}','google','${redirect}')`)))
  })
  console.log(`${count} security checks passed; disposable database only.`)
} finally {
  if(started) execFileSync(join(bin,'pg_ctl'),['-D',join(root,'data'),'-m','immediate','-w','stop'],{stdio:'ignore'})
  rmSync(root,{recursive:true,force:true})
}
