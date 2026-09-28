// server/matchmaking.js
// Public queue (fills to 10, then auto-starts) and private lobby codes
// (host shares a code, up to 10 people join it, host starts it manually).

import { Match, nextMatchCode } from './match.js';

export function createMatchmaking(io) {
  const queue = [];          // [{socket, name}]
  const lobbies = new Map(); // code -> { hostId, members: [{socket,name}] }
  const matches = new Map(); // code -> Match

  function startMatchFrom(members) {
    const code = nextMatchCode();
    const match = new Match(io, code, members);
    matches.set(code, match);
    match.start();
    return match;
  }

  function findMatchOf(socketId) {
    for (const m of matches.values()) if (m.players.has(socketId)) return m;
    return null;
  }

  function cleanupSocket(socket) {
    const qi = queue.findIndex(e => e.socket.id === socket.id);
    if (qi >= 0) queue.splice(qi, 1);
    for (const [code, lobby] of lobbies) {
      const before = lobby.members.length;
      lobby.members = lobby.members.filter(m => m.socket.id !== socket.id);
      if (lobby.members.length !== before) io.to(code).emit('lobby:update', publicLobby(lobby, code));
      if (lobby.members.length === 0) lobbies.delete(code);
    }
    const match = findMatchOf(socket.id);
    if (match) {
      match.removePlayer(socket.id);
      if (match.isEmpty()) { match.stop(); matches.delete(match.code); }
    }
  }

  function publicLobby(lobby, code) {
    return { code, hostId: lobby.hostId, members: lobby.members.map(m => ({ id: m.socket.id, name: m.name })) };
  }

  return {
    handleSocket(socket) {
      socket.on('queue:join', ({ name }) => {
        if (queue.some(e => e.socket.id === socket.id)) return;
        queue.push({ socket, name: (name || '').slice(0, 24) || `Operative-${socket.id.slice(0, 4)}` });
        socket.emit('queue:status', { position: queue.length, size: queue.length });
        io.emit('queue:size', { size: queue.length });
        if (queue.length >= 10) {
          const members = queue.splice(0, 10);
          const match = startMatchFrom(members);
          members.forEach((m, i) => m.socket.emit('queue:matched', { code: match.code }));
        }
      });

      socket.on('queue:leave', () => {
        const i = queue.findIndex(e => e.socket.id === socket.id);
        if (i >= 0) queue.splice(i, 1);
        io.emit('queue:size', { size: queue.length });
      });

      socket.on('lobby:create', ({ name }) => {
        const code = nextMatchCode().slice(0, 5);
        lobbies.set(code, { hostId: socket.id, members: [{ socket, name: name || 'Host' }] });
        socket.join(code);
        socket.emit('lobby:created', publicLobby(lobbies.get(code), code));
      });

      socket.on('lobby:join', ({ code, name }) => {
        const lobby = lobbies.get(code);
        if (!lobby) return socket.emit('lobby:error', { message: 'No lobby with that code.' });
        if (lobby.members.length >= 10) return socket.emit('lobby:error', { message: 'Lobby is full.' });
        lobby.members.push({ socket, name: name || `Operative-${socket.id.slice(0, 4)}` });
        socket.join(code);
        io.to(code).emit('lobby:update', publicLobby(lobby, code));
      });

      socket.on('lobby:start', ({ code }) => {
        const lobby = lobbies.get(code);
        if (!lobby || lobby.hostId !== socket.id) return;
        if (lobby.members.length < 2) return socket.emit('lobby:error', { message: 'Need at least 2 players to start.' });
        const match = startMatchFrom(lobby.members);
        lobby.members.forEach(m => m.socket.emit('queue:matched', { code: match.code }));
        lobbies.delete(code);
      });

      socket.on('match:character', ({ character }) => {
        const match = findMatchOf(socket.id);
        if (match) match.setCharacter(socket.id, character);
      });
      socket.on('match:move', (msg) => { const m = findMatchOf(socket.id); if (m) m.handleMovement(socket.id, msg, Date.now()); });
      socket.on('match:shoot', (msg) => { const m = findMatchOf(socket.id); if (m) m.handleShoot(socket.id, msg, Date.now()); });
      socket.on('match:ability', ({ abilityId }) => { const m = findMatchOf(socket.id); if (m) m.handleAbility(socket.id, abilityId, Date.now()); });
      socket.on('match:buy', (msg) => { const m = findMatchOf(socket.id); if (m) m.handleBuy(socket.id, msg); });
      socket.on('match:plant', ({ holding }) => { const m = findMatchOf(socket.id); if (m) m.handlePlantProgress(socket.id, holding, Date.now()); });
      socket.on('match:defuse', ({ holding }) => { const m = findMatchOf(socket.id); if (m) m.handleDefuseProgress(socket.id, holding, Date.now()); });

      socket.on('disconnect', () => cleanupSocket(socket));
    },
  };
}
