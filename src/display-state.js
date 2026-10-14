import { availablePlayers, playerMatchHistory, previousRepeatedMatch } from './model.js';

export function createDisplayState(setup, session, configurationName, theme) {
  const byId = new Map(setup.players.map(player => [player.id, player]));
  const player = id => {
    const saved = byId.get(id);
    if (!saved) return null;
    return { id: saved.id, name: saved.name, level: saved.level, lastMatchNumber: playerMatchHistory(session, id).at(-1)?.number || null };
  };
  return {
    configurationName, theme, attendingCount: session.attending.length,
    courts: [...setup.courts].sort((a, b) => a.number - b.number).map(court => {
      const live = session.live[court.id];
      return { id: court.id, number: court.number, players: live ? live.players.map(player) : [null, null, null, null], matchNumber: live?.number || null, startedAt: live?.startedAt ?? null };
    }),
    queue: session.queue.map((match, index) => ({ id: match.id, position: index + 1, players: match.players.map(player), repeatMatchNumber: previousRepeatedMatch(session, match.players)?.number || null })),
    available: availablePlayers(session).map(player).filter(Boolean)
  };
}

export function pageItems(items, page, capacity) {
  const size = Math.max(1, Math.floor(capacity) || 1);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const currentPage = ((page % totalPages) + totalPages) % totalPages;
  return { items: items.slice(currentPage * size, (currentPage + 1) * size), page: currentPage, totalPages };
}

export function displayStats(state) {
  const courtsPlaying = state.courts.filter(court => court.startedAt !== null).length;
  return { checkedIn: state.attendingCount, courtsAvailable: state.courts.length - courtsPlaying, queuedMatches: state.queue.length, courtsPlaying };
}

export function displayMatchPages(state, courtPage = 0) {
  return {
    court: pageItems(state.courts, courtPage, 10),
    queue: { items: state.queue.slice(0, 7), page: 0, totalPages: 1 }
  };
}
