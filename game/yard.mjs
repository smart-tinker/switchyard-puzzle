export const routes = ['A', 'B', 'C'];
const layouts = [
  ['Первый рейс', 'A', 2], ['Средний путь', 'BC', 3],
  ['Три пути', 'ACB', 4], ['Обходной путь', 'BACB', 5],
  ['Двойная подача', 'CBBAAC', 4], ['Окно движения', 'ABACBC', 8],
  ['Вечерняя смена', 'CABABCA', 7], ['Чистая смена', 'ACBABCBA', 8],
];
export const levels = layouts.map(([name, order, budget]) => ({ name, order: [...order], budget }));
export const destination = ([top, middle]) => top ? 'A' : middle ? 'B' : 'C';

export function newRun(level) {
  return { switches: [false, false], moves: 0, index: 0, state: 'play', actual: null, budget: level.budget };
}

export function toggle(run, n) {
  if (run.state !== 'play' || (n !== 0 && n !== 1) || run.moves >= run.budget) return run;
  const switches = run.switches.slice();
  switches[n] = !switches[n];
  return { ...run, switches, moves: run.moves + 1 };
}

export function dispatch(level, run) {
  if (run.state !== 'play') return run;
  const actual = destination(run.switches);
  if (actual !== level.order[run.index]) return { ...run, state: 'miss', actual };
  const index = run.index + 1;
  return { ...run, actual, index, state: index === level.order.length ? 'win' : 'play' };
}

export function dailyLevel(date) {
  const day=date.toISOString().slice(0,10), order=[];
  let seed=Math.imul(Date.parse(day)/86400000,2654435761)>>>0;
  for(let i=0;i<8;i++) {
    seed^=seed<<13; seed^=seed>>>17; seed^=seed<<5;
    const choices=routes.filter(r=>r!==order.at(-1));
    order.push(choices[(seed>>>0)%choices.length]);
  }
  // Both configurations for track A are considered when setting the budget.
  const paths=['C','B','A','A'];
  let costs=[0,Infinity,Infinity,Infinity];
  for(const route of order) costs=paths.map((p,to)=>p!==route?Infinity:
    Math.min(...costs.map((c,from)=>c+((from^to)&1)+(((from^to)>>1)&1))));
  return {name:'Смена дня',day,order,budget:Math.min(...costs)+2};
}
