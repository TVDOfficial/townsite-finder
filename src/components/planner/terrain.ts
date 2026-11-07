// Builds a real-world terrain patch around a point: heights from AWS Terrain Tiles
// (terrarium encoding, ~10–30 m source data) and a satellite texture from Esri.

const Z_HEIGHT = 14; // 3×3 tiles ≈ 6–7 km square
const Z_IMAGE = 16; // 12×12 imagery tiles → 3072 px texture (~2.4 m/px)
const TILES = 3;
const PX = 256;

export interface TerrainData {
  size: number; // metres across
  tileM: number;
  heights: Float32Array; // (TILES*PX)² grid, metres relative to the spot
  gridN: number;
  center: [number, number]; // world x/z of the terrain mesh centre
  baseElevation: number; // metres above sea level at the spot
  image: HTMLCanvasElement;
  heightAt: (x: number, z: number) => number;
  inBounds: (x: number, z: number, margin?: number) => boolean;
}

function lngLatToTile(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function loadTerrain(lng: number, lat: number, onProgress: (p: number) => void): Promise<TerrainData> {
  const f = lngLatToTile(lng, lat, Z_HEIGHT);
  const ox = Math.floor(f.x) - 1, oy = Math.floor(f.y) - 1;
  const sx = f.x - ox, sy = f.y - oy; // spot position in tile units inside the 3×3 patch
  const tileM = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** Z_HEIGHT;
  const gridN = TILES * PX;

  const total = TILES * TILES + (TILES * 4) ** 2;
  let done = 0;
  const tick = () => onProgress(++done / total);

  // --- Heights ---
  const hCanvas = document.createElement("canvas");
  hCanvas.width = hCanvas.height = gridN;
  const hCtx = hCanvas.getContext("2d", { willReadFrequently: true })!;
  const heightJobs: Promise<void>[] = [];
  for (let ty = 0; ty < TILES; ty++)
    for (let tx = 0; tx < TILES; tx++)
      heightJobs.push(
        loadImage(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z_HEIGHT}/${ox + tx}/${oy + ty}.png`)
          .then((img) => hCtx.drawImage(img, tx * PX, ty * PX))
          .finally(tick),
      );

  // --- Satellite imagery ---
  const scale = 2 ** (Z_IMAGE - Z_HEIGHT);
  const n = TILES * scale;
  const image = document.createElement("canvas");
  image.width = image.height = n * PX;
  const iCtx = image.getContext("2d")!;
  iCtx.fillStyle = "#8a7a5a";
  iCtx.fillRect(0, 0, image.width, image.height);
  const imageJobs: Promise<void>[] = [];
  for (let ty = 0; ty < n; ty++)
    for (let tx = 0; tx < n; tx++)
      imageJobs.push(
        loadImage(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z_IMAGE}/${oy * scale + ty}/${ox * scale + tx}`)
          .then((img) => iCtx.drawImage(img, tx * PX, ty * PX))
          .catch(() => {})
          .finally(tick),
      );

  await Promise.all(heightJobs);
  const px = hCtx.getImageData(0, 0, gridN, gridN).data;
  const raw = new Float32Array(gridN * gridN);
  for (let i = 0; i < raw.length; i++) raw[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;

  const sample = (arr: Float32Array, u: number, v: number) => {
    const x = Math.max(0, Math.min(gridN - 1.001, u * PX - 0.5));
    const y = Math.max(0, Math.min(gridN - 1.001, v * PX - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i = y0 * gridN + x0;
    return (arr[i] * (1 - fx) + arr[i + 1] * fx) * (1 - fy) + (arr[i + gridN] * (1 - fx) + arr[i + gridN + 1] * fx) * fy;
  };
  const baseElevation = sample(raw, sx, sy);
  const heights = raw.map((h) => h - baseElevation);

  const heightAt = (x: number, z: number) => sample(heights, x / tileM + sx, z / tileM + sy);
  const half = (TILES / 2) * tileM;
  const center: [number, number] = [(TILES / 2 - sx) * tileM, (TILES / 2 - sy) * tileM];
  const inBounds = (x: number, z: number, margin = 20) =>
    Math.abs(x - center[0]) < half - margin && Math.abs(z - center[1]) < half - margin;

  await Promise.all(imageJobs);
  return { size: TILES * tileM, tileM, heights, gridN, center, baseElevation, image, heightAt, inBounds };
}
