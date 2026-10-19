# Project Brief: Free Beginner-Friendly Hiking App

This file is the handoff from a planning conversation. Read it fully before writing code. It covers what we're building, why, the decisions already made, and how the owner wants to work.

---

## About the owner and why this exists

- I've gotten really into hiking recently. Existing apps that offer offline maps + GPX import (Gaia GPS, AllTrails, CalTopo, Komoot, etc.) are either **paid** or have a **bad/confusing interface**.
- I want a **free, extremely beginner-friendly** alternative. The **main purpose is safety**: helping people not get lost, especially with no cell signal.
- I already have real users: **myself and my friends**, who don't want to pay for a hiking app. They'll use this on actual hikes. My **hiking club** is likely to adopt it too, and it may grow beyond that — design for that scale, not just a handful of friends.
- This is also meant to be a **resume project**. It targets a real problem, has real users, and it's something I genuinely care about.
- I'm based in Vancouver, BC, so the first map region that matters is **British Columbia** (North Shore / Lower Mainland trails especially).
- I decided a native app is more trouble than it's worth **for now**. I want a **web app** people can use without an app store, with the option to turn it into a real app later.

## How I want you to work with me

- **You write all of the code.** Don't give me exercises or ask me to make changes myself.
- **Build in stages**, getting each one working before moving on (see Build Plan below).
- **After each stage, explain in plain English**: what the code does, the general idea, how you executed it, and *why* you made each key choice. I need to be able to talk confidently about this project in interviews, including questions like "walk me through how recording works," "why did you store hikes that way," or "what happens if GPS drops out."
- Point out anything that's a good "interview talking point" (real engineering problems and tradeoffs).
- I'll be upfront that the project was built with AI assistance, so keep the code clean and well-organized — it should look professional to anyone browsing the repo.
- Be honest with me about limitations and tradeoffs rather than overselling.

---

## Product: Version 1 scope

**In scope (v1):**
1. **Offline map** of a downloadable region (e.g. a province/state, not a whole country — Canada as one file would be several GB).
2. **Live location** (blue dot) — GPS works without internet.
3. **GPX import** — load a trail's GPX file and draw it on the map.
4. **Record your hike** — save GPS points as you walk and draw your trail.
5. **Distance walked.**
6. **Pause / resume** a hike. While paused, the map stays **fully usable** and live location still shows; pausing only stops adding points to the recording. On resume, start a new track segment (GPX supports segments).
7. **Saved hike history** stored in the app, with a map of each hike, and **export as GPX** (also a backup/sharing method).

**Explicitly deferred (later):**
- Elevation gain (I said elevation "can come later"). When we do it: raw phone GPS altitude is noisy and overcounts gain, so it'll need smoothing and/or correction against terrain elevation data (DEM).
- Contour lines / terrain shading (optional extra download, adds size).
- Strava integration (see notes below).
- Sharing hikes with others beyond exporting GPX / images.
- **Accounts & cloud sync → Stage 8** (decided Oct 2026, after v1 is field-tested). Until then durability comes from a one-tap backup file (see Hike history).
- Wrapping into a real native app (Capacitor).

**Beginner-friendly ideas (good differentiators — keep in mind):**
- Dead-simple UI and onboarding, plain-language stats.
- "You're off the trail" alert when drifting from the imported GPX route (works offline).
- Battery % shown on the hike screen + low-battery warning.
- Turnaround-time reminders (future).

---

## Technical decisions so far

**Platform: Progressive Web App (PWA) hosted free on GitHub Pages.**
- Repo: `psanjith/hikingapp`, served at `https://psanjith.github.io/hikingapp/`.
- Friends open the link once, then **"Add to Home Screen"** — it gets an icon, opens full screen, and updates when I push changes.
- Must work on both **Android and iPhone**. The owner tests on an **iPhone 16 Pro**, so iOS Safari is the primary test target.

**Stack:** TypeScript + Vite, plain DOM (no UI framework), MapLibre GL JS, `vite-plugin-pwa` (Workbox) for the service worker, Vitest for core-logic tests. The owner knows Python and JS/TS.

**Offline support:**
- Use a **service worker** to cache all app files so the app opens with no internet after the first visit.
- Storage: **IndexedDB** (via `idb`) for hikes and GPS points (small transactional writes, crash-safe); **OPFS** for large map region files (random-access byte-range reads for PMTiles).
- **First open requires internet** to load the app and download a map region (ideally at home on Wi-Fi).
- **iPhone caveat:** Safari can evict data for websites not visited recently; home-screen-installed apps are treated as more persistent. The app should **prompt users to Add to Home Screen**. Consider requesting persistent storage (`navigator.storage.persist()`).
- Clearing browser data wipes maps/hikes → the **GPX export** button is the safety net.
- **Safari Private Browsing has no OPFS** (`getDirectory()` throws `UnknownError`), so maps can't be saved there; the Maps sheet detects this and says so. Verified on iPhone (Oct 2026): installed to Home Screen, Lower Mainland downloaded, airplane mode → map + GPS (±17 m outdoors) work. Indoors in airplane mode iOS often reports "position unavailable" (no Wi-Fi/cell assistance); that's expected.
- Show clear errors if a map download fails due to storage space.
- Test: put a phone in **airplane mode** and confirm the app opens with map + location. (Good interview detail.)

