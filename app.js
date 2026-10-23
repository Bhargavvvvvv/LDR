import { GAME_INFO, SYMBOLS, RPS, createRoom, startGame, move, settleMemory, publicState } from './games.js';
import { ART } from './art.js';
import { peerOptions } from './config.js';
import { DATE_GAME_IDS, validDateGame } from './date-games.js';
import { renderDateGame, ratherHandoffKey } from './date-ui.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const cleanName = name => typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20) : '';
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;
const REACTIONS = { heart:'💗', clap:'👏', laugh:'😄', kiss:'😘' };
let session = null, state = null, selectedGame = null, busy = false, memoryTimer, toastTimer, handoffRound = null, lastReaction = 0;
let pendingWild = null, unoOwner = null, unoRound = null, saidUno = false, dateUiKey = '', truthDraft = { key:'', text:'' };

function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200);
}
function connectionMessage(message = '') { $('#connection-message').textContent = message; }
function setBusy(value) {
  busy = value;
  $('#create-room').disabled = value; $('#join-room').disabled = value;
  $('#create-room').innerHTML = value ? 'Connecting…' : 'Create a room <span aria-hidden="true">↗</span>';
}
function getName() {
  const name = cleanName($('#player-name').value);
  if (!name) { connectionMessage('A name first, then the fun.'); $('#player-name').focus(); return null; }
  try { localStorage.setItem('just-us-name', name); } catch { /* Private browsing can disable storage. */ }
  return name;
}
function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(10))].map(n => alphabet[n % alphabet.length]).join('');
}
function cardMarkup(id, disabled = false) {
  const g = GAME_INFO[id];
  return `<button class="game-card" data-game="${id}" ${disabled ? 'disabled' : ''} aria-label="Play ${g.title}"><div class="game-art art-${id}">${ART[id]}</div><div class="game-card-body"><h3>${g.title}</h3><p>${g.description}</p><div class="game-meta"><span>2 players · ${g.time}</span><span class="game-arrow" aria-hidden="true">↗</span></div></div></button>`;
}
$('#home-games').innerHTML = Object.keys(GAME_INFO).map(id => cardMarkup(id)).join('');

