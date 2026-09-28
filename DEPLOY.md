# Put Tactical Strike online

This project is a Node/Express + Socket.IO web game. It needs a Node web host for the multiplayer features; a static host such as GitHub Pages cannot run the Socket.IO server.

## Render

1. Put this folder in a GitHub repository.
2. On Render, create a new Web Service from that repository.
3. Render can use the included `render.yaml`, or use:
   - Build command: `npm install`
   - Start command: `npm start`
4. Deploy.
5. Open the HTTPS URL Render gives you. The game is then playable in a browser.

## Local

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Important

The game uses original/procedural assets and systems. It does not include Riot's proprietary Valorant source code, models, textures, sounds, or exact map assets.
