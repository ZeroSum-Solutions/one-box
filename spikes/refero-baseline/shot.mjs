import { chromium } from 'playwright';
const out = 'spikes/refero-baseline/shots';
const b = await chromium.launch();
for (const [name, w, h] of [['desktop',1440,900],['mobile',390,844]]) {
  const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:2 });
  const errs = [];
  p.on('console', m => m.type()==='error' && errs.push(m.text()));
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:4321', { waitUntil:'networkidle' });
  // Deterministically load every image before shooting. Relying on a scroll
  // pass to trigger loading="lazy" is a race: it decoded on desktop and
  // intermittently failed on mobile, which renders below-fold images blank and
  // reads as a broken layout rather than a harness gap.
  await p.evaluate(async () => {
    const imgs = [...document.images];
    imgs.forEach((i) => { i.loading = 'eager'; i.fetchPriority = 'high'; });
    await Promise.all(imgs.map((i) =>
      i.complete && i.naturalWidth ? null : i.decode().catch(() => {})
    ));
  });
  try {
    await p.waitForFunction(
      () => [...document.images].every((i) => i.complete && i.naturalWidth > 0),
      null, { timeout: 20000 }
    );
  } catch {
    const missing = await p.evaluate(() =>
      [...document.images].filter((i) => !i.complete || !i.naturalWidth)
        .map((i) => i.src.split('/').pop()));
    console.log(`  WARN ${name}: images not decoded ->`, missing.join(', ') || '(none)');
  }
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
