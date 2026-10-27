import {test,expect} from '@playwright/test';
test('search, filters, sorting, themes, and preview controls',async({page})=>{
  await page.route('https://api.busy.tedt.org/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"downloads":{}}'}));
  const catalog=(await (await page.request.get('/apps.json')).json()).apps;
  await page.goto('/');
  await expect(page.locator('[data-result-count]')).toHaveText(String(catalog.filter(a=>a.status==='active').length));
  await page.locator('#search').fill('codex');
  await expect(page.locator('[data-result-count]')).toHaveText(String(catalog.filter(a=>a.status==='active'&&[a.name,a.description,a.author,...a.tags].join(' ').toLowerCase().includes('codex')).length));
  await page.locator('#source').selectOption('tedt');
  await expect(page.locator('[data-empty]')).toBeVisible();
  await page.locator('[data-reset]').click();
  await page.locator('#sort').selectOption('name');
  await expect(page.locator('[data-gallery] [data-app-card]').first()).toHaveAttribute('data-name',[...catalog].sort((a,b)=>a.name.localeCompare(b.name))[0].name);
  await page.locator('[data-theme-choice="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.locator('[data-theme-choice="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('html')).not.toHaveClass(/motion-on/);
});
test('download acknowledgment and tracking failure do not block static ZIPs',async({page})=>{
  await page.route('https://api.busy.tedt.org/**',route=>route.abort());
  await page.goto('/apps/community/busy-codex/');
  const download=page.getByRole('link',{name:'Download Complete App',exact:true});
  await expect(download).toHaveAttribute('aria-disabled','true');
  await page.locator('[data-trust-ack]').check();
  await expect(download).toHaveAttribute('aria-disabled','false');
  const event=page.waitForEvent('download');await download.click();const received=await event;
  expect(received.suggestedFilename()).toBe('busy-codex.zip');
});
test('mobile pages fit the screen and honor reduced motion',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  for(const route of ['/','/apps/community/busy-codex/','/ideas/','/contributors/']){
    await page.goto(route);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator('html')).not.toHaveClass(/motion-on/);
  }
  await page.goto('/ideas/');await expect(page.getByRole('link',{name:'Suggest an App',exact:true})).toHaveAttribute('href',/discussions\/new\?category=ideas/);
});
