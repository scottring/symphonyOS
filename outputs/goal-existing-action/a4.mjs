// Codex review of ee451922: (1) a lost save response that committed, (2) a concurrent relink during confirmation,
// (3) a save whose read-back also fails. Local stack only.
import { open, shot, BASE } from './pw.mjs'
import { createClient } from '@supabase/supabase-js'
const goalName = 'GEA Identify family activities for fall'
const samClient = createClient('http://127.0.0.1:55321', process.env.LOCAL_ANON, { auth: { persistSession: false } })
await samClient.auth.signInWithPassword({ email: 'sam@horizon.test', password: 'horizon-local-1' })
const { data: samUser } = await samClient.auth.getUser()
let { data: third } = await samClient.from('tasks').select('id').eq('title', 'GEA Plan winter break').maybeSingle()
if (!third) third = (await samClient.from('tasks').insert({ user_id: samUser.user.id, title: 'GEA Plan winter break', bucket: 'month', month_start: '2026-10-01', is_goal: true, context: 'family', scope: 'compound' }).select('id').single()).data
const { browser, ctx, page } = await open({ who: 'alex' })
await page.goto(BASE + '/month?start=2026-10-01'); await page.waitForTimeout(3500)
const b = page.locator('li', { hasText: goalName }).locator('.period-goal-open').first(); if (/show/.test(await b.innerText())) await b.click(); await page.waitForTimeout(400)
await page.getByRole('button', { name: `Add an existing action to ${goalName}` }).click(); await page.waitForTimeout(400)
const dlg = page.getByRole('dialog', { name: 'Add an existing action' })
const search = dlg.getByRole('searchbox')

// 1. The PATCH reaches the database and commits, but its response is lost.
await ctx.route(/\/rest\/v1\/tasks\?.*goal_task_id/, async (r) => {
  if (r.request().method() !== 'PATCH') return r.continue()
  await r.fetch()          // the write lands
  return r.abort('failed') // the answer never comes back
})
await search.fill('errand 01'); await page.waitForTimeout(300)
await dlg.getByRole('button', { name: /GEA Errand 01/ }).click(); await page.waitForTimeout(1500)
console.log('1 LOST RESPONSE →', await dlg.getByRole('status').innerText().catch(() => 'no status'), '|', await dlg.getByRole('alert').innerText().catch(() => 'no alert'))
await ctx.unrouteAll({ behavior: 'ignoreErrors' })

// 2. Confirm opens for swim (under winter); meanwhile Sam moves it to his own goal.
await search.fill('swim'); await page.waitForTimeout(300)
await dlg.getByRole('button', { name: /GEA Look up swim lessons/ }).click(); await page.waitForTimeout(300)
const { error: samErr } = await samClient.from('tasks').update({ goal_task_id: third.id }).eq('title', 'GEA Look up swim lessons')
console.log('2 Sam moved it meanwhile:', samErr ? samErr.message : 'yes')
await dlg.getByRole('button', { name: /^Move it to/ }).click(); await page.waitForTimeout(1500)
console.log('2 CONFLICT →', await dlg.getByRole('alert').innerText().catch(() => 'no alert'))
await shot(page, 'a4-conflict', false)

// 3. Write AND read-back both lost.
await ctx.route(/\/rest\/v1\/tasks\?.*goal_task_id/, (r) => r.abort('failed'))
await search.fill('errand 02'); await page.waitForTimeout(300)
await dlg.getByRole('button', { name: /GEA Errand 02/ }).click(); await page.waitForTimeout(1500)
console.log('3 UNKNOWN →', await dlg.getByRole('alert').innerText().catch(() => 'no alert'))
// 4. Connection back: the retry reads first (the row is still free), then writes.
await ctx.unrouteAll({ behavior: 'ignoreErrors' })
await dlg.getByRole('button', { name: /GEA Errand 02/ }).click(); await page.waitForTimeout(1500)
console.log('4 RETRY AFTER RECOVERY →', await dlg.getByRole('status').innerText().catch(() => 'no status'))
await browser.close()
