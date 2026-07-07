// editor/js/app.js — 에디터 진입점: 상태/패널/모드전환/전역 이벤트.
import { ProjectStore } from './state.js';
import { LibraryPanel } from './libraryPanel.js';
import { Inspector } from './inspector.js';
import { PlanView } from './planView.js';
import { ElevationView } from './elevationView.js';
import { PRESETS, RANGES, LOBBY_RANGES, makeRoom, computeLayout, wallLength, LAYOUT } from '../../shared/schema.js';
import { openPreview } from './previewBridge.js';
import { exportPublishZip } from './exporter.js';
import { openApiSearch } from './apiSearch.js';

const $ = (s) => document.querySelector(s);

const WALL_SWATCH = { 'deep-red': '#5e2626', green: '#2c4436', navy: '#26324e', gray: '#5f5a53' };
const FLOOR_SWATCH = { 'walnut-herringbone': '#6b4a30', 'oak-herringbone': '#9c7748', 'ash-plank': '#c3ac86', 'walnut-plank': '#5c3f2b' };
const LABELS = { 'deep-red': '딥레드', green: '딥그린', navy: '네이비', gray: '웜그레이', 'walnut-herringbone': '월넛헤링본', 'oak-herringbone': '오크헤링본', 'ash-plank': '애쉬플랭크', 'walnut-plank': '월넛플랭크', warm: 'Warm', neutral: 'Neutral', cool: 'Cool' };

let store, plan, elev, mode = 'plan';

async function main() {
  store = await new ProjectStore().init();
  window.__store = store;
  window.__views = {}; // 디버그/검증용 뷰 참조

  new LibraryPanel(store, $('#library-root'));
  new Inspector(store, $('#inspector-root'), { onApiFill: (a) => openApiSearch(store, a) });
  plan = new PlanView(store, $('#canvas-host'), { onWallPick: () => setMode('elevation') });
  elev = new ElevationView(store, $('#canvas-host'));
  elev.deactivate();
  window.__views = { plan, elev };

  bindTopbar();
  bindTabs();
  bindModes();
  bindStrip();
  bindKeys();

  store.on('load', () => { renderAll(); });
  store.on('change', () => { renderCanvas(); renderStrip(); renderRoute(); markDirty(true); });
  store.on('select', () => { renderRoomProps(); renderAtmosphere(); renderStrip(); });
  store.on('saved', () => markDirty(false));
  store.on('dirty', () => markDirty(true));
  store.on('undoredo', () => renderAll());
  window.addEventListener('resize', () => renderCanvas());

  renderAll();
}

function renderAll() {
  $('#proj-title').value = store.project.meta.title || '';
  renderCanvas(); renderRoomProps(); renderAtmosphere(); renderRoute(); renderStrip(); updateUndoBtns();
}
function renderCanvas() { (mode === 'plan' ? plan : elev).resize(); }

// ---- 모드 전환 ----
function bindModes() {
  document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  updateModeHint();
}
function setMode(m) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  if (m === 'plan') { elev.deactivate(); plan.activate(); }
  else { plan.deactivate(); elev.activate(); }
  updateModeHint();
}
function updateModeHint() {
  $('#mode-hint').textContent = mode === 'plan'
    ? '룸 클릭 = 선택 · 벽 클릭 = 정면뷰 진입 · 문 핸들 드래그 = 위치 이동'
    : `${store.selection.wall || ''} 벽 · 보관함에서 드래그해 걸기 · 작품 드래그로 이동(150cm 스냅)`;
}

// ---- 탭 ----
function bindTabs() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
    $('#tab-artwork').hidden = t.dataset.tab !== 'artwork';
    $('#tab-space').hidden = t.dataset.tab !== 'space';
  }));
}

