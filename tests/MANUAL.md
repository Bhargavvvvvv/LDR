# Browser verification

Checked locally on 2026-10-23 using two browser tabs and the real PeerJS Cloud service:

- Create a room, open an invite URL, join with a different name.
- Both players see the same lobby and names; only the host selects games.
- Tic-Tac-Toe moves synchronize, enforce turns, finish a win, update both scores, and alternate the starting player on rematch.
- Rock Paper Scissors keeps a submitted choice hidden until the partner chooses, then reveals both and awards the winner.
- Connect Four synchronizes a drop into the lowest empty row and hands over the turn.
- Memory Match synchronizes flips, pauses after a mismatch, hides the cards again, and hands over the turn.
- Reactions reach the other player.
- A third browser tab receives the room-full message.
- Same-device Rock Paper Scissors uses the handoff screen and resolves the result.
- Clicking the logo after a scored round returns to the lobby without changing the room code, players, connection, or score. Verified from both the host and guest; selecting a different game still works.
- Truth or Dare synchronizes the prompt and typed answer, allows either player to advance after a response, alternates the active player, and lets that player skip a dare.
- Would You Rather keeps the first online choice hidden, reveals both names under their chosen answers, and offers the next question.
- UNO deals different private hands, synchronizes hand counts, grants another turn for Reverse, passes the turn on a number card, synchronizes Wild color selection, and supports drawing followed by passing.
- At a 390px viewport, same-device UNO conceals cards before the player is ready and again when the turn passes. Cards fit the phone width; action labels use readable symbols and captions.
- Same-device Would You Rather conceals the first choice behind a handoff screen, reveals both answers after the second pick, and fits at 390px.
- Desktop, narrow browser, and a 390px embedded viewport render the responsive landing page.

Automated rules checks: `npm test`.

Still needs real-world verification after publication: a game between two physical devices on different networks, mobile Safari/Chrome backgrounding, and disconnect behavior on those networks. No TURN relay is configured, so restrictive networks may fail to connect. GitHub publication is left to the repository owner.
