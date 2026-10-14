import { romanNumeral } from './model.js';
import { displayStats, displayMatchPages } from './display-state.js';

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let state = null;
const pages = { court: 0, queue: 0 };
const grids = Object.fromEntries(Object.keys(pages).map(key => [key, document.querySelector(`#${key}-grid`)]));
const clockElement = document.querySelector('#display-clock');
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

function updateClock() {
  const now = new Date();
  clockElement.textContent = clockFormat.format(now);
  clockElement.dateTime = now.toISOString();
}

updateClock();

function plate(player) {
  return player ? `<div class="nameplate ${esc(player.level)}"><strong>${esc(player.name)}</strong>${player.matchesPlayed ? `<small class="match-number" title="${player.matchesPlayed} ${player.matchesPlayed === 1 ? 'match' : 'matches'} played this session" aria-label="${player.matchesPlayed} ${player.matchesPlayed === 1 ? 'match' : 'matches'} played this session">${romanNumeral(player.matchesPlayed)}</small>` : ''}</div>` : '<div class="empty-slot">Waiting for players</div>';
}

function render() {
  if (!state) return;
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('#configuration-name').textContent = state.configurationName;
  const stats = displayStats(state);
  document.querySelector('#stat-checked-in').textContent = stats.checkedIn;
  document.querySelector('#stat-courts-available').textContent = stats.courtsAvailable;
  document.querySelector('#stat-queued-matches').textContent = stats.queuedMatches;
  document.querySelector('#stat-courts-playing').textContent = stats.courtsPlaying;
  document.querySelector('#board-summary').textContent = `${state.attendingCount} attending · ${state.courts.filter(court => court.startedAt !== null).length} courts playing · ${state.queue.length} queued matches`;
  const matches = displayMatchPages(state, pages.court);
  for (const key of Object.keys(pages)) {
    const items = key === 'court' ? state.courts : state.queue;
    const paged = matches[key];
    pages[key] = paged.page;
    document.querySelector(`#${key}-count`).textContent = items.length;
    document.querySelector(`#${key}-page`).textContent = key === 'queue' && items.length > 7 ? `First 7 of ${items.length}` : paged.totalPages > 1 ? `${paged.page + 1} / ${paged.totalPages}` : '';
    grids[key].innerHTML = paged.items.map(item => {
      const live = key === 'court' && item.startedAt !== null;
      return `<article class="display-card ${key === 'queue' ? 'queue-card' : 'court-card'} ${live && Date.now() < item.startedAt + 30000 ? 'just-started' : ''}" ${live ? `data-highlight-until="${item.startedAt + 30000}"` : ''}>
        <div class="card-heading"><h3>${key === 'court' ? `Court ${item.number}` : `Queue ${item.position}`}</h3>${live ? `<span class="timer" data-start="${item.startedAt}">${elapsed(item.startedAt)}</span>` : `<span>${key === 'court' ? 'OPEN' : item.players.filter(Boolean).length === 4 ? 'READY' : 'FILLING'}</span>`}</div>
        ${key === 'queue' ? `<div class="card-detail">${item.position === 1 ? 'Next to play' : 'Queued'}</div>` : ''}
        <div class="card-players">${item.players.map(plate).join('')}</div>
        ${key === 'queue' ? `<div class="queue-note">${item.repeatMatchNumber ? `Repeats last match #${item.repeatMatchNumber}` : `${item.players.filter(Boolean).length} / 4 players`}</div>` : ''}
      </article>`;
    }).join('') || `<div class="empty-zone">${key === 'court' ? 'No courts configured' : 'No matches queued'}</div>`;
  }
}

function elapsed(start) {
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function receive(value) {
  if (!value || (state && value.revision <= state.revision)) return;
  state = value;
  render();
}

setInterval(() => {
  updateClock();
  document.querySelectorAll('[data-start]').forEach(timer => timer.textContent = elapsed(Number(timer.dataset.start)));
  document.querySelectorAll('[data-highlight-until]').forEach(card => card.classList.toggle('just-started', Date.now() < Number(card.dataset.highlightUntil)));
}, 1000);
setInterval(() => {
  if (!state) return;
  if (state.courts.length > 10) { pages.court++; render(); }
}, 10000);
window.addEventListener('resize', render);

if (window.displayBoard) {
  window.displayBoard.onUpdate(receive);
  try { receive(await window.displayBoard.getState()); }
  catch { document.querySelector('#board-summary').textContent = 'Could not connect. Close and reopen the display board from the organizer window.'; }
} else document.querySelector('#board-summary').textContent = 'Open this board from the QueMatcher desktop app.';
