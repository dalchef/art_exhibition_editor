// shared/schema.js
// ---------------------------------------------------------------------------
// museum.json 스키마 기본값 + 검증 + 공간 레이아웃 계산.
// editor 와 viewer 가 공용으로 import 한다 (순수 ES module, 빌드 스텝 없음).
//
// 좌표계 (에디터·뷰어 공통 · 절대 좌표):
//   - 1 unit = 1 m.
//   - 평면도 기준: 화면 위 = north, 오른쪽 = east.
//   - Three.js 매핑:  X = east(+),  Z = south(+)  →  north = -Z,  Y = up.
//   - 사각형(rect)은 { xMin, xMax, zMin, zMax } (xMin<xMax, zMin<zMax).
//     north 모서리 = zMin (가장 -Z),  south 모서리 = zMax.
//
// 벽(wall) 규칙:
//   - room.size.w = 폭(진행 방향에 수직),  d = 깊이(진행 방향),  h = 높이.
//   - 벽 "왼쪽 끝"은 **룸 내부에서 그 벽을 바라볼 때** 기준:
//       north 벽을 보면 왼쪽 = west(min X)
//       south 벽을 보면 왼쪽 = east(max X)
//       east  벽을 보면 왼쪽 = north(min Z)
//       west  벽을 보면 왼쪽 = south(max Z)
//   - 문/작품 offset·x 는 위 "왼쪽 끝(0)"에서의 거리(m).  → wallLeftToWorld() 참조.
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

// 고정 치수 / 허용 범위 -------------------------------------------------------
export const LAYOUT = Object.freeze({
  DOOR_W: 1.8,       // 문 폭 (고정)
  DOOR_H: 2.6,       // 문 높이 (고정)
  LOBBY_DEPTH: 4.0,  // 자동 로비 깊이 (폭 = room[0] 폭)
  WALL_THICK: 0.2,   // 벽 두께
  DEFAULT_CENTER_H_CM: 150, // 작품 중심 높이 기본값
});

export const RANGES = Object.freeze({
  roomW: [6, 20], roomD: [6, 16], roomH: [3.5, 5],
  rooms: [2, 5],
  spotIntensity: [0.5, 2.0],
});

// 프리셋 화이트리스트 (검증용) -----------------------------------------------
export const PRESETS = Object.freeze({
  wall: ['deep-red', 'green', 'navy', 'gray'],
  floor: ['walnut-herringbone', 'oak-herringbone', 'ash-plank', 'walnut-plank'],
  frame: ['gold', 'wood', 'black', 'none'],
  lightingMood: ['warm', 'neutral', 'cool'],
  lightTemp: ['warm', 'neutral', 'cool'],
  avatarPreset: ['owl', 'capybara', 'rabbit', 'dragon'], // v1.1 동물 4종 (구 a1~a4 는 로드 시 매핑)
  wallDir: ['north', 'east', 'south', 'west'],
});

// --- id 생성 (브라우저 런타임 전용; 충돌 회피용 단순 카운터+시각) ------------
let _idc = 0;
function uid(prefix) {
  _idc = (_idc + 1) % 100000;
  const t = Date.now().toString(36).slice(-5);
  return `${prefix}-${t}${_idc.toString(36)}`;
}

// --- 텍스트월 스타일 (v1.2 P4) ----------------------------------------------
// 제목/본문 블록 스타일 + 패널 공통 필드. 필드 부재 시 이 기본값으로 폴백(구 프로젝트 호환).
export const TEXT_DEFAULTS = Object.freeze({
  title:   { font: 'serif', weight: 700, sizeCm: 28, color: '#F2E9DB', letterSpacing: 0.06, lineHeight: 1.35 },
  body:    { font: 'sans', weight: 400, sizeCm: 9, color: '#D9C9A8', letterSpacing: 0.02, lineHeight: 1.7 },
  secTitle:{ font: 'serif', weight: 700, sizeCm: 12, color: '#3A2F24', letterSpacing: 0.04, lineHeight: 1.4 },
  secBody: { font: 'sans', weight: 400, sizeCm: 6.5, color: '#5A4C3C', letterSpacing: 0.01, lineHeight: 1.75 },
  titlePanel: { align: 'center', bg: 'none', widthCm: 900, light: { on: true, intensity: 1.2, temp: 'warm' } },
  introPanel: { align: 'left', bg: 'light', widthCm: 260, light: { on: false, intensity: 1.0, temp: 'warm' } },
});
export function makeTextStyle(base, overrides = {}) {
  return { ...TEXT_DEFAULTS[base], ...(overrides || {}) };
}
export function makePanel(base, overrides = {}) {
  const d = TEXT_DEFAULTS[base];
  return { ...d, ...(overrides || {}), light: { ...d.light, ...((overrides || {}).light || {}) } };
}

