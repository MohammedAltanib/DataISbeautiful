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
