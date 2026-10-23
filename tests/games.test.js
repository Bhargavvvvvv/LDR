import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, startGame, move, settleMemory, publicState, SYMBOLS } from '../games.js';

function room(game) { const s = createRoom('Alex'); s.players[1] = 'Sam'; return startGame(s, game, () => 0.5); }
function play(s, index) { const result = move(s, s.game.turn, { index, round:s.round }); assert.ok(result, `legal move ${index}`); return result; }

test('tic-tac-toe wins once and rejects late, duplicate, out-of-turn, and malformed moves', () => {
  let s = room('ttt');
  assert.equal(move(s, 1, {index:0, round:1}), null);
  for (const index of [-1, 9, 1.2, '1', null, NaN]) assert.equal(move(s, 0, {index, round:1}), null);
  assert.equal(move(s, 0, {index:0, round:0}), null);
  s = play(s, 0);
  assert.equal(move(s, 1, {index:0, round:1}), null);
  for (const index of [3, 1, 4, 2]) s = play(s, index);
  assert.deepEqual(s.game.result, { winner:0, line:[0, 1, 2] });
  assert.deepEqual(s.scores, [1, 0]);
  assert.equal(move(s, 1, {index:5, round:1}), null);
  const rematch = startGame(s, 'ttt');
  assert.equal(rematch.game.turn, 1); assert.equal(rematch.round, 2); assert.deepEqual(rematch.scores, [1, 0]);
});
test('tic-tac-toe draw and both diagonal wins', () => {
  let s = room('ttt'); for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) s = play(s, i);
  assert.equal(s.game.result.winner, null); assert.deepEqual(s.scores, [0, 0]);
  for (const sequence of [[0, 1, 4, 2, 8], [2, 0, 4, 1, 6]]) {
    s = room('ttt'); for (const i of sequence) s = play(s, i); assert.equal(s.game.result.winner, 0);
  }
});
test('connect four handles gravity, full columns and vertical/horizontal/diagonal wins', () => {
  let s = room('c4'); for (let i = 0; i < 6; i++) s = play(s, 0);
  assert.equal(move(s, s.game.turn, {index:0, round:1}), null);
  assert.deepEqual(s.game.board.filter((_, i) => i % 7 === 0), [1, 0, 1, 0, 1, 0]);
  for (const index of [-1, 7, 1.5]) assert.equal(move(s, s.game.turn, {index, round:1}), null);
  for (const sequence of [[0, 1, 0, 1, 0, 1, 0], [0, 6, 1, 6, 2, 5, 3], [0, 1, 1, 2, 4, 2, 2, 3, 4, 3, 5, 3, 3]]) {
    s = room('c4'); for (const i of sequence) s = play(s, i);
    assert.equal(s.game.result.winner, 0); assert.equal(s.game.result.line.length, 4); assert.deepEqual(s.scores, [1, 0]);
  }
});
test('all nine RPS outcomes and secret choices', () => {
  const beats = { rock:'scissors', scissors:'paper', paper:'rock' };
  for (const a of Object.keys(beats)) for (const b of Object.keys(beats)) {
    let s = room('rps');
    assert.equal(move(s, 0, {choice:'invalid', round:1}), null);
    s = move(s, 0, {choice:a, round:1});
    assert.deepEqual(publicState(s).game.choices, ['locked', null]);
    assert.equal(s.game.choices[0], a);
    assert.equal(move(s, 0, {choice:b, round:1}), null);
    s = move(s, 1, {choice:b, round:1});
    assert.equal(s.game.result.winner, a === b ? null : beats[a] === b ? 0 : 1);
    assert.deepEqual(publicState(s).game.choices, [a, b]);
  }
});
test('memory hides cards, locks mismatches until cleared, and rejects old timers', () => {
  let s = room('memory');
  assert.ok(publicState(s).game.deck.every(v => v === null));
  const first = 0, second = s.game.deck.findIndex(v => v !== s.game.deck[first]);
  s = play(s, first); assert.equal(publicState(s).game.deck[first], s.game.deck[first]);
  assert.equal(move(s, 0, {index:first, round:1}), null);
  s = play(s, second); assert.equal(s.game.pending, true);
  assert.equal(move(s, 0, {index:15, round:1}), null);
  assert.equal(settleMemory(s, 0), null);
  s = settleMemory(s, 1); assert.equal(s.game.turn, 1); assert.ok(publicState(s).game.deck.every(v => v === null));
  assert.equal(settleMemory(startGame(s, 'memory'), 1), null);
});
test('memory matches grant another turn and a completed game awards one win', () => {
  let s = room('memory');
  for (let value = 0; value < SYMBOLS.length; value++) {
    const indices = s.game.deck.flatMap((v, i) => v === value ? [i] : []);
    assert.equal(indices.length, 2);
    for (const i of indices) s = play(s, i);
    assert.equal(s.game.turn, 0);
  }
  assert.deepEqual(s.game.pairs, [8, 0]); assert.equal(s.game.result.winner, 0); assert.deepEqual(s.scores, [1, 0]);
});
test('state projection does not mutate authoritative state; stale moves cannot reach new rounds', () => {
  const original = room('memory'), copy = structuredClone(original);
  publicState(original); assert.deepEqual(original, copy);
  const next = startGame(original, 'ttt');
  assert.equal(move(next, 1, {index:0, round:1}), null);
  assert.equal(startGame(original, 'not-a-game'), null);
});
