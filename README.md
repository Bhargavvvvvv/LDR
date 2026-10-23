# Just Us — a little arcade for two

A cozy, responsive mini-game site for you and your favorite person. Includes live two-device play, room links and codes, session scores, rematches, reactions, and a same-device mode.

**Games:** Truth or Dare, Would You Rather, UNO for Two, Tic-Tac-Toe, Rock Paper Scissors, Connect Four, and Memory Match.

## Date-night games

- **Truth or Dare:** 28 original truths and 20 sweet, playful dares. Take turns, share a typed answer or mark a dare done, and skip freely. Ten shared moments complete a session without changing competitive scores. Answers appear on both screens and are replaced as you move on; there is no saved chat history.
- **Would You Rather:** 28 original questions about dates, affection, traditions, and future adventures. Both players choose privately, then reveal together. Discuss why you picked your answer. Ten answered questions complete a session; skipping does not count as an answer. Matching picks are counted without awarding a room win.
- **UNO for Two:** An UNO-style card game with original artwork and explicit two-player house rules. Each player gets seven private cards from a 108-card deck. Match color or value, choose a color with Wild, and play Skip, Reverse, +2, and +4 cards. Skip and Reverse give you another turn; draw cards make the other player draw and miss a turn. There is no stacking. +4 legality is enforced automatically. After drawing, you can play only the drawn card or pass. Tap **Say UNO** before playing down to one card; forgetting automatically adds two cards. First out earns one room win. Full house rules are available inside the game.

All three work in the existing live rooms. Same-device Would You Rather conceals the first pick until the second player chooses; UNO hides hands behind a pass-the-device screen whenever the turn changes. As with the rest of the site, the online host maintains the full game state; it is intended for trusted partners, not adversarial competitive play.

The card game uses its own house rules, rather than all official challenge, penalty-timing, or tournament scoring rules. [Mattel's UNO reference](https://service.mattel.com/instruction_sheets/42797-4L.pdf) describes the underlying matching and action-card mechanics.

## Publish free with GitHub Pages

No build step, API key, paid hosting, or npm install is required for publishing.

1. Create a **public GitHub repository** and upload this folder's contents. Keep `index.html` at the repository root, alongside `app.js`, `games.js`, `date-games.js`, `date-ui.js`, `prompts.js`, `styles.css`, `config.js`, `art.js`, `assets/`, and `vendor/`. Include the empty `.nojekyll` file if uploading with Git. When updating an existing site, upload the new files too and refresh both players' pages before creating a room.
2. In your repository, open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select your branch (usually `main`), choose **/ (root)**, and click **Save**.
5. Wait for GitHub to publish, then open the HTTPS site URL shown in Pages settings. A project URL usually looks like `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

All asset paths are relative, so repository subpaths work. You do not need to change a base URL. Later, push/upload edits to the same branch to update the site.

Official instructions: [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Play together

1. Enter your name and select **Create a room**.
2. Click the room-code box to copy your invite link and send it to your partner.
3. Your partner opens it, enters their name, and selects **Join**. They can also enter the 10-character code manually.
4. The host chooses a game. Both players see moves and scores update live.
5. Either player can click the **Just Us logo** or **All games** to return both players to the game selection screen, keeping the room, players, and scores. The host chooses the next game or starts a rematch. Use **Leave room** when you want to end the session.

Keep both browser tabs open. Closing, refreshing, or leaving ends your session; scores are not saved. Rooms accept only one partner, and a disconnected session requires a new room. Share the invite only with the intended player: anyone with it can take the available seat.

For the couch option, choose **Play on one device**. You take turns on the same screen; Rock Paper Scissors includes a pass-the-device step to keep choices hidden. The second player is called “Player 2”.

## Run locally

With Node.js 20 or newer:

```sh
npm start
```

Open `http://127.0.0.1:4173`. To test multiplayer on your computer, open two browser tabs, create a room in one, and join from the other. Opening `index.html` directly as a `file://` URL will not work because the app uses JavaScript modules.

```sh
npm test
```

Tests cover game outcomes, turns, illegal and stale moves, replay prevention, scores, hidden choices, memory visibility, simultaneous Would You Rather picks, cooperative completion, and UNO rules and private hands. Twenty simulated UNO games check card conservation and completion across full games and reshuffles.

## How live play works

GitHub Pages serves static files; it does not run a multiplayer server. This site uses the bundled **PeerJS 1.5.5** library and **PeerJS Cloud's free public signaling service** to introduce the two browsers. Once connected, game messages use an encrypted WebRTC data channel. The host validates all moves and sends shared state to the guest. Hidden Memory Match values and unrevealed RPS choices are removed from outgoing state. This is a casual game with a trusted host, not a competitive anti-cheat system.

**Network limits:** the free public service is an external dependency with no uptime guarantee. Some mobile, corporate, VPN, and restrictive NAT networks need a TURN relay and cannot connect with the default STUN-only setup. PeerJS no longer provides free TURN. If a room fails, try another network or turn off a VPN. Reliable connectivity across all networks requires a TURN provider or a hosted realtime backend; neither is configured here. See the [PeerJS FAQ](https://peerjs.com/client/faq) and [TURN discontinuation notice](https://github.com/orgs/peers/discussions/1172).

`config.js` accepts PeerJS options for your own signaling/ICE configuration. Never put long-lived TURN passwords or private service keys in this repository. A static website cannot keep secrets; use short-lived credentials from a backend if adding authenticated relay service.

Only your chosen name is saved to local browser storage. Game state stays in the two browsers. PeerJS handles connection metadata; Google Fonts supplies optional typefaces (local system fallbacks are included). There is no analytics or account system. As with ordinary WebRTC, participants may learn each other's network addresses.

## Customize

- Colors, typography, spacing: `styles.css` (`:root` has the main colors).
- Landing-page text and app name: `index.html`.
- Game names and descriptions, and classic game rules: `games.js`.
- Date-night prompts: `prompts.js`.
- Truth or Dare, Would You Rather, and UNO rules and presentation: `date-games.js` and `date-ui.js`.
- Illustrated game cards: `art.js` (original inline SVGs).
- Room and UI behavior: `app.js`.
- Connection configuration: `config.js`.

`vendor/peerjs.min.js` is distributed under the included MIT license in `vendor/PEERJS-LICENSE`. No dependency download is needed to use the site.
