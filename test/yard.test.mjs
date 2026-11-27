import assert from 'node:assert/strict';
import test from 'node:test';
import { destination, dispatch, levels, newRun, toggle } from '../game/yard.mjs';

test('all paths, wrong route, and move budget', () => {
  assert.deepEqual([[1,0],[0,1],[0,0],[1,1]].map(destination), ['A','B','C','A']);
  const l = levels[0];
  const wrong = dispatch(l, newRun(l));
  assert.equal(wrong.state, 'miss');
  assert.equal(wrong.actual, 'C');
  assert.equal(toggle(wrong, 0), wrong);
  let s = toggle(toggle(newRun(l), 0), 0);
  assert.equal(toggle(s, 0), s);
  assert.equal(dispatch(l, toggle(newRun(l), 0)).state, 'win');
});

for (const [i,l] of levels.entries()) test('level ' + (i+1) + ' is solvable within its switch budget', () => {
  let stack = [newRun(l)];
  const visited = new Set();
  while (stack.length) {
    const s = stack.pop();
    if (s.state === 'win') return;
    if (s.state !== 'play') continue;
    const key = [s.index, s.moves, ...s.switches].join(',');
    if (visited.has(key)) continue;
    visited.add(key);
    stack.push(dispatch(l,s),toggle(s,0),toggle(s,1));
  }
  assert.fail('no valid route for ' + l.name);
});
