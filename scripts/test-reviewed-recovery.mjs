import assert from 'node:assert/strict'
import {execFileSync,execFile} from 'node:child_process'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
const bin='/opt/homebrew/opt/postgresql@17/bin',root=mkdtempSync(join(tmpdir(),'symphony-recovery-')),args=['-h',root,'-p','55447','-U','postgres','-d','postgres','-X','-At','-v','ON_ERROR_STOP=1']
const sql=q=>execFileSync(join(bin,'psql'),[...args,'-c',`select 1;\n${q}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split('\n').at(-1)
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',T='10000000-0000-0000-0000-000000000001'
const auth=(q,user=A)=>`set role authenticated;set request.jwt.claim.sub='${user}';${q}`
const begin=key=>JSON.parse(sql(auth(`select public.begin_reviewed_change('${key}','{}')`)))
const tagged=(r,q)=>auth(`set request.headers='${JSON.stringify({'x-symphony-command':r.id,'x-symphony-attempt':r.attempt})}';${q}`)
const finish=r=>sql(auth(`select public.finish_reviewed_change('${r.id}','${r.attempt}','["${T}"]')`))
const undo=r=>sql(auth(`select public.undo_reviewed_change('${r.id}','${r.attempt}')`))
let checks=0,started=false
const check=(s,fn)=>{fn();checks++;console.log('PASS '+s)}
try {
 execFileSync(join(bin,'initdb'),['-D',join(root,'data'),'-U','postgres','--auth=trust','--no-locale'],{stdio:'ignore'})
 execFileSync(join(bin,'pg_ctl'),['-D',join(root,'data'),'-l',join(root,'server.log'),'-o',`-k ${root} -h '' -p 55447`,'-w','start'],{stdio:'ignore'});started=true
 sql(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}');
 create table public.tasks(id uuid primary key default gen_random_uuid(),user_id uuid not null,title text,updated_at timestamptz default clock_timestamp());
 create table public.routines(like public.tasks including all);create table public.goals(like public.tasks including all);create table public.list_items(like public.tasks including all);
 create table public.task_commitments(id uuid primary key default gen_random_uuid(),task_id uuid references public.tasks(id) on delete cascade,status text);
 create table public.task_focus(task_id uuid references public.tasks(id) on delete cascade,user_id uuid,date date,primary key(task_id,user_id,date));
 create table public.actionable_instances(like public.tasks including all);
 create table public.attachments(id uuid primary key default gen_random_uuid(),entity_type text,entity_id text);
 create table public.private_children(id uuid primary key default gen_random_uuid(),task_id uuid references public.tasks(id) on delete cascade);
 alter table public.tasks enable row level security;create policy own on public.tasks to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 alter table public.private_children enable row level security;
 grant select,insert,update,delete on all tables in schema public to authenticated;
 create function public.stamp_task() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
 create trigger stamp before update on public.tasks for each row execute function public.stamp_task();`)
 sql(readFileSync(new URL('../supabase/migrations/20261016100000_reviewed_change_recovery.sql',import.meta.url),'utf8'))
 let r=begin('lost-ack')
 check('create survives a lost acknowledgement in its durable journal',()=>{
  assert.equal(r.fresh,true);sql(tagged(r,`insert into public.tasks(id,user_id,title) values('${T}','${A}','Call Morgan')`));assert.equal(begin('lost-ack').fresh,false)
  assert.equal(sql(auth(`select count(*) from public.reviewed_change_rows where command_id='${r.id}'`)),'1')
 })
 check('interrupted save recovers before retry; old requests cannot write later',()=>{
  assert.equal(undo(r),'t');assert.equal(sql('select count(*) from public.tasks'),'0')
  const old=r;r=begin('lost-ack');assert.notEqual(r.attempt,old.attempt)
  assert.throws(()=>sql(tagged(old,`insert into public.tasks(user_id,title) values('${A}','late old request')`)))
  sql(tagged(r,`insert into public.tasks(id,user_id,title) values('${T}','${A}','Call Morgan')`));finish(r)
  assert.equal(begin('lost-ack').status,'saved');assert.equal(sql('select count(*) from public.tasks'),'1')
 })
 check('created row edited immediately afterward cannot be deleted by Undo',()=>{
  sql(auth(`update public.tasks set title='Morgan called already' where id='${T}'`));assert.throws(()=>undo(r));assert.equal(sql(`select title from public.tasks where id='${T}'`),'Morgan called already')
 })
 let u=begin('update')
 sql(tagged(u,`update public.tasks set title='Corrected' where id='${T}'`));finish(u)
 check('ordinary update Undo restores its before-image and can be retried',()=>{
  assert.equal(undo(u),'t');assert.equal(undo(u),'t');assert.equal(sql(`select title from public.tasks where id='${T}'`),'Morgan called already')
 })
 u=begin('conflict');sql(tagged(u,`update public.tasks set title='Draft one' where id='${T}'`));finish(u)
 check('sub-second later edit is protected with no grace period',()=>{
  sql(auth(`update public.tasks set title='Later edit' where id='${T}'`));assert.throws(()=>undo(u));assert.equal(sql(`select title from public.tasks where id='${T}'`),'Later edit')
 })
 check('another user cannot inspect, finish, undo or forge the receipt',()=>{
  assert.equal(sql(auth(`select count(*) from public.reviewed_changes`,B)),'0')
  assert.throws(()=>sql(auth(`select public.undo_reviewed_change('${u.id}','${u.attempt}')`,B)))
  assert.throws(()=>sql(auth(`update public.reviewed_change_rows set after_row='{}'`)))
  assert.throws(()=>sql(auth(`set request.headers='${JSON.stringify({'x-symphony-command':u.id,'x-symphony-attempt':u.attempt})}';insert into public.tasks(user_id,title) values('${B}','forged')`,B)))
 })
 let c=begin('new-child');const childTask='20000000-0000-0000-0000-000000000001'
 sql(tagged(c,`insert into public.tasks(id,user_id,title) values('${childTask}','${A}','Parent')`));finish(c)
 check('private children added later prevent cascading deletion',()=>{
  sql(`insert into public.private_children(task_id) values('${childTask}')`);assert.throws(()=>undo(c));assert.equal(sql(`select count(*) from public.private_children`),'1')
 })
 check('all conflicts are checked before any part of Undo changes data',()=>{
  const x=begin('two-updates');sql(tagged(x,`update public.tasks set title='Both changed'`));finish(x)
  sql(auth(`update public.tasks set title='Keep this' where id='${childTask}'`));assert.throws(()=>undo(x));assert.equal(sql(`select title from public.tasks where id='${T}'`),'Both changed')
 })
 check('ordinary clients cannot rewrite receipt contents',()=>{
  assert.throws(()=>sql(auth(`update public.reviewed_changes set payload='{}'`)));assert.throws(()=>sql(auth(`delete from public.reviewed_change_rows`)))
 })
 const fresh=begin('racing-undo'),freshId='30000000-0000-0000-0000-000000000001'
 sql(tagged(fresh,`insert into public.tasks(id,user_id,title) values('${freshId}','${A}','Once')`));finish(fresh)
 const run=promisify(execFile)
 const races=await Promise.all(Array.from({length:8},()=>run(join(bin,'psql'),[...args,'-c',auth(`select public.undo_reviewed_change('${fresh.id}','${fresh.attempt}')`)],{encoding:'utf8'})))
 check('eight simultaneous Undo calls safely produce one inverse',()=>{assert.equal(races.length,8);assert.equal(sql(`select count(*) from public.tasks where id='${freshId}'`),'0')})
 console.log(`${checks} recovery checks passed; disposable PostgreSQL only.`)
} finally {if(started)execFileSync(join(bin,'pg_ctl'),['-D',join(root,'data'),'-m','immediate','-w','stop'],{stdio:'ignore'});rmSync(root,{recursive:true,force:true})}
