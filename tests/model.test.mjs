import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, availablePlayers, movePlayer, addPlayerToMatch, queueAvailablePlayer, removeAvailablePlayer, startMatch, endMatch, reorderMatch, swapMatches, normalizeSetup } from '../src/model.js';

function fixture() {
  const session = createSession();
  session.attending = ['a', 'b', 'c', 'd', 'e'];
  session.queue = [{ id: 'first', players: ['a', 'b', 'c', 'd'] }, { id: 'second', players: [null, null, null, null] }];
  return session;
}

test('card drops fill the first gap and transfer a queued player without duplication', () => {
  const session = fixture();
  session.queue[1].players = [null, 'e', null, null];
  addPlayerToMatch(session, 'a', 'second');
  assert.deepEqual(session.queue[1].players, ['a', 'e', null, null]);
  assert.equal(session.queue[0].players[0], null);
  const before = structuredClone(session);
  addPlayerToMatch(session, 'a', 'second');
  assert.deepEqual(session, before);
});

test('full card drops leave all previous assignments intact', () => {
  const session = fixture();
  const before = structuredClone(session);
  assert.throws(() => addPlayerToMatch(session, 'e', 'first'), /already has 4/);
  assert.deepEqual(session, before);
});

test('quick placement chooses the earliest gap before later queued matches', () => {
  const session = fixture();
  movePlayer(session, 'b');
  queueAvailablePlayer(session, 'e');
  assert.deepEqual(session.queue[0].players, ['a', 'e', 'c', 'd']);
  assert.deepEqual(session.queue[1].players, [null, null, null, null]);
});

test('quick placement creates a match when none exist or every match is full', () => {
  for (const hasFullMatch of [false, true]) {
    const session = fixture();
    session.queue = hasFullMatch ? [session.queue[0]] : [];
    queueAvailablePlayer(session, 'e');
    assert.equal(session.queue.length, hasFullMatch ? 2 : 1);
    assert.deepEqual(session.queue.at(-1).players, ['e', null, null, null]);
    const before = structuredClone(session);
    assert.throws(() => queueAvailablePlayer(session, 'e'), /available list/);
    assert.deepEqual(session, before);
  }
});

test('leaving removes only available attendance and blocks queued or live players', () => {
  const session = fixture();
  removeAvailablePlayer(session, 'e');
  assert.deepEqual(session.attending, ['a', 'b', 'c', 'd']);
  const before = structuredClone(session);
  assert.throws(() => removeAvailablePlayer(session, 'a'), /Only available/);
  assert.deepEqual(session, before);
  startMatch(session, 'court');
  const liveBefore = structuredClone(session);
  assert.throws(() => removeAvailablePlayer(session, 'a'), /Only available/);
  assert.throws(() => addPlayerToMatch(session, 'a', 'second'), /Only available/);
  assert.deepEqual(session, liveBefore);
});

test('moving a plate removes its old assignment; replacing returns the displaced player', () => {
  const session = fixture();
  movePlayer(session, 'a', 'second', 0);
  assert.equal(session.queue[0].players[0], null);
  assert.equal(session.queue[1].players[0], 'a');
  movePlayer(session, 'e', 'second', 0);
  assert.deepEqual(availablePlayers(session), ['a']);
  movePlayer(session, 'e');
  assert.deepEqual(availablePlayers(session), ['a', 'e']);
});

test('an incomplete head blocks starting even when a later match is complete', () => {
  const session = fixture();
  reorderMatch(session, 'second', 'first');
  const before = structuredClone(session);
  assert.throws(() => startMatch(session, 'court'), /exactly 4/);
  assert.deepEqual(session, before);
});

test('start locks four players and end returns them behind waiting players', () => {
  const session = fixture();
  startMatch(session, 'court', 1234);
  assert.equal(session.live.court.startedAt, 1234);
  assert.equal(session.queue.length, 1);
  assert.deepEqual(availablePlayers(session), ['e']);
  const before = structuredClone(session);
  assert.throws(() => movePlayer(session, 'a', 'second', 0), /Only available/);
  assert.throws(() => startMatch(session, 'court'), /already playing/);
  assert.deepEqual(session, before);
  endMatch(session, 'court');
  assert.deepEqual(availablePlayers(session), ['e', 'a', 'b', 'c', 'd']);
});

test('invalid drops do not remove a player from their original match', () => {
  const session = fixture();
  const before = structuredClone(session);
  assert.throws(() => movePlayer(session, 'a', 'missing', 0));
  assert.throws(() => movePlayer(session, 'a', 'second', 4));
  assert.deepEqual(session, before);
});

test('reordering moves whole groups and leaves player slots intact', () => {
  const session = fixture();
  reorderMatch(session, 'first', null);
  assert.deepEqual(session.queue.map(match => match.id), ['second', 'first']);
  assert.deepEqual(session.queue[1].players, ['a', 'b', 'c', 'd']);
});

test('card drops swap nonadjacent matches in either direction without shifting other groups', () => {
  const session = fixture();
  session.queue.push({ id: 'third', players: ['e', null, null, null] }, { id: 'fourth', players: [null, null, null, null] });
  const original = structuredClone(session.queue);
  swapMatches(session, 'first', 'fourth');
  assert.deepEqual(session.queue, [original[3], original[1], original[2], original[0]]);
  swapMatches(session, 'first', 'fourth');
  assert.deepEqual(session.queue, original);
});

test('dropping onto the same or a missing card leaves the queue unchanged', () => {
  const session = fixture();
  const before = structuredClone(session);
  swapMatches(session, 'first', 'first');
  swapMatches(session, 'first', 'missing');
  swapMatches(session, 'missing', 'second');
  assert.deepEqual(session, before);
});

test('saved setup excludes session data and rejects duplicate or invalid court numbers', () => {
  const result = normalizeSetup({
    players: [{ id: 'p', name: ' Alex ', level: 'green' }],
    courts: [{ id: 'c1', number: 1 }, { id: 'c2', number: 1 }, { id: 'c3', number: -1 }, { id: 'c4', number: 1.5 }],
    queue: ['not saved'], live: { c1: 'not saved' }
  });
  assert.deepEqual(result, { players: [{ id: 'p', name: 'Alex', level: 'green' }], courts: [{ id: 'c1', number: 1 }] });
  assert.deepEqual(createSession(), { attending: [], queue: [], live: {}, nextMatchNumber: 1, matches: [] });
});

test('100 attendees across 15 simultaneous courts retain exactly one assignment each', () => {
  const session = createSession();
  session.attending = Array.from({ length: 100 }, (_, index) => `player-${index}`);
  session.queue = Array.from({ length: 20 }, (_, index) => ({ id: `match-${index}`, players: session.attending.slice(index * 4, index * 4 + 4) }));
  for (let court = 0; court < 15; court++) startMatch(session, `court-${court}`, 1234);
  const locations = [...availablePlayers(session), ...session.queue.flatMap(match => match.players), ...Object.values(session.live).flatMap(match => match.players)];
  assert.equal(locations.length, 100);
  assert.equal(new Set(locations).size, 100);
  assert.equal(Object.keys(session.live).length, 15);
  for (let court = 0; court < 15; court++) endMatch(session, `court-${court}`);
  assert.equal(availablePlayers(session).length, 80);
});
