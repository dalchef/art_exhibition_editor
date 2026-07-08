// viewer/js/world.js
// museum.json → 룸/로비/문/타이틀월 지오메트리 생성.
//
// 좌표계 (shared/schema.js 와 동일, 여기서 고정 문서화):
//   X = east(+),  Z = south(+)  →  north = -Z.  Y = up.  1 unit = 1 m.
//   rect = {xMin,xMax,zMin,zMax}.  north 모서리 = zMin.
//
// 벽은 "라인 유니온" 방식으로 만든다: 모든 룸+로비의 4변을 같은 직선끼리 합쳐
// 경계마다 벽을 딱 한 번만 생성 → 공유벽 이중생성/ z-fighting 없음. 문은 구멍으로 뺀다.
import * as THREE from '../../vendor/three.module.js';
import { LAYOUT, wallLeftToWorld, wallLength, wallFaceStyle, doorCovered, textBlocks } from '../../shared/schema.js';
import { wallStyleTexture, floorStyleTexture, styledTextTexture, WALL_COLORS } from './textures.js';
import { makeSpotlight } from './artwork.js';

const T = LAYOUT.WALL_THICK;
const WALL_TILE = 2.6;   // 벽지 타일 크기(m)
const FLOOR_TILE = 1.15; // 바닥 타일 크기(m)
const MOOD_COLOR = { warm: 0xffd9a8, neutral: 0xfff4e6, cool: 0xdfe9ff };

// 라인 키: 방향 + 고정좌표(소수 3자리)
const hkey = (z) => `H:${z.toFixed(3)}`;
const vkey = (x) => `V:${x.toFixed(3)}`;

