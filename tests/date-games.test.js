import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, startGame, move, publicState } from '../games.js';
import { makeDeck, canPlayCard, validDateGame, COLORS } from '../date-games.js';
import { renderDateGame } from '../date-ui.js';

function room(id) { const s = createRoom('Alex'); s.players[1] = 'Sam'; return startGame(s, id, () => .42); }
function action(s, a) { return { round:s.round, step:s.game.step, questionId:s.game.questionId, ...a }; }
function play(s, a, actor = s.game.turn) {
  const next = move(s, actor, action(s, a), () => .42);
  assert.ok(next, `accepted ${JSON.stringify(a)}`); return next;
}
function fixture(hand0, hand1, top = ['rose','5']) {
  const s = room('uno'), deck = makeDeck();
  const take = ([color, value]) => { const i = deck.findIndex(c => c.color === color && c.value === value); assert.ok(i >= 0); return deck.splice(i, 1)[0]; };
  s.game.hands = [hand0.map(take), hand1.map(take)];
  s.game.discard = [take(top)]; s.game.drawPile = deck; s.game.color = top[0];
  return s;
}
test('truth prompts alternate players, preserve scores, allow passing and reject stale answers', () => {
  let s = room('truth');
  assert.equal(move(s, 1, action(s, { type:'prompt', kind:'truth' })), null);
  s = play(s, { type:'prompt', kind:'truth' });
  const stale = action(s, { type:'answer', text:'Too late' });
  assert.equal(move(s, 0, action(s, { type:'answer', text:'   ' })), null);
  s = play(s, { type:'skip' }); assert.equal(s.game.turn, 1); assert.equal(s.game.completed, 0);
  assert.equal(move(s, 0, stale), null);
  s = play(s, { type:'prompt', kind:'dare' });
  s = play(s, { type:'answer', text:'' }); assert.equal(s.game.answer, 'Dare done!');
  s = play(s, { type:'next' }, 0); assert.equal(s.game.turn, 0);
  for (let i = 1; i < 10; i++) {
    s = play(s, { type:'prompt', kind:'truth' });
    s = play(s, { type:'answer', text:'I love the little things.' });
    if (i < 9) s = play(s, { type:'next' });
  }
  assert.equal(s.game.result.together, true); assert.equal(s.game.completed, 10);
  assert.deepEqual(s.scores, [0, 0]); assert.equal(move(s, 0, action(s, {type:'next'})), null);
  assert.equal('truths' in publicState(s).game, false);
});
test('shared truth answers render as text, including markup and multiline answers', () => {
  let s = room('truth'); s = play(s, {type:'prompt', kind:'truth'});
  s = play(s, {type:'answer', text:'<img src=x onerror=alert(1)>\nSweet & kind'});
  const html = renderDateGame(publicState(s), {local:false, role:0, ready:true}).html;
  assert.ok(html.includes('&lt;img')); assert.ok(html.includes('Sweet &amp; kind')); assert.ok(!html.includes('<img'));
});
test('would-you-rather accepts simultaneous choices, hides option zero, and rejects stale picks after a skip', () => {
  let s = room('rather');
  const first = action(s, {type:'pick', option:0}), second = action(s, {type:'pick', option:1});
  s = move(s, 0, first); assert.deepEqual(publicState(s, 1).game.choices, ['locked', null]);
  assert.equal(move(s, 0, first), null);
  s = move(s, 1, second); assert.equal(s.game.revealed, true); assert.deepEqual(s.game.choices, [0, 1]);
  assert.equal(move(s, 0, action(s, {type:'skip'})), null);
  s = play(s, {type:'next'}); const stale = action(s, {type:'pick', option:1});
  const before = s.game.question; s = play(s, {type:'skip'});
  assert.notDeepEqual(s.game.question, before); assert.equal(s.game.number, 2);
  assert.equal(move(s, 1, stale), null); assert.equal('questions' in publicState(s).game, false);
});
test('ten revealed questions finish cooperatively and count agreements exactly once', () => {
  let s = room('rather');
  for (let i = 0; i < 10; i++) {
    s = play(s, {type:'pick', option:0}, 0); s = play(s, {type:'pick', option:i % 2}, 1);
    if (i < 9) s = play(s, {type:'next'}, 1);
  }
  assert.equal(s.game.result.together, true); assert.equal(s.game.matches, 5); assert.deepEqual(s.scores, [0,0]);
});
test('UNO deck has 108 distinct cards and projections reveal only the viewer hand', () => {
  const s = room('uno'), original = structuredClone(s), deck = makeDeck();
  assert.equal(deck.length, 108); assert.equal(new Set(deck.map(c => c.uid)).size, 108);
  assert.deepEqual(s.game.hands.map(h => h.length), [7,7]); assert.equal(s.game.drawPile.length, 93);
  assert.match(s.game.discard[0].value, /^\d$/);
  for (const viewer of [0,1]) {
    const projected = publicState(s, viewer);
    assert.ok(projected.game.hands[1 - viewer].every(c => c === null));
    assert.deepEqual(projected.game.hands[viewer], s.game.hands[viewer]);
    assert.equal('drawPile' in projected.game, false); assert.equal(validDateGame(projected.game), true);
    assert.deepEqual(publicState(projected, viewer), projected);
  }
  assert.deepEqual(s, original);
});
test('same-device UNO conceals cards until the current player is ready', () => {
  const s = publicState(room('uno'), 0);
  const hidden = renderDateGame(s, {local:true, role:0, ready:true, unoOwner:null}).html;
  assert.ok(hidden.includes('Show my hand')); assert.ok(!hidden.includes('data-uno-card'));
  const visible = renderDateGame(s, {local:true, role:0, ready:true, unoOwner:0}).html;
  assert.equal((visible.match(/data-uno-card/g) || []).length, 7);
});
test('UNO matches color or value, refuses illegal/out-of-turn/stale moves, and scores a win once', () => {
  let s = fixture([['blue','4'],['rose','2']], [['sage','3']]);
  assert.equal(move(s, 0, action(s, {type:'card', uid:s.game.hands[0][0].uid})), null);
  assert.equal(move(s, 1, action(s, {type:'draw'})), null);
  const old = action(s, {type:'draw'});
  s = play(s, {type:'card', uid:s.game.hands[0][1].uid, uno:true});
  assert.equal(s.game.turn, 1); assert.equal(s.game.hands[0].length, 1);
  assert.equal(move(s, 0, old), null);
  s = fixture([['blue','5']], [['sage','3']]);
  s = play(s, {type:'card', uid:s.game.hands[0][0].uid});
  assert.equal(s.game.result.winner, 0); assert.deepEqual(s.scores, [1,0]);
  assert.equal(move(s, 0, action(s, {type:'draw'})), null);
});
test('UNO skip, reverse and draw cards obey two-player turns; missing UNO adds two', () => {
  for (const value of ['skip','reverse','draw2']) {
    let s = fixture([['rose',value],['blue','3'],['blue','6']], [['sage','2']]);
    s = play(s, {type:'card', uid:s.game.hands[0][0].uid});
    assert.equal(s.game.turn, 0); assert.equal(s.game.hands[1].length, value === 'draw2' ? 3 : 1);
  }
  let s = fixture([['rose','3'],['blue','2']], [['sage','1']]);
  s = play(s, {type:'card', uid:s.game.hands[0][0].uid});
  assert.equal(s.game.hands[0].length, 3); assert.match(s.game.notice, /Missed UNO|missed UNO/);
});
test('wilds require a color, +4 is illegal with active-color cards, and last +4 applies its penalty', () => {
  let s = fixture([['wild','wild4'],['rose','1']], [['blue','2']]);
  assert.equal(move(s, 0, action(s, {type:'card', uid:s.game.hands[0][0].uid, color:'blue'})), null);
  s = fixture([['wild','wild'],['blue','1']], [['sage','2']]);
  assert.equal(move(s, 0, action(s, {type:'card', uid:s.game.hands[0][0].uid})), null);
  s = play(s, {type:'card', uid:s.game.hands[0][0].uid, color:'sage', uno:true});
  assert.equal(s.game.color, 'sage'); assert.equal(s.game.turn, 1);
  s = fixture([['wild','wild4']], [['blue','2']]);
  s = play(s, {type:'card', uid:s.game.hands[0][0].uid, color:'gold'});
  assert.equal(s.game.hands[1].length, 5); assert.equal(s.game.result.winner, 0);
});
test('after drawing, UNO permits only the drawn card or pass and never leaks its ID to the opponent', () => {
  let s = fixture([['rose','3'],['rose','2']], [['sage','1']]);
  const oldCard = s.game.hands[0][0].uid;
  s = play(s, {type:'draw'});
  assert.equal(publicState(s, 1).game.drawn, 'hidden'); assert.equal(typeof publicState(s, 0).game.drawn, 'number');
  assert.equal(move(s, 0, action(s, {type:'draw'})), null);
  assert.equal(move(s, 0, action(s, {type:'card', uid:oldCard})), null);
  s = play(s, {type:'pass'}); assert.equal(s.game.turn, 1); assert.equal(s.game.drawn, null);
});
test('empty draw piles recycle old discards while preserving the top card', () => {
  let s = fixture([['blue','4']], [['sage','2']]);
  const top = s.game.discard[0]; s.game.discard.unshift(...s.game.drawPile); s.game.drawPile = [];
  s = play(s, {type:'draw'});
  assert.deepEqual(s.game.discard, [top]); assert.equal(s.game.hands[0].length, 2); assert.ok(s.game.drawPile.length > 0);
});
test('simulated UNO games finish and conserve every card across legal moves and reshuffles', () => {
  let seed = 19221;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let round = 0; round < 20; round++) {
    let s = startGame(createRoom('Alex'), 'uno', random);
    for (let turn = 0; turn < 2000 && !s.game.result; turn++) {
      const g = s.game, actor = g.turn, card = g.hands[actor].find(c => canPlayCard(g, actor, c));
      const a = card ? {type:'card', uid:card.uid, color:COLORS[Math.floor(random() * 4)], uno:true} : {type:g.drawn === null ? 'draw' : 'pass'};
      s = move(s, actor, action(s, a), random); assert.ok(s);
      const cards = [...s.game.hands.flat(), ...s.game.drawPile, ...s.game.discard];
      assert.equal(cards.length, 108); assert.equal(new Set(cards.map(c => c.uid)).size, 108);
      for (const viewer of [0,1]) assert.equal(validDateGame(publicState(s, viewer).game), true);
    }
    assert.ok(s.game.result, 'game terminates');
    assert.equal(s.scores.reduce((a,b) => a+b, 0), 1);
  }
});
