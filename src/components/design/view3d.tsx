"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  blockerFootprint, roofSurfaceZ, sunPosition, siteDate, effectiveZone,
  type DesignData, type Scene, type Vec2, type Vec3,
} from "@/lib/solar/shading";

export interface View3DProps {
  design: DesignData;
  scene: Scene;
  panelColors: (string | null)[];
  /** Site-local date/time driving the sun light + current sun marker. */
  when: { month: number; day: number; hour: number };
  showSunPath: boolean;
  showPanelInfo?: boolean;
  onBearing?: (deg: number) => void;
  /** Increment to snap the camera back to north-up. */
  resetNorth?: number;
  className?: string;
}

// Local (x east, y north, z up) → three.js (x east, y up, z south).
const T = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
const TV = (v: Vec3) => T(v.x, v.y, v.z);

const TILE_ZOOM = 19;
const TILE_SPAN = 2; // tiles each side of centre → 5×5 tiles ≈ 380 m square at 13°N

function lng2tile(lng: number, z: number) { return ((lng + 180) / 360) * 2 ** z; }
function lat2tile(lat: number, z: number) { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; }
function tile2lng(x: number, z: number) { return (x / 2 ** z) * 360 - 180; }
function tile2lat(y: number, z: number) { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(Math.sinh(n)); }

