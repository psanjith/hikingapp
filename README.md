# Hiking App

A free hiking map for your phone that keeps working when you lose signal.

Live: https://psanjith.github.io/hikingapp/

I got into hiking recently, mostly around Vancouver and the North Shore, and every app that does offline maps and GPX files properly either costs money or is confusing to use. My friends weren't going to pay for one, so I made my own. The main point is safety: knowing where you are when there's no cell service.

It's a web app, not something from the App Store. You open the link, add it to your home screen, and from then on it works like a normal app.

What it does right now:

- download a map of any Canadian province (plus Yukon and the NWT, and smaller areas around Vancouver) and use it offline
- show where you are, which way you're facing, and how accurate the GPS is
- load a GPX file for a trail and warn you if you wander off it
- record your hike with pause and resume, saved as you go so a crash doesn't lose it
- keep a history of your hikes, export them as GPX, and back everything up to one file
- a compass that also shows your coordinates, in case you ever need to tell someone where you are

Some notes on how it works, if you're curious:

The maps are OpenStreetMap data from Protomaps. A GitHub Action cuts each province out of the planet file every month and puts them on Cloudflare R2. The app downloads them in the background, stores them on the phone (Origin Private File System), and MapLibre draws them.

Phone GPS is noisier than you'd think, especially under trees or indoors. Positions go through a small Kalman filter, and the recorder ignores movement smaller than the GPS error, so your distance doesn't keep climbing while you sit at the top eating lunch.

Phones stop GPS for web apps when the screen locks, so the app keeps the screen on while recording. Bring a power bank. A native version would fix this, and the code is set up so that should be possible later.

Your hikes are stored on your phone only. There's no account. If you care about your history, use the backup button now and then.

It's still early. I'm starting to test it with friends on real hikes, so expect rough edges, and please don't make it your only way of finding your way.

To run it locally:

```
npm install
npm run dev
npm test
```

The dev server uses HTTPS so you can open it on your phone over Wi-Fi, since browsers only allow GPS on HTTPS.

I built this with a lot of help from an AI coding assistant (Claude). I decided what to build and how it should work, tested it on my own phone, and worked through the problems that came up on real walks.

Map data © OpenStreetMap contributors. MIT license.
