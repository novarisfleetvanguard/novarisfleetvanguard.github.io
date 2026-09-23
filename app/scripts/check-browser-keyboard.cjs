// Ordinary keyboard/button input against a preview or live game.
// Optional client override is only for pre-release regression checks.
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('fs'),assert=require('assert');
const engine=process.env.BROWSER||'chromium',url=process.env.GAME_URL||'http://127.0.0.1:8787/';
const result={engine,url,clientOverride:!!process.env.OVERRIDE_CLIENT,checks:[],errors:[]};let browser;
(async()=>{
 const options={headless:process.env.HEADED!=='1',...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})};
 if(engine==='chromium')options.args=['--no-sandbox','--use-angle=swiftshader','--disable-dev-shm-usage'];
 if(engine==='firefox')options.firefoxUserPrefs={'webgl.force-enabled':true,'gfx.webrender.software':true};
 browser=await playwright[engine].launch(options);const page=await browser.newPage({viewport:{width:1100,height:850}});
 page.on('pageerror',e=>result.errors.push(e.message));
 if(process.env.OVERRIDE_CLIENT)await page.route('**/client.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.OVERRIDE_CLIENT)}));
 await page.addInitScript(()=>{window.keyboardInputs=[];window.keyboardState=null;const W=WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='state')keyboardState=m;}catch{}});}send(value){try{const m=JSON.parse(value);if(m.action?.type==='input'){keyboardInputs.push(m.action);if(keyboardInputs.length>20)keyboardInputs.shift();}}catch{}return super.send(value);}};});
 async function activate(selector){await page.locator(selector).waitFor({state:'visible'});await page.locator(selector).press('Enter');}
 await page.goto(url);await page.locator('#boot-settings').click();await page.locator('#quality').selectOption('low');await page.locator('#settings-done').click();
 await activate('#enter');await activate('#skip-intro');await activate('#load-enter');await activate('#create-room');await page.waitForFunction(()=>!!keyboardState);await activate('#ready');await page.waitForFunction(()=>keyboardState.view.players.find(p=>p.id===keyboardState.you).ready);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'start');await page.keyboard.press('Enter');await page.waitForFunction(()=>keyboardState.view.phase==='playing');
 async function fireAfterDismiss(selector){
  await activate(selector);await page.waitForTimeout(100);
  const focus=await page.evaluate(()=>document.activeElement.id);assert.equal(focus,'world','Dismissing '+selector+' returns focus to flight');
  await page.keyboard.down('Space');await page.waitForTimeout(320);const input=await page.evaluate(()=>keyboardInputs.at(-1));await page.keyboard.up('Space');assert(input.fire,'Space fires after '+selector);result.checks.push({dismissed:selector,focus,fire:input.fire});
 }
 await fireAfterDismiss('#arrival-dismiss');
 // A ground-only dodge attempted in orbit produces a real server notice.
 await page.keyboard.press('KeyQ');await page.locator('#toast').waitFor({state:'visible'});const notice=await page.locator('#toast-text').innerText();await fireAfterDismiss('#toast-close');result.notice=notice;
 await page.keyboard.press('KeyQ');await page.locator('#toast').waitFor({state:'visible'});await activate('#hud-guide');const heading=await page.evaluate(()=>document.activeElement.id);assert.equal(heading,'modal-kicker');
 for(let i=0;i<5;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.querySelector('#modal').contains(document.activeElement)),'Dialog keeps native focus');}
 assert(await page.locator('#modal').isVisible());result.dialogFocusPreserved=true;assert.equal(result.errors.length,0);result.success=true;await browser.close();
 if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(async error=>{result.success=false;result.error=error.stack;if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(result,null,2));console.error(error);await browser?.close();process.exitCode=1});