// patternImages: { [wall.patternAsset|floor.asset]: HTMLImageElement } — main.js 가 사전 로드 (P5)
export function buildWorld(scene, project, layout, patternImages = {}) {
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  const colliders = []; // {minX,maxX,minZ,maxZ}
  // 로비: project.lobby (P3 그랜드 로비). 부재 시 구 방식 기본값.
  const lobbyDef = project.lobby || {
    size: { h: project.rooms[0].size.h }, wall: { preset: 'gray', pattern: false },
    floor: { preset: 'walnut-plank' }, lighting: { mood: 'warm', ambient: 0.85 },
    decor: {}, artworks: [],
  };
  const rects = [{
    id: '__lobby__', rect: layout.lobby, size: { h: lobbyDef.size.h ?? 8 }, isLobby: true,
    wall: lobbyDef.wall || { color: '#5f5a53', pattern: 'plain' }, wallFaces: lobbyDef.wallFaces,
    floor: lobbyDef.floor || { preset: 'walnut-plank' }, lobbyDef,
  }];
  for (let i = 0; i < layout.rooms.length; i++) {
    const lr = layout.rooms[i];
    const room = project.rooms[i];
    rects.push({ id: lr.id, rect: lr.rect, size: room.size, wall: room.wall, wallFaces: room.wallFaces, floor: room.floor, room, index: i });
  }

  // ---- 바닥 + 천장 (rect 단위) ----
  for (const r of rects) {
    const { rect } = r;
    const w = rect.xMax - rect.xMin, d = rect.zMax - rect.zMin, h = r.size.h;
    const cx = (rect.xMin + rect.xMax) / 2, cz = (rect.zMin + rect.zMax) / 2;

    const fs = floorStyleTexture(r.floor, patternImages[r.floor?.asset]);
    const ftex = fs.tex.clone();
    ftex.needsUpdate = true;
    ftex.repeat.set(w / fs.tileM, d / fs.tileM);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.82, metalness: 0.0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    group.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0xece4d6, roughness: 1.0, metalness: 0 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, h, cz);
    group.add(ceil);
  }

  // ---- 벽 라인 유니온 (P3: 면 단위 스타일) ----
  // 각 라인에 "claim"(어느 공간이 어느 쪽에서 이 경계를 쓰는지)을 기록한다.
  // H 라인: 공간이 라인 남쪽(z>fixed)에 있으면 side 'S' → 벽의 +z 면을 본다.
  // V 라인: 공간이 라인 동쪽(x>fixed)에 있으면 side 'E' → 벽의 +x 면을 본다.
  const lines = new Map();
  const addWall = (axis, fixed, a, b, height, space, dir, side) => {
    const key = axis === 'H' ? hkey(fixed) : vkey(fixed);
    let L = lines.get(key);
    if (!L) { L = { axis, fixed, ivals: [], claims: [], height }; lines.set(key, L); }
    const lo = Math.min(a, b), hi = Math.max(a, b);
    L.ivals.push([lo, hi]);
    L.claims.push({ lo, hi, space, dir, side });
    L.height = Math.max(L.height, height);
  };
  for (const r of rects) {
    const { rect } = r, h = r.size.h;
    addWall('H', rect.zMin, rect.xMin, rect.xMax, h, r, 'north', 'S'); // 공간은 라인 남쪽
    addWall('H', rect.zMax, rect.xMin, rect.xMax, h, r, 'south', 'N');
    addWall('V', rect.xMin, rect.zMin, rect.zMax, h, r, 'west', 'E');  // 공간은 라인 동쪽
    addWall('V', rect.xMax, rect.zMin, rect.zMax, h, r, 'east', 'W');
  }

  // ---- 문 구멍 ----
  const openings = new Map();
  const addOpening = (axis, fixed, center) => {
    const key = axis === 'H' ? hkey(fixed) : vkey(fixed);
    if (!openings.has(key)) openings.set(key, []);
    openings.get(key).push({ center, width: LAYOUT.DOOR_W, height: LAYOUT.DOOR_H });
  };
  // 로비 → 전시 통로 (로비 북쪽 벽 중앙 고정) — P2: 룸이 맞닿아 있을 때만 개구부
  const lobbyCx = (layout.lobby.xMin + layout.lobby.xMax) / 2;
  if (doorCovered(layout, '__lobby__', 'north', (layout.lobby.xMax - layout.lobby.xMin) / 2)) {
    addOpening('H', layout.lobby.zMin, lobbyCx);
  }
  // 각 룸 exitDoor — P2: 무효 문(인접 공간 없음/벽 범위 밖)은 벽을 뚫지 않는다
  for (let i = 0; i < layout.rooms.length; i++) {
    const room = project.rooms[i];
    if (!room.exitDoor) continue;
    if (!doorCovered(layout, room.id, room.exitDoor.wall, room.exitDoor.offset)) continue;
    const d = wallLeftToWorld(layout.rooms[i].rect, room.exitDoor.wall, room.exitDoor.offset);
    if (room.exitDoor.wall === 'north' || room.exitDoor.wall === 'south') addOpening('H', d.z, d.x);
    else addOpening('V', d.x, d.z);
  }

  // ---- 벽 생성 ----
  const baseboardMat = new THREE.MeshStandardMaterial({ color: 0x2c2622, roughness: 0.7 });
  const moldingMat = new THREE.MeshStandardMaterial({ color: 0xe9e0d0, roughness: 0.9 });

  // 면 스타일 → 텍스처 (wallStyleTexture 내부 캐시 사용). claim 없음(외벽) = null.
  const faceWS = (claim) => {
    if (!claim) return null;
    const def = wallFaceStyle(claim.space, claim.dir);
    return wallStyleTexture(def, patternImages[def?.patternAsset]);
  };
  // 위치 t 에서 라인 양쪽 claim 탐색. posSide: H='S'(+z 면), V='E'(+x 면).
  const claimsAt = (L, t) => {
    const posSide = L.axis === 'H' ? 'S' : 'E';
    let pos = null, neg = null;
    for (const c of L.claims) {
      if (t < c.lo - 1e-4 || t > c.hi + 1e-4) continue;
      if (c.side === posSide) pos = pos || c; else neg = neg || c;
    }
    return { pos, neg };
  };

  for (const [key, L] of lines) {
    const spans = mergeIvals(L.ivals);
    const ops = (openings.get(key) || []).map(o => [o.center - o.width / 2, o.center + o.width / 2, o.height]);

    for (const [s, e] of spans) {
      // 이 span 내 문 구멍
      const spanOps = ops.filter(o => o[0] >= s - 1e-3 && o[1] <= e + 1e-3);
      const solids = subtractIntervals([s, e], spanOps.map(o => [o[0], o[1]]));
      for (const [ss, ee] of solids) {
        // P3: 면 소속이 달라지는 지점(claim 경계)에서 세그먼트 추가 분할
        const cuts = new Set([ss, ee]);
        for (const c of L.claims) {
          if (c.lo > ss + 1e-4 && c.lo < ee - 1e-4) cuts.add(c.lo);
          if (c.hi > ss + 1e-4 && c.hi < ee - 1e-4) cuts.add(c.hi);
        }
        const pts = [...cuts].sort((a, b) => a - b);
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          if (b - a < 1e-3) continue;
          const { pos, neg } = claimsAt(L, (a + b) / 2);
          const wsPos = faceWS(pos) || faceWS(neg);   // 외벽 바깥면(exterior)은 반대면 스타일로 렌더
          const wsNeg = faceWS(neg) || faceWS(pos);
          buildWallBox(group, colliders, L.axis, L.fixed, a, b, L.height, wsPos, wsNeg, baseboardMat, moldingMat);
        }
      }
      // 문 상인방(lintel) — 문 중앙 기준 양면 스타일
      for (const o of spanOps) {
        const { pos, neg } = claimsAt(L, (o[0] + o[1]) / 2);
        const wsPos = faceWS(pos) || faceWS(neg);
        const wsNeg = faceWS(neg) || faceWS(pos);
        buildLintel(group, L.axis, L.fixed, o[0], o[1], o[2], L.height, wsPos, wsNeg);
      }
    }
  }

  // ---- 벤치 (decor.benches) ----
  for (const r of rects) {
    if (r.isLobby || !r.room?.decor?.benches) continue;
    const { rect } = r;
    const cx = (rect.xMin + rect.xMax) / 2, cz = (rect.zMin + rect.zMax) / 2;
    addBench(group, colliders, cx, cz);
  }

  // ---- 룸/로비 조명 무드 (§7: warm/neutral/cool + ambient) ----
  // 중앙 천장 포인트라이트로 색온도/밝기를 낸다. distance 로 옆 공간 번짐 제한.
  const moodLights = [];
  for (const r of rects) {
    const lighting = r.isLobby ? r.lobbyDef.lighting : r.room.lighting;
    const mood = lighting?.mood || 'warm';
    const amb = lighting?.ambient ?? 0.6;
    const { rect } = r;
    const cx = (rect.xMin + rect.xMax) / 2, cz = (rect.zMin + rect.zMax) / 2;
    const radius = Math.max(rect.xMax - rect.xMin, rect.zMax - rect.zMin);
    const pl = new THREE.PointLight(MOOD_COLOR[mood] || MOOD_COLOR.warm, amb * (r.isLobby ? 14 : 9), radius * 1.6, 1.4);
    pl.position.set(cx, r.size.h - 0.5, cz);
    group.add(pl);
    moodLights.push({ light: pl, roomIndex: r.isLobby ? -1 : r.index });
  }

  // ---- 그랜드 로비 데코 (P3 — 전부 절차 생성, 토글) ----
  buildLobbyDecor(group, colliders, rects[0], project);

  // ---- 텍스트 오브젝트 (v1.3 P4 — 타이틀월/섹션 패널 포함 자유 배치) ----
  buildTexts(group, project, layout);

  return { group, colliders, rects, moodLights };
}

