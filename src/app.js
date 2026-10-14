import { LEVELS, uid, romanNumeral, createSession, availablePlayers, isLive, isQueued, movePlayer, addPlayerToMatch, queueAvailablePlayer, removeAvailablePlayer, playerMatchHistory, previousRepeatedMatch, startMatch, endMatch, reorderMatch, swapMatches } from './model.js';
import { normalizeConfigurations, activeConfiguration, configurationSetup, updateConfigurationSetup, addConfiguration, renameConfiguration, selectConfiguration } from './configurations.js';
import { createDisplayState } from './display-state.js';

const root = document.querySelector('#app');
const attendanceDialog = document.querySelector('#attendance-dialog');
const playerMenu = document.querySelector('#player-menu');
const removeAttendeeButton = document.querySelector('#remove-attendee');
const playerHistory = document.querySelector('#player-history');
const repeatMatchDialog = document.querySelector('#repeat-match-dialog');
let pendingRepeatMatch = null;
const displaySettings = document.querySelector('#display-settings');
let lastDisplayState = null;
let menuPlayerId = null;
let menuPlayerElement = null;
const configurationDialog = document.querySelector('#configuration-dialog');
let pendingConfigurations = null;
let configurations = normalizeConfigurations(null);
let setup = configurationSetup(configurations);
const session = createSession();
let page = 'session', search = '', rosterSearch = '', levelFilter = 'all', toastTimer;
let saving = false, loadFailed = false;
let desktopOutdated = false;
const restartMessage = 'The desktop save handler is out of date. Fully quit the app and reopen it before saving. Reloading the window is not enough.';
let sidebarCollapsed = false;
let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
try {
  sidebarCollapsed = localStorage.getItem('quematcher.sidebarCollapsed') === 'true';
  const savedTheme = localStorage.getItem('quematcher.theme');
  if (savedTheme === 'dark' || savedTheme === 'light') theme = savedTheme;
} catch { /* Appearance controls still work when preference storage is unavailable. */ }
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const playerById = id => setup.players.find(player => player.id === id);

function applyAppearance() {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('sidebar-collapsed', sidebarCollapsed);
}

function saveAppearance() {
  applyAppearance();
  try {
    localStorage.setItem('quematcher.theme', theme);
    localStorage.setItem('quematcher.sidebarCollapsed', String(sidebarCollapsed));
  } catch { toast('Appearance changed, but could not be remembered for next time.', true); }
}

applyAppearance();

