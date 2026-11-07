# Townsite

Find a random spot in Australia that's well away from existing towns, see what it would take to build a town there, then plan it in 3D.

**Live site:** https://townsite-finder.vercel.app

## Features

- **Finder** (`/`): pick a state and a minimum distance from towns, then hit *Find me a spot*. Rejected points flash on the map before it flies to the winner.
- **Easiest spot mode**: scores 40 random candidates on power, water, roads, rainfall, slope and likely land type, and picks the easiest for your town size. Runners-up are shown so you can compare.
- **Spot details**: terrain and slope map, water nearby, roads, power lines, nearest town, city and hospital, climate, photos, an estimated land type and price, native title, a difficulty score, and step-by-step guides for buying the land and building a town.
- **Share links**: every spot has its own URL (`/?lat=…&lng=…&size=…`).
- **Google Earth and Google Maps buttons** for every spot.
- **Town planner** (`/plan`): about 7 × 7 km of real terrain with the satellite photo draped over it.
  - 46 buildings across Housing, Community, Commercial, Industry, Utilities, Transport and Nature, each with a build cost, a yearly running cost and who pays it.
  - Straight or curved roads (press C). Roads that cross or meet become junctions, and you can turn any junction into a roundabout or traffic lights.
  - Auto-generated Australian street names you can rename, shown on street signs.
  - Click anything to select it, then rotate (R), move (M) or delete it. Ctrl+Z undoes.
  - Grid snapping (G) with a grid drawn on the terrain.
  - An adjustable square town boundary with area and estimated land cost.
  - Capacity meters for power, water, sewage, school places, healthcare, police and fire, groceries, internet and jobs.
  - A budget panel with build cost, running cost per year or month, who pays, and council rates income.
  - **Alive** mode: cars drive the roads (on the left) and people walk between homes, shops and parks.
  - **Report**: a printable town plan report (Print / Save as PDF) with a 3D snapshot, site assessment, site plan, schedules, services, budget and approvals pathway.
  - **Saving**: towns autosave in your browser. *Towns* lists them and lets you export or import a file, or copy a share link.
- **Walk and fly**: *Walk*, then WASD to move, F to fly, Shift for super speed.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

`npm install` also copies MapLibre's tile worker into `public/maplibre/` (the `postinstall` script).

## Data

Bundled in `src/data/`, refreshed with `npm run build-data` (or `npm run build-data -- power` for one part):

| File | Source |
|---|---|
| `au-states.json` | Natural Earth 1:50m |
| `settlements.json`, `hospitals.json`, `power-lines.json` | OpenStreetMap via Overpass |

Fetched live, per spot:

| What | Source |
|---|---|
| Parks and reserves | CAPAD 2024 (DCCEEW ArcGIS service) |
| Property parcels (lot/plan, tenure, area, outline) | Queensland and NSW cadastre services |
| Nearby buildings (homesteads, sheds) | Overture Maps buildings, incl. Microsoft ML footprints (PMTiles on S3) |
| Native title | National Native Title Tribunal ArcGIS service |
| Elevation | Open-Meteo (Copernicus 90 m) in the finder; AWS Terrain Tiles in the planner |
| Climate (2015–2024) | Open-Meteo ERA5 archive |
| Water, roads, rail, airfields | OpenFreeMap vector tiles |
| Council name | OpenStreetMap via Overpass (often busy; skipped after 6 s) |
| Photos | Wikimedia Commons (+ Mapillary if `MAPILLARY_TOKEN` is set) |
| Satellite imagery | Esri World Imagery |

No API keys are needed. Optionally set `MAPILLARY_TOKEN` for more street-level photos.

API responses send `Cache-Control: s-maxage` headers so Vercel's CDN caches each spot.

## Limitations

- Almost all land in Australia is owned or leased. In Queensland and NSW the app shows the actual property parcel (and in Queensland its tenure); owner names need a paid title search. Other states still use the estimate below.
- Land type outside Queensland is a rule-based guess from state, rainfall and location. ABARES' national land tenure service is offline, so check the real parcel with the state viewer the app links to. Live state lookups are planned.
- Prices and build costs are rough ranges for curiosity, not quotes or advice.
- Post-processing (ambient occlusion, bloom) is disabled because `@react-three/postprocessing` and drei's `<Environment>` don't work with three r187.