// --- 구간 유틸 -------------------------------------------------------------
function mergeIvals(ivals) {
  const s = ivals.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of s) {
    if (out.length && iv[0] <= out[out.length - 1][1] + 1e-6) {
      out[out.length - 1][1] = Math.max(out[out.length - 1][1], iv[1]);
    } else out.push([iv[0], iv[1]]);
  }
  return out;
}
function subtractIntervals(span, cuts) {
  let segs = [span.slice()];
  for (const [c0, c1] of cuts.sort((a, b) => a[0] - b[0])) {
    const next = [];
    for (const [s, e] of segs) {
      if (c1 <= s || c0 >= e) { next.push([s, e]); continue; }
      if (c0 > s) next.push([s, c0]);
      if (c1 < e) next.push([c1, e]);
    }
    segs = next;
  }
  return segs.filter(([s, e]) => e - s > 1e-3);
}

// --- 벽 재질 (면 하나) ------------------------------------------------------
function wallFaceMat(ws, len, height) {
  const tex = ws.tex.clone(); tex.needsUpdate = true;
  tex.repeat.set(len / ws.tileM, height / ws.tileM);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0 });
}

// --- 벽 박스 하나 (P3: 양면 재질 분리) ---------------------------------------
// BoxGeometry 재질 순서 [+x, -x, +y, -y, +z, -z].
// H 벽: +z 면 = 라인 남쪽 공간이 보는 면(wsPos), -z 면 = 북쪽 공간 면(wsNeg).
// V 벽: +x 면 = 동쪽 공간 면(wsPos), -x 면 = 서쪽 공간 면(wsNeg).
function buildWallBox(group, colliders, axis, fixed, s, e, height, wsPos, wsNeg, baseboardMat, moldingMat) {
  const len = e - s;
  const mPos = wallFaceMat(wsPos, len, height);
  const mNeg = wsNeg === wsPos ? mPos : wallFaceMat(wsNeg, len, height);
  const mCap = mPos; // 단면(문설주)·상하부는 pos 면 스타일
  const mat = axis === 'H'
    ? [mCap, mCap, mCap, mCap, mPos, mNeg]
    : [mPos, mNeg, mCap, mCap, mCap, mCap];

  let geo, px, pz, sx, sz;
  if (axis === 'H') { sx = len; sz = T; px = (s + e) / 2; pz = fixed; }
  else { sx = T; sz = len; px = fixed; pz = (s + e) / 2; }
  geo = new THREE.BoxGeometry(sx, height, sz);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(px, height / 2, pz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);

  // 걸레받이
  const bb = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.02, 0.14, sz + 0.02), baseboardMat);
  bb.position.set(px, 0.07, pz);
  group.add(bb);
  // 상단 몰딩
  const ml = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.02, 0.10, sz + 0.02), moldingMat);
  ml.position.set(px, height - 0.05, pz);
  group.add(ml);

  // 충돌 AABB
  if (axis === 'H') colliders.push({ minX: s, maxX: e, minZ: fixed - T / 2, maxZ: fixed + T / 2 });
  else colliders.push({ minX: fixed - T / 2, maxX: fixed + T / 2, minZ: s, maxZ: e });
}

