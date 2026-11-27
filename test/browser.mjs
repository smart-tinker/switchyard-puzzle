import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { dailyLevel, destination, dispatch, newRun, toggle } from '../game/yard.mjs';

function solve(level,state,seen=new Set()) {
  if(state.state==='win') return [];
  if(state.state!=='play') return null;
  const key=[state.index,state.moves,...state.switches].join(',');
  if(seen.has(key)) return null;
  seen.add(key);
  const actions=[['s1',toggle(state,0)],['s2',toggle(state,1)]];
  if(destination(state.switches)===level.order[state.index]) actions.unshift(['send',dispatch(level,state)]);
  for(const [id,next] of actions){
    const rest=solve(level,next,seen);
    if(rest) return [id,...rest];
  }
  return null;
}
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
  const plain=req.url.startsWith('/portable/');
  const file=files[plain?req.url.slice('/portable'.length):req.url];
  if(!file){res.writeHead(404).end();return}
  try{
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript');
    res.end(await readFile((plain?'portable/':'packed/')+file));
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
  console.log('YARD_DESKTOP_JPEG='+ (await page.screenshot({type:'jpeg',quality:35})).toString('base64'));
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
  console.log('YARD_MOBILE_JPEG='+ (await phone.screenshot({type:'jpeg',quality:32})).toString('base64'));
  await phone.getByRole('button',{name:'Отправить состав'}).tap();
  await phone.getByRole('button',{name:'Следующий уровень'}).waitFor();
  assert.deepEqual(errors,[]);
  const offline=await browser.newPage({reducedMotion:'reduce'});
  offline.on('pageerror',e=>errors.push(e.message));
  await offline.goto(url+'/portable/');
  assert.equal(await offline.locator('script[src="/sdk.js"]').count(),0);
  await offline.keyboard.press('1');
  await offline.locator('#send').click();
  await offline.getByRole('button',{name:'Следующий уровень'}).waitFor();
  assert.deepEqual(errors,[]);
  const day=new Date('2026-11-27T12:00:00Z');
  await offline.clock.setFixedTime(day);
  await offline.locator('#daily').click();
  assert.match(await offline.locator('#level').textContent(),/2026-11-27/);
  assert.equal(await offline.locator('#record').textContent(),'Рекорда пока нет');
  const l=dailyLevel(day), solution=solve(l,newRun(l));
  assert.ok(solution);
  for(const [i,id] of solution.entries()){
    await offline.locator('#'+id).click();
    if(id==='send' && i<solution.length-1) await offline.waitForFunction(()=>!document.querySelector('#send').disabled);
  }
  await offline.getByRole('button',{name:'Сыграть ещё раз'}).waitFor();
  const record='Рекорд дня: '+solution.filter(x=>x!=='send').length+' перев.';
  assert.equal(await offline.locator('#record').textContent(),record);
  await offline.reload();
  await offline.locator('#daily').click();
  assert.equal(await offline.locator('#record').textContent(),record);
  await offline.locator('#campaign').click();
  assert.match(await offline.locator('#level').textContent(),/01/);
  await offline.clock.setFixedTime(new Date('2026-11-28T12:00:00Z'));
  await offline.locator('#daily').click();
  assert.equal(await offline.locator('#record').textContent(),'Рекорда пока нет');
  assert.deepEqual(errors,[]);
  console.log('DAILY_REPLAY_PASS');
  console.log('PORTABLE_SMOKE_PASS');
  console.log('DESKTOP_AND_MOBILE_SMOKE_PASS');
} finally {
  await browser?.close();
  srv.close();
}
