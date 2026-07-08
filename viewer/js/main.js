// viewer/js/main.js — 뷰어 진입점: 데이터 로드 → 월드 빌드 → 렌더 루프.
import * as THREE from '../../vendor/three.module.js';
import { computeLayout, validateProject, ensureLobby, ensureTextStyles, normalizeSurfaces, ensureOrigins, ensureTexts } from '../../shared/schema.js';
import { buildWorld } from './world.js';
import { buildArtworks } from './artwork.js';
import { makeAvatar } from './avatar.js';
import { PlayerControls } from './controls.js';
import { Interactions } from './interact.js';
import { HUD } from './hud.js';
import { AutoWalk } from './autowalk.js';
import { AVATAR_PRESETS, LEGACY_PRESET_MAP } from './avatarPresets.js';

const params = new URLSearchParams(location.search);
const DEBUG_CAM = params.get('cam') === 'orbit' || params.get('debugcam') === '1';
// P1(v1.3) 임베드 모드: 캐릭터 선택을 건너뛰고 즉시 갤러리 진입 (에디터 스플릿 프리뷰용).
// URL 파라미터가 없으면 절대 활성화되지 않음 → 퍼블리시 결과물의 시작 흐름에 영향 없음.
const EMBED = params.get('embed') === '1';
const SKIP_INTRO = EMBED || params.get('skipIntro') === '1';

const el = {
  canvas: document.getElementById('scene'),
  loading: document.getElementById('loading'),
  loadTitle: document.getElementById('load-title'),
  loadFill: document.getElementById('load-fill'),
  loadPct: document.getElementById('load-pct'),
};

function setProgress(p, label) {
  el.loadFill.style.width = Math.round(p * 100) + '%';
  el.loadPct.textContent = Math.round(p * 100) + '%';
  if (label) el.loadTitle.textContent = label;
}

// ---- 데이터 로드 --------------------------------------------------------
// 프로덕션 기본: fetch('./data/museum.json'). 개발: ?src=상대경로. 프리뷰: ?preview=1 (M4).
async function loadData() {
  if (params.get('preview') === '1') {
    return await loadFromPreview(); // M4: 에디터가 postMessage 로 전달
  }
  const src = params.get('src') || './data/museum.json';
  const res = await fetch(src);
  if (!res.ok) throw new Error(`데이터 로드 실패: ${src} (${res.status})`);
  const project = await res.json();
  const baseDir = src.slice(0, src.lastIndexOf('/') + 1);
  return { project, baseDir, blobs: null };
}

function loadFromPreview() {
  return new Promise((resolve) => {
    // 부모 창(같은 출처의 에디터)에 준비 신호를 보내고 데이터 수신 대기.
    // window.open(팝업) = opener, iframe 임베드(P1) = parent.
    window.addEventListener('message', (e) => {
      if (e.origin === location.origin && e.data && e.data.type === 'museum-preview-data') {
        resolve({ project: e.data.project, baseDir: '', blobs: e.data.blobs || null });
      }
    });
    const host = window.opener || (window.parent !== window ? window.parent : null);
    if (host) host.postMessage({ type: 'museum-preview-ready' }, location.origin);
  });
}

// 임베드(skipIntro) 진입용 아바타: 마지막 선택(localStorage) → 프로젝트 기본값 → 폴백.
// HUD 의 초기 선택 로직과 동일한 정규화 (구 a1~a4 프리셋 매핑 포함).
function resolveEmbedAvatar(project) {
  let last = null;
  try { last = JSON.parse(localStorage.getItem('museum-avatar-last') || 'null'); } catch (e) { /* 무시 */ }
  const av = last || project.avatarDefaults || {};
  const preset = AVATAR_PRESETS[av.preset] ? av.preset : (LEGACY_PRESET_MAP[av.preset] || 'capybara');
  return {
    preset,
    body: AVATAR_PRESETS[preset].bodies[av.body] ? av.body : 'default',
    garment: (typeof av.garment === 'string' && av.garment.startsWith('#')) ? av.garment
      : AVATAR_PRESETS[preset].garmentDefault,
  };
}

