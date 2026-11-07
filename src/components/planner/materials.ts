import * as THREE from "three";

// Procedural textures (no downloads) + shared materials, created once.

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true, srgb = true) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const noise = (c: CanvasRenderingContext2D, w: number, h: number, amt: number, n = 4000) => {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * amt;
    c.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${v})`;
    c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
};

let cache: ReturnType<typeof build> | null = null;
export function mats() {
  return (cache ??= build());
}

function build() {
  // Corrugated iron: stripes used as a bump map (1 texture unit ≈ 1 m)
  const corrugated = canvasTex(64, 8, (c) => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    for (let i = 0; i <= 8; i++) { g.addColorStop(i / 8, i % 2 ? "#000" : "#fff"); }
    c.fillStyle = g; c.fillRect(0, 0, 64, 8);
  }, true, false);

  const weatherboard = canvasTex(64, 128, (c) => {
    c.fillStyle = "#fff"; c.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 128; y += 16) {
      const g = c.createLinearGradient(0, y, 0, y + 16);
      g.addColorStop(0, "#d9d9d9"); g.addColorStop(0.15, "#ffffff"); g.addColorStop(1, "#ececec");
      c.fillStyle = g; c.fillRect(0, y, 64, 16);
    }
  });

  const brick = canvasTex(128, 128, (c) => {
    c.fillStyle = "#cfc6b8"; c.fillRect(0, 0, 128, 128);
    const bw = 32, bh = 12;
    for (let row = 0; row < 128 / bh + 1; row++)
      for (let col = -1; col < 128 / bw + 1; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        const tone = 0.85 + Math.random() * 0.3;
        c.fillStyle = `rgb(${Math.round(255 * tone)},${Math.round(255 * tone * 0.97)},${Math.round(255 * tone * 0.95)})`;
        c.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
      }
    noise(c, 128, 128, 0.08, 1500);
  });

  const render = canvasTex(128, 128, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 128, 128); noise(c, 128, 128, 0.05, 3000); });

  const asphalt = canvasTex(64, 256, (c) => {
    c.fillStyle = "#3a3b3d"; c.fillRect(0, 0, 64, 256);
    noise(c, 64, 256, 0.18, 5000);
    c.fillStyle = "#f2f2f2"; c.fillRect(30, 20, 4, 90); c.fillRect(30, 148, 4, 90); // dashed centre line
    c.fillStyle = "#d9d9d9"; c.fillRect(2, 0, 2, 256); c.fillRect(60, 0, 2, 256); // edge lines
  });

  const gravel = canvasTex(64, 64, (c) => { c.fillStyle = "#a8865c"; c.fillRect(0, 0, 64, 64); noise(c, 64, 64, 0.3, 2500); });

  const grass = canvasTex(256, 256, (c) => {
    c.fillStyle = "#5d8f3a"; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"; c.fillRect(0, i * 32, 256, 32); }
    noise(c, 256, 256, 0.12, 9000);
  });

  const concrete = canvasTex(128, 128, (c) => { c.fillStyle = "#c9c6bf"; c.fillRect(0, 0, 128, 128); noise(c, 128, 128, 0.07, 4000); c.strokeStyle = "rgba(0,0,0,0.12)"; c.strokeRect(0, 0, 128, 128); });

  const carpark = canvasTex(128, 128, (c) => {
    c.fillStyle = "#3d3e40"; c.fillRect(0, 0, 128, 128); noise(c, 128, 128, 0.15, 3000);
    c.fillStyle = "#eee"; for (let x = 0; x < 128; x += 32) c.fillRect(x, 0, 2, 56);
  });

  const solar = canvasTex(128, 64, (c) => {
    c.fillStyle = "#16243b"; c.fillRect(0, 0, 128, 64);
    c.strokeStyle = "#9fb3cc"; c.lineWidth = 1;
    for (let x = 0; x <= 128; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 64); c.stroke(); }
    for (let y = 0; y <= 64; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(128, y); c.stroke(); }
  });

  // UVs are in metres, so repeat = 1 / (metres covered by one texture tile)
  corrugated.repeat.set(1.6, 1.6);
  weatherboard.repeat.set(0.8, 0.8);
  brick.repeat.set(1.1, 1.1);
  render.repeat.set(0.4, 0.4);
  gravel.repeat.set(0.35, 0.35);
  grass.repeat.set(0.08, 0.08);
  concrete.repeat.set(0.25, 0.25);
  carpark.repeat.set(0.1, 0.1);
  solar.repeat.set(0.4, 0.4);

  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  // Colorbond-style roof colours
  const roof = (color: string) => std({ color, metalness: 0.55, roughness: 0.42, bumpMap: corrugated, bumpScale: 1.2 });

  const windowGlass = new THREE.MeshPhysicalMaterial({
    color: "#1d2b38", metalness: 0.2, roughness: 0.06, clearcoat: 1, emissive: new THREE.Color("#ffc874"), emissiveIntensity: 0,
  });

  return {
    textures: { corrugated, weatherboard, brick, render, asphalt, gravel, grass, concrete, carpark, solar },
    roofs: {
      monument: roof("#3b3d40"), woodland: roof("#5c6157"), surfmist: roof("#e6e3da"), manor: roof("#7a2e2b"),
      paperbark: roof("#c9bfa6"), deepocean: roof("#2c3e50"), zinc: roof("#b9bcbf"),
    },
    weatherboard: (color: string) => std({ color, map: weatherboard, roughness: 0.8 }),
    brick: (color: string) => std({ color, map: brick, roughness: 0.9 }),
    render: (color: string) => std({ color, map: render, roughness: 0.85 }),
    plain: (color: string, roughness = 0.7, metalness = 0) => std({ color, roughness, metalness }),
    glass: windowGlass,
    clearGlass: new THREE.MeshPhysicalMaterial({ color: "#a8d8ff", metalness: 0, roughness: 0.02, transmission: 0.6, transparent: true, opacity: 0.45 }),
    metal: std({ color: "#c7cbd0", metalness: 0.85, roughness: 0.3 }),
    darkMetal: std({ color: "#2b2e33", metalness: 0.7, roughness: 0.4 }),
    white: std({ color: "#f4f2ec", roughness: 0.6 }),
    timber: std({ color: "#8b5a2b", roughness: 0.8 }),
    concrete: std({ color: "#ffffff", map: concrete, roughness: 0.95 }),
    asphalt: std({ color: "#ffffff", map: asphalt, roughness: 0.92 }),
    gravel: std({ color: "#ffffff", map: gravel, roughness: 1 }),
    grass: std({ color: "#ffffff", map: grass, roughness: 1 }),
    carpark: std({ color: "#ffffff", map: carpark, roughness: 0.95 }),
    solar: std({ color: "#ffffff", map: solar, metalness: 0.6, roughness: 0.25 }),
    water: new THREE.MeshPhysicalMaterial({ color: "#2f6f8f", roughness: 0.05, metalness: 0.1, clearcoat: 1 }),
    foliage: [std({ color: "#5b6e3a", roughness: 0.9 }), std({ color: "#6f7f45", roughness: 0.9 }), std({ color: "#4c5f33", roughness: 0.9 })],
    bark: std({ color: "#d8d2c4", roughness: 0.9 }),
    lamp: std({ color: "#fff6d8", emissive: new THREE.Color("#ffd27a"), emissiveIntensity: 0 }),
    red: std({ color: "#c62828", roughness: 0.5 }),
    blue: std({ color: "#1e4fa3", roughness: 0.5 }),
    green: std({ color: "#1f8f4e", roughness: 0.5 }),
    yellow: std({ color: "#f2b705", roughness: 0.5 }),
    ghostOk: new THREE.MeshBasicMaterial({ color: "#2ccf93", transparent: true, opacity: 0.35, depthWrite: false }),
    ghostBad: new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.4, depthWrite: false }),
    selected: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.25, depthWrite: false }),
  };
}

/** Night lighting: windows and lamps glow. */
export function setNight(amount: number) {
  const m = mats();
  m.glass.emissiveIntensity = amount * 1.6;
  m.lamp.emissiveIntensity = amount * 3;
}
