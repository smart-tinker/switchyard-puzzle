import {destination, dispatch, levels, newRun, toggle} from './yard.mjs';

const $ = (id) => document.getElementById(id);
const svg = (tag) => document.createElementNS('http://www.w3.org/2000/svg', tag);
const track = {
  A:'M22 165 H277 C337 165 349 66 430 66 H837',
  B:'M22 165 H837',
  C:'M22 165 H528 C592 165 604 261 678 261 H837',
};
const colors = { A:'#ffbf63', B:'#62dfc2', C:'#ca97ff' };
const trackParts = ['M22 165 H837','M277 165 C337 165 349 66 430 66 H837','M528 165 C592 165 604 261 678 261 H837'];
for (const d of trackParts) {
  const rail = svg('path');
  rail.setAttribute('d', d);
  rail.setAttribute('fill','none');
  rail.setAttribute('stroke','#637e93');
  rail.setAttribute('stroke-width','10');
  $('rails').append(rail);
  const ties = svg('path');
  ties.setAttribute('d',d);
  ties.setAttribute('fill','none');
  ties.setAttribute('stroke','#7996ac');
  ties.setAttribute('stroke-width','23');
  ties.setAttribute('stroke-dasharray','4 14');
  $('rails').insertBefore(ties, $('rails').firstChild);
  const gap=svg('path');
  gap.setAttribute('d',d);
  gap.setAttribute('fill','none');
  gap.setAttribute('stroke','#142b3c');
  gap.setAttribute('stroke-width','5');
  $('rails').append(gap);
}
const key = 'switchyard.progress.v1';
let levelIndex = 0;
try {
  const saved=Number(localStorage.getItem(key));
  if (Number.isInteger(saved) && saved>=0 && saved<levels.length) levelIndex=saved;
} catch {}
let level=levels[levelIndex], run=newRun(level), moving=false, paused=false, adPending=false;
let sdk, activeSdk=false, lastAdAt=performance.now(), engaged=false;
const buttons=[$('s1'),$('s2')];
const blocked=()=>paused || document.hidden || adPending;

function gameplay() {
  const active=engaged && run.state==='play' && !blocked();
  const api=sdk?.features?.GameplayAPI;
  if (!api || active===activeSdk) return;
  activeSdk=active;
  if (active) api.start(); else api.stop();
}
function render() {
  const route=destination(run.switches), target=level.order[run.index];
  $('level').textContent='Уровень '+String(levelIndex+1).padStart(2,'0')+' / 08';
  $('selected').setAttribute('d',track[route]);
  if (!moving) {
    $('train').style.color=colors[target ?? run.actual ?? 'B'];
    $('train').setAttribute('transform','translate(105 165)');
  }
  buttons.forEach((b,i)=>{
    b.disabled=blocked() || moving || run.state!=='play' || run.moves>=level.budget;
    b.setAttribute('aria-pressed',String(run.switches[i]));
  });
  $('reset').disabled=blocked() || moving;
  $('send').disabled=blocked() || moving;
  const end=levelIndex===levels.length-1;
  $('send').textContent=run.state==='miss'?'Повторить':run.state==='win'?(end?'Сыграть заново':'Следующий уровень'):'Отправить состав';
  $('status').textContent=blocked()?'Пауза':run.state==='miss'?
    'Не тот путь: '+run.actual+' вместо '+target+'. Попробуйте ещё раз.':
    run.state==='win'?(end?'Смена завершена. Все составы на своих путях!':'Все составы на месте. Уровень пройден.'):
    level.name+' · Переводов осталось: '+(level.budget-run.moves)+' · Состав '+target+' → выбран путь '+route;
  $('queue').replaceChildren(...level.order.map((a,i)=>{
    const li=document.createElement('li');
    li.textContent=a; li.style.backgroundColor=colors[a];
    li.className=i<run.index?'done':i===run.index?'next':'';
    if(i===run.index) li.setAttribute('aria-current','step');
    return li;
  }));
  gameplay();
}
function change(n) { if(!blocked()&&!moving){engaged=true;run=toggle(run,n);render()} }
function restart() { if(!blocked()&&!moving){engaged=true;run=newRun(level);render()} }
function next() {
  levelIndex=(levelIndex+1)%levels.length;
  try { localStorage.setItem(key,String(levelIndex)); } catch {}
  level=levels[levelIndex]; run=newRun(level); engaged=true; render();
}
function advance() {
  if (!sdk?.adv?.showFullscreenAdv || (levelIndex+1)%3!==0 || performance.now()-lastAdAt<180000) { next(); return; }
  adPending=true; lastAdAt=performance.now(); render();
  const finish=()=>{if(!adPending)return;adPending=false;next()};
  try { sdk.adv.showFullscreenAdv({callbacks:{onClose:finish,onError:finish}}); } catch { finish(); }
}
function send() {
  if (blocked() || moving) return;
  if (run.state==='miss') { restart(); return; }
  if (run.state==='win') { advance(); return; }
  engaged=true; moving=true; render();
  const path=$('selected'), len=path.getTotalLength();
  let last=performance.now(), elapsed=0;
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?40:620;
  requestAnimationFrame(function frame(now) {
    if (!blocked()) elapsed+=Math.min(50,Math.max(0,now-last));
    last=now;
    const pct=Math.min(1,elapsed/duration);
    const point=path.getPointAtLength(83+(len-83)*pct);
    $('train').setAttribute('transform','translate('+point.x+' '+point.y+')');
    if(pct<1) requestAnimationFrame(frame);
    else { run=dispatch(level,run); moving=false; render(); }
  });
}
buttons.forEach((b,i)=>b.addEventListener('click',()=>change(i)));
$('reset').addEventListener('click',restart);
$('send').addEventListener('click',send);
document.addEventListener('keydown',(e)=>{
  if(e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  if(e.key==='1'||e.key==='2'){e.preventDefault();change(Number(e.key)-1)}
  if(e.code==='Space' && !e.target.closest?.('button')){e.preventDefault();send()}
});
document.addEventListener('visibilitychange',render);
document.addEventListener('contextmenu',(e)=>e.preventDefault());
render();
async function connect() {
  if (!globalThis.YaGames || sdk) return;
  try {
    sdk=await globalThis.YaGames.init();
    sdk.on?.('game_api_pause',()=>{paused=true;render()});
    sdk.on?.('game_api_resume',()=>{paused=false;render()});
    sdk.features?.LoadingAPI?.ready();
    gameplay();
  } catch (err) { console.warn('Yandex Games SDK unavailable:',err?.message); }
}
if(globalThis.YaGames) void connect();
else document.querySelector('script[src="/sdk.js"]')?.addEventListener('load',connect,{once:true});
