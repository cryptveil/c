// public/src/net.js
// Thin Socket.IO client wrapper. This module never decides a hit, a kill, a
// credit total, or a round result -- it sends intents to the server and
// applies whatever the server broadcasts back. That split is what makes the
// multiplayer server-authoritative instead of client-trusted.

export function connectNet(handlers) {
  const socket = io(); // global `io` from the socket.io client script tag

  socket.on('connect', () => handlers.onConnect && handlers.onConnect(socket.id));
  socket.on('disconnect', () => handlers.onDisconnect && handlers.onDisconnect());
  socket.on('queue:status', (d) => handlers.onQueueStatus && handlers.onQueueStatus(d));
  socket.on('queue:size', (d) => handlers.onQueueSize && handlers.onQueueSize(d));
  socket.on('queue:matched', (d) => handlers.onMatched && handlers.onMatched(d));
  socket.on('lobby:created', (d) => handlers.onLobbyCreated && handlers.onLobbyCreated(d));
  socket.on('lobby:update', (d) => handlers.onLobbyUpdate && handlers.onLobbyUpdate(d));
  socket.on('lobby:error', (d) => handlers.onLobbyError && handlers.onLobbyError(d));
  socket.on('match:joined', (d) => handlers.onMatchJoined && handlers.onMatchJoined(d));
  socket.on('match:roster', (d) => handlers.onRoster && handlers.onRoster(d));
  socket.on('match:playerLeft', (d) => handlers.onPlayerLeft && handlers.onPlayerLeft(d));
  socket.on('match:state', (d) => handlers.onState && handlers.onState(d));
  socket.on('combat:shotFired', (d) => handlers.onShotFired && handlers.onShotFired(d));
  socket.on('combat:hit', (d) => handlers.onHit && handlers.onHit(d));
  socket.on('combat:kill', (d) => handlers.onKill && handlers.onKill(d));
  socket.on('ability:activated', (d) => handlers.onAbility && handlers.onAbility(d));
  socket.on('round:planted', (d) => handlers.onPlanted && handlers.onPlanted(d));
  socket.on('round:defused', (d) => handlers.onDefused && handlers.onDefused(d));
  socket.on('round:ended', (d) => handlers.onRoundEnded && handlers.onRoundEnded(d));
  socket.on('economy:update', (d) => handlers.onEconomy && handlers.onEconomy(d));

  return {
    socket,
    joinQueue(name) { socket.emit('queue:join', { name }); },
    leaveQueue() { socket.emit('queue:leave'); },
    createLobby(name) { socket.emit('lobby:create', { name }); },
    joinLobby(code, name) { socket.emit('lobby:join', { code, name }); },
    startLobby(code) { socket.emit('lobby:start', { code }); },
    pickCharacter(id) { socket.emit('match:character', { character: id }); },
    sendMove(x, y, z, yaw) { socket.emit('match:move', { x, y, z, yaw }); },
    sendShoot(targetId, headshot) { socket.emit('match:shoot', { targetId, headshot }); },
    sendAbility(abilityId) { socket.emit('match:ability', { abilityId }); },
    sendBuy(kind, id) { socket.emit('match:buy', { kind, id }); },
    sendPlant(holding) { socket.emit('match:plant', { holding }); },
    sendDefuse(holding) { socket.emit('match:defuse', { holding }); },
  };
}
