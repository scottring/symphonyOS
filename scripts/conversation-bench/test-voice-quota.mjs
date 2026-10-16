// Disposable local PostgreSQL proof; never connects to hosted data.
import {execFileSync} from 'node:child_process'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
const bin=process.env.PG_BIN??'/opt/homebrew/opt/postgresql@17/bin',root=mkdtempSync(join(tmpdir(),'voice-quota-')),cluster=join(root,'db')
const args=['-h',root,'-p','55459','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-X','-q','-t','-A']
const sql=s=>execFileSync(join(bin,'psql'),args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
const uid='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002'
const call=s=>sql(`set role authenticated;set request.jwt.claim.sub='${uid}';${s}`)
let started=false
try{
 execFileSync(join(bin,'initdb'),['-D',cluster,'-U','postgres','--auth=trust','--no-locale'],{stdio:'ignore'})
 execFileSync(join(bin,'pg_ctl'),['-D',cluster,'-l',join(root,'server.log'),'-o',`-k ${root} -h '' -p 55459`,'-w','start'],{stdio:'ignore'});started=true
 sql(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${uid}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 for(const name of ['20261009163000_workspace_voice_pilot_usage.sql','20261015143000_workspace_voice_start_settlement.sql'])sql(readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'))
 const id='10000000-0000-0000-0000-000000000001'
 assert.equal(call(`select public.reserve_workspace_voice_start_v2('${id}')`),'t')
 assert.equal(call(`select public.reserve_workspace_voice_start_v2('${id}')`),'f')
 assert.equal(sql('select starts from workspace_voice_usage'),'1')
 assert.throws(()=>call(`select public.settle_workspace_voice_start('${id}','${uid}',false)`),'Caller cannot refund')
 sql(`set role service_role;select public.settle_workspace_voice_start('${id}','${other}',false)`)
 assert.equal(sql('select starts from workspace_voice_usage'),'1','Wrong user cannot release')
 // Midnight rollover: release the reserved day, never today's separate bucket.
 sql(`update workspace_voice_usage set usage_day=current_date-1;update workspace_voice_start_reservations set usage_day=current_date-1`)
 sql(`set role service_role;select public.settle_workspace_voice_start('${id}','${uid}',false);select public.settle_workspace_voice_start('${id}','${uid}',false)`)
 assert.equal(sql('select starts from workspace_voice_usage'),'0','Only one refund')
 for(let n=1;n<=12;n++)assert.equal(call(`select public.reserve_workspace_voice_start_v2('20000000-0000-0000-0000-${String(n).padStart(12,'0')}')`),'t')
 assert.equal(call("select public.reserve_workspace_voice_start_v2('30000000-0000-0000-0000-000000000001')"),'f','13th start refused')
 const accepted='20000000-0000-0000-0000-000000000001'
 sql(`set role service_role;select public.settle_workspace_voice_start('${accepted}','${uid}',true);select public.settle_workspace_voice_start('${accepted}','${uid}',false)`)
 assert.equal(sql('select starts from workspace_voice_usage where usage_day=current_date'),'12','Accepted start cannot be refunded later')
 const released='20000000-0000-0000-0000-000000000002'
 sql(`set role service_role;select public.settle_workspace_voice_start('${released}','${uid}',false)`)
 assert.equal(call("select public.reserve_workspace_voice_start_v2('30000000-0000-0000-0000-000000000002')"),'t','Failed handshake frees one slot')
 console.log('PASS real PostgreSQL: cap, duplicate IDs, idempotent refunds, authorization, midnight, accepted starts, replacement slot')
}finally{if(started)execFileSync(join(bin,'pg_ctl'),['-D',cluster,'-m','immediate','-w','stop'],{stdio:'ignore'});rmSync(root,{recursive:true,force:true})}
