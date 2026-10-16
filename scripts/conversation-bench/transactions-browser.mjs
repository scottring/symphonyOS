import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { gradeRecords } from './grading.mjs'
const cases=JSON.parse(readFileSync(new URL('./ui-journeys.json', import.meta.url)))
const browser=await chromium.launch({headless:true,channel:'chrome'})
const results=[]
try {
 for(const scenario of cases){
  const page=await browser.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
  try {
   await page.goto(`${process.env.BENCH_PREVIEW_URL??'http://127.0.0.1:5183'}/scripts/conversation-bench/transaction-preview.html?case=${scenario.id}`)
   await page.getByTestId('records').waitFor()
   const read=async()=>JSON.parse(await page.getByTestId('records').textContent())
   const before=await read()
   for(const _ of scenario.stages){await page.getByRole('button',{name:'Stage proposal',exact:true}).click();await page.getByRole('button',{name:/^Save \d+ changes?$/}).waitFor();assert.deepEqual(await read(),before,'proposal wrote records before approval');assert.equal(await page.locator('.change-card').count(),1)}
   await page.reload();await page.getByRole('button',{name:/^Save \d+ changes?$/}).waitFor();assert.deepEqual(await read(),before,'Pending-card reload must not write')
   if(scenario.fault==='stale')await page.getByRole('button',{name:'Simulate another edit'}).click()
   await page.getByRole('button',{name:/^Save \d+ changes?$/}).click()
   await page.waitForFunction(()=>['saved','failed','partial'].includes(document.querySelector('[data-testid="receipt"]').textContent))
   assert.equal(await page.getByTestId('receipt').textContent(),scenario.receipt??'saved','receipt must reflect actual result')
   assert.deepEqual(gradeRecords(scenario.expected,await read(),before),[],'persisted fixture records')
   if(scenario.receipt==='partial')assert.equal(await page.getByRole('button',{name:'Ask for an updated card'}).isDisabled(),true,'Partial writes must not be blindly reapplied')
   if(scenario.undo){await page.getByRole('button',{name:/^Undo / }).click();await page.getByText('Undone',{exact:true}).waitFor();assert.deepEqual(await read(),before,'Undo must restore the original records and bystanders')}
   assert.deepEqual(errors,[])
   results.push({id:scenario.id,catalog:scenario.catalog,status:'passed'})
  }catch(error){results.push({id:scenario.id,catalog:scenario.catalog,status:'failed',error:error.message,console:errors})}
  console.log(results.at(-1))
  await page.close()
 }
}finally{await browser.close()}
const report={at:new Date().toISOString(),kind:'real UI + validators + applier; synthetic persistence, no model',results}
mkdirSync(new URL('./reports/',import.meta.url),{recursive:true})
writeFileSync(new URL('./reports/browser-transactions.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
for(const r of results)console.log(`${r.status.toUpperCase()} ${r.id}${r.error?': '+r.error:''}`)
process.exitCode=results.every(r=>r.status==='passed')?0:1
