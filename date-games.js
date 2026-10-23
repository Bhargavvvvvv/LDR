import { TRUTHS, DARES, WOULD_YOU_RATHER } from './prompts.js';

export const DATE_GAME_IDS = ['truth', 'rather', 'uno'];
export const COLORS = ['rose', 'gold', 'sage', 'blue'];
export const COLOR_NAMES = { rose:'Red', gold:'Yellow', sage:'Green', blue:'Blue' };
export const CARD_NAMES = { skip:'Skip', reverse:'Reverse', draw2:'+2', wild:'Wild', wild4:'+4' };
export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function makeDeck() {
  const deck = [];
  const add = (color, value) => deck.push({ uid:deck.length, color, value });
  for (const color of COLORS) {
    add(color, '0');
    for (const value of ['1','2','3','4','5','6','7','8','9','skip','reverse','draw2']) { add(color, value); add(color, value); }
  }
  for (let i = 0; i < 4; i++) { add('wild', 'wild'); add('wild', 'wild4'); }
  return deck;
}
export function startDateGame(game, random) {
  const g = { ...game, step:0 };
  if (g.id === 'truth') Object.assign(g, { stage:'choose', prompt:null, answer:'', completed:0, last:null,
    truths:shuffle(TRUTHS, random), dares:shuffle(DARES, random), truthIndex:0, dareIndex:0 });
  if (g.id === 'rather') {
    const questions = shuffle(WOULD_YOU_RATHER, random);
    Object.assign(g, { questions, question:questions[0], questionId:0, number:1, choices:[null, null], revealed:false, matches:0 });
  }
  if (g.id === 'uno') {
    const deck = shuffle(makeDeck(), random), hands = [deck.splice(0, 7), deck.splice(0, 7)];
    const [first] = deck.splice(deck.findIndex(c => /^\d$/.test(c.value)), 1);
    Object.assign(g, { hands, drawPile:deck, discard:[first], color:first.color, drawn:null, emptyPasses:0, notice:'Seven cards each. Make a little friendly mischief.' });
  }
  return g;
}
function together(g) { g.result = { winner:null, line:[], together:true }; }
function nextTruth(g) { g.turn = 1 - g.turn; g.stage = 'choose'; g.prompt = null; g.answer = ''; }
function truthMove(g, actor, a) {
  if (a.type === 'next' && g.stage === 'response') { nextTruth(g); return true; }
  if (actor !== g.turn) return false;
  if (a.type === 'prompt' && g.stage === 'choose' && ['truth','dare'].includes(a.kind)) {
    const list = a.kind === 'truth' ? g.truths : g.dares, key = a.kind + 'Index';
    g.prompt = { kind:a.kind, text:list[g[key]++ % list.length] }; g.stage = 'prompt'; return true;
  }
  if (a.type === 'skip' && ['choose','prompt'].includes(g.stage)) {
    g.last = { actor, skipped:true }; nextTruth(g); return true;
  }
  if (a.type === 'answer' && g.stage === 'prompt' && typeof a.text === 'string') {
    const text = a.text.trim().slice(0, 500);
    if (g.prompt.kind === 'truth' && !text) return false;
    g.answer = text || 'Dare done!'; g.stage = 'response'; g.completed++;
    g.last = { actor, skipped:false };
    if (g.completed >= 10) together(g);
    return true;
  }
  return false;
}
function ratherMove(g, actor, a) {
  if (a.type === 'pick' && !g.revealed && g.choices[actor] === null && [0,1].includes(a.option)) {
    g.choices[actor] = a.option;
    if (g.choices.every(c => c !== null)) {
      g.revealed = true;
      if (g.choices[0] === g.choices[1]) g.matches++;
      if (g.number === 10) together(g);
    }
    return true;
  }
  if ((a.type === 'next' && g.revealed) || (a.type === 'skip' && !g.revealed)) {
    if (a.type === 'skip') {
      // Replace a skipped prompt without counting it as an answered question.
      const removed = g.questions.splice(g.number - 1, 1)[0];
      g.questions.push(removed);
    } else g.number++;
    g.questionId++; g.question = g.questions[g.number - 1]; g.choices = [null,null]; g.revealed = false;
    return true;
  }
  return false;
}
export function canPlayCard(g, actor, card) {
  if (!card || g.result || actor !== g.turn || (g.drawn !== null && g.drawn !== card.uid)) return false;
  if (card.value === 'wild4') return !g.hands[actor].some(c => c && c.color === g.color);
  return card.color === 'wild' || card.color === g.color || card.value === g.discard.at(-1).value;
}
function drawCards(g, actor, count, random) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (!g.drawPile.length && g.discard.length > 1) {
      const top = g.discard.pop(); g.drawPile = shuffle(g.discard, random); g.discard = [top];
    }
    const card = g.drawPile.pop(); if (!card) break;
    g.hands[actor].push(card); drawn.push(card);
  }
  return drawn;
}
function unoMove(g, actor, a, random) {
  if (actor !== g.turn) return false;
  if (a.type === 'draw' && g.drawn === null) {
    const cards = drawCards(g, actor, 1, random);
    g.drawn = cards[0]?.uid ?? 'empty';
    g.notice = cards.length ? 'One card drawn. Play that card if it fits, or pass.' : 'The draw pile is empty. Pass to your person.';
    return true;
  }
  if (a.type === 'pass' && g.drawn !== null) {
    g.emptyPasses = g.drawn === 'empty' ? g.emptyPasses + 1 : 0;
    if (g.emptyPasses >= 2 && g.hands.every((hand, i) => hand.every(c => !canPlayCard({ ...g, turn:i, drawn:null }, i, c)))) g.result = { winner:null, line:[] };
    g.drawn = null; g.turn = 1 - actor; g.notice = `Player ${actor + 1} passed.`; return true;
  }
  if (a.type !== 'card' || !Number.isInteger(a.uid)) return false;
  const index = g.hands[actor].findIndex(c => c.uid === a.uid), card = g.hands[actor][index];
  if (!canPlayCard(g, actor, card) || (card.color === 'wild' && !COLORS.includes(a.color))) return false;
  g.hands[actor].splice(index, 1); g.discard.push(card); g.color = card.color === 'wild' ? a.color : card.color;
  g.drawn = null; g.emptyPasses = 0;
  const penalty = g.hands[actor].length === 1 && a.uno !== true;
  if (penalty) drawCards(g, actor, 2, random);
  const draw = card.value === 'draw2' ? 2 : card.value === 'wild4' ? 4 : 0;
  if (draw) drawCards(g, 1 - actor, draw, random);
  const extraTurn = ['skip','reverse','draw2','wild4'].includes(card.value);
  g.notice = `${COLOR_NAMES[g.color]} is the active color. ${draw ? `Player ${2 - actor} draws ${draw}; Player ${actor + 1} plays again.` : extraTurn ? `Player ${2 - actor} is skipped; Player ${actor + 1} plays again.` : `Player ${2 - actor} is up.`}${penalty ? ` Player ${actor + 1} missed UNO: two-card penalty.` : g.hands[actor].length === 1 ? ` Player ${actor + 1} says UNO!` : ''}`;
  if (g.hands[actor].length === 0) g.result = { winner:actor, line:[] };
  else g.turn = extraTurn ? actor : 1 - actor;
  return true;
}
export function moveDateGame(state, actor, action, random = Math.random) {
  if (state.game.id === 'rather' && action.type === 'pick') {
    // Both devices may pick at once; accept each once for this exact question.
    if (action.questionId !== state.game.questionId) return null;
  } else if (action.step !== state.game.step) return null;
  const next = structuredClone(state), g = next.game;
  const accepted = g.id === 'truth' ? truthMove(g, actor, action) : g.id === 'rather' ? ratherMove(g, actor, action) : unoMove(g, actor, action, random);
  if (!accepted) return null;
  g.step++;
  if (g.result?.winner !== null && g.result?.winner !== undefined) next.scores[g.result.winner]++;
  return next;
}
export function projectDateGame(g, viewer) {
  if (g.id === 'truth') { delete g.truths; delete g.dares; delete g.truthIndex; delete g.dareIndex; }
  if (g.id === 'rather') {
    delete g.questions;
    if (!g.revealed) g.choices = g.choices.map(c => c === null ? null : 'locked');
  }
  if (g.id === 'uno') {
    g.hands = g.hands.map((hand, i) => i === viewer ? hand : hand.map(() => null));
    if (g.drawPile) g.drawCount = g.drawPile.length;
    delete g.drawPile;
    g.discard = [g.discard.at(-1)];
    // A drawn card ID would reveal its identity because card IDs are stable.
    if (viewer !== g.turn && g.drawn !== null) g.drawn = 'hidden';
  }
}
export function validDateGame(g) {
  if (!Number.isInteger(g.step) || g.step < 0) return false;
  const text = (v, max = 500) => typeof v === 'string' && v.length <= max;
  if (g.id === 'truth') return ['choose','prompt','response'].includes(g.stage) && (g.prompt === null || (g.prompt && ['truth','dare'].includes(g.prompt.kind) && text(g.prompt.text))) && text(g.answer) && Number.isInteger(g.completed) && g.completed >= 0 && g.completed <= 10 && (g.last === null || (g.last && [0,1].includes(g.last.actor) && typeof g.last.skipped === 'boolean'));
  if (g.id === 'rather') return Array.isArray(g.question) && g.question.length === 2 && g.question.every(v => text(v)) && Number.isInteger(g.questionId) && g.questionId >= 0 && Number.isInteger(g.number) && g.number >= 1 && g.number <= 10 && Array.isArray(g.choices) && g.choices.length === 2 && g.choices.every(c => [null,0,1,'locked'].includes(c)) && typeof g.revealed === 'boolean' && Number.isInteger(g.matches) && g.matches >= 0 && g.matches <= 10;
  const card = c => c && Number.isInteger(c.uid) && c.uid >= 0 && c.uid < 108 && [...COLORS,'wild'].includes(c.color) && [...Object.keys(CARD_NAMES),...'0123456789'].includes(c.value);
  return Array.isArray(g.hands) && g.hands.length === 2 && g.hands.every(h => Array.isArray(h) && h.length <= 108 && h.every(c => c === null || card(c))) && Array.isArray(g.discard) && g.discard.length === 1 && card(g.discard[0]) && COLORS.includes(g.color) && Number.isInteger(g.drawCount) && g.drawCount >= 0 && g.drawCount <= 108 && (g.drawn === null || g.drawn === 'empty' || g.drawn === 'hidden' || (Number.isInteger(g.drawn) && g.drawn >= 0 && g.drawn < 108)) && text(g.notice);
}
