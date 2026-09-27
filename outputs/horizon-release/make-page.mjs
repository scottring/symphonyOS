import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 1200 } })
await p.setContent(`<body style="margin:0;background:#fbf8f1;font:34px 'Comic Sans MS','Bradley Hand',cursive;color:#223;padding:60px">
<h1 style="font-size:54px;margin:0 0 30px">Fall</h1>
<p>Plan winter vacation — somewhere warm</p><p>Nourish a love of reading</p><p>Get the house ready for winter</p>
<p>Renew the passports</p><p>Buy snow tires</p><p>Pick apples at Oak Hill</p><p>Clean out the gutters</p>
<p>Flu shots — Oct 3, 10am</p><p>Swim lessons every Saturday</p></body>`)
await p.screenshot({ path: new URL('./page.jpg', import.meta.url).pathname, type: 'jpeg', quality: 80 }); await b.close(); console.log('page.jpg ok')