// --- 문 위 상인방 (P3: 양면 재질 분리) ---------------------------------------
function buildLintel(group, axis, fixed, o0, o1, doorH, wallH, wsPos, wsNeg) {
  const len = o1 - o0;
  const h = wallH - doorH;
  if (h <= 0.01) return;
  const mPos = wallFaceMat(wsPos, len, h);
  const mNeg = wsNeg === wsPos ? mPos : wallFaceMat(wsNeg, len, h);
  const mat = axis === 'H'
    ? [mPos, mPos, mPos, mPos, mPos, mNeg]
    : [mPos, mNeg, mPos, mPos, mPos, mPos];
  let sx, sz, px, pz;
  if (axis === 'H') { sx = len; sz = T; px = (o0 + o1) / 2; pz = fixed; }
  else { sx = T; sz = len; px = fixed; pz = (o0 + o1) / 2; }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), mat);
  mesh.position.set(px, doorH + h / 2, pz);
  group.add(mesh);
  // 문틀 상단
  const frame = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.06, 0.08, sz + 0.06),
    new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.6 }));
  frame.position.set(px, doorH, pz);
  group.add(frame);
}

// --- 벤치 ------------------------------------------------------------------
function addBench(group, colliders, cx, cz) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.6 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.5), mat);
  seat.position.y = 0.45; seat.castShadow = true; g.add(seat);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.5 });
  for (const dx of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.44), legMat);
    leg.position.set(dx, 0.225, 0); g.add(leg);
  }
  g.position.set(cx, 0, cz);
  group.add(g);
  colliders.push({ minX: cx - 0.8, maxX: cx + 0.8, minZ: cz - 0.25, maxZ: cz + 0.25 });
}

