import { open, shot, BASE } from './pw.mjs'
{
  const { browser, page } = await open({ who: 'casey' })
  await page.goto(BASE + '/season?start=2026-09-01'); await page.waitForTimeout(3500)
  await page.getByRole('button', { name: /^Show all \d+/ }).click()
  await page.getByRole('button', { name: 'Link Buy snow tires to a goal' }).click()
  await page.getByRole('dialog', { name: 'Link to goal' }).getByRole('button', { name: /Get the house ready for winter/ }).click(); await page.waitForTimeout(2000)
  await page.reload(); await page.waitForTimeout(3000)
  const exp = page.getByRole('button', { name: 'Show next actions under Get the house ready for winter' }); if (await exp.count()) await exp.click()
  await shot(page, 'k8-fall-final-desk', true)
  console.log('GOAL:', (await page.getByRole('region', { name: /goals$/ }).innerText()).match(/Get the house ready for winter.{0,260}/s)?.[0].replace(/\n+/g, ' | '))
  await browser.close()
}
{
  const { browser, page } = await open({ who: 'casey', width: 390, height: 844 })
  await page.goto(BASE + '/season?start=2026-09-01'); await page.waitForTimeout(3500)
  await shot(page, 'k9-fall-final-phone-top', false)
  await page.getByRole('heading', { name: 'Single actions' }).scrollIntoViewIfNeeded(); await shot(page, 'k9-fall-final-phone-actions', false)
  const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); console.log('phone overflow', o)
  await page.getByRole('button', { name: 'Any of these goals? Choose…' }).click(); await page.waitForTimeout(500)
  await shot(page, 'k9-phone-sort-panel', false)
  const o2 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); console.log('panel overflow', o2)
  await browser.close()
}