**Maps:**
- Use **OpenStreetMap** data (free) rendered with **MapLibre GL JS**. Avoid paid per-view providers (Google, Mapbox).
- **Protomaps / PMTiles** for single-file regional map downloads.
- **Hosting map files: Cloudflare R2** (free egress, 10 GB free storage; requires a card on file). Chosen over GitHub Pages because Pages has a 1 GB site cap and a 100 GB/month soft bandwidth cap, which a club-sized user base could exceed. A custom domain on R2 is recommended for production (the `r2.dev` URL is rate-limited). Maps should be regenerated periodically (e.g. monthly) since trails change.
- Keep regions small and selectable (e.g. BC, or even Lower Mainland).
- **How it's built (Stage 2):** regions are defined in `maps/regions.json` and cut from the daily Protomaps planet build with `pmtiles extract` at max zoom 14 (`scripts/build-maps.mjs`). Measured sizes (Oct 2026): Lower Mainland & Sea-to-Sky 59 MB, Vancouver Island 102 MB, all of BC 951 MB. The `maps.yml` workflow rebuilds monthly and uploads to R2 as `regions/<id>/<YYYYMMDD>.pmtiles` (immutable) plus `catalog.json` (uploaded last, 5-min cache). Keeps the two newest versions per region.
- **In the app:** downloads run in a Web Worker writing to OPFS with sync access handles, resumable via HTTP Range. IndexedDB records only fully-verified downloads. A custom MapLibre protocol (`hike://`, `TileRouter`) serves tiles from downloaded regions first, then streams the all-BC file from R2 when online. Style = Protomaps "light" + custom bold trail layers; fonts/sprites are bundled in `public/basemap` and precached.
- Local dev: `node scripts/build-maps.mjs --out public/dev-maps --only lower-mainland` and `VITE_MAPS_BASE_URL=/hikingapp/dev-maps/` in `.env.local`.

**GPX import (Stage 3):**
- `src/gpx/parseGpx.ts` reads GPX 1.0/1.1 by element local name (namespace-agnostic): each `<trkseg>` and `<rte>` becomes a separate line (no fake straight lines across gaps), `<wpt>` become labelled markers. Bad points are skipped; non-GPX files get a plain-language `GpxError`. Tests run under jsdom for `DOMParser`.
- Routes are saved in IndexedDB (`routes` store, DB v2) behind a `RouteStore` interface; one route is "active" (shown) at a time, remembered in localStorage. Only one so the map stays simple and the future off-route alert has a single trail to compare against.
- After import the map fits the route and stops "follow me". `OfflineMaps.coverageFor(bounds)` warns if no downloaded region contains the route and suggests the smallest catalog region that does.
- The file input has no `accept` filter on purpose: iOS greys out `.gpx` files when one is set. Contents are validated instead.
- Verified on iPhone (Oct 2026): import from Files, route drawn and zoomed to.

**Recording & distance:**
- Save a GPS point every few seconds (lat, lon, time, accuracy).
- **Filter GPS jitter**: skip points within a few metres of the last one and/or with poor accuracy, so distance doesn't creep up while standing still.
- Distance = sum of distances between consecutive kept points (haversine).
- **Save points to storage as they arrive**, not only at the end, so a crash or dead battery doesn't lose the hike.
- **Known web limitation:** browsers (especially iOS Safari) can stop GPS when the screen locks or the app is backgrounded. Most reliable approach for v1: **keep the screen on during recording** (Screen Wake Lock API) and tell users to bring a power bank. Be upfront in the UI about this.
- **How it's built (Stage 4):** `Recorder` (`src/recording/recorder.ts`) is a start → pause ⇄ resume → finish state machine that depends only on the `LocationSource` and `HikeStore` interfaces (tested with a fake GPS + in-memory store). `filterFix` (pure) keeps a fix only if accuracy ≤ 40 m and it moved ≥ clamp(accuracy/2, 5, 15) m; a >60 s silence followed by a >100 m jump starts a new segment and isn't counted. IndexedDB (DB v3): `hikes` summaries + `points` keyed `[hikeId, seq]`, each point written with the updated summary in one transaction, through a serial write queue. Resume = new segment. On launch, an unfinished hike is restored **paused** (active time counted only up to its last saved point). Wake lock only while recording; battery shown only where `navigator.getBattery` exists (not iOS). A toast explains gaps after the app was backgrounded > 30 s. Hikes with < 2 points are discarded on Finish.