function toast(message, error = false) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.className = `visible ${error ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.className = '', 4500);
}

async function saveSetup(next) {
  return saveConfigurations(updateConfigurationSetup(configurations, next));
}

async function saveConfigurations(next) {
  if (desktopOutdated) { toast(restartMessage, true); return false; }
  if (loadFailed) { toast('Saved setup could not be loaded. Restart the app before editing it.', true); return false; }
  if (saving) { toast('Please wait for the current save.', true); return false; }
  saving = true;
  try {
    if (window.desktop) await window.desktop.saveSetup(next);
    else {
      const previous = localStorage.getItem('quematcher.setup');
      if (previous && !JSON.parse(previous).configs && !localStorage.getItem('quematcher.setup.legacy-backup')) localStorage.setItem('quematcher.setup.legacy-backup', previous);
      localStorage.setItem('quematcher.setup', JSON.stringify(next));
    }
    const switched = next.activeConfigId !== configurations.activeConfigId;
    configurations = next;
    setup = configurationSetup(configurations);
    if (switched) {
      Object.assign(session, createSession());
      selectedPlayer = null;
      search = ''; rosterSearch = ''; levelFilter = 'all';
    }
    render();
    return true;
  } catch (error) { toast(`Could not save setup: ${error.message}`, true); }
  finally { saving = false; }
  return false;
}

async function requestConfigurationChange(next) {
  if (loadFailed || saving) return saveConfigurations(next);
  if (next.activeConfigId !== configurations.activeConfigId && (session.attending.length || session.queue.length || Object.keys(session.live).length)) {
    pendingConfigurations = next;
    document.querySelector('#configuration-switch-message').textContent = `Switch to "${activeConfiguration(next).name}" and start a fresh session?`;
    configurationDialog.showModal();
    return;
  }
  await saveConfigurations(next);
}

function plate(id, draggable = true) {
  const player = playerById(id);
  if (!player) return '';
  const history = playerMatchHistory(session, id);
  const lastMatch = history.at(-1);
  const matchCountLabel = `${history.length} ${history.length === 1 ? 'match' : 'matches'} played this session`;
  return `<div class="player ${player.level}" tabindex="0" ${draggable ? 'draggable="true"' : ''} data-player="${esc(id)}" title="${esc(player.name)} · Right-click for match history"><span class="skill-dot"></span><span class="player-name">${esc(player.name)}</span>${lastMatch ? `<span class="player-match-number" title="Most recent match: ${lastMatch.number} · ${matchCountLabel}" aria-label="Most recent match ${lastMatch.number}, ${matchCountLabel}">${romanNumeral(history.length)} · #${lastMatch.number}</span>` : ''}${draggable ? '<span class="grip" aria-hidden="true">⠿</span>' : ''}</div>`;
}

function publishDisplayState() {
  if (!window.desktop?.publishDisplayState) return;
  const state = createDisplayState(setup, session, activeConfiguration(configurations).name, theme);
  const serialized = JSON.stringify(state);
  if (serialized === lastDisplayState) return;
  lastDisplayState = serialized;
  window.desktop.publishDisplayState(state);
}

async function openDisplaySettings() {
  if (!window.desktop?.getDisplayScreens) return toast('The display board requires the desktop app. Fully quit and reopen the updated app if it is already running.', true);
  try {
    const screens = await window.desktop.getDisplayScreens();
    const preferred = screens.find(screen => !screen.organizerScreen) || screens[0];
    document.querySelector('#display-screen').innerHTML = screens.map(screen => `<option value="${screen.id}" ${screen.id === preferred.id ? 'selected' : ''}>${esc(screen.label)} · ${screen.width} × ${screen.height}${screen.organizerScreen ? ' (organizer screen)' : ''}</option>`).join('');
    document.querySelector('#display-fill').checked = !preferred.organizerScreen;
    displaySettings.showModal();
  } catch (error) { toast(`Could not open display settings: ${error.message}. Fully quit and reopen the updated app if needed.`, true); }
}

document.querySelector('#cancel-display-settings').addEventListener('click', () => displaySettings.close());
document.querySelector('#close-display-board').addEventListener('click', async () => {
  try { await window.desktop.closeDisplayBoard(); displaySettings.close(); }
  catch (error) { toast(`Could not close the board: ${error.message}`, true); }
});
document.querySelector('#display-settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = displaySettings.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    publishDisplayState();
    await window.desktop.openDisplayBoard({ screenId: Number(document.querySelector('#display-screen').value), fill: document.querySelector('#display-fill').checked });
    displaySettings.close();
  } catch (error) { toast(`Could not open the board: ${error.message}`, true); }
  finally { submit.disabled = false; }
});

function slots(players, live = false, matchId = '') {
  return Array.from({ length: 4 }, (_, index) => `<div class="slot ${players[index] ? 'filled' : ''}" ${!live ? `data-drop-slot="${index}" data-match="${esc(matchId)}"` : ''}>${players[index] ? plate(players[index], !live) : `<span class="slot-number">${index + 1}</span><span>${live ? 'Waiting for a match' : 'Drop player here'}</span>`}</div>`).join('');
}

function clock(start) {
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderSidebar() {
  return `<aside class="sidebar" id="sidebar">
    <button class="sidebar-toggle" data-action="toggle-sidebar" aria-controls="sidebar" aria-expanded="${!sidebarCollapsed}" aria-label="${sidebarCollapsed ? 'Expand' : 'Collapse'} sidebar" title="${sidebarCollapsed ? 'Expand' : 'Collapse'} sidebar"><span aria-hidden="true">${sidebarCollapsed ? '›' : '‹'}</span><span class="nav-text">Collapse sidebar</span></button>
    <a class="brand" href="#" data-action="session" aria-label="QueMatcher session board"><img class="brand-logo" src="./PSOQ_Logo.jpg" alt="PSOQ logo" /><span class="brand-text">PairFect<small>SMASHERS OF QATAR</small></span></a>
    <div class="nav-label">YOUR STADIUM</div>
    <nav><button data-action="session" title="Session board" aria-label="Session board" class="nav-button ${page === 'session' ? 'selected' : ''}"><span class="nav-icon" aria-hidden="true">▦</span><span class="nav-text">Session board</span></button><button data-action="setup" title="Roster & courts" aria-label="Roster and courts" class="nav-button ${page === 'setup' ? 'selected' : ''}"><span class="nav-icon" aria-hidden="true">☷</span><span class="nav-text">Roster & courts</span></button></nav>
    <div class="sidebar-bottom"><span class="offline-dot"></span><span class="nav-text">For PSOQ<small>All seasons use</small></span></div>
  </aside>`;
}

function renderTopbar() {
  return `<header class="topbar"><span>BADMINTON / ${page === 'session' ? 'SESSION' : 'SAVED SETUP'}</span><div class="topbar-actions"><button class="theme-toggle" data-action="display-board" title="Open a read-only board on a connected screen">Display board ↗</button><button class="configuration-badge" data-action="setup" title="Manage saved configurations">${esc(activeConfiguration(configurations).name)}</button><button class="theme-toggle" data-action="toggle-theme" aria-pressed="${theme === 'dark'}" aria-label="Dark mode" title="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode"><span aria-hidden="true">${theme === 'dark' ? '☀' : '☾'}</span>${theme === 'dark' ? 'Light mode' : 'Dark mode'}</button></div></header>${desktopOutdated ? `<div class="desktop-warning" role="alert">${esc(restartMessage)}</div>` : ''}`;
}

function configurationPanel() {
  const config = activeConfiguration(configurations);
  return `<section class="configuration-panel" aria-labelledby="configuration-heading">
    <div class="section-title"><div><h2 id="configuration-heading">Saved configurations <span class="count">${configurations.configs.length}</span></h2><p class="hint">Keep a separate roster and court setup for each group or venue.</p></div></div>
    <div class="configuration-controls">
      <label class="configuration-select-label">Current configuration<select id="configuration-select" ${loadFailed ? 'disabled' : ''}>${configurations.configs.map(item => `<option value="${esc(item.id)}" ${item.id === config.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
      <form id="rename-configuration"><label>Configuration name<input name="name" value="${esc(config.name)}" maxlength="80" required /></label><button class="button subtle" type="submit" ${loadFailed ? 'disabled' : ''}>Rename</button></form>
      <form id="add-configuration"><label>New configuration<input name="name" placeholder="e.g. Friday social" maxlength="80" required /></label><button class="button dark" type="submit" ${loadFailed ? 'disabled' : ''}>Add config</button></form>
    </div>
    <p class="hint">Edits below save to <strong>${esc(config.name)}</strong>. New configurations start empty. Switching starts a fresh session; saved rosters and courts stay intact.</p>
  </section>`;
}

function renderCourts() {
  return [...setup.courts].sort((a, b) => a.number - b.number).map(court => {
    const live = session.live[court.id];
    const highlightUntil = live ? live.startedAt + 10000 : 0;
    return `<article class="match-card court ${live ? 'playing' : ''} ${Date.now() < highlightUntil ? 'just-started' : ''}" ${live ? `data-highlight-until="${highlightUntil}"` : ''}>
      <div class="card-heading"><h3>Court ${court.number}</h3><span class="status ${live ? 'on' : ''}">${live ? 'PLAYING' : 'OPEN'}</span></div>
      <div class="card-meta">${live ? `Match #${live.number} in progress` : 'Ready for the next group'}</div>
      <div class="match-players">${slots(live?.players || [], true)}</div>
      <div class="card-footer"><span class="timer" ${live ? `data-start="${live.startedAt}"` : ''}>${live ? clock(live.startedAt) : '--:--'}</span><button class="button ${live ? 'danger' : 'blue-button'}" data-action="${live ? 'end' : 'next'}" data-court="${esc(court.id)}">${live ? 'End Match' : 'Next Match'}</button></div>
    </article>`;
  }).join('') || '<div class="empty-board"><h3>A court for every game.</h3><p>Add your numbered courts in saved setup.</p><button class="button dark" data-action="setup">Add courts</button></div>';
}

function renderQueue() {
  return session.queue.map((match, index) => {
    const count = match.players.filter(Boolean).length;
    const repeat = previousRepeatedMatch(session, match.players);
    return `<article class="match-card queued-match ${repeat ? 'repeat-match' : ''}" draggable="true" data-drag-match="${esc(match.id)}" data-queue-match="${esc(match.id)}" title="Drag this card to reorder Queue ${index + 1}">
      <div class="card-heading"><h3><span class="match-handle" aria-hidden="true">⠿</span>Queue ${index + 1}</h3><span class="status ${count === 4 ? 'on' : ''}">${count}/4 ${count === 4 ? 'READY' : 'PLAYERS'}</span></div>
      <div class="card-meta">${index === 0 ? 'Next on an available court' : 'Waiting in the shared queue'}</div>
      ${repeat ? `<p class="repeat-warning" role="status">Repeats their last match (#${repeat.number})</p>` : ''}
      <div class="match-players">${slots(match.players, false, match.id)}</div>
      <div class="card-footer"><div class="match-tools"><button class="text-button" data-action="move-up" data-match="${esc(match.id)}" ${index === 0 ? 'disabled' : ''} aria-label="Move Queue ${index + 1} up">↑ Up</button><button class="text-button" data-action="move-down" data-match="${esc(match.id)}" ${index === session.queue.length - 1 ? 'disabled' : ''} aria-label="Move Queue ${index + 1} down">↓ Down</button></div><button class="icon-button delete-match" data-action="delete-match" data-match="${esc(match.id)}" aria-label="Delete Queue ${index + 1}" title="Delete match">×</button></div>
    </article>`;
  }).join('') || '<div class="empty-queue"><span>01 → 02 → 03</span><h3>Good games start here.</h3><p>Add a match, then drag in four players.</p></div>';
}

function render() {
  playerMenu.hidePopover();
  const available = availablePlayers(session);
  const playingCount = Object.keys(session.live).length;
  root.innerHTML = `${renderSidebar()}<main>${renderTopbar()}${page === 'session' ? `<section class="page-heading"><div><div class="eyebrow">PSOQ FAMILY...</div><h1>Let’s get playing.</h1></div><button class="button dark" data-action="attendance">Select attendance <span>↗</span></button></section><div class="stats"><div><strong>${session.attending.length}</strong><span>checked in</span></div><div><strong>${available.length}</strong><span>available</span></div><div><strong>${session.queue.length}</strong><span>queued matches</span></div><div><strong>${playingCount}<small> / ${setup.courts.length}</small></strong><span>courts playing</span></div></div><div class="workspace"><section class="available-panel" data-drop-available><div class="section-title"><h2>Available players</h2><span class="count">${available.length}</span></div><p class="hint">Drag a name into a queued match.</p><label class="search-label"><span>⌕</span><input id="player-search" type="search" placeholder="Find a player…" value="${esc(search)}" aria-label="Find an available player" /></label><div class="filters"><button data-filter="all" class="${levelFilter === 'all' ? 'active' : ''}">All</button>${LEVELS.map(level => `<button class="filter-dot ${level} ${levelFilter === level ? 'active' : ''}" data-filter="${level}" aria-label="Filter ${level} players" title="${level}"></button>`).join('')}</div><div class="player-list">${available.filter(id => { const player = playerById(id); return player && player.name.toLowerCase().includes(search.toLowerCase()) && (levelFilter === 'all' || player.level === levelFilter); }).map(id => plate(id)).join('') || `<div class="empty-list"><span>＋</span><strong>${session.attending.length ? 'No matching players' : 'Who’s playing today?'}</strong><p>${session.attending.length ? 'Players return here after their match.' : 'Select attendance from your saved roster to get started.'}</p>${!session.attending.length ? '<button class="button subtle" data-action="attendance">Select players</button>' : ''}</div>`}</div><div class="return-zone">Drop here to return a queued player</div></section><div class="board"><section><div class="section-title"><div><h2>Live courts <span class="count">${setup.courts.length}</span></h2><p class="hint">Take the next match when a court is ready.</p></div><button class="text-button" data-action="setup">Manage courts ↗</button></div><div class="courts">${renderCourts()}</div></section><section class="queue-section"><div class="section-title"><div><h2>Shared queue <span class="count">${session.queue.length}</span></h2><p class="hint">Drop a card onto another to swap matches. Drag a name to move a player.</p></div><button class="button dark" data-action="add-match">＋ Add Match</button></div><div class="queue">${renderQueue()}<div class="queue-end" data-drop-end>Drag a match here to move it to the end</div></div></section></div></div>` : setupPage()}</main>`;
  publishDisplayState();
}

function setupPage() {
  return `<section class="page-heading"><div><div class="eyebrow">READY BEFORE THE FIRST SERVE</div><h1>Your Family, remembered.</h1><p>Save your roster and courts. Choose attendance for each session.</p></div><span class="saved-note">${loadFailed ? 'Setup unavailable' : 'Saved on this computer'}</span></section>${configurationPanel()}<div class="setup-grid"><section class="setup-card"><div class="section-title"><h2>Player roster</h2><span class="count">${setup.players.length}</span></div><form id="add-player"><label>Name<input name="name" placeholder="Player name" maxlength="80" required /></label><label>Skill color<select name="level">${LEVELS.map(level => `<option value="${level}">${level[0].toUpperCase() + level.slice(1)}</option>`).join('')}</select></label><button class="button dark" type="submit">Add player</button></form><label class="search-label"><span>⌕</span><input id="roster-search" placeholder="Search saved players…" type="search" value="${esc(rosterSearch)}" aria-label="Search saved players" /></label><div class="roster-list">${setup.players.filter(player => player.name.toLowerCase().includes(rosterSearch.toLowerCase())).map(player => `<form class="roster-row" data-edit-player="${esc(player.id)}"><span class="skill-dot ${player.level}"></span><input name="name" value="${esc(player.name)}" maxlength="80" required aria-label="Player name" /><select name="level" aria-label="Skill color">${LEVELS.map(level => `<option value="${level}" ${player.level === level ? 'selected' : ''}>${level}</option>`).join('')}</select><button class="text-button" type="submit">Save</button><button class="icon-button" type="button" data-action="delete-player" data-player-id="${esc(player.id)}" ${isLive(session, player.id) || isQueued(session, player.id) ? 'disabled title="Return this player to available before deleting"' : 'title="Delete player"'} aria-label="Delete ${esc(player.name)}">×</button></form>`).join('') || '<p class="setup-empty">Add your regular players here. They will be ready for your next session.</p>'}</div></section><section class="setup-card"><div class="section-title"><h2>Courts</h2><span class="count">${setup.courts.length}</span></div><p class="hint">Unique positive whole numbers only.</p><form id="add-court"><label>Court number<input name="number" type="number" min="1" step="1" placeholder="1" required /></label><button class="button dark" type="submit">Add court</button></form><div class="court-settings">${[...setup.courts].sort((a, b) => a.number - b.number).map(court => `<form class="court-setting" data-edit-court="${esc(court.id)}"><span>Court</span><input name="number" value="${court.number}" type="number" min="1" step="1" required aria-label="Court number" /><button class="text-button" type="submit">Save</button><button class="icon-button" type="button" data-action="delete-court" data-court="${esc(court.id)}" ${session.live[court.id] ? 'disabled title="End the match before deleting this court"' : 'title="Delete court"'} aria-label="Delete court ${court.number}">×</button></form>`).join('') || '<p class="setup-empty">Add the courts you use. You can change their numbers anytime.</p>'}</div><div class="setup-tip"><strong>A fresh start, every session.</strong><p>Only these settings are saved. Closing QueMatcher clears attendance, queued games, and live matches.</p></div></section></div>`;
}

function openAttendance() {
  attendanceDialog.innerHTML = `<form id="attendance-form"><div class="dialog-heading"><div><div class="eyebrow">TODAY’S LINEUP</div><h2 id="attendance-title">Who’s playing?</h2></div><button type="button" class="icon-button" data-dialog-close aria-label="Close attendance">×</button></div><p class="hint">Players in queued or live matches stay checked in.</p><input id="attendance-search" type="search" placeholder="Find a player…" aria-label="Search attendance" /><div class="attendance-tools"><button type="button" class="text-button" data-select-attendance="all">Select all</button><button type="button" class="text-button" data-select-attendance="none">Clear available</button></div><div class="attendance-list">${setup.players.map(player => `<label data-attendance-name="${esc(player.name.toLowerCase())}"><input type="checkbox" name="attending" value="${esc(player.id)}" ${session.attending.includes(player.id) ? 'checked' : ''} ${isLive(session, player.id) || isQueued(session, player.id) ? 'disabled' : ''} /><span class="skill-dot ${player.level}"></span><span>${esc(player.name)}</span>${isLive(session, player.id) || isQueued(session, player.id) ? '<small>In a match</small>' : ''}</label>`).join('') || '<p class="setup-empty">Your roster is empty. Add players in Roster & courts first.</p>'}</div><div class="dialog-footer"><button type="button" class="button subtle" data-dialog-close>Cancel</button><button class="button dark" type="submit">Confirm attendance</button></div></form>`;
  attendanceDialog.showModal();
}

root.addEventListener('click', async event => {
  const filter = event.target.closest('[data-filter]');
  if (filter) { levelFilter = filter.dataset.filter; render(); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  event.preventDefault();
  const action = button.dataset.action;
  try {
    if (action === 'toggle-sidebar') { sidebarCollapsed = !sidebarCollapsed; saveAppearance(); }
    else if (action === 'toggle-theme') { theme = theme === 'dark' ? 'light' : 'dark'; saveAppearance(); }
    else if (action === 'session' || action === 'setup') page = action;
    else if (action === 'attendance') { openAttendance(); return; }
    else if (action === 'display-board') { await openDisplaySettings(); return; }
    else if (action === 'add-match') session.queue.push({ id: uid(), players: [null, null, null, null] });
    else if (action === 'delete-match') session.queue = session.queue.filter(match => match.id !== button.dataset.match);
    else if (action === 'next') {
      const next = session.queue[0];
      const repeat = next && previousRepeatedMatch(session, next.players);
      if (repeat && !session.live[button.dataset.court]) {
        pendingRepeatMatch = { courtId: button.dataset.court, matchId: next.id, players: [...next.players] };
        document.querySelector('#repeat-match-message').textContent = `${next.players.map(id => playerById(id)?.name || 'Player').join(', ')} played together in their most recent match (#${repeat.number}).`;
        repeatMatchDialog.showModal();
        return;
      }
      startMatch(session, button.dataset.court);
      setTimeout(updateCourtTimers, 10000);
    }
    else if (action === 'end') endMatch(session, button.dataset.court);
    else if (action === 'move-up' || action === 'move-down') {
      const index = session.queue.findIndex(match => match.id === button.dataset.match);
      if (action === 'move-up' && index > 0) reorderMatch(session, button.dataset.match, session.queue[index - 1].id);
      if (action === 'move-down' && index < session.queue.length - 1) reorderMatch(session, button.dataset.match, session.queue[index + 2]?.id || null);
    } else if (action === 'delete-player') {
      const id = button.dataset.playerId;
      if (isLive(session, id) || isQueued(session, id)) throw new Error('This player is in a match.');
      await saveSetup({ ...setup, players: setup.players.filter(player => player.id !== id) });
      if (!setup.players.some(player => player.id === id)) session.attending = session.attending.filter(playerId => playerId !== id);
    } else if (action === 'delete-court') {
      if (session.live[button.dataset.court]) throw new Error('End this court’s match before removing it.');
      await saveSetup({ ...setup, courts: setup.courts.filter(court => court.id !== button.dataset.court) });
    }
    render();
  } catch (error) { toast(error.message, true); }
});