// 이미지 경로 → 실제 URL (프리뷰면 blob, 아니면 baseDir 상대)
export function resolveAsset(ctx, path) {
  if (!path) return '';
  if (ctx.blobs && ctx.blobs[path]) return ctx.blobs[path];
  if (/^(https?:|blob:|data:)/.test(path)) return path;
  return ctx.baseDir + path;
}

// Pretendard + Noto Serif KR 로드 대기(캔버스 텍스트가 폴백폰트로 그려지는 것 방지)
async function ensureFont() {
  try {
    await Promise.all([
      document.fonts.load('800 40px Pretendard'),
      document.fonts.load('700 30px Pretendard'),
      document.fonts.load('500 24px Pretendard'),
      document.fonts.load(`700 40px 'Noto Serif KR'`),
      document.fonts.load(`400 24px 'Noto Serif KR'`),
      document.fonts.load(`700 40px 'Noto Sans KR'`),
      document.fonts.load(`400 24px 'Noto Sans KR'`),
    ]);
    await document.fonts.ready;
  } catch (e) { /* 폴백폰트로 진행 */ }
}

// 프로젝트 정규화 (구 스키마 호환: 로비/텍스트 스타일/벽·바닥 필드)
function normalizeProject(project) {
  ensureLobby(project);
  ensureTextStyles(project);
  normalizeSurfaces(project);
  ensureOrigins(project); // P2: 레거시 체인 배치 → origin
  ensureTexts(project);   // P4: 고정 타이틀월/섹션 패널 → 자유 배치 텍스트 오브젝트
  return project;
}

// 커스텀 패턴 이미지 사전 로드 (P5) — buildWorld 는 동기이므로 미리 로드해 전달
async function preloadPatterns(project, ctx) {
  const keys = new Set();
  const scan = (r) => {
    if (r?.wall?.pattern === 'custom' && r.wall.patternAsset) keys.add(r.wall.patternAsset);
    if (r?.floor?.preset === 'custom' && r.floor.asset) keys.add(r.floor.asset);
    // P3: 면 단위 오버라이드의 커스텀 패턴
    for (const f of Object.values(r?.wallFaces || {})) {
      if (f?.pattern === 'custom' && f.patternAsset) keys.add(f.patternAsset);
    }
  };
  for (const r of (project.rooms || [])) scan(r);
  scan(project.lobby);
  const map = {};
  await Promise.all([...keys].map(k => new Promise((res) => {
    const img = new Image();
    img.onload = () => { map[k] = img; res(); };
    img.onerror = () => res();
    img.src = resolveAsset(ctx, k);
  })));
  return map;
}

// ---- 조명 ---------------------------------------------------------------
function setupLights(scene, isMobile) {
  const hemi = new THREE.HemisphereLight(0xfff2dc, 0x3a2f28, 0.55);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffe9cc, 0.35);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xffe6c0, 0.7);
  key.position.set(6, 14, 8);
  if (!isMobile) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 60;
    const s = 24;
    key.shadow.camera.left = -s; key.shadow.camera.right = s;
    key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0004;
  }
  scene.add(key);
  return { hemi, amb, key };
}

// ---- 디버그 오빗 카메라 (M0 검증용) -------------------------------------
function attachOrbit(camera, dom, target) {
  let az = 0.6, pol = 1.15, dist = 18;
  let dragging = false, px = 0, py = 0;
  const apply = () => {
    const sp = Math.sin(pol), cp = Math.cos(pol);
    camera.position.set(
      target.x + dist * sp * Math.sin(az),
      target.y + dist * cp,
      target.z + dist * sp * Math.cos(az)
    );
    camera.lookAt(target.x, target.y, target.z);
  };
  dom.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; py = e.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    az -= (e.clientX - px) * 0.005; pol -= (e.clientY - py) * 0.005;
    pol = Math.max(0.2, Math.min(1.5, pol)); px = e.clientX; py = e.clientY; apply();
  });
  dom.addEventListener('wheel', (e) => { dist = Math.max(4, Math.min(40, dist + e.deltaY * 0.02)); apply(); e.preventDefault(); }, { passive: false });
  apply();
  return { apply };
}