// ---- 상단바 ----
function bindTopbar() {
  $('#proj-title').addEventListener('input', (e) => store.mutate(p => { p.meta.title = e.target.value; }, { detail: { silent: true }, coalesce: 'meta.title' }));
  $('#btn-undo').addEventListener('click', () => store.undo());
  $('#btn-redo').addEventListener('click', () => store.redo());
  $('#btn-preview').addEventListener('click', () => openPreview(store));
  $('#btn-publish').addEventListener('click', () => doPublish());
  $('#btn-saveproj').addEventListener('click', () => doSaveProject());
  $('#btn-openproj').addEventListener('click', () => $('#proj-file').click());
  $('#proj-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await store.importProjectZip(f); toast('프로젝트를 불러왔습니다.'); }
    catch (err) { toast('불러오기 실패: ' + err.message, true); }
    e.target.value = '';
  });
}
function updateUndoBtns() { $('#btn-undo').disabled = !store.canUndo(); $('#btn-redo').disabled = !store.canRedo(); }
function markDirty(d) { const el = $('#save-state'); el.textContent = d ? '저장 중…' : '저장됨'; el.classList.toggle('dirty', d); updateUndoBtns(); }

async function doSaveProject() {
  await store.save();
  const blob = await store.exportProjectZip();
  download(blob, `${store.project.meta.slug || 'museum'}-project.zip`);
  toast('작업 파일(zip)을 저장했습니다.');
}
async function doPublish() {
  const v = store.validate();
  if (!v.ok) { toast('검증 오류: ' + v.errors[0], true); return; }
  try { await store.save(); await exportPublishZip(store); toast('Publish ZIP 을 생성했습니다.'); }
  catch (err) { toast('Publish 실패: ' + err.message, true); console.error(err); }
}

// 룸/로비 공용 참조 (mutate 콜백 안에서 사용)
function roomRef(p, id) { return id === '__lobby__' ? p.lobby : p.rooms.find(x => x.id === id); }