// --- 로비 (v1.2 P3 — 그랜드 로비) --------------------------------------------
// lobby 필드 부재 시 기본값 자동 생성(schemaVersion 1 유지, 기존 프로젝트 호환).
export const LOBBY_RANGES = Object.freeze({ w: [10, 24], d: [8, 18], h: [5, 10] });
export function makeLobby(overrides = {}) {
  return {
    size: { w: 18, d: 12, h: 8, ...(overrides.size || {}) },
    wall: { preset: 'gray', pattern: false, ...(overrides.wall || {}) },
    floor: { preset: 'walnut-plank', ...(overrides.floor || {}) },
    lighting: { mood: 'warm', ambient: 0.85, ...(overrides.lighting || {}) },
    decor: { chandelier: true, columns: true, cofferedCeiling: true, goldTrim: true, carpet: true,
             ...(overrides.decor || {}) },
    artworks: overrides.artworks || [],
  };
}
export function ensureLobby(project) {
  if (!project.lobby) project.lobby = makeLobby();
  else project.lobby = makeLobby(project.lobby);
  return project.lobby;
}

// --- 벽/바닥 스타일 정규화 (v1.2 P5) -----------------------------------------
// 구 프리셋 4종 → 자유 색 필드 자동 매핑. 매핑 HEX 는 기존 렌더 베이스색과 동일하게 유지
// (AC: 구 프로젝트 로드 시 외관 변화 없음 — 문서의 #7A1F2B 예시 대신 현행 베이스색 채택).
export const LEGACY_WALL_HEX = Object.freeze({
  'deep-red': '#5e2626', green: '#2c4436', navy: '#26324e', gray: '#5f5a53',
});
export function normalizeWall(w = {}) {
  const out = { preset: w.preset || 'deep-red', ...w };
  out.color = w.color || LEGACY_WALL_HEX[w.preset] || '#5e2626';
  if (typeof out.pattern === 'boolean' || out.pattern == null) {
    out.pattern = out.pattern === false ? 'plain' : 'damask';
  }
  out.patternOpacity = out.patternOpacity ?? 1;
  out.patternScale = out.patternScale ?? (out.pattern === 'custom' ? 1 : 2.6);
  out.patternMirror = out.patternMirror ?? false;
  return out;
}
export function normalizeFloor(f = {}) {
  const out = { preset: f.preset || 'walnut-herringbone', ...f };
  if (out.preset === 'custom') { out.scale = out.scale ?? 1; out.mirror = out.mirror ?? false; }
  return out;
}
export function normalizeSurfaces(project) {
  for (const r of (project.rooms || [])) { r.wall = normalizeWall(r.wall); r.floor = normalizeFloor(r.floor); }
  if (project.lobby) { project.lobby.wall = normalizeWall(project.lobby.wall); project.lobby.floor = normalizeFloor(project.lobby.floor); }
  return project;
}

// 텍스트월 스타일 필드 정규화 (P4) — 구 프로젝트 로드 시 기본값 채움.
export function ensureTextStyles(project) {
  project.titleStyle = makeTextStyle('title', project.titleStyle);
  project.introStyle = makeTextStyle('body', project.introStyle);
  project.titlePanel = makePanel('titlePanel', project.titlePanel);
  for (const r of (project.rooms || [])) {
    r.introTitleStyle = makeTextStyle('secTitle', r.introTitleStyle);
    r.introBodyStyle = makeTextStyle('secBody', r.introBodyStyle);
    r.introPanel = makePanel('introPanel', r.introPanel);
  }
  return project;
}

// --- 기본값 팩토리 ----------------------------------------------------------
export function makeArtwork(overrides = {}) {
  const id = overrides.id || uid('aw');
  return {
    id,
    image: overrides.image || '',
    thumb: overrides.thumb || '',
    caption: {
      title: '', artist: '', year: '', medium: '',
      collection: '', credit: 'Public domain', sourceUrl: '',
      ...(overrides.caption || {}),
    },
    sizeCm: { w: 60, h: 80, ...(overrides.sizeCm || {}) },
    scale: overrides.scale ?? 1.0,
    placement: { wall: 'north', x: 2.0, centerHeightCm: LAYOUT.DEFAULT_CENTER_H_CM,
                 ...(overrides.placement || {}) },
    frame: { style: 'gold', matte: false, matteColor: '#f3ead8',
             ...(overrides.frame || {}) },
    light: { intensity: 1.2, temp: 'warm', ...(overrides.light || {}) },
    docentNote: overrides.docentNote || '',
  };
}