/** Stitch satellite tiles around the site into one texture; returns it with its local-metre bounds. */
async function loadGround(design: DesignData, scene: Scene) {
  const cx = Math.floor(lng2tile(design.center.lng, TILE_ZOOM)), cy = Math.floor(lat2tile(design.center.lat, TILE_ZOOM));
  const n = TILE_SPAN * 2 + 1;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n * 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#475569";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await Promise.all(
    Array.from({ length: n * n }, (_, i) => {
      const tx = cx - TILE_SPAN + (i % n), ty = cy - TILE_SPAN + Math.floor(i / n);
      return new Promise<void>((res) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { ctx.drawImage(img, (i % n) * 256, Math.floor(i / n) * 256); res(); };
        img.onerror = () => res();
        img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${TILE_ZOOM}/${ty}/${tx}`;
      });
    }),
  );
  const nw = scene.proj.toLocal({ lat: tile2lat(cy - TILE_SPAN, TILE_ZOOM), lng: tile2lng(cx - TILE_SPAN, TILE_ZOOM) });
  const se = scene.proj.toLocal({ lat: tile2lat(cy + TILE_SPAN + 1, TILE_ZOOM), lng: tile2lng(cx + TILE_SPAN + 1, TILE_ZOOM) });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, minX: nw.x, maxX: se.x, minY: se.y, maxY: nw.y };
}

type Ground = Awaited<ReturnType<typeof loadGround>>;

function textSprite(text: string, color = "#fde047", scale = 1) {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 40px system-ui";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,.65)"; g.strokeText(text, 64, 32);
  g.fillStyle = color; g.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.4 * scale, 1.2 * scale, 1);
  s.renderOrder = 10;
  return s;
}

function sunSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,230,1)"); grd.addColorStop(0.25, "rgba(255,230,90,.95)"); grd.addColorStop(1, "rgba(255,200,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.renderOrder = 11;
  return s;
}

/** Walls + top for an outline whose top height may vary per vertex (sloped roofs). */
function extrusion(poly: Vec2[], zBot: number[] | number, zTop: number[], uvOf?: (p: Vec2) => [number, number]) {
  const pos: number[] = [], uv: number[] = [];
  const zb = (i: number) => (Array.isArray(zBot) ? zBot[i] : zBot);
  const push = (p: Vec2, z: number, u: [number, number] = [0, 0]) => { const v = T(p.x, p.y, z); pos.push(v.x, v.y, v.z); uv.push(...u); };
  const walls = new THREE.BufferGeometry();
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length, a = poly[i], b = poly[j];
    push(a, zb(i)); push(b, zb(j)); push(b, zTop[j]);
    push(a, zb(i)); push(b, zTop[j]); push(a, zTop[i]);
  }
  walls.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  walls.computeVertexNormals();
  const tris = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p.x, p.y)), []);
  pos.length = 0; uv.length = 0;
  for (const t of tris) for (const k of t) push(poly[k], zTop[k], uvOf ? uvOf(poly[k]) : [0, 0]);
  const top = new THREE.BufferGeometry();
  top.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  top.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  top.computeVertexNormals();
  return { walls, top };
}

function buildModel(design: DesignData, scene: Scene, colors: (string | null)[], ground: Ground | null, showPanelInfo: boolean) {
  const group = new THREE.Group();
  const uvOf = ground ? (p: Vec2): [number, number] => [(p.x - ground.minX) / (ground.maxX - ground.minX), (p.y - ground.minY) / (ground.maxY - ground.minY)] : undefined;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.9, side: THREE.DoubleSide });
  const roofMat = ground ? new THREE.MeshStandardMaterial({ map: ground.tex, roughness: 1, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: 0xd6d3d1, side: THREE.DoubleSide });

  for (const zRaw of design.zones) {
    const z = effectiveZone(zRaw);
    const poly = z.points.map(scene.proj.toLocal);
    if (poly.length < 3) continue;
    const tops = poly.map((p) => roofSurfaceZ(z, p, poly));
    const { walls, top } = extrusion(poly, 0, tops, uvOf);
    const w = new THREE.Mesh(walls, wallMat); w.castShadow = w.receiveShadow = true; group.add(w);
    const t = new THREE.Mesh(top, roofMat); t.receiveShadow = true; t.castShadow = true; group.add(t);
    if (z.parapetHeight > 0 && z.type !== "tilted") {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const box = new THREE.Mesh(new THREE.BoxGeometry(len, z.parapetHeight, 0.15), wallMat);
        box.position.copy(T((a.x + b.x) / 2, (a.y + b.y) / 2, z.height + z.parapetHeight / 2));
        box.rotation.y = Math.atan2(b.y - a.y, b.x - a.x);
        box.castShadow = box.receiveShadow = true;
        group.add(box);
      }
    }
  }

  const blockMat = new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.8 });
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
  for (const b of design.blockers) {
    const base = b.base ?? 0;
    if (b.kind === "tree" && b.center) {
      const c = scene.proj.toLocal(b.center), r = b.radius ?? 1.5;
      const crownR = Math.min(r, b.height / 2);
      const trunkH = Math.max(0.1, b.height - crownR * 1.6);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, trunkH, 8), trunkMat);
      trunk.position.copy(T(c.x, c.y, base + trunkH / 2)); trunk.castShadow = true; group.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), treeMat);
      crown.scale.set(r, crownR, r);
      crown.position.copy(T(c.x, c.y, base + b.height - crownR)); crown.castShadow = crown.receiveShadow = true; group.add(crown);
      continue;
    }
    if (b.kind === "circle" && b.center) {
      const c = scene.proj.toLocal(b.center);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(b.radius ?? 1, b.radius ?? 1, b.height, 24), blockMat);
      cyl.position.copy(T(c.x, c.y, base + b.height / 2)); cyl.castShadow = cyl.receiveShadow = true; group.add(cyl);
      continue;
    }
    const poly = blockerFootprint(b, scene.proj);
    if (poly.length < 3) continue;
    const { walls, top } = extrusion(poly, base, poly.map(() => base + b.height));
    for (const g of [walls, top]) { const m = new THREE.Mesh(g, blockMat); m.castShadow = m.receiveShadow = true; group.add(m); }
  }

  const legMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.4 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.5, roughness: 0.5 });
  const zoneById = new Map(design.zones.map((z) => [z.id, effectiveZone(z)]));
  scene.panels.forEach((p, i) => {
    if (p.removed) return;
    const z = zoneById.get(p.zoneId)!;
    const U = TV(p.U).normalize(), N = TV(p.N).normalize();
    const V = new THREE.Vector3().crossVectors(U, N).normalize();
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors[i] ?? "#1e3a8a"), metalness: 0.35, roughness: 0.35 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(p.w - 0.01, 0.04, p.l - 0.01), mat);
    const m = new THREE.Matrix4().makeBasis(U, N, V);
    panel.quaternion.setFromRotationMatrix(m);
    const ctr = TV({ x: p.O.x + p.U.x * p.w / 2 + p.V.x * p.l / 2, y: p.O.y + p.U.y * p.w / 2 + p.V.y * p.l / 2, z: p.O.z + p.U.z * p.w / 2 + p.V.z * p.l / 2 });
    panel.position.copy(ctr);
    panel.castShadow = panel.receiveShadow = true;
    group.add(panel);
    if (showPanelInfo) {
      // Cell grid lines for a realistic module look.
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry), new THREE.LineBasicMaterial({ color: 0xcbd5e1 }));
      edges.quaternion.copy(panel.quaternion); edges.position.copy(ctr); group.add(edges);
    }
    // Mounting legs from roof to each module corner (flat RCC & shed structures).
    if (z.type !== "tilted" && z.mountHeight > 0.05) {
      const poly = z.points.map(scene.proj.toLocal);
      const corners3: Vec3[] = [
        p.O,
        { x: p.O.x + p.U.x * p.w, y: p.O.y + p.U.y * p.w, z: p.O.z },
        { x: p.O.x + p.V.x * p.l, y: p.O.y + p.V.y * p.l, z: p.O.z + p.V.z * p.l },
        { x: p.O.x + p.U.x * p.w + p.V.x * p.l, y: p.O.y + p.U.y * p.w + p.V.y * p.l, z: p.O.z + p.V.z * p.l },
      ];
      for (const c of corners3) {
        const floor = roofSurfaceZ(z, c, poly);
        const h = c.z - floor;
        if (h <= 0.02) continue;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), legMat);
        leg.position.copy(T(c.x, c.y, floor + h / 2)); leg.castShadow = true; group.add(leg);
      }
      if (z.type === "shed") {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.05, 0.05), frameMat);
        rail.position.copy(TV(p.O).add(U.clone().multiplyScalar(p.w / 2))); rail.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(U, N, V)); group.add(rail);
      }
    }
  });
  return group;
}

export default function View3D(props: View3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; controls: OrbitControls; scene3: THREE.Scene;
    sun: THREE.DirectionalLight; model?: THREE.Group; path?: THREE.Group; ground?: Ground | null; groundMesh?: THREE.Mesh; sunMark: THREE.Sprite; radius: number; target: THREE.Vector3;
  } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // One-time renderer / camera / controls setup.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene3 = new THREE.Scene();
    scene3.background = new THREE.Color(0x9cc3e6);
    scene3.fog = new THREE.Fog(0x9cc3e6, 250, 600);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 5;
    controls.maxDistance = 300;
    scene3.add(new THREE.HemisphereLight(0xdbeafe, 0x6b7280, 0.9));
    const sun = new THREE.DirectionalLight(0xfff4d6, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene3.add(sun, sun.target);
    const sunMark = sunSprite();
    scene3.add(sunMark);
    st.current = { renderer, camera, controls, scene3, sun, sunMark, radius: 30, target: new THREE.Vector3() };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let raf = 0, lastBearing = NaN;
    const loop = () => {
      controls.update();
      const d = new THREE.Vector3().subVectors(controls.target, camera.position);
      // Bearing of the view direction: atan2(east, north) with north = −Z.
      const bearing = ((Math.atan2(d.x, -d.z) * 180) / Math.PI + 360) % 360;
      if (Math.abs(bearing - lastBearing) > 0.5) { lastBearing = bearing; propsRef.current.onBearing?.(bearing); }
      renderer.render(scene3, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      st.current = null;
    };
  }, []);

  // Satellite ground (reload when the site moves).
  const { lat, lng } = props.design.center;
  useEffect(() => {
    let cancelled = false;
    const s = st.current!;
    loadGround(propsRef.current.design, propsRef.current.scene).then((g) => {
      if (cancelled || !st.current) return;
      s.ground = g;
      if (s.groundMesh) { s.scene3.remove(s.groundMesh); s.groundMesh.geometry.dispose(); }
      const w = g.maxX - g.minX, h = g.maxY - g.minY;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: g.tex, roughness: 1 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(T((g.minX + g.maxX) / 2, (g.minY + g.maxY) / 2, 0));
      mesh.receiveShadow = true;
      s.scene3.add(mesh);
      s.groundMesh = mesh;
      rebuildModel();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const rebuildModel = () => {
    const s = st.current;
    if (!s) return;
    const p = propsRef.current;
    if (s.model) { s.scene3.remove(s.model); s.model.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); }
    s.model = buildModel(p.design, p.scene, p.panelColors, s.ground ?? null, p.showPanelInfo ?? true);
    s.scene3.add(s.model);
  };

  // Model rebuild on design / colour changes.
  useEffect(() => {
    rebuildModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.design, props.scene, props.panelColors, props.showPanelInfo]);

  // Frame the camera on the design once (and on "reset north").
  const framed = useRef(false);
  useEffect(() => {
    const s = st.current!;
    const p = propsRef.current;
    const pts = p.design.zones.flatMap((z) => z.points.map(p.scene.proj.toLocal));
    const c = pts.length ? { x: pts.reduce((a, q) => a + q.x, 0) / pts.length, y: pts.reduce((a, q) => a + q.y, 0) / pts.length } : { x: 0, y: 0 };
    const ext = pts.length ? Math.max(8, ...pts.map((q) => Math.hypot(q.x - c.x, q.y - c.y))) : 15;
    const h = p.design.zones.length ? Math.max(...p.design.zones.map((z) => z.height)) : 0;
    s.target = T(c.x, c.y, h);
    s.radius = Math.max(25, ext * 3.2);
    s.controls.target.copy(s.target);
    const dist = s.radius * 1.25;
    // From the south, looking north, ~40° down — or straight north-up after a reset.
    s.camera.position.copy(s.target.clone().add(new THREE.Vector3(0, dist * 0.75, dist * 0.65)));
    s.controls.update();
    framed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.resetNorth, lat, lng, props.design.zones.length > 0]);

  // Sun light + sun-path arcs.
  const { month, day, hour } = props.when;
  useEffect(() => {
    const s = st.current!;
    const p = propsRef.current;
    const pos = sunPosition(siteDate(2025, month, day, hour, lng), lat, lng);
    const dir = (az: number, el: number) => {
      const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
      return T(Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e));
    };
    const R = s.radius;
    const sd = dir(pos.azimuth, Math.max(pos.elevation, 0));
    s.sun.position.copy(s.target.clone().add(sd.clone().multiplyScalar(R * 3)));
    s.sun.target.position.copy(s.target);
    s.sun.intensity = pos.elevation > 0 ? 2.4 * Math.min(1, pos.elevation / 12) : 0;
    const cam = s.sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = cam.bottom = -R * 1.6; cam.right = cam.top = R * 1.6; cam.near = 1; cam.far = R * 8;
    cam.updateProjectionMatrix();
    s.sunMark.visible = pos.elevation > 0;
    s.sunMark.position.copy(s.target.clone().add(sd.clone().multiplyScalar(R)));
    s.sunMark.scale.setScalar(R * 0.09);

    if (s.path) { s.scene3.remove(s.path); s.path.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }); }
    const g = new THREE.Group();
    if (p.showSunPath) {
      const arc = (m: number, d: number, color: number, opacity: number, labels: boolean) => {
        const pts: THREE.Vector3[] = [];
        for (let h = 4; h <= 20.01; h += 1 / 6) {
          const sp = sunPosition(siteDate(2025, m, d, h, lng), lat, lng);
          if (sp.elevation > -0.5) pts.push(s.target.clone().add(dir(sp.azimuth, Math.max(0, sp.elevation)).multiplyScalar(R)));
          if (labels && Math.abs(h - Math.round(h)) < 1e-6 && sp.elevation > 2) {
            const lp = s.target.clone().add(dir(sp.azimuth, sp.elevation).multiplyScalar(R));
            const label = textSprite(String(Math.round(h) > 12 ? Math.round(h) - 12 : Math.round(h)), "#fde047", R / 45);
            label.position.copy(lp.clone().add(new THREE.Vector3(0, R * 0.04, 0)));
            g.add(label);
            const dot = new THREE.Mesh(new THREE.SphereGeometry(R * 0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
            dot.position.copy(lp); g.add(dot);
          }
        }
        if (pts.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
      };
      arc(5, 21, 0x93c5fd, 0.55, false); // June solstice
      arc(11, 21, 0x93c5fd, 0.55, false); // December solstice
      arc(month, day, 0xfde047, 1, true);
      // Compass ring on the roof plane.
      const ring: THREE.Vector3[] = [];
      for (let a = 0; a <= 360; a += 5) ring.push(s.target.clone().add(dir(a, 0).multiplyScalar(R)));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })));
      for (const [lbl, a] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const) {
        const sp = textSprite(lbl, lbl === "N" ? "#f87171" : "#ffffff", R / 35);
        sp.position.copy(s.target.clone().add(dir(a, 0).multiplyScalar(R * 1.06)));
        g.add(sp);
      }
    }
    s.path = g;
    s.scene3.add(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, day, hour, props.showSunPath, lat, lng, props.resetNorth, props.design.zones.length]);

  return <div ref={host} className={props.className ?? "h-full w-full"} />;
}
