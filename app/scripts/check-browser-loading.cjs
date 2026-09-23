// Real browser download failures and retry; no gameplay-state fixtures.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),assert=require('assert');
const GAME_URL=process.env.GAME_URL||'http://127.0.0.1:8787/';
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--disable-dev-shm-usage']});const results={};
try{
 const silent=await browser.newPage();const silentErrors=[];silent.on('pageerror',e=>silentErrors.push(e.message));await silent.goto(GAME_URL);
 await silent.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>/\/audio\.js(?:\?|$)/.test(u));const {AudioEngine}=await import(url);AudioEngine.prototype.unlock=()=>new Promise(()=>{});});
 await silent.locator('#enter').click();await silent.locator('#intro').waitFor({state:'visible'});await silent.locator('#skip-intro').click();await silent.locator('#load-enter').click({timeout:30000});assert(await silent.locator('#menu').isVisible());assert.equal(silentErrors.length,0);results.pendingAudio={passed:true,continuedToMenu:true,errors:silentErrors};await silent.close();
 for(const failure of ['stalled','invalid-model']){
  const context=await browser.newContext({viewport:{width:1000,height:800}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let blocked=true,attempts=0;const held=[];
  await page.route('**/assets/novaris-vanguard.glb*',async route=>{attempts++;if(!blocked)return route.continue();if(failure==='invalid-model')return route.fulfill({contentType:'model/gltf-binary',body:'not a model'});return new Promise(resolve=>held.push({route,resolve}));});
  await page.goto(GAME_URL);const started=Date.now();await page.locator('#enter').click();await page.locator('#skip-intro').click();await page.locator('#load-retry').waitFor({state:'visible',timeout:45000});const waitMs=Date.now()-started;assert.equal(await page.locator('#load-enter').isVisible(),false);
  blocked=false;await page.locator('#load-retry').click();await page.locator('#load-enter').waitFor({state:'visible',timeout:30000});assert(attempts>=2,'Retry must make another request');await page.locator('#load-enter').click();assert(await page.locator('#menu').isVisible());assert.equal(errors.length,0);results[failure]={passed:true,waitMs,attempts,explicitRetry:true,continuedToMenu:true,errors};
  for(const h of held){await h.route.abort().catch(()=>{});h.resolve();}await context.close();
 }
 results.passed=true;if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
