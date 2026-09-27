import { open, BASE } from './pw.mjs'
import { createClient } from '@supabase/supabase-js'
const { browser, page } = await open({ who: 'riley' })
if (await page.getByLabel('Household name').count()) {
  await page.getByLabel('Household name').fill('Lee household')
  await page.getByPlaceholder('Partner’s name').fill('Drew')
  await page.getByRole('button', { name: 'Set up my household' }).click(); await page.waitForTimeout(4000)
}
await browser.close()
// Drew (a real second login) joins the household, as Settings would.
const admin = createClient('http://127.0.0.1:55321', process.env.LOCAL_SR, { auth: { persistSession: false } })
const users = (await admin.auth.admin.listUsers()).data.users
const riley = users.find((u) => u.email === 'riley@horizon.test'), drew = users.find((u) => u.email === 'drew@horizon.test')
const { data: hm } = await admin.from('household_members').select('household_id').eq('user_id', riley.id).single()
await admin.from('household_members').upsert({ household_id: hm.household_id, user_id: drew.id, role: 'member', status: 'active', joined_at: new Date().toISOString() }, { onConflict: 'household_id,user_id' })
console.log('household', hm.household_id)
