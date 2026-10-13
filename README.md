# QueMatcher

QueMatcher is an offline desktop app for organizers of badminton social groups. It helps organizers manage attendance, manually arrange groups of four, and keep matches moving across multiple courts.

Players have draggable name plates colored by skill level, from beginner to strongest: **green, purple, blue, orange, red**. Organizers build and reorder matches in one shared queue. Each live court takes the next complete group, tracks playing time, and returns players to the available list when their match ends. QueMatcher does not assign partners or automatically balance matches.

The interface is intended for sessions with about **100 players and 15 courts**. Player rosters and numbered courts are saved on the computer; attendance and matches belong to the current session only.

This QueMatcher was developed for the use of PSOQ Family. 

## Quick startup

### Run from source

Install **Node.js 22 or newer** with npm, then open a terminal in the QueMatcher project folder and run:

```sh
npm install
npm run dev
```

`npm install` is needed for the initial setup and after dependency changes. For subsequent launches, run `npm run dev`.

### Use the macOS installer

If you have the built Apple Silicon installer, open `release/QueMatcher-0.1.0-arm64.dmg`, drag **QueMatcher** into **Applications**, and launch it from there. This initial installer is unsigned. Windows installer build instructions are below; Windows has not yet been verified.

### Start your first session

1. Open **Roster & courts**, add your players and skill colors, and add your court numbers.
2. Open **Session board** and choose today's players with **Select attendance**.
3. Click **Add Match** and drag four players into its slots.
4. Click an empty court's blue **Next Match** button to start that group and its timer.
5. Click the red **End Match** button when they finish. All four players return to the available list.

The installed app works entirely offline without accounts or external services. Downloading development dependencies and packaging tools requires internet access.

**Closing the app clears the session.** A confirmation pop-up warns you before the queue, attendance, active matches, and timers are removed. Your saved roster and courts are kept.

## Appearance and layout

- Use the arrow at the top of the sidebar to collapse or expand navigation.
- Use **Dark mode** or **Light mode** in the top bar to switch themes. The initial theme follows the computer's appearance setting.
- The sidebar and theme preferences are remembered locally between launches.
- Courts and queued matches use matching vertical cards named **Court 1**, **Queue 1**, and so on, with four players listed in one column. Queue numbers reflect the current order.
- Player name plates use solid skill colors and larger, bold names. Long names wrap to stay readable.
- A court lights up for **10 seconds** when a match starts, then returns to its normal playing appearance.

## Workflow

1. In **Roster & courts**, save players with one of five skill colors and add numbered courts. Court numbers are unique positive whole numbers.
2. On **Session board**, use **Select attendance** to check in today's players.
3. **Add Match** creates four empty queue slots. Drag a player anywhere onto a queue card to fill its first empty slot from the top. Moving a player removes their previous assignment. Full cards reject drops without replacing anyone.
4. Drag a match's handle to reorder the shared queue. Move up/down buttons also change the order.
5. An empty court's **Next Match** starts the first queued group only when it has four players. The timer starts immediately.
6. Live players cannot be moved. **End Match** returns them to the available list.
7. Closing the desktop window asks for confirmation. Only roster and court settings are saved; attendance, queue, and live matches are cleared.

Players already queued or playing cannot be unchecked in attendance or deleted. An active court cannot be deleted until its match ends. Duplicate player names are allowed because people can share a name; each roster entry has its own identity.

Double-click an available player to place them in the earliest empty slot in the shared queue. If every card is full, or the queue is empty, a new card is created automatically.

Right-click an available player and choose **Remove from today's session** when they leave or stop playing. Their permanent roster entry is kept. Use **Select attendance** to check them back in if they return. Players in queued or live matches must return to the available list before they can leave.

## Verification and packaging

```sh
npm test
npm run check
npm run dist:mac
npm run dist:win
```

Build installers on their respective operating systems for the most reliable results. Outputs are placed in `release/`. Public distribution requires platform signing/notarization credentials; these are not configured here. Electron includes its own browser runtime, so installer size is larger than a native webview app.

Saved setup is stored in `setup.json` in Electron's per-user application data directory. Session state is never written to disk.

The initial build passes match-rule tests including a 100-player, 15-court session. The macOS UI and close confirmation were checked locally. Windows behavior still needs verification on Windows. The dependency audit retains moderate findings in the development-only packaging chain; the Electron runtime was updated to 44.7.0 to resolve the high-severity runtime findings.

For interface-only browser review, run `npm run preview` and open `http://127.0.0.1:5173`. This preview saves setup in browser storage and uses the browser's generic close warning; the custom warning is implemented in the desktop app.
