import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
const promo=process.env.PROMO_DIR;
if(promo) await mkdir(promo,{recursive:true});
async function shot(page,name,w=1280,h=720) {
  if(!promo) return;
  const bytes=await page.screenshot({path:join(promo,name+'.png'),animations:'disabled'});
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  assert.equal(bytes.readUInt32BE(16),w);
  assert.equal(bytes.readUInt32BE(20),h);
}
async function artwork(page,icon) {
  const w=icon?1024:1920, h=icon?1024:1080;
  await page.setViewportSize({width:w,height:h});
  const scenery=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="night"><stop stop-color="#24435c"/><stop offset="1" stop-color="#0a1423"/></radialGradient>
    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M0 50V0H50" fill="none" stroke="#476481" stroke-opacity=".4" stroke-width="2"/></pattern>
    <path id="rail" d="M-180 660H250C395 660 405 377 555 377H1290 M250 660H1290"/>
  </defs>
  <rect width="100%" height="100%" fill="url(#night)"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <g transform="translate(${icon?0:950} ${icon?0:50})">
    <use href="#rail" fill="none" stroke="#7193ae" stroke-width="64" stroke-dasharray="9 32"/>
    <use href="#rail" fill="none" stroke="#0d2638" stroke-width="36"/>
    <use href="#rail" fill="none" stroke="#b0cada" stroke-width="20"/>
    <use href="#rail" fill="none" stroke="#203a50" stroke-width="11"/>
    <path d="M-180 660H250C395 660 405 377 555 377H1290" fill="none" stroke="#62dfc2" stroke-width="6"/>
    <circle cx="250" cy="660" r="24" fill="#ffbf63" stroke="#111c29" stroke-width="8"/>
    <g transform="translate(455 662)" stroke="#102032" stroke-width="10" fill="#ffbf63">
      <rect x="0" y="-169" width="200" height="143" rx="31"/>
      <rect x="23" y="-248" width="126" height="101" rx="18"/>
      <rect x="41" y="-224" width="60" height="53" rx="10" fill="#173348"/>
      <rect x="175" y="-131" width="196" height="103" rx="26"/>
      <rect x="308" y="-176" width="32" height="50" rx="7"/>
      <circle cx="56" cy="-11" r="29"/><circle cx="141" cy="-11" r="29"/><circle cx="298" cy="-11" r="29"/>
    </g>
  </g>
  ${icon?'':`<text x="108" y="531" fill="#ffbf63" font-family="system-ui,sans-serif" font-weight="900" font-size="149" letter-spacing="-7">Стрелочная</text>
  <path d="M117 594H870" stroke="#62dfc2" stroke-width="7"/>
  <circle cx="117" cy="594" r="11" fill="#62dfc2"/>`}
  </svg>`;
  await page.setContent('<!doctype html><html lang="ru"><meta charset="utf-8"><style>body{margin:0}svg{display:block}</style>'+scenery+'</html>');
  await shot(page,icon?'01-icon':'02-cover',w,h);
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
  async function checkTrainingTarget(p,letter){
    const clue=p.locator('#training-target');
    assert.equal(await clue.isVisible(),true);
    assert.equal(await clue.textContent(),'Активный состав: '+letter+' · Целевой путь: '+letter);
    assert.equal(await p.locator('#train-label').textContent(),letter);
    assert.equal(await p.locator('#train-badge').isVisible(),true);
    assert.deepEqual(await p.locator('.markers .target').evaluateAll(nodes=>nodes.map(n=>n.id)),['marker-'+letter]);
    assert.equal(await p.locator('#marker-'+letter).evaluate(n=>getComputedStyle(n).strokeDasharray),'9px, 5px');
  }
  assert.equal(await page.locator('#training-target').isVisible(),false);
  await page.locator('#training').focus();
  await page.keyboard.press('Enter');
  await checkTrainingTarget(page,'C');
  await page.locator('#order-ca').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'order-ac');
  await page.keyboard.press('Enter');
  await checkTrainingTarget(page,'A');
  assert.match(await status.textContent(),/выбран путь C/);
  const phone=await browser.newPage({viewport:{width:360,height:640},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(url);
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await phone.getByRole('button',{name:'Стрелка 1',exact:true}).tap();
  console.log('YARD_MOBILE_JPEG='+ (await phone.screenshot({type:'jpeg',quality:32})).toString('base64'));
  await phone.getByRole('button',{name:'Отправить состав'}).tap();
  await phone.getByRole('button',{name:'Следующий уровень'}).waitFor();
  assert.deepEqual(errors,[]);
  await phone.locator('#training').tap();
  await checkTrainingTarget(phone,'C');
  await phone.locator('#order-ac').tap();
  await checkTrainingTarget(phone,'A');
  assert.match(await phone.locator('#status').textContent(),/выбран путь C/);
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const offline=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  offline.on('pageerror',e=>errors.push(e.message));
  await offline.goto(url+'/portable/');
  assert.equal(await offline.locator('script[src="/sdk.js"]').count(),0);
  if(promo) {
    const controls=await offline.locator('.actions').boundingBox();
    assert.ok(controls && controls.y+controls.height<=720);
  }
  await shot(offline,'03-campaign');
  await offline.keyboard.press('1');
  await offline.locator('#send').click();
  await offline.getByRole('button',{name:'Следующий уровень'}).waitFor();
  assert.deepEqual(errors,[]);
  if(promo) {
    await offline.getByRole('button',{name:'Следующий уровень'}).click();
    await offline.locator('#s2').click();
    await shot(offline,'04-track-switch');
  }
  await offline.locator('#training').click();
  assert.equal(await offline.locator('#level').textContent(),'Учебная смена');
  assert.equal(await offline.locator('#order-ca').getAttribute('aria-pressed'),'true');
  assert.deepEqual(await offline.locator('#queue li').allTextContents(),['C','A']);
  assert.match(await offline.locator('#status').textContent(),/Переводов осталось: 1.*выбран путь C/);
  await offline.locator('#send').click();
  await offline.waitForFunction(()=>document.querySelector('#queue .next')?.textContent==='A');
  await checkTrainingTarget(offline,'A');
  await offline.locator('#s1').click();
  await offline.locator('#send').click();
  await offline.getByRole('button',{name:'Сыграть ещё раз'}).waitFor();
  assert.match(await offline.locator('#status').textContent(),/Учебная смена пройдена за один перевод/);
  assert.equal(await offline.locator('#training-target').isVisible(),false);
  assert.equal(await offline.locator('.markers .target').count(),0);
  await offline.locator('#order-ac').click();
  assert.deepEqual(await offline.locator('#queue li').allTextContents(),['A','C']);
  await offline.locator('#s1').click();
  await offline.locator('#send').click();
  await offline.waitForFunction(()=>document.querySelector('#queue .next')?.textContent==='C');
  assert.equal(await offline.locator('#s1').isDisabled(),true);
  assert.equal(await offline.locator('#s2').isDisabled(),true);
  await offline.locator('#send').click();
  await offline.getByRole('button',{name:'Повторить'}).waitFor();
  assert.match(await offline.locator('#status').textContent(),/A вместо C/);
  await offline.locator('#reset').click();
  assert.deepEqual(await offline.locator('#queue li').allTextContents(),['A','C']);
  assert.equal(await offline.locator('#queue .done').count(),0);
  await checkTrainingTarget(offline,'A');
  assert.match(await offline.locator('#status').textContent(),/Переводов осталось: 1.*выбран путь C/);
  await offline.locator('#campaign').click();
  assert.equal(await offline.locator('#training-order').isVisible(),false);
  assert.match(await offline.locator('#level').textContent(),promo?/02/:/01/);
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
    if(id==='send' && i===solution.indexOf('send')) await shot(offline,'05-daily-in-progress');
  }
  await offline.getByRole('button',{name:'Сыграть ещё раз'}).waitFor();
  await shot(offline,'06-daily-record');
  const record='Рекорд дня: '+solution.filter(x=>x!=='send').length+' перев.';
  assert.equal(await offline.locator('#record').textContent(),record);
  await offline.reload();
  await offline.locator('#daily').click();
  assert.equal(await offline.locator('#record').textContent(),record);
  await offline.locator('#campaign').click();
  assert.match(await offline.locator('#level').textContent(),promo?/02/:/01/);
  await offline.clock.setFixedTime(new Date('2026-11-28T12:00:00Z'));
  await offline.locator('#daily').click();
  assert.equal(await offline.locator('#record').textContent(),'Рекорда пока нет');
  assert.deepEqual(errors,[]);
  console.log('DAILY_REPLAY_PASS');
  console.log('PORTABLE_SMOKE_PASS');
  console.log('DESKTOP_AND_MOBILE_SMOKE_PASS');
  if(promo) {
    const art=await browser.newPage();
    await artwork(art,true);
    await artwork(art,false);
    console.log('PROMO_SIX_PNG_PASS');
  }
} finally {
  await browser?.close();
  srv.close();
}
