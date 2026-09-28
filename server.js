// server.js
// Entry point. Serves the client (public/) and the shared rules module
// (shared/) as static files, and wires up Socket.IO matchmaking + the
// authoritative match logic in server/.

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { createMatchmaking } from './server/matchmaking.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

app.get('/healthz', (req, res) => res.json({ ok: true }));

const matchmaking = createMatchmaking(io);
io.on('connection', (socket) => matchmaking.handleSocket(socket));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Tactical Strike server listening on http://localhost:${PORT}`);
});
