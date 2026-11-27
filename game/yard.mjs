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
