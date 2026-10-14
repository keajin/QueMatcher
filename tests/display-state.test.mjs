import test from 'node:test';
import assert from 'node:assert/strict';
import { createDisplayState, pageItems, displayStats, displayMatchPages } from '../src/display-state.js';
import { createSession, startMatch, endMatch } from '../src/model.js';

function fixture() {
  const setup = {
    players: ['a', 'b', 'c', 'd', 'e', 'absent'].map(id => ({ id, name: id.toUpperCase(), level: 'blue' })),
    courts: [{ id: 'court-2', number: 2 }, { id: 'court-1', number: 1 }]
  };
  const session = createSession();
  session.attending = ['a', 'b', 'c', 'd', 'e'];
  session.queue = [{ id: 'next', players: ['a', 'b', 'c', 'd'] }];
  return { setup, session };
}

test('the board projects live courts, queue, and only available attendees', () => {
  const { setup, session } = fixture();
  startMatch(session, 'court-2', 1000);
  const state = createDisplayState(setup, session, 'Friday', 'dark');
  assert.deepEqual(state.courts.map(court => court.number), [1, 2]);
  assert.equal(state.courts[1].matchNumber, 1);
  assert.equal(state.courts[1].startedAt, 1000);
  assert.equal(state.courts[1].players[0].lastMatchNumber, 1);
  assert.deepEqual(state.available.map(player => player.id), ['e']);
  assert.deepEqual(state.queue, []);
  assert.equal(state.configurationName, 'Friday');
  assert.equal(state.theme, 'dark');
  assert.equal('matches' in state, false);
});

test('board snapshots carry repeat warnings and are independent of future session edits', () => {
  const { setup, session } = fixture();
  startMatch(session, 'court-1', 1000);
  endMatch(session, 'court-1', 2000);
  session.queue.push({ id: 'repeat', players: ['d', 'c', 'b', 'a'] });
  const before = structuredClone(session);
  const state = createDisplayState(setup, session, 'Club', 'light');
  assert.equal(state.queue[0].position, 1);
  assert.equal(state.queue[0].repeatMatchNumber, 1);
  assert.deepEqual(session, before);
  session.queue[0].players[0] = null;
  setup.players.find(player => player.id === 'd').name = 'Changed';
  assert.equal(state.queue[0].players[0].name, 'D');
});

test('pagination covers 100 players without omitting the final page', () => {
  const players = Array.from({ length: 100 }, (_, index) => index);
  const pages = Array.from({ length: 6 }, (_, index) => pageItems(players, index, 18));
  assert.deepEqual(pages.flatMap(page => page.items), players);
  assert.equal(pages[5].items.length, 10);
  assert.deepEqual(pageItems(players, 6, 18), pages[0]);
  assert.deepEqual(pageItems([], 100, 0), { items: [], page: 0, totalPages: 1 });
});

test('display stats distinguish checked-in players, open courts, and playing courts', () => {
  const { setup, session } = fixture();
  let state = createDisplayState(setup, session, 'Club', 'light');
  assert.deepEqual(displayStats(state), { checkedIn: 5, courtsAvailable: 2, queuedMatches: 1, courtsPlaying: 0 });
  startMatch(session, 'court-2', 1000);
  state = createDisplayState(setup, session, 'Club', 'light');
  assert.deepEqual(displayStats(state), { checkedIn: 5, courtsAvailable: 1, queuedMatches: 0, courtsPlaying: 1 });
  endMatch(session, 'court-2', 2000);
  state = createDisplayState(setup, session, 'Club', 'light');
  assert.deepEqual(displayStats(state), { checkedIn: 5, courtsAvailable: 2, queuedMatches: 0, courtsPlaying: 0 });
});

test('up to ten courts stay on one page regardless of rotation attempts', () => {
  for (const count of [0, 5, 6, 10]) {
    const courts = Array.from({ length: count }, (_, number) => ({ number: number + 1 }));
    const paged = displayMatchPages({ courts, queue: [] }, 5).court;
    assert.deepEqual(paged.items, courts);
    assert.equal(paged.totalPages, 1);
    assert.equal(paged.page, 0);
  }
});

test('courts above ten rotate in groups of ten without losing court order', () => {
  const courts = Array.from({ length: 15 }, (_, number) => ({ number: number + 1 }));
  const state = { courts, queue: [] };
  const first = displayMatchPages(state, 0).court;
  const second = displayMatchPages(state, 1).court;
  assert.equal(first.totalPages, 2);
  assert.equal(first.items.length, 10);
  assert.equal(second.items.length, 5);
  assert.deepEqual([...first.items, ...second.items], courts);
  assert.deepEqual(displayMatchPages(state, 2).court, first);
});

test('queue always shows only its first seven and follows organizer reordering', () => {
  const queue = Array.from({ length: 12 }, (_, position) => ({ position: position + 1 }));
  const state = { courts: [], queue };
  for (const page of [0, 1, 10]) {
    const paged = displayMatchPages(state, page).queue;
    assert.deepEqual(paged.items, queue.slice(0, 7));
    assert.equal(paged.totalPages, 1);
  }
  state.queue = [...queue].reverse();
  assert.deepEqual(displayMatchPages(state).queue.items, state.queue.slice(0, 7));
  assert.equal(queue.length, 12);
});
