export const LEVELS = ['green', 'purple', 'blue', 'orange', 'red'];
export const uid = () => crypto.randomUUID();

export function normalizeSetup(input) {
  const players = [], courts = [], ids = new Set(), numbers = new Set();
  for (const player of Array.isArray(input?.players) ? input.players : []) {
    if (typeof player.id !== 'string' || !player.id || ids.has(player.id) || typeof player.name !== 'string' || !player.name.trim() || !LEVELS.includes(player.level)) continue;
    ids.add(player.id);
    players.push({ id: player.id, name: player.name.trim().slice(0, 80), level: player.level });
  }
  for (const court of Array.isArray(input?.courts) ? input.courts : []) {
    if (typeof court.id !== 'string' || !court.id || ids.has(court.id) || !Number.isSafeInteger(court.number) || court.number < 1 || numbers.has(court.number)) continue;
    ids.add(court.id); numbers.add(court.number);
    courts.push({ id: court.id, number: court.number });
  }
  return { players, courts };
}

export function createSession() { return { attending: [], queue: [], live: {}, nextMatchNumber: 1, matches: [] }; }
export function isLive(session, playerId) { return Object.values(session.live).some(match => match.players.includes(playerId)); }
export function isQueued(session, playerId) { return session.queue.some(match => match.players.includes(playerId)); }
export function availablePlayers(session) { return session.attending.filter(id => !isLive(session, id) && !isQueued(session, id)); }

export function playerMatchHistory(session, playerId) {
  return session.matches.filter(match => match.players.includes(playerId));
}

export function previousRepeatedMatch(session, players) {
  if (players.length !== 4 || players.some(id => !id) || new Set(players).size !== 4) return null;
  const previous = players.map(id => session.matches.findLast(match => match.players.includes(id)));
  const match = previous[0];
  if (!match || !previous.every(item => item?.number === match.number)) return null;
  return match.players.length === 4 && match.players.every(id => players.includes(id)) ? match : null;
}

export function movePlayer(session, playerId, matchId = null, slot = null) {
  if (!session.attending.includes(playerId) || isLive(session, playerId)) throw new Error('Only available or queued players can be moved.');
  const target = matchId === null ? null : session.queue.find(match => match.id === matchId);
  if (matchId !== null && (!target || !Number.isInteger(slot) || slot < 0 || slot > 3)) throw new Error('Choose a valid queued match slot.');
  for (const match of session.queue) match.players = match.players.map(id => id === playerId ? null : id);
  if (target) target.players[slot] = playerId;
}

export function addPlayerToMatch(session, playerId, matchId) {
  if (!session.attending.includes(playerId) || isLive(session, playerId)) throw new Error('Only available or queued players can be moved.');
  const match = session.queue.find(item => item.id === matchId);
  if (!match) throw new Error('Choose a queued match.');
  if (match.players.includes(playerId)) return;
  const slot = match.players.findIndex(id => id === null);
  if (slot < 0) throw new Error('This match already has 4 players. Choose another queue card.');
  movePlayer(session, playerId, matchId, slot);
}

export function queueAvailablePlayer(session, playerId) {
  if (!availablePlayers(session).includes(playerId)) throw new Error('Choose a player from the available list.');
  let match = session.queue.find(item => item.players.includes(null));
  if (!match) {
    match = { id: uid(), players: [null, null, null, null] };
    session.queue.push(match);
  }
  addPlayerToMatch(session, playerId, match.id);
}

export function removeAvailablePlayer(session, playerId) {
  if (!availablePlayers(session).includes(playerId)) throw new Error('Only available players can leave the session.');
  session.attending = session.attending.filter(id => id !== playerId);
}

export function startMatch(session, courtId, now = Date.now(), options = {}) {
  if (session.live[courtId]) throw new Error('This court is already playing.');
  const next = session.queue[0];
  if (!next) throw new Error('Add a match to the shared queue first.');
  if (next.players.length !== 4 || next.players.some(id => !id) || new Set(next.players).size !== 4) throw new Error('The first queued match must have exactly 4 players.');
  if (next.players.some(id => !session.attending.includes(id) || isLive(session, id))) throw new Error('A queued player is unavailable.');
  if (options.expectedMatchId && (next.id !== options.expectedMatchId || options.expectedPlayers?.length !== 4 || new Set(options.expectedPlayers).size !== 4 || !options.expectedPlayers.every(id => next.players.includes(id)))) throw new Error('The next queued match changed. Review it before starting.');
  const repeat = previousRepeatedMatch(session, next.players);
  if (repeat && !options.allowRepeat) throw new Error(`These players were together in their last match (#${repeat.number}). Confirm before starting again.`);
  const number = session.nextMatchNumber;
  session.queue.shift();
  session.live[courtId] = { players: [...next.players], startedAt: now, number };
  session.matches.push({ number, courtId, players: [...next.players], startedAt: now, endedAt: null });
  session.nextMatchNumber++;
}

export function endMatch(session, courtId, now = Date.now()) {
  const match = session.live[courtId];
  if (!match) return;
  const record = session.matches.find(item => item.number === match.number);
  if (record) record.endedAt = now;
  session.attending = [...session.attending.filter(id => !match.players.includes(id)), ...match.players];
  delete session.live[courtId];
}

export function swapMatches(session, matchId, targetId) {
  if (matchId === targetId) return;
  const from = session.queue.findIndex(match => match.id === matchId);
  const to = session.queue.findIndex(match => match.id === targetId);
  if (from < 0 || to < 0) return;
  [session.queue[from], session.queue[to]] = [session.queue[to], session.queue[from]];
}

export function reorderMatch(session, matchId, beforeId) {
  if (matchId === beforeId) return;
  const from = session.queue.findIndex(match => match.id === matchId);
  if (from < 0 || (beforeId !== null && !session.queue.some(match => match.id === beforeId))) return;
  const [match] = session.queue.splice(from, 1);
  const to = beforeId === null ? session.queue.length : session.queue.findIndex(item => item.id === beforeId);
  session.queue.splice(to, 0, match);
}

export function romanNumeral(count) {
  let numeral = '';
  for (const [value, symbol] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (count >= value) { numeral += symbol; count -= value; }
  }
  return numeral;
}