function cleanup() {
  const old = session; session = null;
  clearTimeout(memoryTimer);
  if (old) { clearTimeout(old.timeout); clearTimeout(old.handshakeTimer); old.conn?.close(); old.peer?.destroy(); }
  state = null; handoffRound = null; setBusy(false);
  pendingWild = null; unoOwner = null; unoRound = null; saidUno = false; dateUiKey = ''; truthDraft = { key:'', text:'' };
}
function fail(message) {
  cleanup(); $('#home').hidden = false; $('#room').hidden = true;
  connectionMessage(message);
}
function send(message) {
  if (!session?.conn?.open) return;
  try { session.conn.send(message); } catch { disconnected(); }
}
function disconnected() {
  if (!session || session.mode === 'local') return;
  session.ready = false; session.lost = true;
  render();
}
function createPeer(id) {
  if (typeof window.Peer !== 'function') throw new Error('The connection library could not load. Refresh the page and try again.');
  return id ? new window.Peer(id, peerOptions) : new window.Peer(peerOptions);
}
function explainError(error) {
  return ({ 'peer-unavailable':'That room could not be found. Check the code and make sure your person has their room open.', 'unavailable-id':'That room code is already in use. Please create another room.', 'network':'The connection service is unreachable. Check your internet and try again.', 'browser-incompatible':'This browser does not support live play. Try a current Chrome, Safari, Firefox, or Edge browser.', 'ssl-unavailable':'A secure connection is required. Open the HTTPS version of your site.' })[error.type] || 'The room could not connect. Try again, use another network, or turn off your VPN.';
}
function watchPeer(s) {
  s.peer.on('error', error => {
    if (session !== s) return;
    if (s.ready && s.conn?.open) return; // A live data channel does not depend on signaling.
    if ($('#room').hidden) fail(explainError(error));
    else { s.ready = false; s.lost = true; s.error = explainError(error); render(); }
  });
  s.peer.on('disconnected', () => {
    if (session !== s) return;
    if (!s.ready) { s.error = 'The room connection was interrupted. Leave and create a new room to try again.'; s.lost = true; render(); }
    else if (!s.peer.destroyed) s.peer.reconnect();
  });
}
function rejectConnection(conn, reason) {
  conn.on('error', () => {});
  conn.on('open', () => { conn.send({ type:'reject', reason }); setTimeout(() => conn.close(), 300); });
}
async function hostRoom() {
  if (busy) return;
  const name = getName(); if (!name) return;
  cleanup(); setBusy(true); connectionMessage('Making a little room for you two…');
  const s = session = { mode:'online', role:0, code:roomCode(), ready:false, occupied:false, name };
  state = createRoom(name);
  if (selectedGame) state = startGame(state, selectedGame);
  try { s.peer = createPeer(`just-us-v1-${s.code}`); } catch (e) { fail(e.message); return; }
  s.timeout = setTimeout(() => { if (session === s) fail('The connection service took too long. Check your network and try again.'); }, 18000);
  watchPeer(s);
  s.peer.on('open', () => {
    if (session !== s) return;
    clearTimeout(s.timeout); setBusy(false); connectionMessage(); showRoom();
  });
  s.peer.on('connection', conn => {
    if (session !== s || s.conn || s.occupied || s.lost) { rejectConnection(conn, 'This room already has two players or has ended. Ask your person for a new invite.'); return; }
    s.conn = conn;
    s.handshakeTimer = setTimeout(() => { if (session === s && !s.ready) { s.conn = null; conn.close(); } }, 12000);
    conn.on('data', message => {
      if (session !== s || s.conn !== conn || !message || typeof message !== 'object') return;
      if (message.type === 'hello' && !s.occupied && cleanName(message.name)) {
        clearTimeout(s.handshakeTimer); s.occupied = true; s.ready = true;
        state.players[1] = cleanName(message.name); publish(); toast(`${state.players[1]} is here. Let the games begin!`);
      } else if (message.type === 'move' && s.ready) applyMove(1, message.action);
      else if (message.type === 'lobby' && s.ready && message.round === state.round) showGameSelection();
      else if (message.type === 'reaction' && s.ready) receiveReaction(message.value, 1);
    });
    conn.on('close', () => { if (session === s && s.conn === conn) { if (s.occupied) disconnected(); else { s.conn = null; clearTimeout(s.handshakeTimer); } } });
    conn.on('error', () => { if (session === s && s.conn === conn) { if (s.occupied) disconnected(); else { s.conn = null; conn.close(); clearTimeout(s.handshakeTimer); } } });
  });
}
function joinRoom(event) {
  event?.preventDefault(); if (busy) return;
  const name = getName(); if (!name) return;
  const code = $('#room-code').value.toUpperCase().replace(/[\s-]/g, '');
  if (!CODE_PATTERN.test(code)) { connectionMessage('Enter the 10-character room code from your person.'); $('#room-code').focus(); return; }
  cleanup(); setBusy(true); connectionMessage('Finding your person…');
  const s = session = { mode:'online', role:1, code, name, ready:false };
  try { s.peer = createPeer(); } catch (e) { fail(e.message); return; }
  watchPeer(s);
  s.timeout = setTimeout(() => { if (session === s && !s.ready) fail('We could not connect the two devices. Keep the host’s tab open, check the code, and try another network or turn off your VPN.'); }, 22000);
  s.peer.on('connection', conn => rejectConnection(conn, 'This player is already joining a room.'));
  s.peer.on('open', () => {
    if (session !== s) return;
    const conn = s.conn = s.peer.connect(`just-us-v1-${code}`, { reliable:true, serialization:'json' });
    conn.on('open', () => { if (session === s) send({ type:'hello', name }); });
    conn.on('data', message => {
      if (session !== s || !message || typeof message !== 'object') return;
      if (message.type === 'reject') { fail(typeof message.reason === 'string' ? message.reason.slice(0, 200) : 'That room is full.'); return; }
      if (message.type === 'state' && validState(message.state)) {
        clearTimeout(s.timeout); state = message.state; s.ready = true; s.lost = false;
        setBusy(false); connectionMessage(); showRoom();
      } else if (message.type === 'reaction') receiveReaction(message.value, 0);
    });
    conn.on('close', () => { if (session === s) { if (s.ready) disconnected(); else if (!s.lost) fail('The room closed before you could join. Ask your person to create a new one.'); } });
    conn.on('error', () => { if (session === s) { if (s.ready) disconnected(); else fail('The room could not connect. Check your code and try another network.'); } });
  });
}
function validState(s) {
  if (!s || !Array.isArray(s.players) || s.players.length !== 2 || !s.players.every(n => n === null || (typeof n === 'string' && n.length <= 20)) || !Array.isArray(s.scores) || s.scores.length !== 2 || !s.scores.every(n => Number.isInteger(n) && n >= 0) || !Number.isInteger(s.round)) return false;
  const g = s.game; if (g === null) return true;
  if (!g || !Object.hasOwn(GAME_INFO, g.id) || ![0, 1].includes(g.turn)) return false;
  if (g.result !== null && (!g.result || ![null, 0, 1].includes(g.result.winner) || !Array.isArray(g.result.line))) return false;
  if (DATE_GAME_IDS.includes(g.id)) return validDateGame(g);
  if (['ttt', 'c4'].includes(g.id)) return Array.isArray(g.board) && g.board.length === (g.id === 'ttt' ? 9 : 42) && g.board.every(v => [null, 0, 1].includes(v));
  if (g.id === 'rps') return Array.isArray(g.choices) && g.choices.length === 2 && g.choices.every(c => [null, 'locked', ...Object.keys(RPS)].includes(c));
  return Array.isArray(g.deck) && g.deck.length === 16 && g.deck.every(v => v === null || (Number.isInteger(v) && v >= 0 && v < 8)) && Array.isArray(g.flipped) && g.flipped.length <= 2 && Array.isArray(g.matched) && g.matched.length <= 16 && [...g.flipped, ...g.matched].every(i => Number.isInteger(i) && i >= 0 && i < 16) && Array.isArray(g.pairs) && g.pairs.length === 2 && g.pairs.every(n => Number.isInteger(n) && n >= 0 && n <= 8);
}
function localPlay() {
  const name = cleanName($('#player-name').value) || 'Player 1';
  cleanup(); connectionMessage(); session = { mode:'local', role:0, ready:true };
  state = createRoom(name); state.players[1] = 'Player 2';
  if (selectedGame) state = startGame(state, selectedGame);
  showRoom();
}
function showRoom() { $('#home').hidden = true; $('#room').hidden = false; render(); }
function publish() { if (session?.mode === 'online') send({ type:'state', state:publicState(state, 1) }); render(); }
function applyMove(actor, action) {
  if (!session?.ready) return;
  const next = move(state, actor, action); if (!next) return;
  state = next; publish();
  if (state.game?.pending) {
    clearTimeout(memoryTimer); const round = state.round;
    memoryTimer = setTimeout(() => {
      if (!session || !state) return;
      const settled = settleMemory(state, round);
      if (settled) { state = settled; publish(); }
    }, 1100);
  }
}
function play(action) {
  if (!session?.ready || !state?.game) return;
  action.round = state.round;
  if (DATE_GAME_IDS.includes(state.game.id)) action.step = state.game.step;
  if (state.game.id === 'rather') action.questionId = state.game.questionId;
  if (session.mode === 'local') {
    const actor = ['rps', 'rather'].includes(state.game.id) ? state.game.choices[0] !== null ? 1 : 0 : state.game.turn;
    applyMove(actor, action);
  } else if (session.role === 0) applyMove(0, action);
  else send({ type:'move', action });
}
function chooseGame(id) {
  if (!session) {
    selectedGame = id; toast(`${GAME_INFO[id].title} it is! Create a room or play on one device.`);
    $('#player-name').focus(); $('#player-name').scrollIntoView({ block:'center', behavior:'smooth' }); return;
  }
  if (session.mode !== 'local' && (session.role !== 0 || !session.ready)) return;
  clearTimeout(memoryTimer); state = startGame(state, id); handoffRound = null; publish();
}
function showGameSelection() {
  if (!session || !state) return;
  if (session.mode === 'online' && session.role === 1) {
    if (session.ready) send({ type:'lobby', round:state.round });
  } else {
    clearTimeout(memoryTimer);
    state.game = null;
    handoffRound = null;
    publish();
  }
  window.scrollTo({ top:0, behavior:'smooth' });
}
function render() {
  if (!session || !state) return;
  const local = session.mode === 'local', host = local || session.role === 0, ready = session.ready;
  const s = publicState(state, local ? state.game?.turn ?? 0 : session.role);
  $('#room-subtitle').textContent = ['truth','rather'].includes(s.game?.id) ? 'A little honesty. A little laughter. A little closer.' : 'A little friendly competition looks good on you two.';
  $('#room-connection').textContent = local ? 'TOGETHER ON ONE DEVICE' : session.lost ? 'CONNECTION LOST' : ready ? 'YOU’RE BOTH HERE' : 'WAITING FOR YOUR PERSON';
  $('#room-dot').classList.toggle('offline', !ready);
  $('#copy-invite').hidden = local;
  $('#display-code').textContent = session.code || '';
  $('#players').innerHTML = s.players.map((name, i) => `${i ? '<div class="player-vs">vs.</div>' : ''}<div class="player-card"><span class="player-avatar">${escape(name ? name[0].toUpperCase() : '♡')}</span><div><div class="player-name">${escape(name || 'Your person')}</div><div class="player-label">${!name ? 'Waiting to join…' : local ? `Player ${i + 1}` : i === session.role ? 'You' : 'Your person'}</div></div><span class="player-score" aria-label="${s.scores[i]} wins">${s.scores[i]}</span></div>`).join('');
  $('#room-notice').textContent = session.error || (session.lost ? 'Your connection ended. Leave this room and create a new one to play again. This round is paused.' : !ready ? 'Your room is ready. Copy the invite above and send it to your favorite person. Keep this tab open.' : '');
  $('#lobby-instruction').textContent = host ? 'Pick a game to start your date.' : `${s.players[0]} is choosing your next game.`;
  $('#room-games').innerHTML = Object.keys(GAME_INFO).map(id => cardMarkup(id, !host || !ready)).join('');
  $('#lobby').hidden = Boolean(s.game); $('#game-panel').hidden = !s.game;
  document.querySelectorAll('[data-reaction]').forEach(button => { button.disabled = !ready; });
  if (!s.game) return;
  const g = s.game, info = GAME_INFO[g.id];
  const uiKey = `${s.round}:${g.step}`;
  if (dateUiKey !== uiKey) { dateUiKey = uiKey; pendingWild = null; saidUno = false; }
  if (unoRound !== s.round) { unoRound = s.round; unoOwner = null; }
  $('#game-board').classList.toggle('wide-board', g.id === 'uno');
  $('#active-game-tag').textContent = info.tag; $('#active-game-title').textContent = info.title; $('#game-rules').textContent = info.rules;
  $('#game-round').textContent = `ROUND ${s.round}`;
  $('#back-games').disabled = !ready;
  $('#rematch').hidden = !g.result || !host; $('#rematch').disabled = !ready;
  $('#rematch-wait').hidden = !g.result || host;
  let message;
  if (!ready) message = session.lost ? 'Play is paused — connection lost.' : 'Waiting for your person to join…';
  else if (g.result) message = g.result.winner === null ? 'A perfect match. It’s a tie! ♡' : `${s.players[g.result.winner]} wins! ${local || g.result.winner !== session.role ? 'Well played. ♡' : 'Look at you go. ♡'}`;
  else if (g.id === 'rps') {
    const actor = local ? g.choices[0] ? 1 : 0 : session.role;
    message = g.choices[actor] ? 'Choice locked. Waiting for your person…' : local ? `${s.players[actor]}, choose your move in secret.` : 'What’s your move? Your choice stays secret until you both pick.';
  } else if (g.id === 'memory' && g.pending) message = 'Not quite a match. Take a little mental picture…';
  else message = local ? `${s.players[g.turn]}’s turn${g.id === 'ttt' ? ` · ${g.turn === 0 ? '×' : '○'}` : ''}` : g.turn === session.role ? `Your turn${g.id === 'ttt' ? ` · You’re ${g.turn === 0 ? '×' : '○'}` : ''}` : `${s.players[g.turn]}’s turn. A little patience, a little strategy.`;
  if (DATE_GAME_IDS.includes(g.id)) {
    const view = renderDateGame(s, { local, role:session.role, ready, handoff:handoffRound, unoOwner, wild:pendingWild, saidUno, draft:truthDraft.key === uiKey ? truthDraft.text : '' });
    $('#game-board').innerHTML = view.html;
    $('#game-round').textContent = view.progress;
    if (ready) message = view.message;
  }
  $('#turn-message').textContent = message; $('#turn-message').classList.toggle('finished', Boolean(g.result));
  const canMove = ready && !g.result && (local || g.turn === session.role);
  if (g.id === 'ttt') $('#game-board').innerHTML = `<div class="board-ttt">${g.board.map((value, i) => `<button class="ttt-cell ${g.result?.line.includes(i) ? 'winning' : ''}" data-index="${i}" data-player="${value}" aria-label="Row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}: ${value === null ? 'empty' : value === 0 ? 'X' : 'O'}" ${!canMove || value !== null ? 'disabled' : ''}>${value === null ? '' : value === 0 ? '×' : '○'}</button>`).join('')}</div>`;
  if (g.id === 'c4') $('#game-board').innerHTML = `<div class="board-c4">${Array.from({length:7}, (_, i) => `<button class="c4-drop" data-index="${i}" aria-label="Drop into column ${i + 1}" ${!canMove || g.board[i] !== null ? 'disabled' : ''}>↓</button>`).join('')}${g.board.map((v, i) => `<span class="c4-cell ${g.result?.line.includes(i) ? 'winning' : ''}" data-player="${v}" role="img" aria-label="Row ${Math.floor(i / 7) + 1}, column ${i % 7 + 1}: ${v === null ? 'empty' : escape(s.players[v])}">${v === null ? '' : v === 0 ? '♡' : '✧'}</span>`).join('')}</div>`;
  if (g.id === 'memory') $('#game-board').innerHTML = `<p class="memory-score">${escape(s.players[0])}: ${g.pairs[0]} pairs &nbsp; · &nbsp; ${escape(s.players[1])}: ${g.pairs[1]} pairs</p><div class="board-memory">${g.deck.map((v, i) => `<button class="memory-card ${v !== null ? 'revealed' : ''} ${g.matched.includes(i) ? 'matched' : ''}" data-index="${i}" aria-label="Card ${i + 1}: ${v === null ? 'face down' : SYMBOLS[v]}${g.matched.includes(i) ? ', matched' : ''}" ${!canMove || g.pending || v !== null ? 'disabled' : ''}>${v === null ? '✧' : SYMBOLS[v]}</button>`).join('')}</div>`;
  if (g.id === 'rps') {
    if (g.result) $('#game-board').innerHTML = `<div class="rps-result">${g.choices.map((choice, i) => `${i ? '<span>vs.</span>' : ''}<div><strong>${RPS[choice]}</strong>${escape(s.players[i])}<small>${escape(choice)}</small></div>`).join('')}</div>`;
    else if (local && g.choices[0] && handoffRound !== s.round) $('#game-board').innerHTML = `<div class="local-handoff">First choice locked. No peeking!<br>Pass the device to ${escape(s.players[1])}.<button id="handoff-ready" class="button secondary">I’m ready to choose →</button></div>`;
    else {
      const actor = local ? g.choices[0] ? 1 : 0 : session.role;
      $('#game-board').innerHTML = `<div class="rps-choices">${Object.entries(RPS).map(([choice, icon]) => `<button class="rps-choice" data-choice="${choice}" ${!ready || g.choices[actor] ? 'disabled' : ''}><span aria-hidden="true">${icon}</span>${choice[0].toUpperCase() + choice.slice(1)}</button>`).join('')}</div>`;
    }
  }
}
function animateReaction(value) {
  if (!Object.hasOwn(REACTIONS, value)) return;
  for (let i = 0; i < 5; i++) {
    const item = document.createElement('span'); item.className = 'floating-reaction'; item.textContent = REACTIONS[value];
    item.style.left = `${25 + Math.random() * 50}%`; item.style.animationDelay = `${i * .13}s`;
    $('#reaction-stage').append(item); setTimeout(() => item.remove(), 3400);
  }
}
function receiveReaction(value, actor) {
  if (!Object.hasOwn(REACTIONS, value) || !session || Date.now() - (session.lastReceivedReaction || 0) < 1200) return;
  session.lastReceivedReaction = Date.now(); animateReaction(value); toast(`${state?.players[actor] || 'Your person'} sent ${REACTIONS[value]}`);
}
$('#create-room').addEventListener('click', hostRoom);
$('#join-form').addEventListener('submit', joinRoom);
$('#local-play').addEventListener('click', localPlay);
$('#room-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase(); });
$('#leave-room').addEventListener('click', () => {
  if (session?.ready && !window.confirm('Leave your play date? The room and its scores will end.')) return;
  cleanup(); $('#room').hidden = true; $('#home').hidden = false; connectionMessage();
  const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url); window.scrollTo(0, 0);
});
$('#copy-invite').addEventListener('click', async () => {
  if (!session?.code) return;
  const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('room', session.code);
  try { await navigator.clipboard.writeText(url.href); toast('Invite link copied. Send it to your person!'); }
  catch { toast(`Share this room code: ${session.code}`); }
});
$('.brand').addEventListener('click', event => {
  if (!session) return;
  event.preventDefault();
  showGameSelection();
});
$('#back-games').addEventListener('click', showGameSelection);
$('#rematch').addEventListener('click', () => { if (state?.game?.result) chooseGame(state.game.id); });
document.addEventListener('click', event => {
  const card = event.target.closest('[data-game]'); if (card && !card.disabled) chooseGame(card.dataset.game);
  const cell = event.target.closest('[data-index]'); if (cell && !cell.disabled) play({ index:Number(cell.dataset.index) });
  const choice = event.target.closest('[data-choice]'); if (choice && !choice.disabled) play({ choice:choice.dataset.choice });
  if (event.target.closest('#handoff-ready')) { handoffRound = state.game.id === 'rather' ? ratherHandoffKey(state) : state.round; render(); }
  const dateAction = event.target.closest('[data-date-action]');
  if (dateAction && !dateAction.disabled) {
    const type = dateAction.dataset.dateAction;
    if (type === 'show-hand') { unoOwner = state.game.turn; render(); }
    else if (type === 'say-uno') { saidUno = !saidUno; render(); }
    else if (type === 'cancel-wild') { pendingWild = null; render(); }
    else play(type === 'truth' || type === 'dare' ? { type:'prompt', kind:type } : { type });
  }
  const option = event.target.closest('[data-rather-option]');
  if (option && !option.disabled) play({ type:'pick', option:Number(option.dataset.ratherOption) });
  const unoCard = event.target.closest('[data-uno-card]');
  if (unoCard && !unoCard.disabled) {
    const viewer = session.mode === 'local' ? state.game.turn : session.role;
    const selected = state.game.hands[viewer].find(c => c?.uid === Number(unoCard.dataset.unoCard));
    if (selected?.color === 'wild') { pendingWild = { round:state.round, step:state.game.step, uid:selected.uid }; render(); }
    else if (selected) play({ type:'card', uid:selected.uid, uno:saidUno });
  }
  const wildColor = event.target.closest('[data-wild-color]');
  if (wildColor && !wildColor.disabled && pendingWild) play({ type:'card', uid:pendingWild.uid, color:wildColor.dataset.wildColor, uno:saidUno });
  const reaction = event.target.closest('[data-reaction]');
  if (reaction && session?.ready && Date.now() - lastReaction > 1200) { lastReaction = Date.now(); animateReaction(reaction.dataset.reaction); send({ type:'reaction', value:reaction.dataset.reaction }); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'truth-answer') truthDraft = { key:dateUiKey, text:event.target.value };
});
document.addEventListener('submit', event => {
  if (event.target.id !== 'truth-answer-form') return;
  event.preventDefault(); play({ type:'answer', text:$('#truth-answer').value });
});
$('#how-button').addEventListener('click', () => $('#help-dialog').showModal());
$('#close-help').addEventListener('click', () => $('#help-dialog').close());
$('#help-done').addEventListener('click', () => $('#help-dialog').close());
$('#help-dialog').addEventListener('click', event => { if (event.target === $('#help-dialog') && (event.offsetX < 0 || event.offsetY < 0 || event.offsetX > event.target.offsetWidth || event.offsetY > event.target.offsetHeight)) event.target.close(); });
window.addEventListener('beforeunload', () => session?.peer?.destroy());
window.addEventListener('offline', () => { if (session?.mode === 'online' && session.ready) toast('Your internet connection dropped. Waiting for the room connection…'); });
try { $('#player-name').value = cleanName(localStorage.getItem('just-us-name')); } catch { /* Optional convenience only. */ }
const invite = new URL(location.href).searchParams.get('room');
if (invite && CODE_PATTERN.test(invite.toUpperCase())) { $('#room-code').value = invite.toUpperCase(); connectionMessage('Your person invited you. Enter your name and tap Join.'); }
