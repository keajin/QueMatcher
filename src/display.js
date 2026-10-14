import { pageItems, displayStats, displayMatchPages } from './display-state.js';

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let state = null;
const pages = { court: 0, queue: 0, available: 0 };
const grids = Object.fromEntries(Object.keys(pages).map(key => [key, document.querySelector(`#${key}-grid`)]));

function plate(player) {
  return player ? `<div class="nameplate ${esc(player.level)}"><strong>${esc(player.name)}</strong>${player.lastMatchNumber ? `<small>#${player.lastMatchNumber}</small>` : ''}</div>` : '<div class="empty-slot">Waiting for players</div>';
}

function capacity(key) {
  if (key === 'court') return 10;
  if (key === 'queue') return 7;
  const grid = grids[key];
  const style = getComputedStyle(grid);
  const gap = parseFloat(style.gap) || 0;
  if (key === 'available') {
    const rowHeight = parseFloat(style.getPropertyValue('--available-row-height')) || 60;
    return Math.max(1, Math.floor((grid.clientHeight + gap) / (rowHeight + gap)));
  }
  return 1;
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
    const items = key === 'court' ? state.courts : key === 'queue' ? state.queue : state.available;
    const paged = key === 'available' ? pageItems(items, pages.available, capacity(key)) : matches[key];
    pages[key] = paged.page;
    document.querySelector(`#${key}-count`).textContent = items.length;
    document.querySelector(`#${key}-page`).textContent = key === 'queue' && items.length > 7 ? `First 7 of ${items.length}` : paged.totalPages > 1 ? `${paged.page + 1} / ${paged.totalPages}` : '';
    grids[key].innerHTML = paged.items.map(item => {
      if (key === 'available') return plate(item);
      const live = key === 'court' && item.startedAt !== null;
      return `<article class="display-card ${key === 'queue' ? 'queue-card' : 'court-card'} ${live && Date.now() < item.startedAt + 10000 ? 'just-started' : ''}" ${live ? `data-highlight-until="${item.startedAt + 10000}"` : ''}>
        <div class="card-heading"><h3>${key === 'court' ? `Court ${item.number}` : `Queue ${item.position}`}</h3><span>${key === 'court' ? live ? 'PLAYING' : 'OPEN' : item.players.filter(Boolean).length === 4 ? 'READY' : 'FILLING'}</span></div>
        <div class="card-detail">${key === 'court' ? live ? `Match #${item.matchNumber}` : 'Ready for the next group' : item.position === 1 ? 'Next to play' : 'Queued'}</div>
        <div class="card-players">${item.players.map(plate).join('')}</div>
        ${key === 'court' ? `<div class="timer" ${live ? `data-start="${item.startedAt}"` : ''}>${live ? elapsed(item.startedAt) : '--:--'}</div>` : `<div class="queue-note">${item.repeatMatchNumber ? `Repeats last match #${item.repeatMatchNumber}` : `${item.players.filter(Boolean).length} / 4 players`}</div>`}
      </article>`;
    }).join('') || `<div class="empty-zone">${key === 'court' ? 'No courts configured' : key === 'queue' ? 'No matches queued' : 'No available players'}</div>`;
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
  document.querySelectorAll('[data-start]').forEach(timer => timer.textContent = elapsed(Number(timer.dataset.start)));
  document.querySelectorAll('[data-highlight-until]').forEach(card => card.classList.toggle('just-started', Date.now() < Number(card.dataset.highlightUntil)));
}, 1000);
setInterval(() => {
  if (!state) return;
  let changed = false;
  if (state.courts.length > 10) { pages.court++; changed = true; }
  if (state.available.length > capacity('available')) { pages.available++; changed = true; }
  if (changed) render();
}, 10000);
window.addEventListener('resize', render);

if (window.displayBoard) {
  window.displayBoard.onUpdate(receive);
  try { receive(await window.displayBoard.getState()); }
  catch { document.querySelector('#board-summary').textContent = 'Could not connect. Close and reopen the display board from the organizer window.'; }
} else document.querySelector('#board-summary').textContent = 'Open this board from the QueMatcher desktop app.';