// ---- 룸 속성 (Space 탭) ----
function renderRoomProps() {
  const root = $('#room-props-root'); const room = store.selectedRoom;
  if (!room) { root.innerHTML = '<div class="inspector-empty">룸을 선택하세요.</div>'; return; }
  const isLobby = room.id === '__lobby__';
  const idx = store.project.rooms.indexOf(room);
  const isLast = !isLobby && idx === store.project.rooms.length - 1;
  const R = isLobby ? { w: LOBBY_RANGES.w, d: LOBBY_RANGES.d, h: LOBBY_RANGES.h }
                    : { w: RANGES.roomW, d: RANGES.roomD, h: RANGES.roomH };
  root.innerHTML = `
    <div class="panel-title">${isLobby ? '로비 속성 (그랜드 로비)' : '룸 속성'}</div>
    ${isLobby ? '<div class="hint-note" style="margin-bottom:10px">전시 타이틀월과 입장 문이 있는 대공간입니다. 삭제·순서 변경 불가.</div>' : `
    <div class="field"><label>섹션명</label><input type="text" data-rp="name" value="${attr(room.name)}"></div>
    <div class="field"><label>섹션 서문</label><textarea data-rp="intro">${text(room.intro)}</textarea></div>`}
    <div class="field-row">
      <div class="field"><label>폭 W (${R.w.join('–')}m)</label><input type="number" step="0.5" data-size="w" value="${room.size.w}"></div>
      <div class="field"><label>깊이 D (${R.d.join('–')}m)</label><input type="number" step="0.5" data-size="d" value="${room.size.d}"></div>
    </div>
    <div class="field"><label>높이 H (${R.h.join('–')}m)</label><input type="number" step="0.1" data-size="h" value="${room.size.h}"></div>
    ${isLobby || isLast ? (isLobby ? '' : '<div class="hint-note">마지막 룸 — 출구 문 없음</div>') : `
    <div class="field"><label>출구 문 벽</label>
      <div class="seg" data-exit-wall>${PRESETS.wallDir.map(w => `<button data-v="${w}" class="${room.exitDoor?.wall === w ? 'on' : ''}">${w}</button>`).join('')}</div></div>
    <div class="field"><label>문 위치 offset (m)</label><input type="number" step="0.1" data-exit-offset value="${room.exitDoor?.offset ?? 3}"></div>`}
  `;
  const upd = (fn, opts = {}) => store.mutate(p => { const r = roomRef(p, room.id); if (r) fn(r); }, { detail: { silent: opts.silent !== false }, coalesce: opts.coalesce });
  root.querySelector('[data-rp=name]')?.addEventListener('input', e => upd(r => { r.name = e.target.value; }, { coalesce: `room.name:${room.id}` }));
  root.querySelector('[data-rp=intro]')?.addEventListener('input', e => upd(r => { r.intro = e.target.value; }, { coalesce: `room.intro:${room.id}` }));
  const SIZE_RANGE = R;
  root.querySelectorAll('[data-size]').forEach(inp => {
    inp.addEventListener('input', () => upd(r => { const v = parseFloat(inp.value); if (v > 0) r.size[inp.dataset.size] = v; }, { coalesce: `room.size:${inp.dataset.size}:${room.id}` }));
    // 확정(blur/Enter) 시 허용 범위로 클램프
    inp.addEventListener('change', () => {
      const [lo, hi] = SIZE_RANGE[inp.dataset.size];
      const v = Math.max(lo, Math.min(hi, parseFloat(inp.value) || lo));
      if (String(v) !== inp.value) inp.value = v;
      upd(r => { r.size[inp.dataset.size] = v; }, { coalesce: `room.size:${inp.dataset.size}:${room.id}` });
      store.breakCoalesce();
    });
  });
  const ew = root.querySelector('[data-exit-wall]');
  if (ew) ew.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; upd(r => { r.exitDoor = r.exitDoor || { offset: 3 }; r.exitDoor.wall = b.dataset.v; }, { silent: false }); renderRoomProps(); });
  const eo = root.querySelector('[data-exit-offset]');
  if (eo) {
    eo.addEventListener('input', e => upd(r => { const v = parseFloat(e.target.value); if (r.exitDoor) r.exitDoor.offset = v; }, { coalesce: `room.exit:${room.id}` }));
    // 확정 시 실제 배치 rect 기준 벽 길이로 클램프
    eo.addEventListener('change', () => {
      const layout = computeLayout(store.project);
      const i = store.project.rooms.findIndex(x => x.id === room.id);
      const r = store.project.rooms[i];
      if (!r?.exitDoor || !layout.rooms[i]) return;
      const len = wallLength(layout.rooms[i].rect, r.exitDoor.wall);
      const v = Math.max(LAYOUT.DOOR_W / 2, Math.min(len - LAYOUT.DOOR_W / 2, parseFloat(eo.value) || LAYOUT.DOOR_W / 2));
      if (String(v) !== eo.value) eo.value = +v.toFixed(2);
      upd(rr => { rr.exitDoor.offset = +v.toFixed(2); }, { coalesce: `room.exit:${room.id}` });
      store.breakCoalesce();
    });
  }
}