// ============================================================================
// 그랜드 로비 데코 (P3) — 샹들리에·기둥·코퍼드 천장·골드 트림·레드 카펫.
// 특정 건축물 복제 없이 절차 생성 요소 조합. 실광원은 샹들리에 중앙 1개로 제한.
// ============================================================================
const GOLD = 0xC9A24C;

function buildLobbyDecor(group, colliders, lobbyRect, project) {
  const def = lobbyRect.lobbyDef || {};
  const decor = def.decor || {};
  const { rect } = lobbyRect;
  const h = lobbyRect.size.h;
  const w = rect.xMax - rect.xMin, d = rect.zMax - rect.zMin;
  const cx = (rect.xMin + rect.xMax) / 2, cz = (rect.zMin + rect.zMax) / 2;

  if (decor.chandelier !== false) {
    // 로비가 크면 2기 (깊이 방향 분산)
    const twin = d >= 15;
    const zs = twin ? [cz - d / 4, cz + d / 4] : [cz];
    zs.forEach((z, i) => addChandelier(group, cx, h, z, i === 0));
  }
  if (decor.columns !== false) addColumns(group, colliders, rect, h);
  if (decor.cofferedCeiling !== false) addCofferedCeiling(group, rect, h);
  if (decor.goldTrim !== false) addGoldTrim(group, rect, h);
  if (decor.carpet !== false) addCarpet(group, rect);
}

// 샹들리에: 골드 링 토러스 2~3단 + emissive 전구 + 크리스털(옥타헤드론) + 체인.
// 실광원(PointLight)은 첫 번째 샹들리에에만 1개.
function addChandelier(group, x, ceilH, z, withLight) {
  const g = new THREE.Group();
  const isMobileLite = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.3 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xFFE9C0, emissive: 0xFFD9A0, emissiveIntensity: 2.2, roughness: 0.4 });
  const crysMat = new THREE.MeshStandardMaterial({ color: 0xF6EEDC, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.85 });

  const topY = ceilH - 0.05;
  const bodyY = ceilH - 2.0;
  // 체인
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, topY - bodyY, 8), goldMat);
  chain.position.set(0, (topY + bodyY) / 2, 0);
  g.add(chain);
  // 링 2~3단 + 전구 + 크리스털
  const tiers = [
    { r: 1.05, y: bodyY, bulbs: 10 },
    { r: 0.68, y: bodyY + 0.5, bulbs: 7 },
    { r: 0.34, y: bodyY + 0.95, bulbs: 0 },
  ];
  const crysGeo = new THREE.OctahedronGeometry(0.05);
  const bulbGeo = new THREE.SphereGeometry(0.055, 10, 8);
  for (const t of tiers) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(t.r, 0.035, 10, 36), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = t.y;
    g.add(ring);
    for (let i = 0; i < t.bulbs; i++) {
      const a = (i / t.bulbs) * Math.PI * 2;
      const bx = Math.cos(a) * t.r, bz = Math.sin(a) * t.r;
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(bx, t.y + 0.09, bz);
      g.add(bulb);
      // 크리스털 (모바일 라이트 모드: 수 감소)
      if (!isMobileLite || i % 2 === 0) {
        const c = new THREE.Mesh(crysGeo, crysMat);
        c.position.set(bx, t.y - 0.14, bz);
        c.rotation.y = a;
        g.add(c);
      }
    }
  }
  g.position.set(x, 0, z);
  group.add(g);
  if (withLight) {
    const pl = new THREE.PointLight(0xFFD9A8, 30, 26, 1.3);
    pl.position.set(x, bodyY - 0.3, z);
    group.add(pl);
  }
}

