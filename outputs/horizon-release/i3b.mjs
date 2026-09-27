import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open({ who: 'sky' })
await page.goto(BASE + '/today'); await page.waitForTimeout(3000)
await page.getByText('Compare three rentals').first().click(); await page.waitForTimeout(1500)
const panel = page.getByRole('complementary').last()
console.log('panel buttons:', (await page.locator('aside, [role=complementary], [role=dialog]').last().getByRole('button').allInnerTexts()).map((s) => s.trim()).filter(Boolean).join(' | '))
console.log('inputs:', (await page.locator('input, textarea, [contenteditable]').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.tagName + ':' + (e.getAttribute('aria-label') || e.getAttribute('placeholder') || '')))).join(' | '))
await shot(page, 'i13a-panel', false)
await browser.close()