// ---- 분위기 (우측) ----
const DECOR_LABELS = {
  benches: '벤치', spotlights: '스포트라이트',
  chandelier: '샹들리에', columns: '기둥', cofferedCeiling: '코퍼드 천장',
  goldTrim: '골드 몰딩', carpet: '레드 카펫',
};
function renderAtmosphere() {
  const root = $('#atmosphere-root'); const room = store.selectedRoom;
  if (!room) { root.innerHTML = '<div class="inspector-empty">룸을 선택하세요.</div>'; return; }
  const decorRows = Object.keys(room.decor).map(k =>
    `<div class="toggle-row"><label>${DECOR_LABELS[k] || k}</label><div class="switch ${room.decor[k] ? 'on' : ''}" data-decor="${k}"></div></div>`).join('');
  const W = room.wall, F = room.floor;
  const PATTERN_LABELS = { damask: '다마스크', stripes: '줄무늬', plaster: '플라스터', fabric: '패브릭', dots: '도트', plain: '민무늬', custom: '커스텀' };
  const patternOpts = ['damask', 'stripes', 'plaster', 'fabric', 'dots', 'plain', ...(W.patternAsset ? ['custom'] : [])];
  root.innerHTML = `
    <div class="swatch-group"><h4>벽 색 (P5 자유 색)</h4>
      <div class="field-row" style="align-items:center;gap:6px">
        <input type="color" data-wall-color value="${W.color}" style="width:40px;height:30px;border:none;border-radius:6px;background:none;cursor:pointer">
        <input type="text" data-wall-hex value="${W.color}" style="flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:6px 8px;font-size:12px">
      </div>
      <div class="swatches" style="margin-top:8px">${Object.entries(WALL_SWATCH).map(([k, c]) =>
        `<div class="swatch ${W.color === c ? 'on' : ''}" data-wall-quick="${c}" style="background:${c}"><span>${LABELS[k]}</span></div>`).join('')}</div>
    </div>
    <div class="swatch-group"><h4>벽 패턴</h4>
      <select data-wall-pattern style="width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px">
        ${patternOpts.map(o => `<option value="${o}" ${W.pattern === o ? 'selected' : ''}>${PATTERN_LABELS[o]}</option>`).join('')}
      </select>
      <div class="field" style="margin-top:8px"><label>패턴 강도 ${Math.round((W.patternOpacity ?? 1) * 100)}%</label>
        <input type="range" data-wall-op min="0" max="1" step="0.05" value="${W.patternOpacity ?? 1}"></div>
      <div class="field"><label>반복 크기 ${W.patternScale}m (0.25–4)</label>
        <input type="range" data-wall-scale min="0.25" max="4" step="0.25" value="${W.patternScale}"></div>
      <div class="toggle-row"><label>미러 반복(이음매 완화)</label><div class="switch ${W.patternMirror ? 'on' : ''}" data-wall-mirror></div></div>
      <label class="lib-browse" style="display:block;text-align:center;margin-top:6px;font-size:12px">패턴 이미지 업로드<input type="file" accept="image/*" data-wall-upload hidden></label>
    </div>
    <div class="swatch-group"><h4>바닥</h4>
      <div class="swatches">${Object.entries(FLOOR_SWATCH).map(([k, c]) =>
        `<div class="swatch ${F.preset === k ? 'on' : ''}" data-floor="${k}" style="background:${c}"><span>${LABELS[k]}</span></div>`).join('')}
        <div class="swatch ${F.preset === 'custom' ? 'on' : ''}" data-floor="custom" style="background:#444;display:${F.asset ? 'block' : 'none'}"><span>커스텀</span></div>
      </div>
      ${F.preset === 'custom' ? `<div class="field" style="margin-top:8px"><label>타일 크기 ${F.scale}m</label>
        <input type="range" data-floor-scale min="0.25" max="4" step="0.25" value="${F.scale || 1}"></div>
      <div class="toggle-row"><label>미러 반복</label><div class="switch ${F.mirror ? 'on' : ''}" data-floor-mirror></div></div>` : ''}
      <label class="lib-browse" style="display:block;text-align:center;margin-top:6px;font-size:12px">바닥 이미지 업로드<input type="file" accept="image/*" data-floor-upload hidden></label>
    </div>
    <div class="swatch-group"><h4>조명 무드</h4>
      <div class="seg" data-mood>${PRESETS.lightingMood.map(m => `<button data-v="${m}" class="${room.lighting.mood === m ? 'on' : ''}">${LABELS[m]}</button>`).join('')}</div></div>
    ${decorRows}`;

  const upd = (fn, rerender = true) => { store.mutate(p => { const r = roomRef(p, room.id); if (r) fn(r); }, { detail: {} }); if (rerender) renderAtmosphere(); };
  const updQuiet = (fn, coalesce) => store.mutate(p => { const r = roomRef(p, room.id); if (r) fn(r); }, { detail: { silent: true }, coalesce });

  root.querySelector('[data-wall-color]').addEventListener('input', e => { updQuiet(r => { r.wall.color = e.target.value; }, 'wallcolor:' + room.id); root.querySelector('[data-wall-hex]').value = e.target.value; });
  root.querySelector('[data-wall-hex]').addEventListener('change', e => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) upd(r => { r.wall.color = v; }); });
  root.querySelectorAll('[data-wall-quick]').forEach(el => el.addEventListener('click', () => upd(r => { r.wall.color = el.dataset.wallQuick; })));
  root.querySelector('[data-wall-pattern]').addEventListener('change', e => upd(r => { r.wall.pattern = e.target.value; }));
  root.querySelector('[data-wall-op]').addEventListener('input', e => updQuiet(r => { r.wall.patternOpacity = parseFloat(e.target.value); }, 'wallop:' + room.id));
  root.querySelector('[data-wall-scale]').addEventListener('input', e => updQuiet(r => { r.wall.patternScale = parseFloat(e.target.value); }, 'wallsc:' + room.id));
  root.querySelector('[data-wall-mirror]').addEventListener('click', () => upd(r => { r.wall.patternMirror = !r.wall.patternMirror; }));
  root.querySelector('[data-wall-upload]').addEventListener('change', (e) => uploadPattern(e.target.files[0], room.id, 'wall'));
  root.querySelectorAll('[data-floor]').forEach(el => el.addEventListener('click', () => {
    if (el.dataset.floor === 'custom' && !room.floor.asset) return;
    upd(r => { r.floor.preset = el.dataset.floor; if (el.dataset.floor === 'custom') { r.floor.scale = r.floor.scale || 1; } });
  }));
  root.querySelector('[data-floor-scale]')?.addEventListener('input', e => updQuiet(r => { r.floor.scale = parseFloat(e.target.value); }, 'floorsc:' + room.id));
  root.querySelector('[data-floor-mirror]')?.addEventListener('click', () => upd(r => { r.floor.mirror = !r.floor.mirror; }));
  root.querySelector('[data-floor-upload]').addEventListener('change', (e) => uploadPattern(e.target.files[0], room.id, 'floor'));
  root.querySelector('[data-mood]').addEventListener('click', e => { const b = e.target.closest('button'); if (b) upd(r => { r.lighting.mood = b.dataset.v; }); });
  root.querySelectorAll('[data-decor]').forEach(el => el.addEventListener('click', () => upd(r => { r.decor[el.dataset.decor] = !r.decor[el.dataset.decor]; })));
}

