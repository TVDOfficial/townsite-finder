// MapLibre 6 runs its tile worker from a separate file; serve it from /public.
import { copyFileSync, mkdirSync } from "node:fs";
const dir = new URL("../public/maplibre/", import.meta.url);
mkdirSync(dir, { recursive: true });
copyFileSync(new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url), new URL("maplibre-gl-worker.mjs", dir));
