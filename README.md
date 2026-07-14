# NotFortnite

A browser-based battle royale inspired by Fortnite. Third-person, mobile/tablet-first,
playable solo against CPU opponents or online against other humans on a private server.

**Play (offline vs CPUs):** https://labairj-ai.github.io/notfortnite/

## Features

- **Battle royale loop** — glide onto the island, loot up, survive the shrinking storm,
  last one standing wins
- **10-player matches** — humans + CPU bots fill every lobby
- **Building** — walls, floors, and ramps (wood / brick / metal) placed on a grid,
  Fortnite-style; harvest materials with your pickaxe from trees, rocks, metal crates,
  and buildings
- **Weapons & loot** — pistol, SMG, rifle, shotgun, sniper in five rarities; bandages,
  medkits, and shield potions; golden chests and floor loot
- **Character customization** — name, skin tone, outfit color, hat; saved locally and
  visible to other players online
- **Mobile-first controls** — virtual joystick, look-drag, fire/jump/build buttons,
  contextual OPEN button; desktop gets pointer-lock + WASD
- **Named POIs** — Salty Suburbs, Loot Lagoon, Crate Canyon, Bush Borough

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Move | WASD | Left joystick |
| Look | Mouse | Drag right side of screen |
| Fire / harvest / place | Left click | 🔥 button |
| Jump | Space | ⬆ button |
| Build mode | Q | 🔨 button |
| Piece (wall/floor/ramp) | Z / X / C | On-screen buttons |
| Cycle material | R | Material button |
| Open chest | F | OPEN button |
| Slots | 1–6 | Tap slot |

## Architecture

```
shared/      Game simulation used by BOTH the browser and the server
  constants.js   tuning (weapons, storm phases, build costs)
  worldgen.js    deterministic island from a seed (terrain, POIs, chests, props)
  match.js       storm, bot AI, damage/kills, loot rolls
src/         Client (Three.js) — rendering, physics, input, HUD, netcode
server/      Node.js WebSocket server for online matches
```

- **Offline mode** runs the full simulation in the browser — no server needed.
  This is what GitHub Pages serves.
- **Online mode** connects to the WebSocket server, which runs the match
  (storm, bots, hit adjudication) and relays player state at 10 Hz. Both sides
  generate the identical island from the match seed, so only deltas travel the wire.

## Running the multiplayer server

```bash
cd server
npm install
npm start            # listens on :8081  (PORT=9000 npm start for another port)
```

Players connect from the web game via **Multiplayer** → `ws://<server-ip>:8081`
(or pass it in the URL: `https://labairj-ai.github.io/notfortnite/?server=ws://<ip>:8081`).

### Hosting on a Linux box (e.g. the OptiPlex)

1. Install Node 20+, copy the repo (`git clone`), then `cd server && npm install`
2. Run it as a service so it survives reboots:
   ```bash
   sudo tee /etc/systemd/system/notfortnite.service > /dev/null <<'EOF'
   [Unit]
   Description=NotFortnite game server
   After=network.target
   [Service]
   WorkingDirectory=/opt/notfortnite/server
   ExecStart=/usr/bin/node server.js
   Restart=always
   [Install]
   WantedBy=multi-user.target
   EOF
   sudo systemctl enable --now notfortnite
   ```
3. Open/forward TCP port 8081 to make it reachable from outside the LAN.
4. **Note:** pages served over HTTPS (like GitHub Pages) can only open `wss://`
   (secure) sockets. For internet play, put the server behind a TLS reverse proxy
   (Caddy makes this a two-line config) or a Cloudflare Tunnel, then connect with
   `wss://your-domain`. Plain `ws://` works fine on a LAN when running the client
   locally via `npx vite`.

## Development

```bash
npm install
npx vite             # client dev server
cd server && npm start   # optional: local multiplayer on ws://localhost:8081
```

Deploys to GitHub Pages automatically on every push to `main`.

## Credits

- **"Animated Base Character" 3D model and animation library by [Quaternius](https://quaternius.com)**
  ([poly.pizza/m/cwYvO5UauX](https://poly.pizza/m/cwYvO5UauX), CC-BY 3.0) — used for the
  rigged "Hero" character type (`public/models/hero.glb`). All other art is procedural.

## v1 known limits

- Hits are adjudicated by the shooter's client (fine for a friendly private server,
  not cheat-proof)
- Bots don't build and ignore player-built walls when pathing
- Inventory has no drop/swap — full slots ignore new pickups
- Ammo is infinite (fire rate is the limiter)
