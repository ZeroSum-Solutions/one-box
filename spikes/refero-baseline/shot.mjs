import { chromium } from 'playwright';
const out = 'spikes/refero-baseline/shots';
const b = await chromium.launch();
for (const [name, w, h] of [['desktop',1440,900],['mobile',390,844]]) {
  const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:2 });
  const errs = [];
  p.on('console', m => m.type()==='error' && errs.push(m.text()));
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:4321', { waitUntil:'networkidle' });
  await p.screenshot({ path:`${out}/wits-${name}.png`, fullPage:true });
  const m = await p.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    vw: innerWidth,
    over: [...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).length,
    h1: document.querySelectorAll('h1').length,
    tel: !!document.querySelector('a[href^="tel:"]'),
    mail: !!document.querySelector('a[href^="mailto:"]'),
  }));
  console.log(name, JSON.stringify(m), 'consoleErrors:', errs.length, errs.slice(0,3).join(' | '));
  await p.close();
}
await b.close();