root.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target, data = new FormData(form);
  if (form.id === 'add-configuration' || form.id === 'rename-configuration') {
    try {
      const name = String(data.get('name'));
      if (form.id === 'add-configuration') await requestConfigurationChange(addConfiguration(configurations, name));
      else await saveConfigurations(renameConfiguration(configurations, configurations.activeConfigId, name));
    } catch (error) { toast(error.message, true); }
  } else if (form.id === 'add-player' || form.dataset.editPlayer) {
    const name = String(data.get('name')).trim(), level = data.get('level');
    if (!name) return toast('Enter a player name.', true);
    if (form.id === 'add-player') {
      if (await saveSetup({ ...setup, players: [{ id: uid(), name, level }, ...setup.players] })) toast(`${name} has been successfully added!`);
    }
    else await saveSetup({ ...setup, players: setup.players.map(player => player.id === form.dataset.editPlayer ? { ...player, name, level } : player) });
  } else if (form.id === 'add-court' || form.dataset.editCourt) {
    const raw = String(data.get('number')), number = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number) || number < 1) return toast('Court numbers must be positive whole numbers.', true);
    if (setup.courts.some(court => court.number === number && court.id !== form.dataset.editCourt)) return toast('That court number already exists.', true);
    if (form.id === 'add-court') await saveSetup({ ...setup, courts: [...setup.courts, { id: uid(), number }] });
    else await saveSetup({ ...setup, courts: setup.courts.map(court => court.id === form.dataset.editCourt ? { ...court, number } : court) });
  }
});

