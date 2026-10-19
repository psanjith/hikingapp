# Hiking App

A free, beginner-friendly hiking map that keeps working when you lose cell signal.

**Live app:** https://psanjith.github.io/hikingapp/

> 🚧 Work in progress. A full write-up (screenshots, design decisions, tradeoffs) is coming as the app is built.

## Why

Apps with offline maps and GPX import are either paid or confusing. This one is free, simple, and focused on safety: knowing where you are when there's no signal.

## Status

| Stage | Feature | Status |
| --- | --- | --- |
| 1 | App shell, map, live location, opens offline | ✅ |
| 2 | Downloadable offline map regions | ⏳ |
| 3 | GPX import | ⏳ |
| 4 | Hike recording (pause/resume, distance, crash-safe autosave) | ⏳ |
| 5 | Hike history and GPX export | ⏳ |
| 6 | Safety polish (off-route alert, battery warning, install prompt) | ⏳ |
| 7 | Field testing | ⏳ |

## Tech

TypeScript · Vite · MapLibre GL JS · OpenStreetMap data · Workbox service worker (PWA) · Vitest · GitHub Pages

## Running locally

```bash
npm install
npm run dev      # HTTPS dev server, also reachable from your phone on the same Wi-Fi
npm test
npm run build
```

## A note on AI assistance

This project is built with the help of an AI coding assistant (Claude). I direct the product and technical decisions, test on real hikes, and review the code.

## License

MIT. Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
