import { open } from './pw.mjs'
import { createClient } from '@supabase/supabase-js'
for (const [who, hh, partner] of [['sky', 'Nova household', 'Rowan']]) {
  const { browser, page } = await open({ who })
  if (await page.getByLabel('Household name').count()) {
    await page.getByLabel('Household name').fill(hh); await page.getByPlaceholder('Partner’s name').fill(partner)
    await page.getByRole('button', { name: 'Set up my household' }).click(); await page.waitForTimeout(4000)
  }
  await browser.close()
}
const admin = createClient('http://127.0.0.1:55321', process.env.LOCAL_SR, { auth: { persistSession: false } })
const users = (await admin.auth.admin.listUsers()).data.users
const sky = users.find((u) => u.email === 'sky@horizon.test'), rowan = users.find((u) => u.email === 'rowan@horizon.test')
const { data: hm } = await admin.from('household_members').select('household_id').eq('user_id', sky.id).single()
await admin.from('household_members').upsert({ household_id: hm.household_id, user_id: rowan.id, role: 'member', status: 'active', joined_at: new Date().toISOString() }, { onConflict: 'household_id,user_id' })
console.log('household', hm.household_id)
