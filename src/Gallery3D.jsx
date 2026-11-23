import React, { useEffect, useRef, useState, useMemo } from 'react';
import './gallery3d.css';

// Base fine-art archival exhibition metadata (from 3d.html)
const BASE_ARTWORKS = [
  {
    id: 0,
    title: 'Sierra Dawn Monolith',
    artist: 'Anselm Vance, 2024',
    size: '275 × 185 cm',
    medium: 'Archival Silver Gelatin Print',
    desc: 'Tác phẩm trung tâm tại hốc Bắc ghi lại khoảnh khắc bình minh chạm đỉnh núi tuyết Sierra Nevada dưới bầu trời tĩnh mịch.',
    pos: [0, 2.15, -9.67],
    rotY: 0,
    w: 2.75,
    h: 1.85,
    seed: 0,
    landscape: true,
    wallLabel: 'North Alcove'
  },
  {
    id: 1,
    title: 'Granite Cathedral I',
    artist: 'Anselm Vance, 2023',
    size: '175 × 245 cm',
    medium: 'Silver Gelatin on Baryta',
    desc: 'Những vách đá dựng đứng vươn thẳng vào tầng mây thấp, tôn vinh cấu trúc địa chất thô ráp qua dải sắc độ đen trắng sâu.',
    pos: [-3.17, 2.22, -3.5],
    rotY: Math.PI / 2,
    w: 1.75,
    h: 2.45,
    seed: 1,
    landscape: false,
    wallLabel: 'West Gallery Wall'
  },
  {
    id: 2,
    title: 'Veil of Mist, Yosemite',
    artist: 'Elena Rostova, 2024',
    size: '175 × 245 cm',
    medium: 'Platinum Palladium Print',
    desc: 'Dòng thác đổ qua hẻm núi đá trầm tích được phơi sáng chậm, biến chuyển động của nước thành dải lụa ánh sáng.',
    pos: [-3.17, 2.22, -0.4],
    rotY: Math.PI / 2,
    w: 1.75,
    h: 2.45,
    seed: 2,
    landscape: false,
    wallLabel: 'West Gallery Wall'
  },
  {
    id: 3,
    title: 'High Ridge Solitude',
    artist: 'Anselm Vance, 2023',
    size: '175 × 245 cm',
    medium: 'Silver Gelatin Print',
    desc: 'Đường sống núi mờ sương lúc chạng vạng, nơi ranh giới giữa đá núi và bầu trời hòa tan trong sắc bạc ấm.',
    pos: [-3.17, 2.22, 2.7],
    rotY: Math.PI / 2,
    w: 1.75,
    h: 2.45,
    seed: 3,
    landscape: false,
    wallLabel: 'West Gallery Wall'
  },
  {
    id: 4,
    title: 'Basalt Escarpment',
    artist: 'Kenji Takahashi, 2024',
    size: '175 × 245 cm',
    medium: 'Archival Pigment on Cotton',
    desc: 'Cấu trúc tầng đá bazan cổ đại dưới ánh nắng xiên chiều tạo nên nhịp điệu hình học tự nhiên đầy uy nghi.',
    pos: [3.17, 2.22, -3.5],
    rotY: -Math.PI / 2,
    w: 1.75,
    h: 2.45,
    seed: 4,
    landscape: false,
    wallLabel: 'East Gallery Wall'
  },
  {
    id: 5,
    title: 'Silent Caldera',
    artist: 'Elena Rostova, 2023',
    size: '175 × 245 cm',
    medium: 'Platinum Palladium Print',
    desc: 'Miệng núi lửa phủ sương mù buổi sớm tại vùng cao nguyên, lưu giữ sự tĩnh tại tuyệt đối của thiên nhiên hoang sơ.',
    pos: [3.17, 2.22, -0.4],
    rotY: -Math.PI / 2,
    w: 1.75,
    h: 2.45,
    seed: 5,
    landscape: false,
    wallLabel: 'East Gallery Wall'
  },
  {
    id: 6,
    title: 'Obsidian Gorge',
    artist: 'Kenji Takahashi, 2024',
    size: '175 × 245 cm',
    medium: 'Silver Gelatin Print',
    desc: 'Hẻm núi đá trầm tích với các mảng sáng tối tương phản mạnh mẽ, gợi cảm giác điêu khắc trên bề mặt ảnh.',
    pos: [3.17, 2.22, 2.7],
    rotY: -Math.PI / 2,
    w: 1.75,
    h: 2.45,
    seed: 6,
    landscape: false,
    wallLabel: 'East Gallery Wall'
  },
  {
    id: 7,
    title: 'Winter Horizon II',
    artist: 'Anselm Vance, 2024',
    size: '275 × 185 cm',
    medium: 'Archival Silver Gelatin Print',
    desc: 'Bức toàn cảnh đối xứng tại hốc Nam khép lại hành trình thị giác bằng đường chân trời tuyết phủ thanh tịnh.',
    pos: [0, 2.15, 9.67],
    rotY: Math.PI,
    w: 2.75,
    h: 1.85,
    seed: 7,
    landscape: true,
    wallLabel: 'South Alcove'
  }
];