root.addEventListener('input', event => {
  const id = event.target.id;
  if (id !== 'player-search' && id !== 'roster-search') return;
  const cursor = event.target.selectionStart;
  if (id === 'player-search') search = event.target.value; else rosterSearch = event.target.value;
  render();
  const input = document.getElementById(id);
  input.focus();
  if (cursor !== null) input.setSelectionRange(cursor, cursor);
});

root.addEventListener('change', async event => {
  if (event.target.id !== 'configuration-select') return;
  const id = event.target.value;
  event.target.value = configurations.activeConfigId;
  if (id === configurations.activeConfigId) return;
  try { await requestConfigurationChange(selectConfiguration(configurations, id)); }
  catch (error) { toast(error.message, true); }
});

document.querySelector('#cancel-configuration-switch').addEventListener('click', () => { if (!saving) configurationDialog.close(); });
configurationDialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
configurationDialog.addEventListener('close', () => { pendingConfigurations = null; });
document.querySelector('#configuration-switch-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!pendingConfigurations || saving) return;
  const buttons = [...configurationDialog.querySelectorAll('button')];
  buttons.forEach(button => button.disabled = true);
  try { if (await saveConfigurations(pendingConfigurations)) configurationDialog.close(); }
  finally { buttons.forEach(button => button.disabled = false); }
});