// ---- 부팅 ---------------------------------------------------------------
async function boot() {
  const isMobile = params.get('mobile') === '1' ||
    (params.get('mobile') !== '0' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

  const renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: !isMobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (!isMobile) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14100e);
  scene.fog = new THREE.Fog(0x14100e, 22, 48);

  setProgress(0.1, '데이터를 불러오는 중…');
  let ctx;
  try {
    ctx = await loadData();
  } catch (err) {
    el.loadTitle.textContent = '데이터를 불러오지 못했습니다';
    el.loadPct.textContent = String(err.message || err);
    console.error(err);
    return;
  }
  let { project } = ctx;
  normalizeProject(project);

  const v = validateProject(project);
  if (!v.ok) console.warn('[museum] 검증 경고/오류:', v.errors, v.warnings);
  el.loadTitle.textContent = project.meta?.title || '미술관';

  // 폰트 로드 완료 후 텍스트 텍스처를 그린다(§5.1). 실패해도 폴백으로 진행.
  await ensureFont();

  setProgress(0.4, '공간을 짓는 중…');
  let patternImages = await preloadPatterns(project, ctx);
  const layout = computeLayout(project);
  let world = buildWorld(scene, project, layout, patternImages);

  setProgress(0.7, '작품을 거는 중…');
  let arts = buildArtworks(scene, project, layout, ctx, resolveAsset);

  // 작품 텍스처 로드를 기다리며 실제 진행률 표시 (실패해도 resolve — 부팅 계속)
  if (arts.loads.length) {
    let done = 0;
    await Promise.all(arts.loads.map(p => p.then(() => {
      done++;
      setProgress(0.7 + 0.28 * (done / arts.loads.length));
    })));
  }

  setupLights(scene, isMobile);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  const b = layout.bounds;
  const target = { x: (b.xMin + b.xMax) / 2, y: 1.6, z: (b.zMin + b.zMax) / 2 };

  let controls = null, interactions = null, orbit = null, avatar = null, hud = null, autowalk = null, editMode = null;
  const EDIT = params.get('preview') === '1' && params.get('edit') === '1' && !isMobile; // P2 (데스크톱 전용)

  // 갤러리 입장 (캐릭터 선택 후 / skipIntro 즉시) — HUD onEnter 와 임베드 진입 공용
  const enterGallery = (opts) => {
    avatar = makeAvatar(opts);
    scene.add(avatar);
    // 임베드 프리뷰(P1): 스폰을 로비 안쪽으로 당겨 3인칭 카메라 풀백 공간 확보
    // (스폰 지점은 남쪽 벽 0.8m 앞이라 즉시 입장 시 카메라가 아바타에 밀착됨)
    const spawnZ = SKIP_INTRO ? Math.max(1.5, layout.spawn.z - 2.2) : layout.spawn.z;
    controls = new PlayerControls(avatar, camera, world.colliders, renderer.domElement, {
      spawnX: layout.spawn.x, spawnZ,
    });
    interactions = new Interactions(controls, arts.anchors, document.getElementById('hud'));
    hud?.attachControls(controls);
    const dwell = parseFloat(params.get('dwell')) || 4;
    autowalk = new AutoWalk(controls, arts.anchors, layout, project, { dwell });
    window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'p' && !interactions.isOpen) autowalk.toggle(); });
    window.__museum.controls = controls;
    window.__museum.interactions = interactions;
    window.__museum.avatar = avatar;
    window.__museum.autowalk = autowalk;
  };

  if (DEBUG_CAM) {
    orbit = attachOrbit(camera, renderer.domElement, target);
  } else if (EDIT) {
    // 3D 편집 프리뷰 (P2): 시작 화면 없이 자유 비행 카메라 + 편집 오버레이 (아래에서 생성)
  } else if (SKIP_INTRO) {
    // P1 임베드: 캐릭터 선택 화면 생략, 아바타로 즉시 입장 (아래 window.__museum 이후 호출)
  } else {
    // 시작 화면 동안: 로비 스폰에서 타이틀월(북쪽)을 바라보는 오프닝 샷
    camera.position.set(layout.spawn.x, 1.5, layout.spawn.z);
    camera.lookAt(layout.spawn.x, 1.5, layout.spawn.z - 6);
    hud = new HUD(project, { isMobile, onEnter: enterGallery });
  }

  window.__museum = { scene, camera, renderer, project, layout, world, arts, ctx, controls, interactions, avatar, hud };

  if (EDIT) {
    const { EditMode } = await import('./editMode.js');
    editMode = new EditMode(window.__museum, {
      onMessage: (msg) => window.opener?.postMessage(msg, location.origin),
    });
    window.__museum.editMode = editMode;
  } else if (!DEBUG_CAM && SKIP_INTRO) {
    enterGallery(resolveEmbedAvatar(project));
  }

  // ---- 프리뷰 라이브 리빌드 (v1.2): 에디터가 재전송한 프로젝트를 즉시 반영 ----
  function disposeGroup(g) {
    g.traverse(o => {
      if (o.isMesh) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m) { m.map?.dispose(); m.dispose(); } }
      }
    });
  }
  async function rebuild(project2, blobs2) {
    ctx.project = project2;
    if (blobs2) ctx.blobs = blobs2;
    normalizeProject(project2);
    project = project2;
    patternImages = await preloadPatterns(project2, ctx);
    scene.remove(world.group); disposeGroup(world.group);
    scene.remove(arts.group); disposeGroup(arts.group);
    const layout2 = computeLayout(project2);
    Object.assign(layout, layout2); // 참조 유지(컨트롤/오토워크가 같은 객체를 봄)
    world = buildWorld(scene, project2, layout, patternImages);
    arts = buildArtworks(scene, project2, layout, ctx, resolveAsset);
    if (controls) controls.colliders = world.colliders;
    if (interactions) { interactions.anchors = arts.anchors; interactions.current = null; }
    if (autowalk) {
      autowalk.stop?.();
      autowalk.anchors = arts.anchors;
      autowalk._byId = {}; for (const a of arts.anchors) autowalk._byId[a.id] = a;
    }
    lastRoom = -99; // 라이트 매니저 재평가
    Object.assign(window.__museum, { project, world, arts });
    if (editMode) editMode.onRebuild();
  }
  window.__museum.rebuild = rebuild;
  if (params.get('preview') === '1') {
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data) return;
      if (e.data.type === 'museum-preview-data' && window.__museum.ready) {
        rebuild(e.data.project, e.data.blobs);
      } else if (e.data.type === 'museum-preview-pause') {
        // P1: 프리뷰 패널 접힘 → 렌더 루프 일시정지 / 펼침 → 재개
        window.__museum.setPaused?.(!!e.data.paused);
      }
    });
  }
  window.__museum.ready = true;

  setProgress(1.0, '완료');
  setTimeout(() => el.loading.classList.add('hidden'), 250);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let lastRoom = -1;
  let paused = false;
  const timer = new THREE.Timer();
  window.__museum.setPaused = (p) => {
    if (paused === !!p) return;
    paused = !!p;
    if (!paused) { timer.update(); animate(); } // 재개: dt 리셋 후 루프 재시작
  };
  function animate() {
    if (paused) return;
    requestAnimationFrame(animate);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    if (editMode) {
      editMode.update(dt);
    } else if (controls) {
      if (autowalk && autowalk.active) autowalk.update(dt);
      controls.update(dt);
      if (interactions) interactions.update(dt);
      // 라이트 매니저: 모바일은 현재 룸의 조명만 활성(§5.8)
      if (isMobile && (arts.spots.length || world.moodLights.length)) {
        const ci = currentRoomIndex(controls.pos, layout);
        if (ci !== lastRoom) {
          lastRoom = ci;
          for (const s of arts.spots) s.spot.visible = (s.roomIndex === ci);
          for (const m of world.moodLights) m.light.visible = (m.roomIndex === ci);
        }
      }
    }
    renderer.render(scene, camera);
  }
  animate();
}

// 플레이어가 현재 어느 룸에 있는지. 로비 = -1 (로비 조명/스포트 매칭용).
function currentRoomIndex(pos, layout) {
  for (let i = 0; i < layout.rooms.length; i++) {
    const r = layout.rooms[i].rect;
    if (pos.x >= r.xMin - 0.3 && pos.x <= r.xMax + 0.3 && pos.y >= r.zMin - 0.3 && pos.y <= r.zMax + 0.3) return i;
  }
  const lb = layout.lobby;
  if (lb && pos.x >= lb.xMin - 0.3 && pos.x <= lb.xMax + 0.3 && pos.y >= lb.zMin - 0.3 && pos.y <= lb.zMax + 0.3) return -1;
  return 0;
}

boot();
