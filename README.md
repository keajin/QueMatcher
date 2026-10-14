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

## Saved configurations

Open **Roster & courts** to manage named configurations for different groups, venues, or regular sessions.

1. Enter a name under **New configuration** and click **Add config**. The new configuration starts with an empty roster and no courts.
2. Add players and courts below. Changes are saved to the selected configuration automatically.
3. Edit **Configuration name** and click **Rename** to change its name. Its saved players and courts remain intact.
4. Choose another setup under **Current configuration** to load its saved roster and courts. The active configuration name also appears in the session header.

Switching configurations starts a fresh session. If attendance, queued games, or active matches exist, a confirmation asks before clearing them. Canceling leaves the session and selected configuration intact. Renaming the current configuration does not reset the session.

Existing saved players and courts automatically become **Default configuration**. The first configuration save preserves the original desktop setup file as `setup.json.legacy-backup`. Each configuration's roster and courts, plus the last selected configuration, are remembered between launches; attendance and matches are still temporary.

## Match history and repeat warnings

Matches receive consecutive numbers when they start, shared across every court. Queue card numbers describe queue position; they are separate from played match numbers. Each player's tag shows their most recent match number. Right-click a tag in the available list, shared queue, or live court to view all their match numbers for this session.

A complete queued group is flagged when those exact four players all played together in their most recent match, regardless of name order. Older repeats and groups with only some returning players are not flagged. Games involving other players on other courts do not affect this check.

**Next Match** asks for confirmation before starting a flagged group. Choose **Review queue** to keep everything unchanged, or **Start anyway** to proceed. Match history stays in memory and clears when the app is quit or another configuration is selected. Leaving and returning to the same session retains a player's history.

## Second-screen display board

1. Connect a monitor or TV to the organizer's laptop and use **extended display** mode, so the screens can show different windows.
2. Click **Display board** in the organizer's top bar.
3. Select the connected screen. An external screen is suggested automatically when available.
4. Leave **Fill selected screen** checked to use its available screen space, then click **Open board**.

The separate, read-only window keeps the logo and **PairFect** branding at the upper left, followed by **PSOQ Family... Let's get playing.** Courts occupy two rows of five above a single row of up to seven queued matches. Available players stay on the right, beneath live counts for checked-in players, available courts, queued matches, and playing courts. Match numbers, skill colors, repeat warnings, and court-start highlights are included. Changes update automatically; searching, changing organizer pages, and opening organizer dialogs do not change the board's contents or bring it to the foreground.

Courts use two rows of five, showing up to 10 without rotation. Only sessions with more than 10 courts rotate court pages every 10 seconds. The queue stays on its first seven matches in one row; later matches remain in the organizer's queue and appear as earlier matches start or the queue is reordered. Available players rotate only when their list cannot fit on screen. The board follows the organizer's light/dark theme. You can move or resize its window, and opening it again reuses the same window.

Press **Esc** while the board is focused, close its window, or use **Display board → Close board** to close only the board. Attendance and matches remain unchanged. Fully closing the organizer also closes the board. If the selected monitor disconnects, the board moves back to a connected screen. With only one screen connected, it opens as a separate window on that screen.

The display board requires the desktop app and runs entirely offline. Screen routing is covered by simulated-monitor tests, and the macOS five-column court layout was checked on a connected 2560 x 1440 monitor. Windows dual-monitor behavior still needs verification on a Windows laptop.

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

## Troubleshooting saves after an update

If adding a player or court reports **Invalid setup data** after updating the source, fully quit and relaunch the desktop app. On macOS, use **Cmd+Q**; closing the window or reloading it does not restart the desktop save handler. For a source launch, run `npm run dev` again after quitting. For an installed app, install the updated build and reopen it.

Quitting clears the current session after confirmation, but previously saved configurations, players, and courts are kept. The app now displays an explicit restart warning when the window and desktop save handler use different configuration formats.
