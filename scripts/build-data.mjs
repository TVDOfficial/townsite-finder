// Downloads and compacts the data bundled into the app:
//  - Australian state outlines (Natural Earth, 1:50m)
//  - Settlements (cities, towns, villages, hamlets) from OpenStreetMap
//  - Hospitals from OpenStreetMap
// Run with: npm run build-data
import { writeFile, mkdir } from "node:fs/promises";

const OUT = new URL("../src/data/", import.meta.url);
const UA = { "User-Agent": "townsite-finder/0.1 (data build script)" };
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const STATES = ["AU-NSW", "AU-VIC", "AU-QLD", "AU-SA", "AU-WA", "AU-TAS", "AU-NT", "AU-ACT"];

const round = (n) => Math.round(n * 1000) / 1000;
const roundCoords = (c) => (typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(roundCoords));

async function overpass(query) {
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (e) {
      console.warn(`  ${url} failed: ${e.message}`);
    }
  }
  throw new Error("All Overpass servers failed");
}

function parseTsv(text) {
  return text
    .trim()
    .split("\n")
    .map((l) => l.split("\t"));
}

async function states() {
  console.log("Downloading state outlines…");
  const res = await fetch(
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson",
    { headers: UA },
  );
  const fc = await res.json();
  const features = fc.features
    .filter((f) => STATES.includes(f.properties.iso_3166_2))
    .map((f) => ({
      type: "Feature",
      properties: { code: f.properties.iso_3166_2.replace("AU-", ""), name: f.properties.name },
      geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
    }));
  console.log(`  ${features.length} states/territories`);
  await writeFile(new URL("au-states.json", OUT), JSON.stringify({ type: "FeatureCollection", features }));
}

async function settlements() {
  console.log("Downloading settlements (this can take a minute)…");
  const q = `[out:csv(::lat,::lon,place,name,population;false;"\\t")][timeout:300];
area["ISO3166-1"="AU"][admin_level=2]->.au;
nwr["place"~"^(city|town|village|hamlet)$"](area.au);
out center;`;
  const types = { city: 0, town: 1, village: 2, hamlet: 3 };
  const rows = parseTsv(await overpass(q))
    .filter((r) => r.length >= 4 && r[0] && r[3])
    .map(([lat, lon, place, name, pop]) => {
      const p = parseInt((pop || "").replace(/[^0-9]/g, ""), 10);
      return [round(+lon), round(+lat), types[place], name, Number.isFinite(p) ? p : 0];
    })
    // Mainland + Tasmania only (drops external territories)
    .filter(([lon, lat]) => lon > 112 && lon < 154.5 && lat < -9 && lat > -44.5);
  console.log(`  ${rows.length} settlements`);
  await writeFile(new URL("settlements.json", OUT), JSON.stringify(rows));
}

async function hospitals() {
  console.log("Downloading hospitals…");
  const q = `[out:csv(::lat,::lon,name;false;"\\t")][timeout:180];
area["ISO3166-1"="AU"][admin_level=2]->.au;
nwr["amenity"="hospital"](area.au);
out center;`;
  const rows = parseTsv(await overpass(q))
    .filter((r) => r[0] && r[1])
    .map(([lat, lon, name]) => [round(+lon), round(+lat), name || "Hospital"])
    .filter(([lon, lat]) => lon > 112 && lon < 154.5 && lat < -9 && lat > -44.5);
  console.log(`  ${rows.length} hospitals`);
  await writeFile(new URL("hospitals.json", OUT), JSON.stringify(rows));
}

async function powerLines() {
  console.log("Downloading power lines (large, can take several minutes)…");
  // Download in 6° squares so each request stays small enough for the public servers.
  const elements = new Map();
  for (let w = 112; w < 154; w += 6) {
    for (let s = -44; s < -10; s += 6) {
      const q = `[out:json][timeout:300];way["power"="line"](${s},${w},${s + 6},${w + 6});out tags geom;`;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const json = JSON.parse(await overpass(q));
          json.elements.forEach((el) => elements.set(el.id, el));
          console.log(`  square ${w},${s}: ${json.elements.length} lines (total ${elements.size})`);
          break;
        } catch (e) {
          console.warn(`  square ${w},${s} attempt ${attempt} failed`);
          await new Promise((r) => setTimeout(r, 15000 * attempt));
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  // Each line: [kV, lon1, lat1, lon2, lat2, …] rounded to ~100 m, consecutive duplicates removed.
  const lines = [];
  for (const el of elements.values()) {
    if (!el.geometry) continue;
    const kv = Math.round(Number((el.tags?.voltage ?? "0").split(";")[0]) / 1000) || 0;
    const flat = [kv];
    let px, py;
    for (const { lon, lat } of el.geometry) {
      const x = round(lon), y = round(lat);
      if (x === px && y === py) continue;
      flat.push(x, y);
      px = x; py = y;
    }
    if (flat.length >= 5) lines.push(flat);
  }
  console.log(`  ${lines.length} power lines`);
  await writeFile(new URL("power-lines.json", OUT), JSON.stringify(lines));
}

await mkdir(OUT, { recursive: true });
const only = process.argv[2];
if (!only || only === "states") await states();
if (!only || only === "settlements") await settlements();
if (!only || only === "hospitals") await hospitals();
if (!only || only === "power") await powerLines();
console.log("Done.");