// Architectural Warm Plaster Texture Generator (from 3d.html)
function createPlasterTexture(width = 1024, height = 1024, washSpots = []) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const baseGrad = ctx.createLinearGradient(0, 0, 0, height);
  baseGrad.addColorStop(0.0, '#5c4433');
  baseGrad.addColorStop(0.35, '#6b5040');
  baseGrad.addColorStop(0.85, '#5a3f2e');
  baseGrad.addColorStop(1.0, '#4a3222');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  washSpots.forEach(([nx, ny, rx, ry, alpha]) => {
    const cx = nx * width;
    const cy = ny * height;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, rx * 0.05, 0, 0, rx);
    g.addColorStop(0, `rgba(200, 150, 90, ${alpha * 0.55})`);
    g.addColorStop(0.45, `rgba(170, 120, 65, ${alpha * 0.28})`);
    g.addColorStop(1, 'rgba(140, 95, 50, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n * 0.95));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n * 0.85));
  }
  ctx.putImageData(imgData, 0, 0);

  const THREE = window.THREE;
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

// Polished Concrete / Warm Stone Floor Texture (from 3d.html)
function createFloorOverlayTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2e2218';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 420; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 140;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    const light = Math.random() > 0.48;
    g.addColorStop(0, light ? 'rgba(100, 78, 55, 0.12)' : 'rgba(28, 20, 14, 0.12)');
    g.addColorStop(1, 'rgba(46, 34, 24, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(18, 12, 8, 0.3)';
  ctx.lineWidth = 2;
  const step = size / 4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
  }

  const THREE = window.THREE;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 6);
  return tex;
}

// Walnut Wood Texture for Central Bench (from 3d.html)
function createWalnutTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3b2618';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y++) {
    const wave = Math.sin(y * 0.07) * 8 + Math.sin(y * 0.23) * 3;
    const tone = 36 + Math.floor(Math.abs(wave) * 1.4 + Math.random() * 8);
    ctx.fillStyle = `rgb(${tone + 22}, ${Math.floor(tone * 0.72)}, ${Math.floor(tone * 0.45)})`;
    ctx.fillRect(0, y, 512, 1.5);
  }
  const THREE = window.THREE;
  return new THREE.CanvasTexture(canvas);
}

