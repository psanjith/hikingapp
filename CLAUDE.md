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
- **Commit messages: no `Co-Authored-By: Claude` (or any AI attribution) lines.** The AI assistance is disclosed in the README; interviewers expect it anyway.
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
- **How it's built (Stage 2):** regions are defined in `maps/regions.json` and cut from the daily Protomaps planet build with `pmtiles extract` at max zoom 14 (`scripts/build-maps.mjs`). The `maps.yml` workflow rebuilds monthly, **one region at a time** (extract → upload → delete, to fit the runner's disk; one pinned Protomaps build per run via `--build`), to R2 as `regions/<id>/<YYYYMMDD>.pmtiles` (immutable) plus `catalog.json` (uploaded last, 5-min cache). Keeps the two newest versions per region.
- **Coverage (extended 2026-10-24):** Lower Mainland & Sea-to-Sky (bbox, 59 MB), Vancouver Island (bbox, 102 MB), and every **province plus Yukon and NWT**, cut by outlines in `maps/provinces/` made from Natural Earth admin-1 (public domain; simplified, buffered 5 km) by `scripts/make-province-outlines.mjs`. Measured (dry run, Oct 2026): PEI 13 MB, NB 86, NS 96, Yukon 176, SK 231, MB 365, NL 372, AB 475, NWT 855, BC 944, ON 1.1 GB, QC 1.4 GB — ~6.1 GB total; ~12 GB on R2 with two versions (a few cents/month past the free 10 GB). **Nunavut deliberately left out** (2.5 GB, very few trails; owner's choice). Province entries have `online: true`: the app streams all of them when online (`TileRouter.setOnlineSources`), trying each whose box covers a tile, since provinces are cut on borders. The Maps sheet lists regions near the hiker first ("Near you", by bounding box). First all-Canada build published 2026-10-24 (6.3 GB, ~5 min on Actions); verified live: Banff streams with nothing downloaded, and Alberta/Lower Mainland list first in Banff/Vancouver.
- **In the app:** downloads run in a Web Worker writing to OPFS with sync access handles, resumable via HTTP Range. IndexedDB records only fully-verified downloads. A custom MapLibre protocol (`hike://`, `TileRouter`) serves tiles from downloaded regions first, then streams the all-BC file from R2 when online. Style = Protomaps "light" + custom bold trail layers; fonts/sprites are bundled in `public/basemap` and precached.
- Local dev: `node scripts/build-maps.mjs --out public/dev-maps --only lower-mainland` and `VITE_MAPS_BASE_URL=/hikingapp/dev-maps/` in `.env.local`.

**GPX import (Stage 3):**
- `src/gpx/parseGpx.ts` reads GPX 1.0/1.1 by element local name (namespace-agnostic): each `<trkseg>` and `<rte>` becomes a separate line (no fake straight lines across gaps), `<wpt>` become labelled markers. Bad points are skipped; non-GPX files get a plain-language `GpxError`. Tests run under jsdom for `DOMParser`.
- Routes are saved in IndexedDB (`routes` store, DB v2) behind a `RouteStore` interface; one route is "active" (shown) at a time, remembered in localStorage. Only one so the map stays simple and the future off-route alert has a single trail to compare against.
- After import the map fits the route and stops "follow me". `OfflineMaps.coverageFor(bounds)` warns if no downloaded region contains the route and suggests the smallest catalog region that does.
- The file input has no `accept` filter on purpose: iOS greys out `.gpx` files when one is set. Contents are validated instead.
- Verified on iPhone (Oct 2026): import from Files, route drawn and zoomed to.

**Position smoothing:**
- All location goes through `smoothLocationSource` (`src/location/smoothing.ts`): a Kalman filter weighting each reading by its accuracy (assumed max speed 3 m/s for the prediction step). Vague readings barely move the dot; sharp ones move it almost fully; a sharp (≤ ±20 m) reading > 3σ away is treated as real movement and followed immediately. The reported accuracy stays the GPS's raw figure (never look more certain than we are). Indoors GPS is inherently ±20–100 m; outdoors ±3–10 m (±10–30 m under canopy) — no app can beat the phone's chip.

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

**Sharing (added after Stage 6, at the owner's request):**
- Recorded hikes are largely for **showing off on social media**. "Share image" (past-hike card, and the "Hike saved" toast) renders a **transparent 1080 px-wide PNG** of the route shape + optional distance/time (`src/share/shareImage.ts`, canvas), white or black with a contrasting soft shadow so it reads on any photo. **Copy image** (async Clipboard API, paste as a sticker) or **Save image** (share sheet). Route fitting shared with list thumbnails (`src/map/fitTrack.ts`).

**Background recording / native app (discussed 2026-10-19):**
- The owner sees "you must keep the app open" as a **safety issue**. No web app can get location with the screen locked or in the background (iOS stops it for all websites incl. Home Screen apps; Android browsers too). The only real fix is a **native app via Capacitor** + a background-location plugin (free option: `@capacitor-community/background-geolocation`), with the existing `LocationSource`/`HikeStore`/files interfaces swapped for native ones.
- Decision for now: **not yet** — stay a web app. Owner is **undecided on Apple's Developer Program ($99 USD/yr)**, needed for TestFlight/App Store; a free Apple ID can run it on their own iPhone (re-install every 7 days). Android: $25 Play fee or sideload.
- Meanwhile the limit is made unmissable: a one-time "Before you start" screen on first Start hike (`src/ui/recordIntro.ts`), a line in the checklist's safety note, the recording status line, and a toast after the app was backgrounded.

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

## Future ideas (not scheduled)

- **Built (2026-10-24): pace-aware turnaround alert ("hero" feature).** Positioning: *"the hiking app that gets beginners home before dark."*
  - `src/safety/sun.ts`: sunset via NOAA solar equations (tested against published Vancouver times ±3 min; compared as exact instants, since B.C. may now be on permanent daylight time — the app just uses the phone's time zone).
  - `src/safety/hikingTime.ts`: Tobler's hiking function over 25 m steps of a 50 m-smoothed elevation profile (GPS altitude from recorded points; `<ele>` from GPX routes, now parsed into `SavedRoute.elevations`); missing elevations interpolated, none = flat.
  - `src/safety/turnaround.ts`: personal pace factor = actual time / Tobler time (trusted after 500 m and 10 min; default 1.3 before), ×1.15 fatigue on the way back. **Turn-around-by = now + slack / (1 + r)** where slack = (sunset − 30 min) − now − time back, r = back/out time ratio — every extra minute out also adds to the way back (the first design's "slack" alone overstated it ~2×). Modes: out-and-back, returning (way back = outward leg from the nearest point, reversed), loop (route ending ≤ 300 m from the start: continue vs go back), destination (one-way route: reach the end, then back). Shown from the first minute.
  - `src/safety/turnaroundText.ts`: hike-bar line (green / amber < 60 min / red < 15 min), start-of-hike daylight message, one-shot alerts at 30 min, 10 min, "turn around now", loop-too-long and back-after-sunset. `src/ui/daylightCoach.ts` recomputes every ≤ 5 s on fixes and every 15 s regardless.
  - Verified with unit tests and a fake-clock Playwright hike starting 5:10 pm (alerts and recalibration behaved as designed). Loop/destination paths are unit-tested only; not yet field-tested.
  - **Total climb is shown** (hike bar, My hikes, past-hike card, share image; `elevationChange` in `hikingTime.ts`): 25 m-smoothed GPS altitude, counted turning point to turning point with a 4 m dead band (tests: 300 m climb ±5%, flat ground with ±8 m noise adds < 20 m). Saved as `climbMeters`/`descentMeters` on finish; older hikes filled in lazily; hidden (not zero) when the phone gives no altitude. **Still to validate on a real hike with a known climb** (e.g. Grouse Grind ≈ 850 m). Battery moved from the big stats to a small label beside the status line.
- **Hiker's toolkit additions** (owner's vision; deferred on 2026-10-19 in favour of real-user testing): daylight left + turnaround reminder, emergency screen (call 911, text my location), trip plan to a friend, elevation.

## Where we left off (2026-10-19)

- Stages 1–6 done and deployed, plus: direction cone + compass screen with coordinates, Kalman position smoothing, live tail on the recorded line, GPS stall recovery + "GPS details" screen (tap the GPS chip).
- **Priority now: real-user testing (Stage 7), no new features.** The owner is sharing the link with friends; a draft tester message was written.
- **Still unconfirmed on a real iPhone:** (1) GPS no longer freezing on a walk (stall-recovery fix); (2) whether the direction cone is ~16° off because phones report magnetic north while the map is true-north-up (if so, add a declination correction for the cone, not the compass screen); (3) GPX/backup export via the iOS share sheet; (4) Kalman smoothing feel indoors/outdoors.
- `main.ts` is ~450 lines of wiring; split into setup modules before Stage 8.

## Resume / repo goals

- **README** in the owner's own voice: plain and simple, written like a person, **no emoji, light structure** (heavy organisation "kills the vibe"). Live link, why I built it, what it does, a few notes on how it works, honest note on AI assistance. Screenshots can be added later.
- Clean commit history; a few tests for core logic (distance calculation, jitter filter, GPX parsing/export).
- Eventually track real usage numbers (e.g. "X friends, Y hikes, Z km logged") for the resume.
- Highlight hard problems solved: offline maps, GPS noise filtering, crash-safe recording, no-signal operation.
