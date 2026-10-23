import { COLORS, COLOR_NAMES, CARD_NAMES, canPlayCard } from './date-games.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const button = (label, action, disabled = false, style = 'secondary') => `<button type="button" class="button ${style}" data-date-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
export const ratherHandoffKey = s => `${s.round}:rather:${s.game.questionId}`;
export const cardLabel = c => `${c.color === 'wild' ? '' : COLOR_NAMES[c.color] + ' '}${CARD_NAMES[c.value] || c.value}`;
function cardFace(c) {
  const symbol = c.value === 'reverse' ? '↺' : c.value === 'skip' ? '⊘' : CARD_NAMES[c.value] || c.value;
  const caption = c.value === 'reverse' ? 'REVERSE' : c.value === 'skip' ? 'SKIP' : c.color === 'wild' ? '✦' : c.color === 'rose' ? '♥' : c.color === 'gold' ? '☀' : c.color === 'sage' ? '✿' : '◆';
  return `<small>${c.color === 'wild' ? 'ANY COLOR' : COLOR_NAMES[c.color].toUpperCase()}</small><strong>${symbol}</strong><span class="card-caption" aria-hidden="true">${caption}</span>`;
}

export function renderDateGame(s, ui) {
  const g = s.game, { local, role, ready } = ui;
  const active = ready && !g.result, ownTurn = active && (local || role === g.turn);
  let html = '', message = '', progress = '';
  if (g.id === 'truth') {
    progress = `${g.completed} / 10 MOMENTS SHARED`;
    message = g.result ? 'Ten little moments, a little closer. You both win. ♡' : g.stage === 'response' ? 'Take a moment to listen. There’s no rush to move on.' : `${s.players[g.turn]}, ${g.stage === 'choose' ? 'truth or dare?' : 'this one is yours.'}`;
    const last = g.last?.skipped && g.stage === 'choose' ? `<p class="date-footnote">${escape(s.players[g.last.actor])} passed. A fresh start for the next person. ♡</p>` : '';
    if (g.stage === 'choose') html = `${last}<div class="date-choices"><button class="date-choice truth-choice" data-date-action="truth" ${!ownTurn ? 'disabled' : ''}><span>♡</span><strong>Truth</strong><small>Let me know you a little better.</small></button><button class="date-choice dare-choice" data-date-action="dare" ${!ownTurn ? 'disabled' : ''}><span>✧</span><strong>Dare</strong><small>A small, sweet leap together.</small></button></div><p class="date-footnote">Keep it comfortable. Skipping never costs a point.</p><div class="date-actions">${button('Pass my turn', 'skip', !ownTurn, 'quiet')}</div>`;
    else {
      html = `<div class="prompt-card"><span class="eyebrow">${g.prompt.kind === 'truth' ? 'A LITTLE HONESTY' : 'A LITTLE COURAGE'}</span><h3>${escape(g.prompt.text)}</h3></div>`;
      if (g.stage === 'prompt') html += ownTurn ? `<form id="truth-answer-form" class="answer-form"><label for="truth-answer">${g.prompt.kind === 'truth' ? 'Your answer' : 'A little note (optional)'}</label><textarea id="truth-answer" maxlength="500" rows="3" ${g.prompt.kind === 'truth' ? 'required' : ''} placeholder="Something just for your person…">${escape(ui.draft)}</textarea><div class="date-actions"><button type="submit" class="button primary">${g.prompt.kind === 'truth' ? 'Share my answer ♡' : 'Dare done ♡'}</button>${button('Skip this one', 'skip', false, 'quiet')}</div></form>` : `<p class="date-footnote">${escape(s.players[g.turn])} is taking their turn. Their answer will appear here.</p>`;
      else html += `<div class="shared-answer"><span>${escape(s.players[g.turn])} shared</span><p>${escape(g.answer)}</p></div>${g.result ? '' : `<div class="date-actions">${button('Next person →', 'next', !active, 'primary')}</div>`}`;
    }
  }
  if (g.id === 'rather') {
    progress = `QUESTION ${g.number} / 10`;
    const actor = local ? g.choices[0] !== null ? 1 : 0 : role;
    message = g.result ? `Ten conversations, ${g.matches} matching picks. There’s always more to discover. ♡` : g.revealed ? g.choices[0] === g.choices[1] ? 'Same wavelength! What made you both pick that?' : 'A little different, a little more to discover. Tell each other why.' : g.choices[actor] !== null ? 'Your choice is tucked away. Waiting for your person…' : `${local ? s.players[actor] + ', pick' : 'Pick'} the one that feels most like you.`;
    if (local && !g.revealed && g.choices[0] !== null && ui.handoff !== ratherHandoffKey(s)) {
      html = `<div class="local-handoff">First choice locked. Pass the device to ${escape(s.players[1])}.<button id="handoff-ready" class="button secondary">I’m ready to choose →</button></div>`;
    } else {
      html = `<p class="date-kicker">Would you rather…</p><div class="rather-options">${g.question.map((option, i) => `<button class="rather-option ${g.revealed && g.choices.includes(i) ? 'picked' : ''}" data-rather-option="${i}" ${!active || g.revealed || g.choices[actor] !== null ? 'disabled' : ''}><span class="option-letter">${i === 0 ? 'A' : 'B'}</span><strong>${escape(option)}</strong>${g.revealed ? `<span class="option-names">${g.choices.flatMap((c, player) => c === i ? [escape(s.players[player])] : []).join(' + ') || 'Neither of you'}</span>` : '<small>Keep your pick a little secret.</small>'}</button>`).join('')}</div>`;
      if (g.revealed) html += `<p class="date-footnote">Take turns finishing: “I chose this because…”<br>${g.matches} matching ${g.matches === 1 ? 'pick' : 'picks'} so far. Different answers are conversation starters, too.</p>`;
    }
    if (!g.result) html += `<div class="date-actions">${g.revealed ? button('Next question →', 'next', !active, 'primary') : button('Skip this question', 'skip', !active, 'quiet')}</div>`;
  }
  if (g.id === 'uno') {
    progress = 'A COLORFUL LITTLE RIVALRY';
    const viewer = local ? g.turn : role, hand = g.hands[viewer], other = 1 - viewer, top = g.discard.at(-1);
    const concealed = local && ui.unoOwner !== viewer && !g.result;
    message = g.result ? g.result.winner === null ? 'No more moves. Let’s shuffle and try again.' : `${s.players[g.result.winner]} is out of cards! One win, a little bragging rights. ♡` : ownTurn ? `${local ? s.players[viewer] + '’s' : 'Your'} turn · Match ${COLOR_NAMES[g.color].toLowerCase()} or ${CARD_NAMES[top.value] || top.value}.` : `${s.players[g.turn]}’s turn. Your hand stays just yours.`;
    html = `<div class="uno-table"><div class="opponent-hand" aria-label="${escape(s.players[other])} has ${g.hands[other].length} cards"><div class="mini-cards" aria-hidden="true">${Array.from({length:Math.min(g.hands[other].length, 9)}, () => '<span>♡</span>').join('')}</div><p>${escape(s.players[other])} · ${g.hands[other].length} ${g.hands[other].length === 1 ? 'card — UNO!' : 'cards'}</p></div><div class="uno-piles"><div><div class="uno-card card-back" aria-hidden="true"><strong>just<br>us.</strong></div><small>${g.drawCount} to draw</small></div><div><div class="uno-card color-${top.color}" role="img" aria-label="Top card: ${cardLabel(top)}">${cardFace(top)}</div><small class="active-color color-label-${g.color}">● ${COLOR_NAMES[g.color]} active</small></div></div></div><p class="uno-notice" role="status">${escape(g.notice.replace(/Player ([12])/g, (_, p) => s.players[Number(p) - 1]))}</p>`;
    if (concealed) html += `<div class="local-handoff">Pass the device to ${escape(s.players[viewer])}.<br>Their cards will stay hidden until they’re ready.${button('Show my hand →', 'show-hand', !active, 'primary')}</div>`;
    else if (g.result) html += '<p class="date-footnote">Another round? The next deal is a fresh start.</p>';
    else if (ui.wild && ui.wild.round === s.round && ui.wild.step === g.step) {
      html += `<div class="wild-picker"><p>What color are we playing next?</p><div>${COLORS.map(color => `<button class="button color-${color}" data-wild-color="${color}" ${!ownTurn ? 'disabled' : ''}>${COLOR_NAMES[color]}</button>`).join('')}</div>${button('Back to my hand', 'cancel-wild', false, 'quiet')}</div>`;
    } else {
      html += `<div class="hand-heading"><span>${local ? escape(s.players[viewer]) + '’s hand' : 'Your hand'} · ${hand.length} cards</span><small>Bright cards are playable</small></div><div class="uno-hand">${hand.map(card => `<button class="uno-card color-${card.color}" data-uno-card="${card.uid}" aria-label="Play ${cardLabel(card)}" ${!ownTurn || !canPlayCard(g, viewer, card) ? 'disabled' : ''}>${cardFace(card)}</button>`).join('')}</div><div class="date-actions uno-actions">${g.drawn === null ? button('Draw one', 'draw', !ownTurn) : button('Pass turn →', 'pass', !ownTurn)}<button class="button uno-call ${ui.saidUno ? 'called' : ''}" data-date-action="say-uno" aria-pressed="${ui.saidUno}" ${!ownTurn || hand.length !== 2 ? 'disabled' : ''}>${ui.saidUno ? 'UNO called ✓' : 'Say UNO'}</button></div>`;
    }
    html += `<details class="house-rules"><summary>Our two-player house rules</summary><ul><li>Seven cards each. Match a color, number, or action. First to empty their hand earns one room win.</li><li>With two players, Skip and Reverse let you play again. +2 and +4 make the other player draw and miss their turn. No stacking.</li><li>Wild chooses a color. +4 is allowed only when your hand has no card of the active color; this is checked automatically.</li><li>After drawing one card, play only that card or pass. Old discards refill the draw pile when needed.</li><li>Tap “Say UNO” before playing down to one card. Forgetting automatically adds two cards. There are no challenge or catch timers.</li></ul><p>A casual UNO-style game with original artwork and these house rules.</p></details>`;
  }
  return { html, message, progress };
}