// Monochrome Fine Art Landscape Generator (from 3d.html)
function createMonochromeArt(seed, isLandscape) {
  const w = isLandscape ? 1200 : 840;
  const h = isLandscape ? 820 : 1160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  if (seed % 3 === 0) {
    sky.addColorStop(0, '#cfc6b8');
    sky.addColorStop(0.6, '#ebe3d5');
    sky.addColorStop(1, '#f7f1e6');
  } else if (seed % 3 === 1) {
    sky.addColorStop(0, '#6e665c');
    sky.addColorStop(0.55, '#b8afa2');
    sky.addColorStop(1, '#e5ddd0');
  } else {
    sky.addColorStop(0, '#dcd3c4');
    sky.addColorStop(1, '#f4ede1');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 18; i++) {
    const cx = ((seed * 173 + i * 97) % 100) / 100 * w;
    const cy = ((seed * 89 + i * 53) % 55) / 100 * h;
    const r = 90 + (i % 5) * 45;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    g.addColorStop(0, 'rgba(255, 250, 242, 0.35)');
    g.addColorStop(1, 'rgba(255, 250, 242, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const baseH = h * (0.42 + l * 0.12);
    const amp = h * (0.24 - l * 0.035);
    const shade = Math.floor(115 - l * 28);
    ctx.beginPath();
    ctx.moveTo(0, h);

    const pts = [];
    const segs = 48;
    for (let i = 0; i <= segs; i++) {
      const nx = i / segs;
      const x = nx * w;
      const ridge =
        Math.sin(nx * 5.2 + seed * 1.7 + l * 2.1) * 0.45 +
        Math.cos(nx * 11.5 - seed * 0.9 + l) * 0.3 +
        Math.sin(nx * 24.0 + l * 3.4) * 0.15 +
        Math.cos(nx * 46.0 + seed) * 0.07;
      const peakBoost = isLandscape ? Math.exp(-Math.pow((nx - 0.5) * 3.2, 2)) * 0.65 : 0.25;
      const y = baseH - (ridge * 0.5 + peakBoost) * amp;
      pts.push([x, y]);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const rockGrad = ctx.createLinearGradient(0, baseH - amp, 0, h);
    rockGrad.addColorStop(0, `rgb(${shade + 16}, ${shade + 11}, ${shade + 4})`);
    rockGrad.addColorStop(0.5, `rgb(${Math.max(18, shade - 18)}, ${Math.max(16, shade - 20)}, ${Math.max(14, shade - 22)})`);
    rockGrad.addColorStop(1, '#14110e');
    ctx.fillStyle = rockGrad;
    ctx.fill();

    ctx.strokeStyle = `rgba(248, 241, 229, ${0.42 - l * 0.08})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    pts.forEach(([px, py], idx) => {
      if (idx === 0) ctx.moveTo(px, py);
      else if (idx % 2 === 0) ctx.lineTo(px, py + 2);
    });
    ctx.stroke();

    if (seed === 2 && l === 2) {
      const wx = w * 0.48;
      const wy = baseH - amp * 0.25;
      const wf = ctx.createLinearGradient(wx, wy, wx, h * 0.88);
      wf.addColorStop(0, 'rgba(250, 245, 236, 0.85)');
      wf.addColorStop(0.7, 'rgba(235, 228, 218, 0.55)');
      wf.addColorStop(1, 'rgba(255, 250, 242, 0.92)');
      ctx.fillStyle = wf;
      ctx.fillRect(wx - 10, wy, 20, h * 0.88 - wy);
    }
  }

  ctx.fillStyle = 'rgba(34, 29, 24, 0.85)';
  ctx.fillRect(0, h * 0.78, w, h * 0.22);

  const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.28, w / 2, h / 2, w * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(12, 9, 6, 0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const THREE = window.THREE;
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return { canvas, tex, dataUrl: canvas.toDataURL('image/jpeg', 0.9) };
}

export default function Gallery3D({ photos = [], user = null, onBack }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [activeWall, setActiveWall] = useState('north');
  const [wallLabel, setWallLabel] = useState('North Alcove · 0°');
  const [autoTour, setAutoTour] = useState(true); // Default auto-rotate enabled as requested
  const [activeArt, setActiveArt] = useState(null);
  const [hoverTitle, setHoverTitle] = useState('');
  const [hoverVisible, setHoverVisible] = useState(false);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const threeRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    raycaster: null,
    pointer: null,
    interactiveMeshes: [],
    artworkGroups: [],
    animId: null,
    state: {
      targetYaw: 0,
      targetPitch: 0.02,
      currentYaw: 0,
      currentPitch: 0.02,
      targetPos: null,
      homePos: null,
      isFocused: false,
      activeArtIndex: -1,
      isDragging: false,
      dragMoved: false,
      prevX: 0,
      prevY: 0,
      hoveredArt: null,
      autoTour: true
    }
  });

  // Map 8 artworks prioritizing user uploaded photos
  const artworks = useMemo(() => {
    return BASE_ARTWORKS.map((base, idx) => {
      if (idx < photos.length) {
        const p = photos[idx];
        const v = p.variants?.find(item => item.width >= 960) || p.variants?.at(-1) || p.variants?.[0];
        return {
          ...base,
          isUserPhoto: true,
          title: p.title || `Tác phẩm của bạn #${idx + 1}`,
          artist: user?.name || 'Ảnh bộ sưu tập cá nhân',
          desc: p.alt || 'Ảnh do bạn đăng tải lưu trữ trong không gian triển lãm kiến trúc.',
          size: p.original ? `${p.original.width} × ${p.original.height} px` : (v ? `${v.width} × ${v.height} px` : base.size),
          medium: 'Nhiếp ảnh số cá nhân',
          imageUrl: p.original?.url || v?.url,
          photoData: p
        };
      }
      return {
        ...base,
        isUserPhoto: false
      };
    });
  }, [photos, user]);

  // Ensure Three.js
  useEffect(() => {
    let active = true;
    function check() {
      if (window.THREE) {
        if (active) setLoading(false);
      } else {
        setTimeout(check, 100);
      }
    }
    check();
    return () => { active = false; };
  }, []);

  // Main 3D Scene setup
  useEffect(() => {
    if (loading || !window.THREE || !containerRef.current) return;

    const THREE = window.THREE;
    const container = containerRef.current;
    const t = threeRef.current;

    // --- Proportions from 3d.html ---
    const NAV_W = 6.4;
    const NAV_H = 6.8;
    const NAV_L = 13.0; // z from -6.5 to +6.5
    const ALC_W = 4.5;
    const ALC_H = 5.3;
    const ALC_D = 3.2; // alcove depth

    const HOME_POS = new THREE.Vector3(0, 1.68, 2.2);
    t.state.homePos = HOME_POS;
    t.state.targetPos = HOME_POS.clone();
    t.state.autoTour = autoTour;

    // Scene & Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a1d12);
    scene.fog = new THREE.FogExp2(0x2c1e12, 0.012);
    t.scene = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(56, container.clientWidth / container.clientHeight, 0.1, 80);
    camera.position.copy(HOME_POS);
    camera.rotation.order = 'YXZ';
    t.camera = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.65;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    t.renderer = renderer;

    t.raycaster = new THREE.Raycaster();
    t.pointer = new THREE.Vector2(-99, -99);
    t.interactiveMeshes = [];
    t.artworkGroups = [];

    // --- Wall Textures (3d.html) ---
    const sideWallTex = createPlasterTexture(1024, 1024, [
      [0.24, 0.34, 0.22, 0.44, 0.52],
      [0.50, 0.34, 0.22, 0.44, 0.52],
      [0.76, 0.34, 0.22, 0.44, 0.52],
      [0.12, 0.14, 0.16, 0.22, 0.35],
      [0.88, 0.14, 0.16, 0.22, 0.35]
    ]);
    const alcoveBackTex = createPlasterTexture(1024, 1024, [
      [0.5, 0.06, 0.58, 0.24, 0.75],
      [0.5, 0.48, 0.34, 0.36, 0.42]
    ]);
    const bulkheadTex = createPlasterTexture(1024, 512, [
      [0.22, 0.45, 0.22, 0.4, 0.45],
      [0.78, 0.45, 0.22, 0.4, 0.45]
    ]);
    const ceilingTex = createPlasterTexture(1024, 1024, [
      [0.5, 0.2, 0.35, 0.3, 0.45],
      [0.5, 0.5, 0.35, 0.3, 0.45],
      [0.5, 0.8, 0.35, 0.3, 0.45]
    ]);

    const sideWallMat = new THREE.MeshStandardMaterial({ map: sideWallTex, roughness: 0.88, metalness: 0.02 });
    const alcoveWallMat = new THREE.MeshStandardMaterial({ map: alcoveBackTex, roughness: 0.88, metalness: 0.02 });
    const bulkheadMat = new THREE.MeshStandardMaterial({ map: bulkheadTex, roughness: 0.88, metalness: 0.02 });
    const ceilingMat = new THREE.MeshStandardMaterial({ map: ceilingTex, roughness: 0.9, metalness: 0.01 });
    const shadowGapMat = new THREE.MeshBasicMaterial({ color: 0x120d09 });

    function addWall(w, h, mat, x, y, z, ry = 0, rx = 0) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.rotation.x = rx;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }

    // Main Nave Walls & Ceiling
    addWall(NAV_L, NAV_H, sideWallMat, -NAV_W / 2, NAV_H / 2, 0, Math.PI / 2);
    addWall(NAV_L, NAV_H, sideWallMat, NAV_W / 2, NAV_H / 2, 0, -Math.PI / 2);
    addWall(NAV_W, NAV_L, ceilingMat, 0, NAV_H, 0, 0, Math.PI / 2);

    // Architectural shadow-gap baseboard
    const gapH = 0.045;
    addWall(NAV_L, gapH, shadowGapMat, -NAV_W / 2 + 0.004, gapH / 2, 0, Math.PI / 2);
    addWall(NAV_L, gapH, shadowGapMat, NAV_W / 2 - 0.004, gapH / 2, 0, -Math.PI / 2);

    // North (-Z) and South (+Z) Alcoves
    [-1, 1].forEach((dir) => {
      const zPortal = dir * (NAV_L / 2);
      const zBack = dir * (NAV_L / 2 + ALC_D);
      const zMid = (zPortal + zBack) / 2;
      const faceIn = dir === -1 ? 0 : Math.PI;

      const pierW = (NAV_W - ALC_W) / 2;
      addWall(pierW, ALC_H, sideWallMat, -(ALC_W / 2 + pierW / 2), ALC_H / 2, zPortal, faceIn);
      addWall(pierW, ALC_H, sideWallMat, (ALC_W / 2 + pierW / 2), ALC_H / 2, zPortal, faceIn);
      addWall(NAV_W, NAV_H - ALC_H, bulkheadMat, 0, ALC_H + (NAV_H - ALC_H) / 2, zPortal, faceIn);

      addWall(pierW, gapH, shadowGapMat, -(ALC_W / 2 + pierW / 2), gapH / 2, zPortal - dir * 0.004, faceIn);
      addWall(pierW, gapH, shadowGapMat, (ALC_W / 2 + pierW / 2), gapH / 2, zPortal - dir * 0.004, faceIn);

      addWall(ALC_D, ALC_H, sideWallMat, -ALC_W / 2, ALC_H / 2, zMid, Math.PI / 2);
      addWall(ALC_D, ALC_H, sideWallMat, ALC_W / 2, ALC_H / 2, zMid, -Math.PI / 2);
      addWall(ALC_D, gapH, shadowGapMat, -ALC_W / 2 + 0.004, gapH / 2, zMid, Math.PI / 2);
      addWall(ALC_D, gapH, shadowGapMat, ALC_W / 2 - 0.004, gapH / 2, zMid, -Math.PI / 2);

      addWall(ALC_W, ALC_H, alcoveWallMat, 0, ALC_H / 2, zBack, faceIn);
      addWall(ALC_W, gapH, shadowGapMat, 0, gapH / 2, zBack - dir * 0.004, faceIn);

      const ceilDepth = ALC_D - 0.14;
      addWall(ALC_W, ceilDepth, ceilingMat, 0, ALC_H, zPortal + dir * (ceilDepth / 2), 0, Math.PI / 2);

      // Warm glowing LED Cove Strip
      const coveStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(ALC_W - 0.04, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xffaa55 })
      );
      coveStrip.position.set(0, ALC_H - 0.02, zBack - dir * 0.08);
      coveStrip.rotation.x = Math.PI / 2;
      scene.add(coveStrip);
    });

    // Floor — Polished Stone Reflector (real-time mirror plane)
    const totalFloorL = NAV_L + ALC_D * 2;
    let floorMesh;
    if (window.THREE && window.THREE.Reflector) {
      // Real reflection mirror plane
      const reflector = new THREE.Reflector(
        new THREE.PlaneGeometry(NAV_W, totalFloorL),
        {
          clipBias: 0.003,
          textureWidth: Math.min(1024, renderer.capabilities.maxTextureSize),
          textureHeight: Math.min(1024, renderer.capabilities.maxTextureSize),
          color: new THREE.Color(0x1a1008),
          recursion: 1
        }
      );
      reflector.rotation.x = -Math.PI / 2;
      reflector.position.y = 0.001;
      scene.add(reflector);

      // Stone overlay blended on top of reflector
      const overlayMat = new THREE.MeshStandardMaterial({
        map: createFloorOverlayTexture(),
        roughness: 0.08,
        metalness: 0.24,
        transparent: true,
        opacity: 0.38,
        depthWrite: false
      });
      floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(NAV_W, totalFloorL), overlayMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.y = 0.002;
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);
    } else {
      // Fallback: dark polished floor without reflector
      const floorMat = new THREE.MeshStandardMaterial({
        map: createFloorOverlayTexture(),
        roughness: 0.08,
        metalness: 0.28
      });
      floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(NAV_W, totalFloorL), floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.y = 0;
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);
    }

    // Ceiling Track Rail & Spots
    const trackGroup = new THREE.Group();
    const trackLen = 11.4;
    const railMat = new THREE.MeshStandardMaterial({ color: 0x161311, roughness: 0.45, metalness: 0.7 });
    const bulbGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa55 });

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, trackLen), railMat);
    rail.position.set(0, NAV_H - 0.025, 0);
    trackGroup.add(rail);

    for (let i = 0; i < 10; i++) {
      const z = -5.0 + i * 1.11;
      const side = i % 2 === 0 ? -1 : 1;
      const fixture = new THREE.Group();
      fixture.position.set(0, NAV_H - 0.06, z);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10), railMat);
      stem.position.y = -0.07;
      fixture.add(stem);

      const headGroup = new THREE.Group();
      headGroup.position.set(side * 0.04, -0.15, 0);
      headGroup.rotation.z = side * 0.68;

      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.19, 16), railMat);
      headGroup.add(can);

      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.036, 16), bulbGlowMat);
      lens.position.y = -0.096;
      lens.rotation.x = Math.PI / 2;
      headGroup.add(lens);

      fixture.add(headGroup);
      trackGroup.add(fixture);
    }

    // Pinhole Downlights
    [-2.15, 2.15].forEach((x) => {
      for (let z = -4.8; z <= 4.8; z += 3.2) {
        const trim = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.036, 16), railMat);
        trim.rotation.x = Math.PI / 2;
        trim.position.set(x, NAV_H - 0.002, z);
        trackGroup.add(trim);

        const emitter = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), bulbGlowMat);
        emitter.rotation.x = Math.PI / 2;
        emitter.position.set(x, NAV_H - 0.003, z);
        trackGroup.add(emitter);
      }
    });
    scene.add(trackGroup);

    // Central Monolithic Walnut Bench
    const walnutMat = new THREE.MeshStandardMaterial({
      map: createWalnutTexture(),
      roughness: 0.42,
      metalness: 0.05
    });
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.44, 3.1), walnutMat);
    bench.position.set(0, 0.22, -0.85);
    bench.castShadow = true;
    bench.receiveShadow = true;
    scene.add(bench);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.03, 2.98), new THREE.MeshBasicMaterial({ color: 0x0e0a07 }));
    plinth.position.set(0, 0.015, -0.85);
    scene.add(plinth);

    // Lighting Rig — Warm 2800K (#ffaa55 / #ffb86c standard)
    const WARM_KEY   = 0xffaa55;   // key track-spot color
    const WARM_FILL  = 0xffb86c;   // fill / cove color
    const WARM_AMB   = 0xff9933;   // deep warm ambient

    // Hemisphere ambient — extremely dim, just enough to see into shadow
    const hemiLight = new THREE.HemisphereLight(WARM_FILL, 0x3d1e08, 0.18);
    scene.add(hemiLight);

    // Alcove cove strip lights (warm glowing LED)
    const northCoveLight = new THREE.PointLight(WARM_FILL, 7, 10, 1.6);
    northCoveLight.position.set(0, ALC_H - 0.35, -(NAV_L / 2 + ALC_D - 0.35));
    scene.add(northCoveLight);

    const southCoveLight = new THREE.PointLight(WARM_FILL, 7, 10, 1.6);
    southCoveLight.position.set(0, ALC_H - 0.35, (NAV_L / 2 + ALC_D - 0.35));
    scene.add(southCoveLight);

    // Wall-wash strip lights — 2800K soft flood along each side wall
    // West wall wash (left)
    for (let z = -4.5; z <= 4.5; z += 2.25) {
      const ww = new THREE.PointLight(WARM_AMB, 3.5, 7, 1.8);
      ww.position.set(-NAV_W / 2 + 0.5, NAV_H * 0.68, z);
      scene.add(ww);
    }
    // East wall wash (right)
    for (let z = -4.5; z <= 4.5; z += 2.25) {
      const ww = new THREE.PointLight(WARM_AMB, 3.5, 7, 1.8);
      ww.position.set(NAV_W / 2 - 0.5, NAV_H * 0.68, z);
      scene.add(ww);
    }

    // Track spot lights — focused beam on each artwork
    const spotPositions = [
      { pos: [0, NAV_H - 0.3, -4.5],   target: [0, 2.15, -(NAV_L / 2 + ALC_D)], intensity: 14, shadow: true },
      { pos: [0.4, NAV_H - 0.3, -3.5], target: [-NAV_W / 2, 2.2, -3.5],          intensity: 11, shadow: true },
      { pos: [0.4, NAV_H - 0.3, -0.4], target: [-NAV_W / 2, 2.2, -0.4],          intensity: 11, shadow: false },
      { pos: [0.4, NAV_H - 0.3, 2.7],  target: [-NAV_W / 2, 2.2, 2.7],           intensity: 11, shadow: false },
      { pos: [-0.4, NAV_H - 0.3, -3.5],target: [NAV_W / 2, 2.2, -3.5],           intensity: 11, shadow: true },
      { pos: [-0.4, NAV_H - 0.3, -0.4],target: [NAV_W / 2, 2.2, -0.4],           intensity: 11, shadow: false },
      { pos: [-0.4, NAV_H - 0.3, 2.7], target: [NAV_W / 2, 2.2, 2.7],            intensity: 11, shadow: false },
      { pos: [0, NAV_H - 0.3, 4.5],    target: [0, 2.15, (NAV_L / 2 + ALC_D)],  intensity: 13, shadow: false }
    ];

    spotPositions.forEach((cfg) => {
      const spot = new THREE.SpotLight(0xffaa55, cfg.intensity, 18, Math.PI / 4.2, 0.72, 1.35);
      spot.position.set(...cfg.pos);
      spot.target.position.set(...cfg.target);
      if (cfg.shadow) {
        spot.castShadow = true;
        spot.shadow.mapSize.set(1024, 1024);
        spot.shadow.bias = -0.0005;
      }
      scene.add(spot);
      scene.add(spot.target);
    });

    // --- Build 8 Artworks (Matching 3d.html) ---
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x151210, roughness: 0.35, metalness: 0.8 });

    artworks.forEach((art, index) => {
      const group = new THREE.Group();
      group.position.set(...art.pos);
      group.rotation.y = art.rotY;

      // Archive works use generated art; user photos use the original texture directly.
      const monoArt = art.isUserPhoto ? null : createMonochromeArt(art.seed, art.landscape);
      if (!art.isUserPhoto) art.dataUrl = monoArt.dataUrl;

      const artMat = art.isUserPhoto
        ? new THREE.MeshBasicMaterial({ color: 0xffffff })
        : new THREE.MeshStandardMaterial({
            map: monoArt.tex,
            roughness: 0.48,
            metalness: 0.04
          });

      if (art.isUserPhoto && art.imageUrl) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
          art.imageUrl,
          (texture) => {
            texture.anisotropy = 8;
            art.dataUrl = art.imageUrl;
            artMat.map = texture;
            artMat.needsUpdate = true;
          },
          undefined,
          (error) => {
            console.error(`Không thể tải ảnh triển lãm: ${art.imageUrl}`, error);
          }
        );
      }

      const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(art.w, art.h), artMat);
      canvasMesh.position.z = 0.028;
      canvasMesh.userData = { artIndex: index, art };
      group.add(canvasMesh);
      t.interactiveMeshes.push(canvasMesh);

      // Matte Black Aluminum Frame (4 bars)
      const border = 0.032;
      const depth = 0.055;
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(art.w + border * 2, border, depth), frameMat);
      topBar.position.set(0, art.h / 2 + border / 2, depth / 2);
      topBar.castShadow = true;

      const botBar = new THREE.Mesh(new THREE.BoxGeometry(art.w + border * 2, border, depth), frameMat);
      botBar.position.set(0, -art.h / 2 - border / 2, depth / 2);
      botBar.castShadow = true;

      const leftBar = new THREE.Mesh(new THREE.BoxGeometry(border, art.h, depth), frameMat);
      leftBar.position.set(-art.w / 2 - border / 2, 0, depth / 2);
      leftBar.castShadow = true;

      const rightBar = new THREE.Mesh(new THREE.BoxGeometry(border, art.h, depth), frameMat);
      rightBar.position.set(art.w / 2 + border / 2, 0, depth / 2);
      rightBar.castShadow = true;

      group.add(topBar, botBar, leftBar, rightBar);
      scene.add(group);
      t.artworkGroups.push({ group, art, artMat });
    });

    // --- Interactive Mouse & Touch Dragging ---
    const st = t.state;

    const onPointerDown = (e) => {
      st.isDragging = true;
      st.dragMoved = false;
      st.prevX = e.clientX;
      st.prevY = e.clientY;
      container.classList.add('grabbing');
    };

    const onPointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      t.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      t.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      setHoverPos({ x: e.clientX, y: e.clientY });

      if (!st.isDragging) return;
      const dx = e.clientX - st.prevX;
      const dy = e.clientY - st.prevY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) st.dragMoved = true;

      st.prevX = e.clientX;
      st.prevY = e.clientY;

      if (st.isFocused && st.dragMoved) {
        returnToCenter(false);
      }

      st.targetYaw += dx * 0.0032;
      st.targetPitch = Math.max(-0.55, Math.min(0.65, st.targetPitch + dy * 0.0026));
    };

    const onPointerUp = (e) => {
      const rect = container.getBoundingClientRect();
      t.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      t.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      t.raycaster.setFromCamera(t.pointer, camera);
      const releaseHits = t.raycaster.intersectObjects(t.interactiveMeshes);
      const releaseArt = releaseHits[0]?.object.userData.artIndex;

      if (st.isDragging && !st.dragMoved && releaseArt != null) {
        focusArtwork(releaseArt);
      }
      st.isDragging = false;
      container.classList.remove('grabbing');
    };

    const onResize = () => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onResize);

    // Focus Camera on Selected Artwork
    function focusArtwork(index) {
      const art = artworks[index];
      if (!art) return;
      st.isFocused = true;
      st.activeArtIndex = index;
      st.autoTour = false;
      setAutoTour(false);

      const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), art.rotY);
      const dist = art.landscape ? 3.1 : 2.85;
      const rightVec = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), art.rotY);

      st.targetPos.set(...art.pos)
        .addScaledVector(normal, dist)
        .addScaledVector(rightVec, 0.35);
      st.targetPos.y = art.pos[1] - 0.05;

      const desiredYaw = art.rotY;
      const delta = Math.atan2(Math.sin(desiredYaw - st.currentYaw), Math.cos(desiredYaw - st.currentYaw));
      st.targetYaw = st.currentYaw + delta;
      st.targetPitch = 0;

      setActiveArt({ ...art, index });
    }

    function returnToCenter(resetAngle = true) {
      st.isFocused = false;
      st.activeArtIndex = -1;
      setActiveArt(null);
      st.targetPos.copy(HOME_POS);
      if (resetAngle) st.targetPitch = 0.02;
    }

    // Animation Loop
    function animate() {
      t.animId = requestAnimationFrame(animate);

      // Auto-rotation when not focused on an artwork
      if (st.autoTour && !st.isFocused) {
        st.targetYaw -= 0.0022;
      }

      // Inertial damping
      st.currentYaw += (st.targetYaw - st.currentYaw) * 0.085;
      st.currentPitch += (st.targetPitch - st.currentPitch) * 0.085;
      camera.rotation.y = st.currentYaw;
      camera.rotation.x = st.currentPitch;
      camera.position.lerp(st.targetPos, 0.075);

      // Compass & HUD Wall Angle
      let deg = Math.round(((-st.currentYaw * 180) / Math.PI) % 360);
      if (deg < 0) deg += 360;

      let label = 'North Alcove';
      let wallKey = 'north';
      if (deg >= 45 && deg < 135) {
        label = 'East Gallery Wall';
        wallKey = 'east';
      } else if (deg >= 135 && deg < 225) {
        label = 'South Alcove';
        wallKey = 'south';
      } else if (deg >= 225 && deg < 315) {
        label = 'West Gallery Wall';
        wallKey = 'west';
      }
      setWallLabel(`${label} · ${deg}°`);
      setActiveWall(wallKey);

      // Raycast Hover
      t.raycaster.setFromCamera(t.pointer, camera);
      const hits = t.raycaster.intersectObjects(t.interactiveMeshes);
      if (hits.length > 0 && !st.isDragging) {
        const hitArt = hits[0].object.userData.art;
        if (st.hoveredArt !== hitArt) {
          st.hoveredArt = hitArt;
          setHoverTitle(hitArt.title);
          setHoverVisible(true);
          container.classList.add('pointer');
        }
      } else if (st.hoveredArt) {
        st.hoveredArt = null;
        setHoverVisible(false);
        container.classList.remove('pointer');
      }

      // Hover elevation on frame
      t.artworkGroups.forEach(({ group, art }) => {
        const isHov = st.hoveredArt && st.hoveredArt.id === art.id;
        const targetScale = isHov ? 1.016 : 1.0;
        group.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.14);
      });

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(t.animId);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [loading, artworks]);

  // Wall Button Navigation
  const handleNavWall = (desiredYaw, key) => {
    const t = threeRef.current;
    if (!t.state) return;
    t.state.isFocused = false;
    t.state.activeArtIndex = -1;
    setActiveArt(null);
    t.state.targetPos.copy(t.state.homePos);
    t.state.targetPitch = 0.02;

    const delta = Math.atan2(Math.sin(desiredYaw - t.state.currentYaw), Math.cos(desiredYaw - t.state.currentYaw));
    t.state.targetYaw = t.state.currentYaw + delta;
    setActiveWall(key);
  };

  // Toggle Auto-rotate
  const handleToggleAutoTour = () => {
    const next = !autoTour;
    setAutoTour(next);
    if (threeRef.current.state) {
      threeRef.current.state.autoTour = next;
    }
  };

  // Step Artworks in Detail Panel
  const handleStepArt = (direction) => {
    const t = threeRef.current;
    if (!t.state || t.state.activeArtIndex === -1) return;
    const total = artworks.length;
    const nextIdx = (t.state.activeArtIndex + direction + total) % total;

    t.state.activeArtIndex = nextIdx;
    const art = artworks[nextIdx];
    const normal = new window.THREE.Vector3(0, 0, 1).applyAxisAngle(new window.THREE.Vector3(0, 1, 0), art.rotY);
    const dist = art.landscape ? 3.1 : 2.85;
    const rightVec = new window.THREE.Vector3(1, 0, 0).applyAxisAngle(new window.THREE.Vector3(0, 1, 0), art.rotY);

    t.state.targetPos.set(...art.pos)
      .addScaledVector(normal, dist)
      .addScaledVector(rightVec, 0.35);
    t.state.targetPos.y = art.pos[1] - 0.05;

    const delta = Math.atan2(Math.sin(art.rotY - t.state.currentYaw), Math.cos(art.rotY - t.state.currentYaw));
    t.state.targetYaw = t.state.currentYaw + delta;
    t.state.targetPitch = 0;

    setActiveArt({ ...art, index: nextIdx });
  };

  const handleReturnCenter = () => {
    const t = threeRef.current;
    if (!t.state) return;
    t.state.isFocused = false;
    t.state.activeArtIndex = -1;
    setActiveArt(null);
    t.state.targetPos.copy(t.state.homePos);
    t.state.targetPitch = 0.02;
  };

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (activeArt) {
          handleReturnCenter();
        } else if (onBack) {
          onBack();
        }
      } else if (e.key === 'ArrowRight' && activeArt) {
        handleStepArt(1);
      } else if (e.key === 'ArrowLeft' && activeArt) {
        handleStepArt(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeArt, onBack]);

  return (
    <div className="gallery-3d-root" role="region" aria-label="Galeria Privada — 3D Exhibition">
      {/* Loading Overlay */}
      {loading && (
        <div className="gal-loading-overlay">
          <div className="gal-spinner" />
          <div className="gal-loading-text">Đang tải không gian triển lãm Galeria Privada…</div>
        </div>
      )}

      {/* 3D WebGL Canvas */}
      <div id="canvas-container" ref={containerRef} className="gallery-canvas-container" />

      {/* Back Button (Top-Left) */}
      <button
        type="button"
        className="gal-back-btn"
        onClick={onBack}
        title="Quay về Stories (Esc)"
        aria-label="Quay về danh sách Stories"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>Quay về Stories</span>
      </button>

      {/* Ultra-subtle Top Compass Indicator (Matching 3d.html) */}
      <div className="gal-hud-top">
        <span className="gal-dot" />
        <span>{wallLabel}</span>
      </div>

      {/* Minimalist Brand (Bottom-Left) */}
      <div className="gal-hud-brand">
        <div className="gal-kr">프라이빗 갤러리</div>
        <div className="gal-en">Galeria Privada</div>
      </div>

      {/* Navigation Pills Bar (Bottom-Right) + Auto-Rotate Button */}
      <div className="gal-nav-bar">
        <button
          type="button"
          className={`gal-nav-btn ${activeWall === 'north' && !activeArt ? 'active' : ''}`}
          onClick={() => handleNavWall(0, 'north')}
        >
          Chính diện
        </button>
        <button
          type="button"
          className={`gal-nav-btn ${activeWall === 'west' && !activeArt ? 'active' : ''}`}
          onClick={() => handleNavWall(Math.PI / 2, 'west')}
        >
          Tường trái
        </button>
        <button
          type="button"
          className={`gal-nav-btn ${activeWall === 'east' && !activeArt ? 'active' : ''}`}
          onClick={() => handleNavWall(-Math.PI / 2, 'east')}
        >
          Tường phải
        </button>
        <button
          type="button"
          className={`gal-nav-btn ${activeWall === 'south' && !activeArt ? 'active' : ''}`}
          onClick={() => handleNavWall(Math.PI, 'south')}
        >
          Phía sau
        </button>

        {/* Chế độ tự động xoay */}
        <button
          type="button"
          className={`gal-nav-btn ${autoTour ? 'active' : ''}`}
          onClick={handleToggleAutoTour}
          title="Bật / tắt chế độ tự động xoay góc nhìn 360 độ"
        >
          <span className={`gal-autotour-indicator ${autoTour ? 'active' : ''}`} />
          <span>Tự động xoay</span>
        </button>
      </div>

      {/* Hover Tag */}
      <div
        className={`gal-hover-tag ${hoverVisible ? 'visible' : ''}`}
        style={{ left: `${hoverPos.x}px`, top: `${hoverPos.y}px` }}
      >
        <div className="gal-t-title">{hoverTitle}</div>
        <div className="gal-t-sub">Click để xem chi tiết</div>
      </div>

      {/* Artwork Detail Panel (Sliding in from Right) */}
      <aside className={`gal-detail-panel ${activeArt ? 'open' : ''}`} role="dialog" aria-modal="true">
        {activeArt && (
          <>
            <div className="gal-dp-eyebrow">
              {activeArt.isUserPhoto ? 'ẢNH BỘ SƯU TẬP CỦA BẠN' : `BỘ SƯU TẬP ARCHIVE 0${activeArt.index + 1} / 0${artworks.length}`}
            </div>
            <h2 className="gal-dp-title">{activeArt.title}</h2>
            <div className="gal-dp-artist">{activeArt.artist}</div>

            {/* Artwork Preview Mount */}
            <div className="gal-dp-preview">
              <img src={activeArt.dataUrl || activeArt.imageUrl} alt={activeArt.title} />
            </div>

            <p className="gal-dp-desc">{activeArt.desc}</p>
            <div className="gal-dp-meta">
              <div>Kích thước<span>{activeArt.size}</span></div>
              <div>Chất liệu<span>{activeArt.medium}</span></div>
            </div>
            <div className="gal-dp-actions">
              <button type="button" className="gal-dp-btn ghost" onClick={() => handleStepArt(-1)}>
                ← Trước
              </button>
              <button type="button" className="gal-dp-btn ghost" onClick={() => handleStepArt(1)}>
                Tiếp →
              </button>
              <button type="button" className="gal-dp-btn primary" onClick={handleReturnCenter}>
                Về trung tâm
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
