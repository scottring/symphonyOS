// Multi-account calendar connections (2026-10-18), against a disposable
// PostgreSQL only; no credentials or remote services.
//   node scripts/test-calendar-accounts-migration.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const bin = process.argv[process.argv.indexOf('--pg-bin') + 1]
if (!bin?.includes('/')) throw new Error('Pass --pg-bin /path/to/postgres/bin')
const root = mkdtempSync(join(tmpdir(), 'symphony-calendar-accounts-'))
const args = ['-h',root,'-p','55449','-U','postgres','-d','postgres','-X','-At','-v','ON_ERROR_STOP=1']
const sql = q => execFileSync(join(bin,'psql'),[...args,'-c',`select 1;\n${q}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split('\n').at(-1)
const migration = name => sql(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002'
const as = (u,q) => `set role authenticated; set request.jwt.claim.sub='${u}'; ${q}`
const conn = (user, provider, email, primary = false, id = 'gen_random_uuid()') =>
  `insert into public.calendar_connections(id,user_id,provider,access_token,refresh_token,token_expires_at,account_email,is_primary)
   values(${id},'${user}','${provider}','t','r',now(),${email ? `'${email}'` : 'null'},${primary})`
const primaries = (user, provider = 'google') =>
  sql(`select coalesce(string_agg(account_email, ',' order by account_email), '') from public.calendar_connections where user_id='${user}' and provider='${provider}' and is_primary`)
let count=0, started=false
const check=(name,fn)=>{fn();count++;console.log('PASS '+name)}
try {
  execFileSync(join(bin,'initdb'),['-D',join(root,'data'),'-U','postgres','--auth=trust','--no-locale'],{stdio:'ignore'})
  execFileSync(join(bin,'pg_ctl'),['-D',join(root,'data'),'-l',join(root,'server.log'),'-o',`-k ${root} -h '' -p 55449`,'-w','start'],{stdio:'ignore'}); started=true
  sql(`create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key); insert into auth.users values('${A}'),('${B}');`)
  migration('001_calendar_connections.sql')
  migration('20261015140000_calendar_connections_granted_scopes.sql')
  sql(`grant select,insert,update,delete on public.calendar_connections to authenticated;
    insert into public.calendar_connections(user_id,provider,access_token,refresh_token,token_expires_at) values('${A}','google','t','r',now()),('${B}','google','t','r',now())`)

  check('baseline: a second Google account is refused (the bug)',()=>assert.throws(()=>sql(conn(A,'google','me@work.com'))))
  migration('20261018150000_calendar_connections_multi_account.sql')

  check('every existing row becomes its provider primary, unnamed',()=>{
    assert.equal(sql(`select count(*) from public.calendar_connections where is_primary and account_email is null`),'2')
  })
  check('a second Google account and an Outlook account sit beside the first',()=>{
    sql(`update public.calendar_connections set account_email='me@gmail.com' where user_id='${A}'`)
    sql(conn(A,'google','me@work.com'))
    sql(conn(A,'microsoft','me@outlook.com',true))
    sql(conn(A,'microsoft','me@corp.com'))
    assert.equal(sql(`select count(*) from public.calendar_connections where user_id='${A}'`),'4')
  })
  check('the same account twice is refused',()=>assert.throws(()=>sql(conn(A,'google','me@work.com'))))
  check('reconnecting an account updates its row through the new conflict key',()=>{
    sql(`insert into public.calendar_connections(user_id,provider,access_token,refresh_token,token_expires_at,account_email)
      values('${A}','google','fresh','r2',now(),'me@work.com') on conflict (user_id,provider,account_email) do update set access_token=excluded.access_token`)
    assert.equal(sql(`select access_token from public.calendar_connections where account_email='me@work.com'`),'fresh')
    assert.equal(sql(`select count(*) from public.calendar_connections where user_id='${A}' and provider='google'`),'2')
  })
  check('two primaries for one provider are refused',()=>assert.throws(()=>sql(`update public.calendar_connections set is_primary=true where account_email='me@work.com'`)))
  check('a person can make another of their accounts primary',()=>{
    const id=sql(`select id from public.calendar_connections where account_email='me@work.com'`)
    assert.equal(sql(as(A,`select public.make_calendar_connection_primary('${id}')`)),'t')
    assert.equal(primaries(A),'me@work.com')
    assert.equal(primaries(A,'microsoft'),'me@outlook.com')
  })
  check("nobody can make someone else's account primary",()=>{
    const id=sql(`select id from public.calendar_connections where account_email='me@gmail.com'`)
    assert.equal(sql(as(B,`select public.make_calendar_connection_primary('${id}')`)),'f')
    assert.equal(primaries(A),'me@work.com')
  })
  check('anonymous callers cannot call it at all',()=>{
    const id=sql(`select id from public.calendar_connections where account_email='me@gmail.com'`)
    assert.throws(()=>sql(`set role anon; select public.make_calendar_connection_primary('${id}')`))
  })
  check('disconnecting the primary hands it to the remaining account',()=>{
    sql(as(A,`delete from public.calendar_connections where account_email='me@work.com'`))
    assert.equal(primaries(A),'me@gmail.com')
  })
  check('disconnecting a non-primary account leaves the primary alone',()=>{
    sql(as(A,`delete from public.calendar_connections where account_email='me@corp.com'`))
    assert.equal(primaries(A,'microsoft'),'me@outlook.com')
  })
  check('disconnecting every account of a provider leaves none',()=>{
    sql(as(A,`delete from public.calendar_connections where user_id='${A}' and provider='microsoft'`))
    assert.equal(sql(`select count(*) from public.calendar_connections where user_id='${A}' and provider='microsoft'`),'0')
  })
  check('running the migration again changes nothing',()=>{
    sql(conn(A,'google','second@gmail.com'))
    migration('20261018150000_calendar_connections_multi_account.sql')
    assert.equal(primaries(A),'me@gmail.com')
    sql(`delete from public.calendar_connections where account_email='second@gmail.com'`)
  })
  check("one person's accounts stay invisible to another",()=>{
    assert.equal(sql(as(B,`select count(*) from public.calendar_connections`)),'1')
    sql(as(B,`delete from public.calendar_connections where user_id='${A}'`))
    assert.equal(sql(`select count(*) from public.calendar_connections where user_id='${A}'`),'1')
  })
  console.log(`${count} calendar-account checks passed; disposable database only.`)
} finally {
  if(started) execFileSync(join(bin,'pg_ctl'),['-D',join(root,'data'),'-m','immediate','-w','stop'],{stdio:'ignore'})
  rmSync(root,{recursive:true,force:true})
}