let dragStartedOnControl = false;
root.addEventListener('pointerdown', event => {
  dragStartedOnControl = Boolean(event.target.closest('button, input, select, a'));
});

root.addEventListener('dragstart', event => {
  if (dragStartedOnControl) { event.preventDefault(); return; }
  playerMenu.hidePopover();
  const player = event.target.closest('[data-player][draggable]');
  const match = event.target.closest('[data-drag-match]');
  if (!player && !match) return;
  event.dataTransfer.setData('text/plain', JSON.stringify(player ? { type: 'player', id: player.dataset.player } : { type: 'match', id: match.dataset.dragMatch }));
  event.dataTransfer.effectAllowed = 'move';
  root.classList.add(player ? 'dragging-player' : 'dragging-match');
});
root.addEventListener('dragend', () => { root.classList.remove('dragging-player', 'dragging-match'); document.querySelectorAll('.drop-hover').forEach(element => element.classList.remove('drop-hover')); });
root.addEventListener('dragover', event => {
  const draggingPlayer = root.classList.contains('dragging-player');
  if (!draggingPlayer && !root.classList.contains('dragging-match')) return;
  const target = event.target.closest(draggingPlayer ? '[data-queue-match], [data-drop-available]' : '[data-queue-match], [data-drop-end]');
  if (!target) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.drop-hover').forEach(element => element.classList.remove('drop-hover'));
  target.classList.add('drop-hover');
});
root.addEventListener('drop', event => {
  event.preventDefault();
  try {
    const payload = JSON.parse(event.dataTransfer.getData('text/plain'));
    if (payload.type === 'player') {
      const target = event.target.closest('[data-queue-match], [data-drop-available]');
      if (!target) return;
      if (target.dataset.queueMatch) addPlayerToMatch(session, payload.id, target.dataset.queueMatch);
      else movePlayer(session, payload.id);
    } else if (payload.type === 'match') {
      const target = event.target.closest('[data-queue-match], [data-drop-end]');
      if (!target) return;
      if (target.dataset.queueMatch) swapMatches(session, payload.id, target.dataset.queueMatch);
      else reorderMatch(session, payload.id, null);
    }
    render();
  } catch (error) { toast(error.message, true); }
  finally { root.classList.remove('dragging-player', 'dragging-match'); document.querySelectorAll('.drop-hover').forEach(element => element.classList.remove('drop-hover')); }
});

