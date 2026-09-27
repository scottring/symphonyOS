import { open, BASE } from './pw.mjs'
const { browser, page } = await open({ who: 'casey' })
if (await page.getByLabel('Household name').count()) {
  await page.getByLabel('Household name').fill('Morgan household')
  await page.getByPlaceholder('Partner’s name').fill('Jordan')
  await page.getByRole('button', { name: 'Set up my household' }).click(); await page.waitForTimeout(4000)
}
console.log(page.url())
await browser.close()