// 기둥/필라스터: 좌우 벽면 등간격. 몸통 실린더 + 상하 캐피탈.
function addColumns(group, colliders, rect, h) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xE7DFD0, roughness: 0.6 });
  const capMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.7, roughness: 0.35 });
  const d = rect.zMax - rect.zMin;
  const n = Math.max(2, Math.round(d / 4));
  const inset = 0.55;
  const r = 0.28;
  for (let i = 0; i < n; i++) {
    const z = rect.zMin + (d / (n + 0)) * (i + 0.5);
    for (const x of [rect.xMin + inset, rect.xMax - inset]) {
      const col = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h - 0.7, 18), bodyMat);
      shaft.position.y = (h - 0.7) / 2 + 0.35;
      col.add(shaft);
      const base = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.35, r * 2.6), bodyMat);
      base.position.y = 0.175;
      col.add(base);
      const neck = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.05, 8, 20), capMat);
      neck.rotation.x = Math.PI / 2;
      neck.position.y = h - 0.62;
      col.add(neck);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.7, 0.28, r * 2.7), capMat);
      cap.position.y = h - 0.4;
      col.add(cap);
      col.position.set(x, 0, z);
      col.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(col);
      colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
    }
  }
}

// 코퍼드 천장: 골드 빔 격자 + 함몰 패널(웜 emissive) — 프레스코 없이 화려함 담당.
function addCofferedCeiling(group, rect, h) {
  const w = rect.xMax - rect.xMin, d = rect.zMax - rect.zMin;
  const cx = (rect.xMin + rect.xMax) / 2, cz = (rect.zMin + rect.zMax) / 2;
  const beamMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.65, roughness: 0.4 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xF2E3C6, emissive: 0xFFE2B8, emissiveIntensity: 0.32, roughness: 0.9 });
  const nx = Math.max(3, Math.round(w / 3)), nz = Math.max(3, Math.round(d / 3));
  // 함몰 패널 (살짝 위)
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, d), panelMat);
  panel.rotation.x = Math.PI / 2;
  panel.position.set(cx, h + 0.12, cz);
  group.add(panel);
  // 빔 격자
  const beamH = 0.14, beamW = 0.16;
  for (let i = 0; i <= nx; i++) {
    const x = rect.xMin + (w / nx) * i;
    const b = new THREE.Mesh(new THREE.BoxGeometry(beamW, beamH, d), beamMat);
    b.position.set(x, h + 0.05, cz);
    group.add(b);
  }
  for (let j = 0; j <= nz; j++) {
    const z = rect.zMin + (d / nz) * j;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, beamH, beamW), beamMat);
    b.position.set(cx, h + 0.05, z);
    group.add(b);
  }
}

// 골드 몰딩: 벽 상단 코니스 + 걸레받이 골드 트림.
function addGoldTrim(group, rect, h) {
  const mat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.7, roughness: 0.35 });
  const w = rect.xMax - rect.xMin, d = rect.zMax - rect.zMin;
  const cx = (rect.xMin + rect.xMax) / 2, cz = (rect.zMin + rect.zMax) / 2;
  const mk = (sx, sz, px, pz, y, th) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, th, sz), mat);
    m.position.set(px, y, pz);
    group.add(m);
  };
  const t = T + 0.06;
  // 코니스 (상단)
  mk(w, t, cx, rect.zMin, h - 0.18, 0.16); mk(w, t, cx, rect.zMax, h - 0.18, 0.16);
  mk(t, d, rect.xMin, cz, h - 0.18, 0.16); mk(t, d, rect.xMax, cz, h - 0.18, 0.16);
  // 골드 걸레받이 트림
  mk(w, t, cx, rect.zMin, 0.19, 0.05); mk(w, t, cx, rect.zMax, 0.19, 0.05);
  mk(t, d, rect.xMin, cz, 0.19, 0.05); mk(t, d, rect.xMax, cz, 0.19, 0.05);
}