// 커스텀 패턴 업로드 (P5): 1024px WebP 최적화 → IndexedDB → wall/floor 필드 연결
async function uploadPattern(file, roomId, kind) {
  if (!file) return;
  try {
    const { processImageFile } = await import('./libraryPanel.js');
    const res = await processImageFile(file, 1024);
    const id = 'pat-' + Math.random().toString(36).slice(2, 8);
    await store.addImage(id, res.blob, res.thumbBlob);
    store.mutate(p => {
      const r = roomId === '__lobby__' ? p.lobby : p.rooms.find(x => x.id === roomId);
      if (!r) return;
      if (kind === 'wall') { r.wall.pattern = 'custom'; r.wall.patternAsset = id; r.wall.patternScale = r.wall.patternScale || 1; }
      else { r.floor.preset = 'custom'; r.floor.asset = id; r.floor.scale = r.floor.scale || 1; }
    }, { detail: {} });
    renderAtmosphere();
    toast('패턴을 적용했습니다. 반복 크기로 타일링을 조정하세요.');
  } catch (err) { toast('패턴 업로드 실패: ' + err.message, true); }
}

// ---- 관람 순서(대본 목차) ----
function renderRoute() {
  const root = $('#route-root'); if (!root) return;
  const route = store.project.route || [];
  const byId = {};
  for (const r of store.project.rooms) for (const a of (r.artworks || [])) byId[a.id] = a;
  for (const a of (store.project.lobby?.artworks || [])) byId[a.id] = a;
  root.innerHTML = `<div class="panel-title">관람 순서 (대본 목차)</div>` +
    (route.length ? `<ol style="padding-left:18px;font-size:13px;line-height:1.9">` +
      route.map(id => `<li>${attr(byId[id]?.caption?.title || id)}</li>`).join('') + `</ol>`
      : '<div class="inspector-empty">배치된 작품이 없습니다.</div>');
}