root.addEventListener('dblclick', event => {
  const player = event.target.closest('[data-player][draggable]');
  if (!player?.closest('[data-drop-available]')) return;
  try { queueAvailablePlayer(session, player.dataset.player); selectedPlayer = null; render(); }
  catch (error) { toast(error.message, true); }
});

root.addEventListener('contextmenu', event => {
  const player = event.target.closest('[data-player]');
  if (!player) return;
  event.preventDefault();
  menuPlayerId = player.dataset.player;
  menuPlayerElement = player;
  const history = playerMatchHistory(session, menuPlayerId);
  playerHistory.innerHTML = `<h3>${esc(playerById(menuPlayerId)?.name || 'Player')}</h3><p class="history-label">THIS SESSION · ${history.length} ${history.length === 1 ? 'MATCH' : 'MATCHES'}</p>${history.length ? `<ol class="history-list">${[...history].reverse().map(match => `<li><strong>Match #${match.number}</strong><span>${match.endedAt === null ? 'Playing' : 'Completed'}</span></li>`).join('')}</ol>` : '<p class="history-empty">No matches played yet.</p>'}`;
  removeAttendeeButton.hidden = !availablePlayers(session).includes(menuPlayerId);
  playerMenu.hidePopover();
  playerMenu.showPopover();
  const bounds = player.getBoundingClientRect();
  const x = event.clientX || bounds.left;
  const y = event.clientY || bounds.bottom;
  playerMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - playerMenu.offsetWidth - 8))}px`;
  playerMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - playerMenu.offsetHeight - 8))}px`;
  if (removeAttendeeButton.hidden) playerHistory.focus();
  else removeAttendeeButton.focus();
});

