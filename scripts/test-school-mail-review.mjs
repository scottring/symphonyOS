import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
const bin = '/opt/homebrew/opt/postgresql@17/bin',
  root = mkdtempSync(join(tmpdir(), 'symphony-school-')),
  args = [
    '-h',
    root,
    '-p',
    '55448',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
  ]
const sql = (q) =>
  execFileSync(join(bin, 'psql'), [...args, '-c', q], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim().split('\n').at(-1)
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const A = id(1),
  B = id(2),
  OTHER = id(3),
  DISPLAY = id(4),
  H = id(10),
  H2 = id(11),
  K = id(20),
  K2 = id(21)
const auth = (q, user = A) =>
  `set role authenticated;set request.jwt.claim.sub='${user}';${q}`
const service = (q) => `set role service_role;${q}`
const json = (value) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
const item = {
  id: 'event-0',
  kind: 'event',
  title: 'Picture day',
  date: '2026-10-20',
  time: null,
  memberIds: [K],
  quote: 'Picture day is October 20.',
}
let checks = 0, started = false
const check = (name, fn) => {
  fn()
  checks++
  console.log('PASS ' + name)
}
const capture = (n, household = H) => {
  const c = id(n)
  sql(
    `insert into captures(id,user_id,household_id,kind,source_key,subject,raw_text,review_required) values('${c}','${
      household === H ? A : OTHER
    }','${household}','email','email:${n}','Weekly update','Source text',true)`,
  )
  return c
}
const stage = (c, items = [item]) => {
  const lease = sql(service(`select claim_school_mail_review('${c}')`))
  assert.notEqual(lease, '')
  assert.equal(
    sql(
      service(
        `select finish_school_mail_review('${c}','${lease}',${
          json({ items, gaps: [] })
        })`,
      ),
    ),
    't',
  )
  return lease
}
const save = (c, items, user = A) =>
  JSON.parse(
    sql(auth(`select save_school_mail_review('${c}',${json(items)})`, user)),
  )
try {
  execFileSync(join(bin, 'initdb'), [
    '-D',
    join(root, 'data'),
    '-U',
    'postgres',
    '--auth=trust',
    '--no-locale',
  ], { stdio: 'ignore' })
  execFileSync(join(bin, 'pg_ctl'), [
    '-D',
    join(root, 'data'),
    '-l',
    join(root, 'server.log'),
    '-o',
    `-k ${root} -h '' -p 55448`,
    '-w',
    'start',
  ], { stdio: 'ignore' })
  started = true
  sql(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 grant usage on schema auth to authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}'),('${OTHER}'),('${DISPLAY}');
 create table households(id uuid primary key,inbound_token text,timezone text default 'America/New_York');insert into households(id) values('${H}'),('${H2}');
 create table household_members(household_id uuid,user_id uuid,role text,status text,created_at timestamptz default now());
 insert into household_members values('${H}','${A}','owner','active'),('${H}','${B}','member','active'),('${H2}','${OTHER}','owner','active'),('${H}','${DISPLAY}','display','active');
 create table family_members(id uuid primary key,user_id uuid,name text,member_type text,display_order int);
 insert into family_members values('${K}','${A}','Casey','core',1),('${K2}','${OTHER}','Foreign child','core',1);
 alter table family_members add column auth_user_id uuid,add column role_label text;
 create function users_share_household(a uuid,b uuid) returns boolean language sql as $$ select exists(select 1 from household_members x join household_members y using(household_id) where x.user_id=a and y.user_id=b) $$;
 create table captures(id uuid primary key,user_id uuid,household_id uuid,kind text,source_key text,subject text,source_label text,raw_text text,status text default 'pending',error text,created_at timestamptz default now(),reviewed_at timestamptz);
 alter table captures enable row level security;
 create table tasks(id uuid primary key default gen_random_uuid(),user_id uuid,title text,completed boolean,bucket text,context text,scope text,category text,scheduled_for timestamptz,is_all_day boolean,location text,notes text,capture_id uuid,assigned_to uuid,assigned_to_all uuid[],needed_on date);
 create table routines(id uuid primary key default gen_random_uuid(),user_id uuid,name text,description text,recurrence_pattern jsonb,time_of_day text,visibility text,assigned_to uuid,assigned_to_all uuid[],context text,scope text,show_on_timeline boolean,raw_input text);
 create table notices(id uuid primary key default gen_random_uuid(),user_id uuid,family_member_id uuid,text text,sender_label text,received_on date,capture_id uuid);
 grant select,update on captures to authenticated;grant all on all tables in schema public to service_role;`,
  )
  sql(
    readFileSync(
      new URL(
        '../supabase/migrations/20261016150000_school_mail_review.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  check('opening setup does not mint an address or mark email received', () => {
    const x = JSON.parse(sql(auth('select school_mail_overview(false)')))
    assert.equal(x.address, null)
    assert.equal(x.messages.length, 0)
  })
  check('address is enabled explicitly and stable across visits', () => {
    const a = JSON.parse(sql(auth('select school_mail_overview(true)')))
    assert.match(a.address, /^[0-9a-f]{16}@symphony-os.com$/)
    assert.equal(
      JSON.parse(sql(auth('select school_mail_overview(false)'))).address,
      a.address,
    )
  })
  check('paired display cannot obtain an address', () => {
    assert.equal(
      JSON.parse(sql(auth('select school_mail_overview(true)', DISPLAY)))
        .address,
      null,
    )
    assert.throws(() =>
      sql(auth(`select ensure_inbound_token('${H}')`, DISPLAY))
    )
  })
  const c = capture(100), lease = stage(c)
  check('a child login cannot read email or save even with household member access', () => {
    const child=id(5)
    sql(`insert into auth.users values('${child}');insert into household_members values('${H}','${child}','member','active');update family_members set auth_user_id='${child}',role_label='child' where id='${K}'`)
    assert.equal(JSON.parse(sql(auth('select school_mail_overview(true)',child))).address,null)
    assert.equal(sql(auth('select count(*) from school_mail_reviews',child)),'0')
    assert.throws(()=>save(c,[item],child))
  })
  check('an anonymous session cannot enable school email', () => {
    assert.throws(()=>sql(auth(`set request.jwt.claims='{"is_anonymous":true}';select ensure_inbound_token('${H}')`)))
  })
  check('extraction produces no plan rows before parent Save', () => {
    assert.equal(sql('select count(*) from tasks'), '0')
    assert.equal(sql('select count(*) from routines'), '0')
    assert.equal(sql('select count(*) from notices'), '0')
  })
  check(
    'another household and a paired display cannot read or approve a review',
    () => {
      for (const u of [OTHER, DISPLAY]) {
        assert.equal(
          sql(auth('select count(*) from school_mail_reviews', u)),
          '0',
        )
        assert.equal(sql(auth('select count(*) from captures', u)), '0')
        assert.throws(() => save(c, [item], u))
      }
    },
  )
  check('ordinary clients cannot rewrite or publish proposals', () => {
    assert.throws(() =>
      sql(auth(`update school_mail_reviews set proposal='{}'`))
    )
    assert.throws(() =>
      sql(auth(`select finish_school_mail_review('${c}','${lease}','{}')`))
    )
    assert.throws(() => sql(auth(`select claim_school_mail_review('${c}')`)))
  })
  check('a parent correction saves the chosen time and person', () => {
    const r = save(c, [{ ...item, title: 'School pictures', time: '15:00' }])
    assert.equal(r.count, 1)
    assert.equal(
      sql("select scheduled_for at time zone 'America/New_York' from tasks"),
      '2026-10-20 15:00:00',
    )
    assert.equal(sql('select assigned_to from tasks'), K)
  })
  check(
    'lost-response retry and the other parent return the same receipt',
    () => {
      const a = save(c, [item]), b = save(c, [], B)
      assert.deepEqual(a, b)
      assert.equal(sql('select count(*) from tasks'), '1')
    },
  )
  check('extractor retries cannot replace saved review', () => {
    assert.equal(sql(service(`select claim_school_mail_review('${c}')`)), '')
    assert.equal(
      sql(
        service(
          `select finish_school_mail_review('${c}','${lease}',${
            json({ items: [], gaps: [] })
          })`,
        ),
      ),
      'f',
    )
  })
  const bad = capture(101)
  stage(bad, [item, { ...item, id: 'event-1' }])
  check('invalid second item rolls back the whole save', () => {
    assert.throws(() =>
      save(bad, [item, { ...item, id: 'event-1', date: '2026-02-31' }])
    )
    assert.equal(sql('select count(*) from tasks'), '1')
    assert.equal(
      sql(`select status from school_mail_reviews where capture_id='${bad}'`),
      'ready',
    )
  })
  check(
    'foreign assignment, invalid time, unknown ids and repeated ids are refused',
    () => {
      for (
        const data of [
          [{ ...item, memberIds: [K2] }],
          [{ ...item, time: '29:70' }],
          [{ ...item, id: 'forged' }],
          [item, item],
        ]
      ) assert.throws(() => save(bad, data))
      assert.equal(sql('select count(*) from tasks'), '1')
    },
  )
  check('unchecked items are not written and dismiss is retry-safe', () => {
    const result = save(bad, [])
    assert.equal(result.status, 'dismissed')
    assert.deepEqual(save(bad, [item]), result)
    assert.equal(sql('select count(*) from tasks'), '1')
  })
  const routine = capture(102)
  const ri = {
    ...item,
    id: 'routine',
    kind: 'routine',
    date: null,
    repeat: { type: 'weekly', days: ['tue', 'thu'] },
    showOnTimeline: false,
  }
  stage(routine, [ri])
  check(
    'a reviewed routine preserves recurrence and Today/Week visibility',
    () => {
      save(routine, [ri])
      assert.equal(sql('select show_on_timeline from routines'), 'f')
      assert.deepEqual(
        JSON.parse(sql('select recurrence_pattern from routines')),
        ri.repeat,
      )
    },
  )
  const notice = capture(103),
    ni = { ...item, id: 'notice', kind: 'notice', date: null }
  stage(notice, [ni])
  check('a notice for one child stays on that child’s tablet page', () => {
    assert.equal(save(notice, [ni]).count, 1)
    assert.equal(
      sql(`select family_member_id from notices where capture_id='${notice}'`),
      K,
    )
    assert.equal(
      sql(`select count(*) from tasks where capture_id='${notice}'`),
      '0',
    )
  })
  check('the same message id can reach two households independently', () => {
    sql(
      `insert into captures(id,user_id,household_id,kind,source_key) values('${
        id(104)
      }','${OTHER}','${H2}','email','email:100')`,
    )
    assert.throws(() =>
      sql(
        `insert into captures(id,user_id,household_id,kind,source_key) values('${
          id(105)
        }','${A}','${H}','email','email:100')`,
      )
    )
  })
  const processing = capture(106)
  check(
    'processing lease excludes concurrent extraction; failed review can retry',
    () => {
      const token = sql(
        service(`select claim_school_mail_review('${processing}')`),
      )
      assert.equal(
        sql(service(`select claim_school_mail_review('${processing}')`)),
        '',
      )
      sql(
        service(
          `select finish_school_mail_review('${processing}','${token}',null,true)`,
        ),
      )
      assert.notEqual(
        sql(service(`select claim_school_mail_review('${processing}')`)),
        '',
      )
    },
  )
  const race = capture(107)
  stage(race)
  const run = promisify(execFile)
  const result = await Promise.all(
    Array.from({ length: 6 }, () =>
      run(join(bin, 'psql'), [
        ...args,
        '-c',
        auth(`select save_school_mail_review('${race}',${json([item])})`),
      ], { encoding: 'utf8' })),
  )
  check('six concurrent Save requests create one set of rows', () => {
    assert.equal(result.length, 6)
    assert.equal(
      sql(`select count(*) from tasks where capture_id='${race}'`),
      '1',
    )
  })
  const duplicate = capture(108)
  stage(duplicate)
  check(
    'a second email cannot add an exact copy of an existing activity',
    () => {
      const receipt = save(duplicate, [item])
      assert.equal(receipt.count, 0)
      assert.deepEqual(receipt.skipped, ['Picture day'])
      assert.equal(
        sql(`select count(*) from tasks where capture_id='${duplicate}'`),
        '0',
      )
    },
  )
  check('a removed member loses review access', () => {
    sql(`update household_members set status='removed' where user_id='${B}'`)
    assert.throws(() => save(race, [], B))
    assert.equal(sql(auth('select count(*) from school_mail_reviews', B)), '0')
  })
  console.log(
    `${checks} school-email database checks passed; disposable PostgreSQL only.`,
  )
} finally {
  if (started) {
    execFileSync(join(bin, 'pg_ctl'), [
      '-D',
      join(root, 'data'),
      '-m',
      'immediate',
      '-w',
      'stop',
    ], { stdio: 'ignore' })
  }
  rmSync(root, { recursive: true, force: true })
}