**Hike history & backup (Stage 5):**
- The owner wants a lasting record of all hikes. Hikes live only on the phone (IndexedDB), so a **backup file** is the durability story: "Back up all hikes" writes one JSON file (`src/history/backup.ts`, format `hikingapp-backup` v1, points packed as `[segment, lat, lon, time, accuracy, altitude]`, includes imported routes) via the share sheet → iCloud Drive/Files. "Restore" merges it in, skipping hikes already present (idempotent). The "My hikes" sheet shows how many hikes aren't backed up yet (last backup time in localStorage).
- Export one hike as GPX 1.1 (`src/gpx/writeGpx.ts`): one `<trkseg>` per segment, time + elevation per point; round-trip tested against our parser.
- Files go out through `src/device/files.ts`: Web Share with files where supported (iOS), else a download. If the tap's permission lapsed while the file was prepared, a toast asks for one more tap.
- Each finished hike stores a ~60-point `preview` for list thumbnails (SVG, no map tiles); older hikes get one lazily.
- Viewing a past hike draws it in pink on the main map with a bottom card (Export / Rename / Delete). New hikes are named "Morning/Afternoon/Evening hike".

**Safety polish (Stage 6):**
- **Off-route alert** (`src/routes/offRoute.ts`, pure + tested): distance to the active route via point-to-segment on a local flat projection. `OffRouteMonitor` arms only after the hiker has been within 30 m (no alerts at home), subtracts GPS accuracy, needs > 50 m for 15 s to alert, and < 30 m to clear (hysteresis). Banner with live distance + "Show me" (frames you and the nearest route point); vibrates on Android (iOS can't).
- **Battery:** `BatteryWarnings` warns once each at 30/20/10% while not charging (Android). iPhone has no battery API, so every 2 h of recording a toast says to check it.
- **"Get ready to hike" checklist** (`src/ui/readyPanel.ts`): first launch + "?" button. Install to Home Screen (Android: real install prompt via `beforeinstallprompt`; iOS: Share → Add to Home Screen steps), download a map, allow location, optional route, plus a short safety note. Browser-tab users get an install tip at most daily.
- `navigator.storage.persist()` on launch when installed, on map download, and on hike start.
- **Direction cone** on the blue dot (`src/device/compass.ts`): iOS `webkitCompassHeading` (needs `DeviceOrientationEvent.requestPermission()`, which iOS only honours during a tap, so it's asked on the first tap anywhere after every launch, plus on locate / Start hike / compass, and as a checklist step), Android `deviceorientationabsolute` (heading = 360 − alpha), plus screen rotation; smoothed the short way round north. Without a compass it shows GPS direction of travel, only while moving (≥ 0.7 m/s). Hidden when the position is stale.
- **Compass screen** (`src/ui/compassPanel.ts`, compass button under "?"): turning SVG dial, degrees + plain-word direction, magnetic north like a real compass, and the hiker's coordinates (`49.32961° N, 122.94890° W`) with Copy, for 911/SAR. The owner's vision is for the app to be a **hiker's toolkit** with everything they need.

**Future-proofing for a native app:**
- Later we'll wrap the same code with **Capacitor** to make real Android/iOS apps (which fixes background recording).
- **Isolate GPS tracking and file/storage access behind clean interfaces/modules** so they can be swapped for native plugins later without rewriting the app.

**Strava (later, not v1):**
- Uploading a user's hikes to *their own* Strava account via the Strava API is feasible.
- Strava's **heatmap is not available** to third-party apps.
- Strava has tightened its API terms recently, including limits on displaying Strava data to anyone other than the account owner. **Check the current developer agreement before designing around Strava**, especially for any sharing features.

---

## Build plan (stages)

1. **App shell + map + live location** — PWA setup (manifest, service worker), MapLibre map, blue-dot location, app opens offline.
2. **Offline map regions** — download a region file, store it on-device, render it with no internet; storage-space handling.
3. **GPX import** — load a file, draw the trail on the map, zoom to it.
4. **Recording** — start / pause / resume / stop, live trail line, distance, jitter filtering, autosave as points arrive, wake lock, battery display.
5. **Hike history** — list of saved hikes with map + distance + date, view a past hike, export GPX.
6. **Polish & safety** — Add-to-Home-Screen prompt, persistent storage request, off-route alert, low-battery warning, clear beginner-friendly UI.
7. **Deploy** — GitHub Pages setup, airplane-mode testing, share link with friends. (A GitHub Actions deploy is set up from Stage 1 so every stage can be tested on a real iPhone over HTTPS.)
8. **Accounts & sync** (after field testing) — so hikes live in your account. Plan agreed so far: **optional** sign-in (the app stays fully usable without an account); the phone stays the primary copy and syncs when online (local-first, works with no signal); log in with a **6-digit email code**, not a magic link (iOS Home Screen apps don't share storage with Safari, so a link would sign in the wrong place); provider likely Supabase or Cloudflare D1 + Workers (free at club scale); needs a privacy policy and account/data deletion, since GPS tracks reveal where people live. Write up the design (provider, data model, sync/conflicts) for the owner's sign-off before coding.

## Resume / repo goals

- Professional **README**: screenshots, live link, "why I built this," list of technical decisions and tradeoffs, honest note on AI assistance.
- Clean commit history; a few tests for core logic (distance calculation, jitter filter, GPX parsing/export).
- Eventually track real usage numbers (e.g. "X friends, Y hikes, Z km logged") for the resume.
- Highlight hard problems solved: offline maps, GPS noise filtering, crash-safe recording, no-signal operation.