document.querySelector('#cancel-repeat-match').addEventListener('click', () => repeatMatchDialog.close());
repeatMatchDialog.addEventListener('close', () => { pendingRepeatMatch = null; });
document.querySelector('#repeat-match-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!pendingRepeatMatch) return;
  try {
    startMatch(session, pendingRepeatMatch.courtId, Date.now(), { allowRepeat: true, expectedMatchId: pendingRepeatMatch.matchId, expectedPlayers: pendingRepeatMatch.players });
    repeatMatchDialog.close();
    render();
    setTimeout(updateCourtTimers, 10000);
  } catch (error) { repeatMatchDialog.close(); toast(error.message, true); }
});

// Manual popovers avoid dismissal by the mouse release that opened the menu.
document.addEventListener('pointerdown', event => {
  if (event.button === 0 && !playerMenu.contains(event.target)) playerMenu.hidePopover();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !playerMenu.matches(':popover-open')) return;
  event.preventDefault();
  playerMenu.hidePopover();
  if (menuPlayerElement?.isConnected) menuPlayerElement.focus();
});
document.addEventListener('contextmenu', event => {
  if (!event.defaultPrevented && !playerMenu.contains(event.target)) playerMenu.hidePopover();
});
window.addEventListener('blur', () => playerMenu.hidePopover());