export function makeRoom(overrides = {}, index = 0) {
  const id = overrides.id || uid('room');
  return {
    id,
    name: overrides.name || `${index + 1}. 새 섹션`,
    intro: overrides.intro || '',
    introTitleStyle: makeTextStyle('secTitle', overrides.introTitleStyle),
    introBodyStyle: makeTextStyle('secBody', overrides.introBodyStyle),
    introPanel: makePanel('introPanel', overrides.introPanel),
    size: { w: 12, d: 9, h: 4.2, ...(overrides.size || {}) },
    wall: { preset: 'deep-red', pattern: true, ...(overrides.wall || {}) },
    floor: { preset: 'walnut-herringbone', ...(overrides.floor || {}) },
    lighting: { mood: 'warm', ambient: 0.6, ...(overrides.lighting || {}) },
    decor: { benches: true, spotlights: true, ...(overrides.decor || {}) },
    // 마지막 룸은 exitDoor: null. 기본은 north 직진.
    exitDoor: overrides.exitDoor === null ? null
            : { wall: 'north', offset: (overrides.size?.w ?? 12) / 2,
                ...(overrides.exitDoor || {}) },
    artworks: overrides.artworks || [],
  };
}

export function makeProject(overrides = {}) {
  const rooms = overrides.rooms || [makeRoom({ name: '1. 첫 번째 섹션' }, 0)];
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      slug: 'untitled-museum',
      title: '제목 없는 전시',
      subtitle: '',
      curator: '',
      intro: '',
      createdAt: new Date().toISOString().slice(0, 10),
      language: 'ko',
      ...(overrides.meta || {}),
    },
    titleStyle: makeTextStyle('title', overrides.titleStyle),
    introStyle: makeTextStyle('body', overrides.introStyle),
    titlePanel: makePanel('titlePanel', overrides.titlePanel),
    lobby: makeLobby(overrides.lobby || {}),
    avatarDefaults: { preset: 'capybara', body: 'default', garment: '#8DA98A',
                      ...(overrides.avatarDefaults || {}) },
    route: overrides.route || [],
    rooms,
  };
}

// --- 벽 기하 헬퍼 -----------------------------------------------------------
// 룸 내부 기준 "왼쪽 끝(0)"에서 벽을 따라 거리 t(m) 떨어진 지점의 월드 좌표.
// 반환 { x, z, along:[ux,uz] } (along = 왼→오 진행 단위벡터, 수평 배치용).
export function wallLeftToWorld(rect, wall, t) {
  switch (wall) {
    case 'north': // zMin, 왼쪽=west(xMin) → east 방향으로 증가
      return { x: rect.xMin + t, z: rect.zMin, along: [1, 0] };
    case 'south': // zMax, 왼쪽=east(xMax) → west 방향
      return { x: rect.xMax - t, z: rect.zMax, along: [-1, 0] };
    case 'east':  // xMax, 왼쪽=north(zMin) → south 방향
      return { x: rect.xMax, z: rect.zMin + t, along: [0, 1] };
    case 'west':  // xMin, 왼쪽=south(zMax) → north 방향
      return { x: rect.xMin, z: rect.zMax - t, along: [0, -1] };
    default:
      return { x: rect.xMin, z: rect.zMin, along: [1, 0] };
  }
}

// 벽의 길이(m) = 그 벽이 걸쳐있는 룸 변의 길이.
export function wallLength(rect, wall) {
  const w = rect.xMax - rect.xMin, d = rect.zMax - rect.zMin;
  return (wall === 'north' || wall === 'south') ? w : d;
}

const HEADING = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

