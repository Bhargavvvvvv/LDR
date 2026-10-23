import { DATE_GAME_IDS, startDateGame, moveDateGame, projectDateGame } from './date-games.js';
// Pure, host-authoritative rules. The guest sends intentions, never board state.
export const GAME_INFO = {
  truth: { title:'Truth or Dare', tag:'A LITTLE CLOSER', description:'Honest little answers. Sweet little dares.', time:'10 moments', rules:'Take turns picking truth or dare. Share an answer or complete a dare. You can always skip. No points, just connection.' },
  rather: { title:'Would You Rather', tag:'GET TO KNOW YOUR PERSON', description:'Two choices. A whole new conversation.', time:'10 questions', rules:'Pick privately, then reveal together. Tell each other why. Either player can skip a question or move on after the reveal.' },
  uno: { title:'UNO for Two', tag:'ONE CARD. ALL THE FEELINGS.', description:'A colorful rivalry, made for just us.', time:'5–15 min', rules:'Match the active color or the top card’s number or symbol. Empty your hand to win. Tap “Say UNO” before playing down to one card.' },
  ttt: { title: 'Tic-Tac-Toe', tag: 'THE CLASSIC', description: 'Three in a row. Endless “I let you win.”', time: '1–2 min', rules: 'Take turns placing your mark. Get three in a row to win.' },
  rps: { title: 'Rock Paper Scissors', tag: 'TRUST YOUR GUT', description: 'Great minds think alike. Or do they?', time: '30 sec', rules: 'Choose in secret. Rock beats scissors, scissors beats paper, paper beats rock.' },
  c4: { title: 'Connect Four', tag: 'A LITTLE STRATEGY', description: 'Make a connection. Four, actually.', time: '3–5 min', rules: 'Drop a piece into a column. Connect four horizontally, vertically, or diagonally.' },
  memory: { title: 'Memory Match', tag: 'BETTER TOGETHER', description: 'Find the pairs. Steal their heart.', time: '2–4 min', rules: 'Flip two cards. A matching pair earns a point and another turn. Most pairs wins.' },
};
export const SYMBOLS = ['🌷','🍒','🍋','🦋','🌙','🍓','🌻','🎀'];
export const RPS = { rock: '✊', paper: '✋', scissors: '✌️' };
export function createRoom(name = 'Player 1') {
  return { players: [name, null], scores: [0, 0], round: 0, game: null };
}
export function startGame(state, id, random = Math.random) {
  if (!Object.hasOwn(GAME_INFO, id)) return null;
  const next = structuredClone(state);
  next.round++;
  let game = { id, turn: (next.round - 1) % 2, result: null };
  if (DATE_GAME_IDS.includes(id)) game = startDateGame(game, random);
  if (id === 'ttt') game.board = Array(9).fill(null);
  if (id === 'c4') game.board = Array(42).fill(null);
  if (id === 'rps') game.choices = [null, null];
  if (id === 'memory') {
    game.deck = SYMBOLS.flatMap((_, i) => [i, i]);
    for (let i = game.deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [game.deck[i], game.deck[j]] = [game.deck[j], game.deck[i]];
    }
    game.flipped = []; game.matched = []; game.pairs = [0, 0]; game.pending = false;
  }
  next.game = game;
  return next;
}
function finish(state, winner, line = []) {
  state.game.result = { winner, line };
  if (winner !== null) state.scores[winner]++;
}
function winnerLine(board, rows, columns, count) {
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const value = board[r * columns + c];
    if (value === null) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const line = [];
      for (let k = 0; k < count; k++) {
        const nr = r + dr * k, nc = c + dc * k;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= columns || board[nr * columns + nc] !== value) break;
        line.push(nr * columns + nc);
      }
      if (line.length === count) return { winner: value, line };
    }
  }
  return null;
}
export function move(state, actor, action, random = Math.random) {
  if (!state.game || state.game.result || (actor !== 0 && actor !== 1) || !action || action.round !== state.round) return null;
  if (DATE_GAME_IDS.includes(state.game.id)) return moveDateGame(state, actor, action, random);
  const next = structuredClone(state), g = next.game;
  if (g.id === 'rps') {
    if (!Object.hasOwn(RPS, action.choice) || g.choices[actor] !== null) return null;
    g.choices[actor] = action.choice;
    if (g.choices.every(Boolean)) {
      const [a, b] = g.choices;
      finish(next, a === b ? null : ({ rock: 'scissors', paper: 'rock', scissors: 'paper' }[a] === b ? 0 : 1));
    }
    return next;
  }
  if (g.turn !== actor || !Number.isInteger(action.index)) return null;
  let index = action.index;
  if (g.id === 'memory') {
    if (index < 0 || index >= 16 || g.pending || g.flipped.includes(index) || g.matched.includes(index)) return null;
    g.flipped.push(index);
    if (g.flipped.length === 2) {
      const [a, b] = g.flipped;
      if (g.deck[a] === g.deck[b]) {
        g.matched.push(a, b); g.pairs[actor]++; g.flipped = [];
        if (g.matched.length === 16) finish(next, g.pairs[0] === g.pairs[1] ? null : g.pairs[0] > g.pairs[1] ? 0 : 1);
      } else g.pending = true;
    }
    return next;
  }
  if (g.id === 'c4') {
    if (index < 0 || index > 6) return null;
    let row = 5;
    while (row >= 0 && g.board[row * 7 + index] !== null) row--;
    if (row < 0) return null;
    index += row * 7;
  } else if (index < 0 || index > 8) return null;
  if (g.board[index] !== null) return null;
  g.board[index] = actor;
  const won = winnerLine(g.board, g.id === 'ttt' ? 3 : 6, g.id === 'ttt' ? 3 : 7, g.id === 'ttt' ? 3 : 4);
  if (won) finish(next, won.winner, won.line);
  else if (g.board.every(v => v !== null)) finish(next, null);
  else g.turn = 1 - actor;
  return next;
}
export function settleMemory(state, round) {
  if (state.round !== round || state.game?.id !== 'memory' || !state.game.pending) return null;
  const next = structuredClone(state);
  next.game.pending = false; next.game.flipped = []; next.game.turn = 1 - next.game.turn;
  return next;
}
// Do not transmit unrevealed memory cards or a partner's unplayed RPS choice.
export function publicState(state, viewer = 0) {
  const next = structuredClone(state), g = next.game;
  if (g && DATE_GAME_IDS.includes(g.id)) projectDateGame(g, viewer);
  if (g?.id === 'rps' && !g.result) g.choices = g.choices.map(choice => choice ? 'locked' : null);
  if (g?.id === 'memory') g.deck = g.deck.map((value, i) => g.matched.includes(i) || g.flipped.includes(i) ? value : null);
  return next;
}
