import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const files = { '/':'index.html','/yard.css':'yard.css','/app.mjs':'app.mjs','/yard.mjs':'yard.mjs' };
const mock = `
  window.calls=[]; window.events={};
  window.YaGames={init:async()=>({
    environment:{i18n:{lang:'ru'}},
    on:(name, fn)=>{window.events[name]=fn},
    features:{LoadingAPI:{ready:()=>calls.push('ready')},
      GameplayAPI:{start:()=>calls.push('start'),stop:()=>calls.push('stop')}}
  })};
`;
const srv = createServer(async(req,res)=>{
  if(req.url==='/sdk.js'){res.setHeader('Content-Type','text/javascript');res.end(mock);return}
  const file=files[req.url];
  if(!file){res.writeHead(404).end();return}
  try{
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript');
    res.end(await readFile('packed/'+file));
  }catch{res.writeHead(500).end()}
});
await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+srv.address().port;
let browser;
try {
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1080,height:760},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  const status=page.locator('#status');
  await page.waitForFunction(()=>window.calls?.includes('ready'));
  assert.match(await status.textContent(),/Первый рейс/);
  await page.keyboard.press('Space');
  await page.getByRole('button',{name:'Повторить'}).waitFor();
  assert.match(await status.textContent(),/C вместо A/);
  await page.getByRole('button',{name:'Повторить'}).click();
  await page.keyboard.press('1');
  await page.evaluate(()=>window.events.game_api_pause());
  assert.equal(await status.textContent(),'Пауза');
  assert.equal(await page.locator('#send').isDisabled(),true);
  await page.evaluate(()=>window.events.game_api_resume());
  assert.match(await status.textContent(),/выбран путь A/);
  await page.locator('#send').click();
  await page.getByRole('button',{name:'Следующий уровень'}).click();
  await page.reload();
  assert.match(await page.locator('#level').textContent(),/02/);
  assert.deepEqual(errors,[]);
  const phone=await browser.newPage({viewport:{width:360,height:640},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(url);
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await phone.getByRole('button',{name:'Стрелка 1',exact:true}).tap();
  await phone.getByRole('button',{name:'Отправить состав'}).tap();
  await phone.getByRole('button',{name:'Следующий уровень'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('DESKTOP_AND_MOBILE_SMOKE_PASS');
} finally {
  await browser?.close();
  srv.close();
}