// --- 공간 레이아웃 계산 -----------------------------------------------------
// 로비 + 각 룸 사각형을 절대좌표로 배치. exitDoor.wall 방향으로 다음 룸을 이어붙임.
// 반환 { lobby, rooms:[{id, rect, size, doorWorld?}], spawn:{x,z,angle}, bounds, overlaps:[{a,b}] }
export function computeLayout(project) {
  const rs = project.rooms || [];
  const out = { lobby: null, rooms: [], spawn: null, bounds: null, overlaps: [] };
  if (rs.length === 0) return out;

  // 로비: room[0] 남쪽. north 모서리 z=0. 크기는 project.lobby(P3 그랜드 로비),
  // 필드 부재 시 구 방식(폭 = room[0] 폭, 깊이 4m) 폴백.
  const lw = project.lobby?.size?.w ?? rs[0].size.w;
  const ld = project.lobby?.size?.d ?? LAYOUT.LOBBY_DEPTH;
  const lobby = {
    xMin: -lw / 2, xMax: lw / 2,
    zMin: 0, zMax: ld,
  };
  out.lobby = lobby;
  // 스폰: 로비 남쪽 입구 중앙, 북(-Z, angle=Math.PI 기준은 뷰어에서 정의)을 바라봄.
  out.spawn = { x: 0, z: lobby.zMax - 0.8, angle: 0 };

  const placed = []; // {id, rect}
  // room[0]: 로비 북쪽에 붙임 (남쪽 벽 = 로비 북쪽 모서리 z=0), x 중심 0.
  let prevRect = {
    xMin: -rs[0].size.w / 2, xMax: rs[0].size.w / 2,
    zMin: -rs[0].size.d, zMax: 0,
  };
  out.rooms.push({ id: rs[0].id, rect: prevRect, size: rs[0].size });
  placed.push({ id: rs[0].id, rect: prevRect });

  for (let i = 1; i < rs.length; i++) {
    const prev = rs[i - 1];
    const exit = prev.exitDoor;
    if (!exit) break; // 앞 룸에 출구 없음 → 체인 종료
    const door = wallLeftToWorld(prevRect, exit.wall, exit.offset);
    const [hx, hz] = HEADING[exit.wall] || HEADING.north;
    const w = rs[i].size.w, d = rs[i].size.d;
    let rect;
    if (hz !== 0) {
      // 진행 = 남/북. 깊이=Z, 폭=X(문 중심 기준).
      if (hz < 0) { // north
        rect = { xMin: door.x - w / 2, xMax: door.x + w / 2, zMin: prevRect.zMin - d, zMax: prevRect.zMin };
      } else {      // south
        rect = { xMin: door.x - w / 2, xMax: door.x + w / 2, zMin: prevRect.zMax, zMax: prevRect.zMax + d };
      }
    } else {
      // 진행 = 동/서. 깊이=X, 폭=Z.
      if (hx > 0) { // east
        rect = { xMin: prevRect.xMax, xMax: prevRect.xMax + d, zMin: door.z - w / 2, zMax: door.z + w / 2 };
      } else {      // west
        rect = { xMin: prevRect.xMin - d, xMax: prevRect.xMin, zMin: door.z - w / 2, zMax: door.z + w / 2 };
      }
    }
    out.rooms.push({ id: rs[i].id, rect, size: rs[i].size, doorWorld: door });
    placed.push({ id: rs[i].id, rect });
    prevRect = rect;
  }

  // 겹침 검사 (인접 룸의 공유 모서리는 면적 0 → 무시). 로비도 포함.
  const all = [{ id: '__lobby__', rect: lobby }, ...placed];
  const EPS = 1e-6;
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      const A = all[a].rect, B = all[b].rect;
      const ox = Math.min(A.xMax, B.xMax) - Math.max(A.xMin, B.xMin);
      const oz = Math.min(A.zMax, B.zMax) - Math.max(A.zMin, B.zMin);
      if (ox > EPS && oz > EPS) out.overlaps.push({ a: all[a].id, b: all[b].id });
    }
  }

  // 전체 bounds
  let xMin = lobby.xMin, xMax = lobby.xMax, zMin = lobby.zMin, zMax = lobby.zMax;
  for (const p of placed) {
    xMin = Math.min(xMin, p.rect.xMin); xMax = Math.max(xMax, p.rect.xMax);
    zMin = Math.min(zMin, p.rect.zMin); zMax = Math.max(zMax, p.rect.zMax);
  }
  out.bounds = { xMin, xMax, zMin, zMax };
  return out;
}

