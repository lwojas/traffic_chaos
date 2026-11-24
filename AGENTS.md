# Agent instructions

This repo is an ECS engine plus a traffic network pressure-management game (the default scene).

- Before changing anything under `scripts/traffic/`, `scripts/system/traffic/`, `scripts/components/traffic/` or `data/`, read **TRAFFIC_GUIDE.md**. It lists the design rules (vehicles stay dumb, the player causes failure, deterministic simulation, three separated layers), the system update order and common pitfalls.
- Generic engine conventions: `IMPLEMENTATION_GUIDE.md`.
- Run `npm test` after every change. Simulation tests run headless, without Phaser.
- Do not add conflict avoidance, reservations or self-chosen rerouting to vehicles; it removes the game. Player-set diversions (`DiversionSystem`) are the one way paths change: by road length, never by congestion.