// 레드 카펫: 남쪽 입구 → 북쪽 전시 입장 문 러너 + 골드 보더.
function addCarpet(group, rect) {
  const d = rect.zMax - rect.zMin;
  const runW = 2.4;
  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(runW, d - 0.3),
    new THREE.MeshStandardMaterial({ color: 0x7A1F2B, roughness: 0.95 })
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.006, (rect.zMin + rect.zMax) / 2);
  carpet.receiveShadow = true;
  group.add(carpet);
  for (const sx of [-1, 1]) {
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, d - 0.3),
      new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.4, roughness: 0.6 })
    );
    border.rotation.x = -Math.PI / 2;
    border.position.set(sx * (runW / 2 + 0.06), 0.007, (rect.zMin + rect.zMax) / 2);
    group.add(border);
  }
}

// --- 텍스트 오브젝트 렌더 (v1.3 P4 — 자유 배치) ------------------------------
// 벽 안쪽면을 향하도록 회전. north 벽(zMin)은 실내가 +z 쪽 → 회전 0 (기본 법선 +Z).
const TEXT_WALL_ROT = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };
const TEXT_WALL_NORMAL = { north: [0, 1], south: [0, -1], east: [-1, 0], west: [1, 0] };

function buildTexts(group, project, layout) {
  const spaces = [{ def: project.lobby, rect: layout.lobby }];
  for (let i = 0; i < layout.rooms.length; i++) {
    spaces.push({ def: project.rooms[i], rect: layout.rooms[i].rect });
  }
  for (const sp of spaces) {
    if (!sp.def || !sp.rect) continue;
    const wallH = sp.def.size?.h ?? 4.2;
    for (const t of (sp.def.texts || [])) buildTextObject(group, project, sp.def, sp.rect, t, wallH);
  }
}

function buildTextObject(group, project, spaceDef, rect, t, wallH) {
  const blocks = textBlocks(project, spaceDef, t).filter(b => b.text);
  if (!blocks.length) return; // 내용 없는 역할 오브젝트는 렌더 생략
  const wall = t.placement?.wall || 'north';
  const len = wallLength(rect, wall);
  const p = styledTextTexture({
    blocks,
    panel: { align: t.panel?.align || 'left', bg: t.panel?.bg || 'none',
             widthCm: Math.min(t.widthCm || 300, Math.max(40, len * 100 - 20)) },
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(p.wM, p.hM),
    new THREE.MeshBasicMaterial({ map: p.texture, transparent: true })
  );
  const at = wallLeftToWorld(rect, wall, Math.max(0, Math.min(len, t.placement?.x ?? len / 2)));
  const [nx, nz] = TEXT_WALL_NORMAL[wall];
  const off = T / 2 + 0.03;
  const y = Math.min(Math.max((t.placement?.centerHeightCm ?? 160) / 100, p.hM / 2 + 0.05), wallH - p.hM / 2 - 0.05);
  mesh.position.set(at.x + nx * off, y, at.z + nz * off);
  mesh.rotation.y = TEXT_WALL_ROT[wall];
  group.add(mesh);
  // 텍스트 스포트라이트 (작품 조명과 동일 시스템)
  if (t.light?.on) {
    makeSpotlight(group, new THREE.Vector3(at.x + nx * off, y, at.z + nz * off), {
      nx, nz, intensity: t.light.intensity ?? 1.2, temp: t.light.temp || 'warm',
      ceilingY: wallH - 0.3,
    });
  }
}
