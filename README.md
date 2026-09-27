# Data Is Beautiful

An animated, Flourish-style world data story: upload a spreadsheet and get a world map + a bar-chart-race ranking panel, fully customizable, running entirely in the browser — **no backend, no build step, no server-side code.**

## Features

- **Upload Excel/CSV** — drop in a `.xlsx`/`.xls`/`.csv` file and columns (country, year, value, and even an image/logo column) are detected automatically. Supports both "long" format (`Country, Year, Value` rows) and "wide" format (one column per year, like World Bank exports). If detection isn't confident, a small dialog lets you map columns by hand.
- **World map with flags** — every country is filled with its own flag, clipped to its exact shape.
- **Bar-chart-race ranking panel** — fully customizable via the ⚙ settings panel: width, height, screen position (left/right), and orientation (horizontal rows or vertical race-style columns).
- **Per-entry name & image override** — click any country, then edit its name or upload a custom image; both changes show up everywhere that country appears (the ranking bar, tooltip, leader badge).
- **Zoom controls** — manual zoom in/out, an intensity slider for the automatic "zoom to the leader" effect, and a toggle to turn auto-zoom off entirely.
- **Custom chart annotations** — write free text directly onto the selected country's trend chart.
- **Video export** — record the animation as a high-bitrate WebM video directly from the browser (`⏺ تسجيل` button), no extra software required.
- **Light/dark theme toggle**, adjustable playback speed, and a draggable year scrubber.

## Map Studio (`maps.html`) — استوديو الخرائط

A separate, self-contained page built specifically for producing YouTube map videos. It shares no code or saved state with `index.html`.

- **Frame-exact MP4 export**: every frame is rendered at an exact timestamp and encoded with WebCodecs into MP4 (H.264 + AAC in Chrome/Edge, VP9/AV1 + Opus as a fallback). There's no screen recording, so no dropped frames, and you can export 1080p/1440p/4K at 30 or 60 fps. Falls back to real-time WebM capture on browsers without WebCodecs.
- **Flat map or 3D globe**, with Natural Earth 50m or 10m (high-detail) borders.
- **Cinematic camera**: smooth van Wijk "fly-to" moves, automatic leader tracking with a minimum shot length, a fixed region view (Arab world, GCC, MENA, continents…), or hand-directed scenes (year → country/region + zoom). Also a slow Ken Burns push-in and a wide closing shot.
- **Map fill**: choropleth by value (sequential palettes, log scale), flags for the leaders, or flags everywhere. Leader glow, pulse beacon and floating name/value labels.
- **Bar-chart race** with smooth rank swaps, RTL (Arabic) or LTR direction, and per-country name/color overrides.
- **Storytelling**: animated intro title card, "new #1" banner, timeline event call-outs, final hold, and a subscribe outro with your channel logo.
- **Channel branding and audio**: logo watermark, background music with fade-out, and built-in synthesized sound effects (whoosh, chime, click) mixed into the export.
- **Formats**: 16:9 (YouTube), 9:16 (Shorts/Reels/TikTok) with a safe-area overlay, 1:1 and 4:5.
- **Arabic-first**: Arabic country names, Arabic-Indic digits, Arabic number abbreviations (ألف/مليون/مليار), Arabic fonts, and Arabic/English name matching for uploaded files.
- **Projects**: autosaved in the browser, plus save/open as a `.json` project file. Export the current frame as a PNG for your thumbnail.

```
maps.html              Map Studio page
css/maps.css           studio UI styles
js/maps/studio.js      UI, state, preview loop
js/maps/engine.js      canvas renderer, camera + timeline (pure function of time)
js/maps/data.js        spreadsheet parsing, column detection, country-name matching
js/maps/countries.js   ISO code + continent tables
js/maps/audio.js       music + synthesized sound effects (preview and export mix)
js/maps/exporter.js    WebCodecs → MP4 export, WebM fallback, PNG frames
```

## Running locally

This is a static site — any local web server works (a plain `file://` double-click won't, because the browser blocks the dataset `fetch()` from a local file). Pick one:

```bash
# Node
npx serve .

# Python
python -m http.server 8000
```

Then open the printed `http://localhost:...` URL.

## Deploying

Push to GitHub and enable **Settings → Pages → Deploy from a branch → `main` / `(root)`**. No build step is needed — `index.html`, `css/`, `js/` and `data/` are served as-is.

## Project structure

```
index.html            entry page — markup only
css/story.css          all styling
js/app.js              D3-based rendering, data pipeline, upload handling, video export
data/sample-retirement-age.csv   default dataset (OECD average retirement age, 1990–2024)
```

## Customizing the default dataset

Open `js/app.js` and edit the `SETTINGS` object at the top — labels, colors, playback speed, and the default bar layout are all there. To ship a different default dataset, replace `data/sample-retirement-age.csv` and update `SETTINGS.columns` to match its headers (or just leave a visitor to upload their own file — that always works, regardless of what's in `SETTINGS`).

## Credits

Built with [D3.js](https://d3js.org/), [topojson](https://github.com/topojson/topojson), the [Natural Earth](https://www.naturalearthdata.com/) 110m world atlas, [SheetJS](https://sheetjs.com/) for spreadsheet parsing, and flag icons from [flagcdn.com](https://flagcdn.com/).