// ---- 룸 스트립 ----
function bindStrip() {
  $('#btn-add-room').addEventListener('click', () => {
    if (store.project.rooms.length >= RANGES.rooms[1]) { toast(`룸은 최대 ${RANGES.rooms[1]}개입니다.`, true); return; }
    store.mutate(p => {
      const prev = p.rooms[p.rooms.length - 1];
      if (prev && !prev.exitDoor) prev.exitDoor = { wall: 'north', offset: prev.size.w / 2 };
      p.rooms.push(makeRoom({ name: `${p.rooms.length + 1}. 새 섹션`, exitDoor: null }, p.rooms.length));
    }, { detail: {} });
    store.select({ roomId: store.project.rooms[store.project.rooms.length - 1].id });
  });
  renderStrip();
}
function renderStrip() {
  const root = $('#strip-scroll'); if (!root) return;
  const lb = store.project.lobby;
  const lobbyCard = `
    <div class="room-card lobby-card ${store.selection.roomId === '__lobby__' ? 'on' : ''}" data-id="__lobby__">
      <div class="rc-name">🏛 로비</div>
      <div class="rc-meta">${(lb?.artworks || []).length}점 · ${lb?.size.w}×${lb?.size.d}m</div>
    </div>`;
  root.innerHTML = lobbyCard + store.project.rooms.map((r, i) => `
    <div class="room-card ${r.id === store.selection.roomId ? 'on' : ''}" draggable="true" data-id="${r.id}" data-i="${i}">
      <button class="rc-del" title="삭제">✕</button>
      <div class="rc-name">${attr(r.name)}</div>
      <div class="rc-meta">${(r.artworks || []).length}점 · ${r.size.w}×${r.size.d}m</div>
    </div>`).join('');
  root.querySelectorAll('.room-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', (e) => { if (e.target.classList.contains('rc-del')) return; store.select({ roomId: id }); });
    card.querySelector('.rc-del')?.addEventListener('click', () => deleteRoom(id));
    if (id !== '__lobby__') {
      card.addEventListener('dragstart', e => e.dataTransfer.setData('text/room-idx', card.dataset.i));
      card.addEventListener('dragover', e => e.preventDefault());
      card.addEventListener('drop', e => { e.preventDefault(); reorderRoom(+e.dataTransfer.getData('text/room-idx'), +card.dataset.i); });
    }
  });
}
function deleteRoom(id) {
  if (store.project.rooms.length <= RANGES.rooms[0]) { toast(`룸은 최소 ${RANGES.rooms[0]}개입니다.`, true); return; }
  store.mutate(p => {
    const i = p.rooms.findIndex(r => r.id === id); if (i < 0) return;
    for (const a of (p.rooms[i].artworks || [])) p.route = p.route.filter(x => x !== a.id);
    p.rooms.splice(i, 1);
    const last = p.rooms[p.rooms.length - 1]; if (last) last.exitDoor = null;
  }, { detail: {} });
  if (store.selection.roomId === id) store.select({ roomId: store.project.rooms[0].id, artworkId: null });
}
function reorderRoom(from, to) {
  if (from === to || from == null) return;
  store.mutate(p => {
    const [r] = p.rooms.splice(from, 1); p.rooms.splice(to, 0, r);
    p.rooms.forEach((rm, i) => { if (i === p.rooms.length - 1) rm.exitDoor = null; else if (!rm.exitDoor) rm.exitDoor = { wall: 'north', offset: rm.size.w / 2 }; });
  }, { detail: {} });
}

// ---- 키보드 ----
function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
  });
}

// ---- 유틸 ----
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function attr(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function text(s) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

window.__toast = toast;
main();
