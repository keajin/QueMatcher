import { LEVELS, uid, normalizeSetup, createSession, availablePlayers, isLive, isQueued, movePlayer, addPlayerToMatch, queueAvailablePlayer, removeAvailablePlayer, startMatch, endMatch, reorderMatch } from './model.js';

const root = document.querySelector('#app');
const attendanceDialog = document.querySelector('#attendance-dialog');
const playerMenu = document.querySelector('#player-menu');
const removeAttendeeButton = document.querySelector('#remove-attendee');
let menuPlayerId = null;
let setup = { players: [], courts: [] };
const session = createSession();
let page = 'session', search = '', rosterSearch = '', levelFilter = 'all', toastTimer;
let saving = false, loadFailed = false;
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
  if (loadFailed) return toast('Saved setup could not be loaded. Restart the app before editing it.', true);
  if (saving) return toast('Please wait for the current save.', true);
  saving = true;
  try {
    if (window.desktop) await window.desktop.saveSetup(next);
    else localStorage.setItem('quematcher.setup', JSON.stringify(next));
    setup = next;
    render();
  } catch (error) { toast(`Could not save setup: ${error.message}`, true); }
  finally { saving = false; }
}

function plate(id, draggable = true) {
  const player = playerById(id);
  if (!player) return '';
  return `<div class="player ${player.level}" ${draggable ? 'draggable="true" tabindex="0"' : ''} data-player="${esc(id)}" title="${esc(player.name)}"><span class="skill-dot"></span><span class="player-name">${esc(player.name)}</span>${draggable ? '<span class="grip" aria-hidden="true">⠿</span>' : ''}</div>`;
}

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
    <a class="brand" href="#" data-action="session" aria-label="QueMatcher session board"><span class="brand-mark">Q<span></span></span><span class="brand-text">QueMatcher<small>THE SOCIAL COURT</small></span></a>
    <div class="nav-label">YOUR CLUBHOUSE</div>
    <nav><button data-action="session" title="Session board" aria-label="Session board" class="nav-button ${page === 'session' ? 'selected' : ''}"><span class="nav-icon" aria-hidden="true">▦</span><span class="nav-text">Session board</span></button><button data-action="setup" title="Roster & courts" aria-label="Roster and courts" class="nav-button ${page === 'setup' ? 'selected' : ''}"><span class="nav-icon" aria-hidden="true">☷</span><span class="nav-text">Roster & courts</span></button></nav>
    <div class="sidebar-bottom"><span class="offline-dot"></span><span class="nav-text">Entirely offline<small>Your club. Your computer.</small></span></div>
  </aside>`;
}

function renderTopbar() {
  return `<header class="topbar"><span>BADMINTON / ${page === 'session' ? 'SESSION' : 'SAVED SETUP'}</span><div class="topbar-actions"><span class="session-tag">${page === 'session' ? 'SESSION IN PROGRESS' : 'PERMANENT SETTINGS'}</span><button class="theme-toggle" data-action="toggle-theme" aria-pressed="${theme === 'dark'}" aria-label="Dark mode" title="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode"><span aria-hidden="true">${theme === 'dark' ? '☀' : '☾'}</span>${theme === 'dark' ? 'Light mode' : 'Dark mode'}</button></div></header>`;
}

function renderCourts() {
  return [...setup.courts].sort((a, b) => a.number - b.number).map(court => {
    const live = session.live[court.id];
    const highlightUntil = live ? live.startedAt + 10000 : 0;
    return `<article class="match-card court ${live ? 'playing' : ''} ${Date.now() < highlightUntil ? 'just-started' : ''}" ${live ? `data-highlight-until="${highlightUntil}"` : ''}>
      <div class="card-heading"><h3>Court ${court.number}</h3><span class="status ${live ? 'on' : ''}">${live ? 'PLAYING' : 'OPEN'}</span></div>
      <div class="card-meta">${live ? 'Match in progress' : 'Ready for the next group'}</div>
      <div class="match-players">${slots(live?.players || [], true)}</div>
      <div class="card-footer"><span class="timer" ${live ? `data-start="${live.startedAt}"` : ''}>${live ? clock(live.startedAt) : '--:--'}</span><button class="button ${live ? 'danger' : 'blue-button'}" data-action="${live ? 'end' : 'next'}" data-court="${esc(court.id)}">${live ? 'End Match' : 'Next Match'}</button></div>
    </article>`;
  }).join('') || '<div class="empty-board"><h3>A court for every game.</h3><p>Add your numbered courts in saved setup.</p><button class="button dark" data-action="setup">Add courts</button></div>';
}

function renderQueue() {
  return session.queue.map((match, index) => {
    const count = match.players.filter(Boolean).length;
    return `<article class="match-card queued-match" data-queue-match="${esc(match.id)}">
      <div class="card-heading"><h3><span class="match-handle" draggable="true" data-drag-match="${esc(match.id)}" title="Drag to reorder Queue ${index + 1}" aria-hidden="true">⠿</span>Queue ${index + 1}</h3><span class="status ${count === 4 ? 'on' : ''}">${count}/4 ${count === 4 ? 'READY' : 'PLAYERS'}</span></div>
      <div class="card-meta">${index === 0 ? 'Next on an available court' : 'Waiting in the shared queue'}</div>
      <div class="match-players">${slots(match.players, false, match.id)}</div>
      <div class="card-footer"><div class="match-tools"><button class="text-button" data-action="move-up" data-match="${esc(match.id)}" ${index === 0 ? 'disabled' : ''} aria-label="Move Queue ${index + 1} up">↑ Up</button><button class="text-button" data-action="move-down" data-match="${esc(match.id)}" ${index === session.queue.length - 1 ? 'disabled' : ''} aria-label="Move Queue ${index + 1} down">↓ Down</button></div><button class="icon-button delete-match" data-action="delete-match" data-match="${esc(match.id)}" aria-label="Delete Queue ${index + 1}" title="Delete match">×</button></div>
    </article>`;
  }).join('') || '<div class="empty-queue"><span>01 → 02 → 03</span><h3>Good games start here.</h3><p>Add a match, then drag in four players.</p></div>';
}

function render() {
  playerMenu.hidePopover();
  const available = availablePlayers(session);
  const playingCount = Object.keys(session.live).length;
  root.innerHTML = `${renderSidebar()}<main>${renderTopbar()}${page === 'session' ? `<section class="page-heading"><div><div class="eyebrow">LESS ADMIN. MORE BADMINTON.</div><h1>Let’s get playing.</h1><p>Build your matches. Keep the courts moving.</p></div><button class="button dark" data-action="attendance">Select attendance <span>↗</span></button></section><div class="stats"><div><strong>${session.attending.length}</strong><span>checked in</span></div><div><strong>${available.length}</strong><span>available</span></div><div><strong>${session.queue.length}</strong><span>queued matches</span></div><div><strong>${playingCount}<small> / ${setup.courts.length}</small></strong><span>courts playing</span></div></div><div class="workspace"><section class="available-panel" data-drop-available><div class="section-title"><h2>Available players</h2><span class="count">${available.length}</span></div><p class="hint">Drag a name into a queued match.</p><label class="search-label"><span>⌕</span><input id="player-search" type="search" placeholder="Find a player…" value="${esc(search)}" aria-label="Find an available player" /></label><div class="filters"><button data-filter="all" class="${levelFilter === 'all' ? 'active' : ''}">All</button>${LEVELS.map(level => `<button class="filter-dot ${level} ${levelFilter === level ? 'active' : ''}" data-filter="${level}" aria-label="Filter ${level} players" title="${level}"></button>`).join('')}</div><div class="player-list">${available.filter(id => { const player = playerById(id); return player && player.name.toLowerCase().includes(search.toLowerCase()) && (levelFilter === 'all' || player.level === levelFilter); }).map(id => plate(id)).join('') || `<div class="empty-list"><span>＋</span><strong>${session.attending.length ? 'No matching players' : 'Who’s playing today?'}</strong><p>${session.attending.length ? 'Players return here after their match.' : 'Select attendance from your saved roster to get started.'}</p>${!session.attending.length ? '<button class="button subtle" data-action="attendance">Select players</button>' : ''}</div>`}</div><div class="return-zone">Drop here to return a queued player</div></section><div class="board"><section><div class="section-title"><div><h2>Live courts <span class="count">${setup.courts.length}</span></h2><p class="hint">Take the next match when a court is ready.</p></div><button class="text-button" data-action="setup">Manage courts ↗</button></div><div class="courts">${renderCourts()}</div></section><section class="queue-section"><div class="section-title"><div><h2>Shared queue <span class="count">${session.queue.length}</span></h2><p class="hint">One shared queue. Drag the handle to change the order.</p></div><button class="button dark" data-action="add-match">＋ Add Match</button></div><div class="queue">${renderQueue()}<div class="queue-end" data-drop-end>Drag a match here to move it to the end</div></div></section></div></div>` : setupPage()}</main>`;
}

function setupPage() {
  return `<section class="page-heading"><div><div class="eyebrow">READY BEFORE THE FIRST SERVE</div><h1>Your club, remembered.</h1><p>Save your roster and courts. Choose attendance for each session.</p></div><span class="saved-note">${loadFailed ? 'Setup unavailable' : 'Saved on this computer'}</span></section><div class="setup-grid"><section class="setup-card"><div class="section-title"><h2>Player roster</h2><span class="count">${setup.players.length}</span></div><form id="add-player"><label>Name<input name="name" placeholder="Player name" maxlength="80" required /></label><label>Skill color<select name="level">${LEVELS.map(level => `<option value="${level}">${level[0].toUpperCase() + level.slice(1)}</option>`).join('')}</select></label><button class="button dark" type="submit">Add player</button></form><label class="search-label"><span>⌕</span><input id="roster-search" placeholder="Search saved players…" type="search" value="${esc(rosterSearch)}" aria-label="Search saved players" /></label><div class="roster-list">${setup.players.filter(player => player.name.toLowerCase().includes(rosterSearch.toLowerCase())).map(player => `<form class="roster-row" data-edit-player="${esc(player.id)}"><span class="skill-dot ${player.level}"></span><input name="name" value="${esc(player.name)}" maxlength="80" required aria-label="Player name" /><select name="level" aria-label="Skill color">${LEVELS.map(level => `<option value="${level}" ${player.level === level ? 'selected' : ''}>${level}</option>`).join('')}</select><button class="text-button" type="submit">Save</button><button class="icon-button" type="button" data-action="delete-player" data-player-id="${esc(player.id)}" ${isLive(session, player.id) || isQueued(session, player.id) ? 'disabled title="Return this player to available before deleting"' : 'title="Delete player"'} aria-label="Delete ${esc(player.name)}">×</button></form>`).join('') || '<p class="setup-empty">Add your regular players here. They will be ready for your next session.</p>'}</div></section><section class="setup-card"><div class="section-title"><h2>Courts</h2><span class="count">${setup.courts.length}</span></div><p class="hint">Unique positive whole numbers only.</p><form id="add-court"><label>Court number<input name="number" type="number" min="1" step="1" placeholder="1" required /></label><button class="button dark" type="submit">Add court</button></form><div class="court-settings">${[...setup.courts].sort((a, b) => a.number - b.number).map(court => `<form class="court-setting" data-edit-court="${esc(court.id)}"><span>Court</span><input name="number" value="${court.number}" type="number" min="1" step="1" required aria-label="Court number" /><button class="text-button" type="submit">Save</button><button class="icon-button" type="button" data-action="delete-court" data-court="${esc(court.id)}" ${session.live[court.id] ? 'disabled title="End the match before deleting this court"' : 'title="Delete court"'} aria-label="Delete court ${court.number}">×</button></form>`).join('') || '<p class="setup-empty">Add the courts you use. You can change their numbers anytime.</p>'}</div><div class="setup-tip"><strong>A fresh start, every session.</strong><p>Only these settings are saved. Closing QueMatcher clears attendance, queued games, and live matches.</p></div></section></div>`;
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
    else if (action === 'add-match') session.queue.push({ id: uid(), players: [null, null, null, null] });
    else if (action === 'delete-match') session.queue = session.queue.filter(match => match.id !== button.dataset.match);
    else if (action === 'next') {
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
  if (form.id === 'add-player' || form.dataset.editPlayer) {
    const name = String(data.get('name')).trim(), level = data.get('level');
    if (!name) return toast('Enter a player name.', true);
    if (form.id === 'add-player') await saveSetup({ ...setup, players: [...setup.players, { id: uid(), name, level }] });
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

root.addEventListener('dragstart', event => {
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
      reorderMatch(session, payload.id, target.dataset.queueMatch || null);
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
  const player = event.target.closest('[data-player][draggable]');
  if (!player?.closest('[data-drop-available]')) return;
  event.preventDefault();
  menuPlayerId = player.dataset.player;
  playerMenu.hidePopover();
  playerMenu.showPopover();
  const bounds = player.getBoundingClientRect();
  const x = event.clientX || bounds.left;
  const y = event.clientY || bounds.bottom;
  playerMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - playerMenu.offsetWidth - 8))}px`;
  playerMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - playerMenu.offsetHeight - 8))}px`;
  removeAttendeeButton.focus();
});

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
  setup = normalizeSetup(window.desktop ? await window.desktop.loadSetup() : JSON.parse(localStorage.getItem('quematcher.setup') || '{}'));
} catch (error) { loadFailed = true; toast(error.message || 'Could not load saved setup.', true); }
render();