removeAttendeeButton.addEventListener('click', () => {
  try {
    const name = playerById(menuPlayerId)?.name;
    removeAvailablePlayer(session, menuPlayerId);
    selectedPlayer = null;
    render();
    toast(`${name} removed from today's session. Their saved roster entry is kept.`);
  } catch (error) { playerMenu.hidePopover(); toast(error.message, true); }
});

// A keyboard alternative to dragging: select a plate, then click a queue card.
let selectedPlayer = null;
root.addEventListener('keydown', event => {
  if (event.key === 'Escape') selectedPlayer = null;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const plateElement = event.target.closest('[data-player][draggable]');
  if (plateElement) { event.preventDefault(); selectedPlayer = plateElement.dataset.player; toast('Player selected. Click a queue card or the available area.'); }
});
root.addEventListener('click', event => {
  if (!selectedPlayer || event.target.closest('[data-action], button, input')) return;
  const target = event.target.closest('[data-queue-match], [data-drop-available]');
  if (!target) return;
  try {
    if (target.dataset.queueMatch) addPlayerToMatch(session, selectedPlayer, target.dataset.queueMatch);
    else movePlayer(session, selectedPlayer);
    selectedPlayer = null; render();
  }
  catch (error) { toast(error.message, true); }
});

attendanceDialog.addEventListener('click', event => {
  if (event.target.closest('[data-dialog-close]')) attendanceDialog.close();
  const select = event.target.closest('[data-select-attendance]');
  if (select) attendanceDialog.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(input => input.checked = select.dataset.selectAttendance === 'all');
});
attendanceDialog.addEventListener('input', event => {
  if (event.target.id === 'attendance-search') attendanceDialog.querySelectorAll('[data-attendance-name]').forEach(label => label.hidden = !label.dataset.attendanceName.includes(event.target.value.toLowerCase()));
});
attendanceDialog.addEventListener('submit', event => {
  event.preventDefault();
  const checked = [...attendanceDialog.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
  session.attending = [...session.attending.filter(id => checked.includes(id)), ...checked.filter(id => !session.attending.includes(id))];
  attendanceDialog.close(); render();
});

function updateCourtTimers() {
  document.querySelectorAll('[data-start]').forEach(timer => timer.textContent = clock(Number(timer.dataset.start)));
  document.querySelectorAll('[data-highlight-until]').forEach(court => {
    court.classList.toggle('just-started', Date.now() < Number(court.dataset.highlightUntil));
  });
}

setInterval(updateCourtTimers, 1000);
if (!window.desktop) window.addEventListener('beforeunload', event => { event.preventDefault(); event.returnValue = ''; });

try {
  configurations = normalizeConfigurations(window.desktop ? await window.desktop.loadSetup() : JSON.parse(localStorage.getItem('quematcher.setup') || '{}'));
  setup = configurationSetup(configurations);
  if (window.desktop) {
    try {
      const capabilities = await window.desktop.getSetupCapabilities?.();
      desktopOutdated = capabilities?.configurationVersion !== 1;
    } catch { desktopOutdated = true; }
    if (desktopOutdated) toast(restartMessage, true);
  }
} catch (error) { loadFailed = true; toast(error.message || 'Could not load saved setup.', true); }
render();