// --- 검증 -------------------------------------------------------------------
// 반환 { ok:boolean, errors:[string], warnings:[string] }
export function validateProject(project) {
  const errors = [], warnings = [];
  const inRange = (v, [lo, hi]) => typeof v === 'number' && v >= lo && v <= hi;

  if (!project || typeof project !== 'object') {
    return { ok: false, errors: ['프로젝트 객체가 없습니다.'], warnings };
  }
  if (project.schemaVersion !== SCHEMA_VERSION) {
    warnings.push(`schemaVersion=${project.schemaVersion} (기대값 ${SCHEMA_VERSION})`);
  }
  const meta = project.meta || {};
  if (!meta.slug || !/^[a-z0-9][a-z0-9-]*$/.test(meta.slug)) {
    errors.push('meta.slug 이 URL-safe(소문자/숫자/하이픈) 하지 않습니다.');
  }
  if (!meta.title) warnings.push('meta.title 이 비어 있습니다.');

  // 로비 크기 범위 (P3)
  if (project.lobby?.size) {
    const ls = project.lobby.size;
    if (!inRange(ls.w, LOBBY_RANGES.w)) errors.push(`로비 폭 w 는 ${LOBBY_RANGES.w.join('~')}m 범위여야 합니다.`);
    if (!inRange(ls.d, LOBBY_RANGES.d)) errors.push(`로비 깊이 d 는 ${LOBBY_RANGES.d.join('~')}m 범위여야 합니다.`);
    if (!inRange(ls.h, LOBBY_RANGES.h)) errors.push(`로비 높이 h 는 ${LOBBY_RANGES.h.join('~')}m 범위여야 합니다.`);
  }

  const rooms = project.rooms || [];
  if (!inRange(rooms.length, RANGES.rooms)) {
    errors.push(`룸 개수는 ${RANGES.rooms[0]}~${RANGES.rooms[1]}개여야 합니다 (현재 ${rooms.length}).`);
  }

  // 레이아웃을 먼저 계산해 실제 배치 rect 로 벽 길이를 구한다.
  // (east/west 진행 룸은 w/d 가 축 회전되므로 size 만으로는 벽 길이를 알 수 없음)
  const layout = rooms.length >= 1 ? computeLayout(project) : null;

  rooms.forEach((r, i) => {
    const tag = `룸 ${i + 1}(${r.name || r.id})`;
    if (!inRange(r.size?.w, RANGES.roomW)) errors.push(`${tag}: 폭 w 는 ${RANGES.roomW.join('~')}m 범위여야 합니다.`);
    if (!inRange(r.size?.d, RANGES.roomD)) errors.push(`${tag}: 깊이 d 는 ${RANGES.roomD.join('~')}m 범위여야 합니다.`);
    if (!inRange(r.size?.h, RANGES.roomH)) errors.push(`${tag}: 높이 h 는 ${RANGES.roomH.join('~')}m 범위여야 합니다.`);
    if (r.wall?.preset && !PRESETS.wall.includes(r.wall.preset)) errors.push(`${tag}: 알 수 없는 벽 프리셋 '${r.wall.preset}'.`);
    if (r.floor?.preset && !PRESETS.floor.includes(r.floor.preset)) errors.push(`${tag}: 알 수 없는 바닥 프리셋 '${r.floor.preset}'.`);
    if (r.lighting?.mood && !PRESETS.lightingMood.includes(r.lighting.mood)) errors.push(`${tag}: 알 수 없는 조명 무드 '${r.lighting.mood}'.`);
    const isLast = i === rooms.length - 1;
    if (!isLast && !r.exitDoor) errors.push(`${tag}: 마지막이 아닌 룸에는 exitDoor 가 필요합니다.`);
    if (r.exitDoor) {
      if (!PRESETS.wallDir.includes(r.exitDoor.wall)) errors.push(`${tag}: exitDoor.wall 값이 잘못되었습니다.`);
      // 실제 배치 rect 기준 벽 길이 (레이아웃이 없으면 size 기반 근사)
      const lrect = layout?.rooms?.[i]?.rect;
      const len = lrect ? wallLength(lrect, r.exitDoor.wall)
        : ((r.exitDoor.wall === 'north' || r.exitDoor.wall === 'south') ? r.size?.w : r.size?.d);
      if (typeof r.exitDoor.offset !== 'number' || r.exitDoor.offset < LAYOUT.DOOR_W / 2 || r.exitDoor.offset > len - LAYOUT.DOOR_W / 2) {
        errors.push(`${tag}: exitDoor.offset(${r.exitDoor.offset})가 벽 안(문폭 여유 포함)에 들어오지 않습니다.`);
      }
    }
    (r.artworks || []).forEach((aw) => {
      if (aw.placement && !PRESETS.wallDir.includes(aw.placement.wall)) {
        errors.push(`${tag} / ${aw.caption?.title || aw.id}: placement.wall 값이 잘못되었습니다.`);
      }
      if (aw.frame?.style && !PRESETS.frame.includes(aw.frame.style)) {
        warnings.push(`${tag} / ${aw.id}: 알 수 없는 액자 스타일 '${aw.frame.style}'.`);
      }
    });
  });

  // 공간 겹침 검사
  if (layout) {
    for (const ov of layout.overlaps) {
      errors.push(`공간 겹침: '${ov.a}' 와 '${ov.b}' 가 겹칩니다. 룸 크기/순서/문 위치를 조정하세요.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
