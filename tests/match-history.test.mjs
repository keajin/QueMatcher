import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, playerMatchHistory, previousRepeatedMatch, startMatch, endMatch, removeAvailablePlayer } from '../src/model.js';

function fixture() {
  const session = createSession();
  session.attending = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  return session;
}

function queue(session, id, players) { session.queue.push({ id, players: [...players] }); }

test('match numbers follow starts across courts, even when matches finish out of order', () => {
  const session = fixture();
  queue(session, 'first', ['a', 'b', 'c', 'd']);
  queue(session, 'second', ['e', 'f', 'g', 'h']);
  startMatch(session, 'court-2', 1000);
  startMatch(session, 'court-1', 2000);
  assert.equal(session.live['court-2'].number, 1);
  assert.equal(session.live['court-1'].number, 2);
  endMatch(session, 'court-1', 3000);
  endMatch(session, 'court-2', 4000);
  assert.deepEqual(playerMatchHistory(session, 'a').map(match => match.number), [1]);
  assert.equal(session.matches[0].endedAt, 4000);
  assert.equal(session.matches[1].endedAt, 3000);
  assert.equal(session.nextMatchNumber, 3);
});

test('the same four are flagged regardless of queue slot order', () => {
  const session = fixture();
  queue(session, 'first', ['a', 'b', 'c', 'd']);
  startMatch(session, 'court', 1000);
  endMatch(session, 'court', 2000);
  assert.equal(previousRepeatedMatch(session, ['d', 'b', 'a', 'c']).number, 1);
  assert.equal(previousRepeatedMatch(session, ['a', 'b', 'c', null]), null);
  assert.equal(previousRepeatedMatch(session, ['a', 'b', 'c', 'c']), null);
  assert.equal(previousRepeatedMatch(session, ['a', 'b', 'c', 'e']), null);
});

test('another group playing on another court does not erase a last-match repeat', () => {
  const session = fixture();
  queue(session, 'first', ['a', 'b', 'c', 'd']);
  startMatch(session, 'court-1', 1000);
  endMatch(session, 'court-1', 2000);
  queue(session, 'second', ['e', 'f', 'g', 'h']);
  startMatch(session, 'court-2', 3000);
  assert.equal(previousRepeatedMatch(session, ['a', 'b', 'c', 'd']).number, 1);
});

test('an older exact group is not flagged after a member plays with other people', () => {
  const session = fixture();
  queue(session, 'first', ['a', 'b', 'c', 'd']);
  startMatch(session, 'court', 1000);
  endMatch(session, 'court', 2000);
  queue(session, 'different', ['a', 'e', 'f', 'g']);
  startMatch(session, 'court', 3000);
  endMatch(session, 'court', 4000);
  assert.equal(previousRepeatedMatch(session, ['a', 'b', 'c', 'd']), null);
  assert.deepEqual(playerMatchHistory(session, 'a').map(match => match.number), [1, 2]);
});

test('an unconfirmed repeat leaves queue, timer, and numbering unchanged', () => {
  const session = fixture();
  queue(session, 'first', ['a', 'b', 'c', 'd']);
  startMatch(session, 'court', 1000);
  endMatch(session, 'court', 2000);
  queue(session, 'repeat', ['d', 'c', 'b', 'a']);
  const before = structuredClone(session);
  assert.throws(() => startMatch(session, 'court', 3000), /Confirm before starting/);
  assert.deepEqual(session, before);
  startMatch(session, 'court', 4000, { allowRepeat: true, expectedMatchId: 'repeat', expectedPlayers: ['a', 'b', 'c', 'd'] });
  assert.equal(session.live.court.number, 2);
  assert.deepEqual(playerMatchHistory(session, 'a').map(match => match.number), [1, 2]);
});

test('confirmation cannot start a changed group or a different head match', () => {
  const session = fixture();
  queue(session, 'different', ['a', 'b', 'c', 'e']);
  const before = structuredClone(session);
  assert.throws(() => startMatch(session, 'court', 1000, { allowRepeat: true, expectedMatchId: 'old-id', expectedPlayers: ['a', 'b', 'c', 'd'] }), /changed/);
  assert.throws(() => startMatch(session, 'court', 1000, { allowRepeat: true, expectedMatchId: 'different', expectedPlayers: ['a', 'b', 'c', 'd'] }), /changed/);
  assert.deepEqual(session, before);
});

test('invalid starts do not consume match numbers or add history', () => {
  const session = fixture();
  queue(session, 'incomplete', ['a', null, null, null]);
  assert.throws(() => startMatch(session, 'court', 1000), /exactly 4/);
  assert.equal(session.nextMatchNumber, 1);
  assert.deepEqual(session.matches, []);
});

test('attendance changes retain history, while a fresh session clears it', () => {
  const session = fixture();
  queue(session, 'first', ['a', 'b', 'c', 'd']);
  startMatch(session, 'court', 1000);
  endMatch(session, 'court', 2000);
  removeAvailablePlayer(session, 'a');
  session.attending.push('a');
  assert.equal(previousRepeatedMatch(session, ['a', 'b', 'c', 'd']).number, 1);
  Object.assign(session, createSession());
  assert.deepEqual(playerMatchHistory(session, 'a'), []);
  assert.equal(session.nextMatchNumber, 1);
});
