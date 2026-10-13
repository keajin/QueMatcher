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

export function createSession() { return { attending: [], queue: [], live: {} }; }
export function isLive(session, playerId) { return Object.values(session.live).some(match => match.players.includes(playerId)); }
export function isQueued(session, playerId) { return session.queue.some(match => match.players.includes(playerId)); }
export function availablePlayers(session) { return session.attending.filter(id => !isLive(session, id) && !isQueued(session, id)); }

export function movePlayer(session, playerId, matchId = null, slot = null) {
  if (!session.attending.includes(playerId) || isLive(session, playerId)) throw new Error('Only available or queued players can be moved.');
  const target = matchId === null ? null : session.queue.find(match => match.id === matchId);
  if (matchId !== null && (!target || !Number.isInteger(slot) || slot < 0 || slot > 3)) throw new Error('Choose a valid queued match slot.');
  for (const match of session.queue) match.players = match.players.map(id => id === playerId ? null : id);
  if (target) target.players[slot] = playerId;
}

export function startMatch(session, courtId, now = Date.now()) {
  if (session.live[courtId]) throw new Error('This court is already playing.');
  const next = session.queue[0];
  if (!next) throw new Error('Add a match to the shared queue first.');
  if (next.players.length !== 4 || next.players.some(id => !id) || new Set(next.players).size !== 4) throw new Error('The first queued match must have exactly 4 players.');
  if (next.players.some(id => !session.attending.includes(id) || isLive(session, id))) throw new Error('A queued player is unavailable.');
  session.queue.shift();
  session.live[courtId] = { players: [...next.players], startedAt: now };
}

export function endMatch(session, courtId) {
  const match = session.live[courtId];
  if (!match) return;
  session.attending = [...session.attending.filter(id => !match.players.includes(id)), ...match.players];
  delete session.live[courtId];
}

export function reorderMatch(session, matchId, beforeId) {
  if (matchId === beforeId) return;
  const from = session.queue.findIndex(match => match.id === matchId);
  if (from < 0 || (beforeId !== null && !session.queue.some(match => match.id === beforeId))) return;
  const [match] = session.queue.splice(from, 1);
  const to = beforeId === null ? session.queue.length : session.queue.findIndex(item => item.id === beforeId);
  session.queue.splice(to, 0, match);
}
