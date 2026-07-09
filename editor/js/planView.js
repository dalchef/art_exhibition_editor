// editor/js/planView.js — 2D 평면도 모드 (v1.3 P2 상호작용 개편).
// 단계적 선택: 룸 클릭 = 선택(강조만) → 활성 룸 벽 호버 스냅(12px) → 벽 클릭 = 정면뷰 진입.
// 자유 배치: 활성 룸 드래그 이동(엣지 자석 스냅 + 겹침 방지), 8핸들 크기 조절(치수 실시간),
// 문 핸들 드래그(무효 문 = 빨강), 벽 밖 작품 = 빨간 마커 경고(자동 삭제 없음).
import { computeLayout, wallLeftToWorld, wallLength, LAYOUT, RANGES, doorCovered } from '../../shared/schema.js';
import { artworkOuterSize } from '../../shared/placementRules.js';

const WALL_HOVER_PX = 12;  // 벽 호버 스냅 임계 (스펙: 화면 기준 약 12px)
const HANDLE_PX = 5;       // 크기 핸들 반경(px)
const SNAP_M = 0.45;       // 룸 이동 자석 스냅 거리(m)
const DRAG_START_PX = 5;   // 클릭/드래그 판별 임계
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

export class PlanView {
  constructor(store, host, opts = {}) {
    this.store = store;
    this.host = host;
    this.onWallPick = opts.onWallPick || (() => {});
    this.canvas = document.createElement('canvas');
    this.host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.drag = null;
    this.hoverWall = null;   // { roomId, wall } — 활성 룸 벽 호버 스냅
    this.dimLabel = null;    // { x, y, text } — 크기 조절 중 치수
    this._bind();
    this.resize();
  }

  activate() { this.canvas.style.display = 'block'; this.resize(); }
  deactivate() { this.canvas.style.display = 'none'; this.hoverWall = null; }

  resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cw = r.width; this.ch = r.height;
    this._fit(); // 드래그 중 store 변경 → resize() 경유 재호출돼도 뷰 변환은 고정
    this.render();
  }

  // 레이아웃은 항상 재계산, 뷰 변환(scale/offset)은 드래그 중 고정(커서-좌표 안정성)
  _fit(force = false) {
    this.layout = computeLayout(this.store.project);
    if (!force && this.drag && ['move', 'resize', 'door'].includes(this.drag.type)) return;
    const b = this.layout.bounds; if (!b) return;
    const bw = b.xMax - b.xMin, bh = b.zMax - b.zMin;
    const pad = 48;
    const s = Math.min((this.cw - pad * 2) / bw, (this.ch - pad * 2) / bh);
    this.view.scale = s;
    this.view.ox = (this.cw - bw * s) / 2 - b.xMin * s;
    this.view.oy = (this.ch - bh * s) / 2 - b.zMin * s;
  }

  w2s(x, z) { return [x * this.view.scale + this.view.ox, z * this.view.scale + this.view.oy]; }
  s2w(sx, sz) { return [(sx - this.view.ox) / this.view.scale, (sz - this.view.oy) / this.view.scale]; }

  // ---- 렌더 ----------------------------------------------------------------
  render() {
    const g = this.ctx, { cw, ch } = this;
    g.clearRect(0, 0, cw, ch);
    g.fillStyle = '#14171c'; g.fillRect(0, 0, cw, ch);
    this._fit();
    const layout = this.layout;
    if (!layout?.lobby) return;
    const selId = this.store.selection.roomId;

    // 나침반
    g.fillStyle = '#5a6472'; g.font = '600 12px Pretendard'; g.textAlign = 'center';
    g.fillText('N ↑', 24, 22);

    // 로비 + 입장 문(북쪽 중앙 고정)
    this._rect(layout.lobby, selId === '__lobby__' ? '#2f3a46' : '#2a2f38', selId === '__lobby__' ? '#c9a24c' : '#3a4250', selId === '__lobby__');
    const [lcx, lcy] = this.w2s((layout.lobby.xMin + layout.lobby.xMax) / 2, (layout.lobby.zMin + layout.lobby.zMax) / 2);
    g.fillStyle = '#6b7686'; g.font = '600 12px Pretendard'; g.textAlign = 'center';
    g.fillText('로비 · 타이틀월', lcx, lcy);
    this._lobbyDoor(layout);

    // 룸
    this._doorHandle = null;
    layout.rooms.forEach((lr, i) => {
      const room = this.store.project.rooms[i];
      const on = room.id === selId;
      this._rect(lr.rect, on ? '#2f3a46' : '#262c35', on ? '#c9a24c' : '#3a4250', on);
      const [cx, cy] = this.w2s((lr.rect.xMin + lr.rect.xMax) / 2, (lr.rect.zMin + lr.rect.zMax) / 2);
      g.fillStyle = on ? '#f0e3c4' : '#aab4c2'; g.font = '700 13px Pretendard'; g.textAlign = 'center';
      g.fillText(room.name || `룸 ${i + 1}`, cx, cy - 4);
      g.fillStyle = '#6b7686'; g.font = '400 11px Pretendard';
      g.fillText(`${fmt(room.size.w)}×${fmt(room.size.d)}m`, cx, cy + 12);

      // 작품 마커 (P2 배치물 보호: 벽 범위 밖 = 빨강)
      for (const aw of (room.artworks || [])) {
        const wl = wallLength(lr.rect, aw.placement.wall);
        const o = artworkOuterSize(aw);
        const out = aw.placement.x - o.w / 2 < -0.01 || aw.placement.x + o.w / 2 > wl + 0.01;
        const p = wallLeftToWorld(lr.rect, aw.placement.wall, Math.max(0, Math.min(wl, aw.placement.x)));
        const [mx, my] = this.w2s(p.x, p.z);
        g.fillStyle = out ? '#e05656' : '#e6c878';
        g.beginPath(); g.arc(mx, my, out ? 5 : 4, 0, 7); g.fill();
        if (out) { g.strokeStyle = '#e05656'; g.lineWidth = 1.5; g.beginPath(); g.arc(mx, my, 8, 0, 7); g.stroke(); }
      }
      // exitDoor
      if (room.exitDoor) this._door(lr.rect, room, on);
    });

    // 활성 룸: 벽 호버 하이라이트 + 크기 핸들
    const activeRect = this._rectOf(selId);
    if (activeRect) {
      if (this.hoverWall && this.hoverWall.roomId === selId) this._highlightWall(activeRect, this.hoverWall.wall);
      if (selId !== '__lobby__') this._handles(activeRect);
    }

    // 치수 라벨 (크기 조절/이동 중)
    if (this.dimLabel) {
      const { x, y, text } = this.dimLabel;
      g.font = '700 12px Pretendard'; g.textAlign = 'left';
      const tw = g.measureText(text).width;
      g.fillStyle = 'rgba(20,22,28,.92)'; g.fillRect(x, y - 16, tw + 14, 22);
      g.fillStyle = '#f0e3c4'; g.fillText(text, x + 7, y);
    }

    // 경고 (겹침 / 무효 문 / 벽 밖 작품)
    const warns = [];
    if (layout.overlaps.length) warns.push('⚠ 룸이 겹칩니다 — 위치/크기를 조정하세요');
    if (!doorCovered(layout, '__lobby__', 'north', (layout.lobby.xMax - layout.lobby.xMin) / 2)) {
      warns.push('⚠ 로비 입장 문(북쪽 중앙)이 룸과 맞닿지 않습니다');
    }
    layout.rooms.forEach((lr, i) => {
      const room = this.store.project.rooms[i];
      if (room.exitDoor && !doorCovered(layout, room.id, room.exitDoor.wall, room.exitDoor.offset)) {
        warns.push(`⚠ ${room.name}: 출구 문이 인접 공간과 맞닿지 않습니다`);
      }
    });
    g.font = '700 12px Pretendard'; g.textAlign = 'left';
    warns.slice(0, 3).forEach((t, i) => { g.fillStyle = '#d06a6a'; g.fillText(t, 16, ch - 16 - i * 18); });
  }

  _rect(rect, fill, stroke, bold) {
    const g = this.ctx;
    const [x0, y0] = this.w2s(rect.xMin, rect.zMin);
    const [x1, y1] = this.w2s(rect.xMax, rect.zMax);
    g.fillStyle = fill; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = stroke; g.lineWidth = bold ? 2.5 : 1.5; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  _rectOf(id) {
    if (!id || !this.layout) return null;
    if (id === '__lobby__') return this.layout.lobby;
    return this.layout.rooms.find(r => r.id === id)?.rect || null;
  }

  // 벽 호버 하이라이트: 색 강조 + 두께 증가 (클릭 전 어느 벽인지 명확히)
  _highlightWall(rect, wall) {
    const g = this.ctx;
    const a = wallLeftToWorld(rect, wall, 0);
    const b = wallLeftToWorld(rect, wall, wallLength(rect, wall));
    const [ax, ay] = this.w2s(a.x, a.z), [bx, by] = this.w2s(b.x, b.z);
    g.strokeStyle = '#6ea3d6'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#cfe2f4'; g.font = '600 11px Pretendard'; g.textAlign = 'center';
    g.fillText('클릭 → 정면뷰', (ax + bx) / 2, (ay + by) / 2 - 8);
  }

  // 8방향 크기 핸들
  _handlePts(rect) {
    const [x0, y0] = this.w2s(rect.xMin, rect.zMin);
    const [x1, y1] = this.w2s(rect.xMax, rect.zMax);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    return { nw: [x0, y0], n: [mx, y0], ne: [x1, y0], e: [x1, my], se: [x1, y1], s: [mx, y1], sw: [x0, y1], w: [x0, my] };
  }
  _handles(rect) {
    const g = this.ctx;
    const pts = this._handlePts(rect);
    for (const k of HANDLES) {
      const [hx, hy] = pts[k];
      g.fillStyle = '#c9a24c'; g.strokeStyle = '#14171c'; g.lineWidth = 1;
      g.fillRect(hx - HANDLE_PX, hy - HANDLE_PX, HANDLE_PX * 2, HANDLE_PX * 2);
      g.strokeRect(hx - HANDLE_PX, hy - HANDLE_PX, HANDLE_PX * 2, HANDLE_PX * 2);
    }
  }
  _hitHandle(rect, sx, sy) {
    const pts = this._handlePts(rect);
    for (const k of HANDLES) {
      const [hx, hy] = pts[k];
      if (Math.abs(sx - hx) <= HANDLE_PX + 3 && Math.abs(sy - hy) <= HANDLE_PX + 3) return k;
    }
    return null;
  }

  // 문 (exitDoor): 활성 룸 = 드래그 핸들, 무효 문 = 빨강
  _door(rect, room, on) {
    const g = this.ctx;
    const door = room.exitDoor;
    const valid = doorCovered(this.layout, room.id, door.wall, door.offset);
    const len = wallLength(rect, door.wall);
    const t = Math.max(0, Math.min(len, door.offset));
    const half = LAYOUT.DOOR_W / 2;
    const a = wallLeftToWorld(rect, door.wall, Math.max(0, t - half));
    const b = wallLeftToWorld(rect, door.wall, Math.min(len, t + half));
    const c = wallLeftToWorld(rect, door.wall, t);
    const [ax, ay] = this.w2s(a.x, a.z), [bx, by] = this.w2s(b.x, b.z);
    g.strokeStyle = valid ? (on ? '#e6c878' : '#8a94a2') : '#e05656';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    const [cx, cy] = this.w2s(c.x, c.z);
    g.fillStyle = valid ? '#e6c878' : '#e05656';
    g.beginPath(); g.arc(cx, cy, on ? 6 : 4, 0, 7); g.fill();
    if (on) this._doorHandle = { x: cx, y: cy, rect, wall: door.wall, roomId: room.id };
  }

  // 로비 입장 문 (북쪽 중앙 고정 · 드래그 불가)
  _lobbyDoor(layout) {
    const g = this.ctx;
    const lb = layout.lobby;
    const cx = (lb.xMin + lb.xMax) / 2;
    const valid = doorCovered(layout, '__lobby__', 'north', (lb.xMax - lb.xMin) / 2);
    const [ax, ay] = this.w2s(cx - LAYOUT.DOOR_W / 2, lb.zMin);
    const [bx] = this.w2s(cx + LAYOUT.DOOR_W / 2, lb.zMin);
    g.strokeStyle = valid ? '#8a94a2' : '#e05656'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, ay); g.stroke();
  }

  // ---- 입력 ------------------------------------------------------------------
  _bind() {
    const pos = (e) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    this.canvas.addEventListener('pointerdown', (e) => {
      const [sx, sy] = pos(e);
      const selId = this.store.selection.roomId;
      const activeRect = this._rectOf(selId);

      // 1) 문 핸들 (활성 룸)
      if (this._doorHandle && Math.hypot(sx - this._doorHandle.x, sy - this._doorHandle.y) < 12) {
        this.drag = { type: 'door', ...this._doorHandle };
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      // 2) 크기 핸들 (활성 룸, 로비 제외)
      if (activeRect && selId !== '__lobby__') {
        const h = this._hitHandle(activeRect, sx, sy);
        if (h) {
          this.drag = { type: 'resize', roomId: selId, dir: h, start: { ...activeRect } };
          this.canvas.setPointerCapture(e.pointerId);
          return;
        }
      }
      // 3) 활성 룸 벽 근처 → 정면뷰 진입 대기 (클릭 판정은 pointerup)
      if (activeRect) {
        const w = this._nearestWallWithin(activeRect, sx, sy, WALL_HOVER_PX);
        if (w) {
          this.drag = { type: 'wallclick', roomId: selId, wall: w, sx, sy };
          this.canvas.setPointerCapture(e.pointerId);
          return;
        }
      }
      // 4) 룸 히트 → 선택 + 이동 대기
      const hit = this._hitRoom(sx, sy);
      if (hit) {
        if (hit.room.id !== selId) this.store.select({ roomId: hit.room.id, artworkId: null, textId: null });
        if (hit.room.id !== '__lobby__') {
          const [wx, wz] = this.s2w(sx, sy);
          const room = this.store.project.rooms.find(r => r.id === hit.room.id);
          this.drag = { type: 'maybe', roomId: hit.room.id, sx, sy, offX: wx - room.origin.x, offZ: wz - room.origin.z, lastValid: { ...room.origin } };
          this.canvas.setPointerCapture(e.pointerId);
        }
        this.render();
        return;
      }
      // 5) 빈 공간 → 선택 해제
      if (selId) { this.store.select({ roomId: null, artworkId: null, wall: null, textId: null }); this.render(); }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const [sx, sy] = pos(e);
      if (!this.drag) { this._hover(sx, sy); return; }

      if (this.drag.type === 'door') this._dragDoor(sx, sy);
      else if (this.drag.type === 'resize') this._dragResize(sx, sy);
      else if (this.drag.type === 'maybe') {
        if (Math.hypot(sx - this.drag.sx, sy - this.drag.sy) > DRAG_START_PX) { this.drag.type = 'move'; this.hoverWall = null; }
      } else if (this.drag.type === 'wallclick') {
        if (Math.hypot(sx - this.drag.sx, sy - this.drag.sy) > DRAG_START_PX) this.drag.cancelled = true;
      }
      if (this.drag.type === 'move') this._dragMove(sx, sy);
    });

    this.canvas.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      this.dimLabel = null;
      if (!d) return;
      if (d.type === 'wallclick' && !d.cancelled) {
        // 하이라이트된 벽 클릭 → 정면뷰 진입
        this.store.select({ roomId: d.roomId, wall: d.wall, artworkId: null, textId: null });
        this.onWallPick(d.roomId, d.wall);
        return;
      }
      if (['move', 'resize', 'door'].includes(d.type)) {
        this.store.breakCoalesce();
        this.store.save();
      }
      this._fit(true);
      this.render();
    });
  }

  // 호버(드래그 없음): 활성 룸 벽 스냅 + 커서
  _hover(sx, sy) {
    const selId = this.store.selection.roomId;
    const rect = this._rectOf(selId);
    let cursor = 'default';
    let hw = null;
    if (rect) {
      if (selId !== '__lobby__') {
        const h = this._hitHandle(rect, sx, sy);
        if (h) cursor = HANDLE_CURSOR[h];
      }
      if (cursor === 'default' && this._doorHandle && Math.hypot(sx - this._doorHandle.x, sy - this._doorHandle.y) < 12) {
        cursor = 'grab';
      }
      if (cursor === 'default') {
        const w = this._nearestWallWithin(rect, sx, sy, WALL_HOVER_PX);
        if (w) { hw = { roomId: selId, wall: w }; cursor = 'pointer'; }
      }
    }
    if (cursor === 'default') {
      const hit = this._hitRoom(sx, sy);
      if (hit) cursor = hit.room.id === selId && hit.room.id !== '__lobby__' ? 'grab' : 'pointer';
    }
    this.canvas.style.cursor = cursor;
    const changed = JSON.stringify(hw) !== JSON.stringify(this.hoverWall);
    this.hoverWall = hw;
    if (changed) this.render();
  }

  // ---- 드래그 동작 -----------------------------------------------------------
  _dragDoor(sx, sy) {
    const [wx, wz] = this.s2w(sx, sy);
    const { rect, wall, roomId } = this.drag;
    let t = this._alongWall(rect, wall, wx, wz);
    const len = wallLength(rect, wall);
    t = Math.max(LAYOUT.DOOR_W / 2, Math.min(len - LAYOUT.DOOR_W / 2, t));
    this.store.mutate(p => {
      const rr = p.rooms.find(r => r.id === roomId);
      if (rr && rr.exitDoor) rr.exitDoor.offset = +t.toFixed(2);
    }, { detail: { silent: true }, coalesce: 'door:' + roomId });
    this.render();
  }

  _dragResize(sx, sy) {
    const [wx, wz] = this.s2w(sx, sy);
    const { roomId, dir, start } = this.drag;
    let { xMin, xMax, zMin, zMax } = start;
    const [wLo, wHi] = RANGES.roomW, [dLo, dHi] = RANGES.roomD;
    const r1 = (v) => Math.round(v * 10) / 10;
    if (dir.includes('w')) xMin = r1(Math.min(Math.max(wx, xMax - wHi), xMax - wLo));
    if (dir.includes('e')) xMax = r1(Math.max(Math.min(wx, xMin + wHi), xMin + wLo));
    if (dir.includes('n')) zMin = r1(Math.min(Math.max(wz, zMax - dHi), zMax - dLo));
    if (dir.includes('s')) zMax = r1(Math.max(Math.min(wz, zMin + dHi), zMin + dLo));
    this.store.mutate(p => {
      const rr = p.rooms.find(r => r.id === roomId);
      if (!rr) return;
      rr.origin.x = xMin; rr.origin.z = zMin;
      rr.size.w = +(xMax - xMin).toFixed(2);
      rr.size.d = +(zMax - zMin).toFixed(2);
    }, { detail: { silent: true }, coalesce: 'room-resize:' + roomId });
    const [lx, ly] = this.w2s(xMax, zMin);
    this.dimLabel = { x: lx + 10, y: ly + 14, text: `${fmt(xMax - xMin)} × ${fmt(zMax - zMin)} m` };
    this.render();
  }

  _dragMove(sx, sy) {
    const [wx, wz] = this.s2w(sx, sy);
    const d = this.drag;
    const room = this.store.project.rooms.find(r => r.id === d.roomId);
    if (!room) return;
    const w = room.size.w, dep = room.size.d;
    const r05 = (v) => Math.round(v * 20) / 20;
    let cand = { x: r05(wx - d.offX), z: r05(wz - d.offZ) };
    cand = this._snapOrigin(cand, w, dep, d.roomId);
    // 겹침 방지: 겹치면 마지막 유효 위치 유지
    if (this._overlaps(cand, w, dep, d.roomId)) cand = d.lastValid;
    else d.lastValid = { ...cand };
    this.store.mutate(p => {
      const rr = p.rooms.find(r => r.id === d.roomId);
      if (rr) { rr.origin.x = cand.x; rr.origin.z = cand.z; }
    }, { detail: { silent: true }, coalesce: 'room-move:' + d.roomId });
    this.render();
  }

  // 엣지 자석 스냅: 다른 공간의 평행 엣지에 근접하면 딱 붙임(flush) / 정렬
  _snapOrigin(cand, w, d, selfId) {
    const others = this._otherRects(selfId);
    let bestDX = null, bestDZ = null;
    for (const R of others) {
      const zNear = Math.min(cand.z + d, R.zMax) - Math.max(cand.z, R.zMin) > -SNAP_M;
      const xNear = Math.min(cand.x + w, R.xMax) - Math.max(cand.x, R.xMin) > -SNAP_M;
      if (zNear) {
        for (const [edge, target] of [[cand.x, R.xMax], [cand.x + w, R.xMin], [cand.x, R.xMin], [cand.x + w, R.xMax]]) {
          const dx = target - edge;
          if (Math.abs(dx) < SNAP_M && (bestDX === null || Math.abs(dx) < Math.abs(bestDX))) bestDX = dx;
        }
      }
      if (xNear) {
        for (const [edge, target] of [[cand.z, R.zMax], [cand.z + d, R.zMin], [cand.z, R.zMin], [cand.z + d, R.zMax]]) {
          const dz = target - edge;
          if (Math.abs(dz) < SNAP_M && (bestDZ === null || Math.abs(dz) < Math.abs(bestDZ))) bestDZ = dz;
        }
      }
    }
    return { x: +(cand.x + (bestDX || 0)).toFixed(3), z: +(cand.z + (bestDZ || 0)).toFixed(3) };
  }

  _otherRects(selfId) {
    const out = [this.layout.lobby];
    for (const lr of this.layout.rooms) if (lr.id !== selfId) out.push(lr.rect);
    return out;
  }

  _overlaps(origin, w, d, selfId) {
    const EPS = 1e-6;
    for (const R of this._otherRects(selfId)) {
      const ox = Math.min(origin.x + w, R.xMax) - Math.max(origin.x, R.xMin);
      const oz = Math.min(origin.z + d, R.zMax) - Math.max(origin.z, R.zMin);
      if (ox > EPS && oz > EPS) return true;
    }
    return false;
  }

  // ---- 히트 테스트 ------------------------------------------------------------
  _hitRoom(sx, sy) {
    const layout = this.layout;
    for (let i = 0; i < layout.rooms.length; i++) {
      const rect = layout.rooms[i].rect;
      const [x0, y0] = this.w2s(rect.xMin, rect.zMin);
      const [x1, y1] = this.w2s(rect.xMax, rect.zMax);
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) return { room: this.store.project.rooms[i], rect, index: i };
    }
    const lb = layout.lobby;
    if (lb) {
      const [x0, y0] = this.w2s(lb.xMin, lb.zMin);
      const [x1, y1] = this.w2s(lb.xMax, lb.zMax);
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) return { room: { id: '__lobby__' }, rect: lb, index: -1 };
    }
    return null;
  }

  _nearestWallWithin(rect, sx, sy, maxPx) {
    const edges = {
      north: this._distToSeg(sx, sy, rect.xMin, rect.zMin, rect.xMax, rect.zMin),
      south: this._distToSeg(sx, sy, rect.xMin, rect.zMax, rect.xMax, rect.zMax),
      west: this._distToSeg(sx, sy, rect.xMin, rect.zMin, rect.xMin, rect.zMax),
      east: this._distToSeg(sx, sy, rect.xMax, rect.zMin, rect.xMax, rect.zMax),
    };
    const [wall, dist] = Object.entries(edges).sort((a, b) => a[1] - b[1])[0];
    return dist <= maxPx ? wall : null;
  }
  _distToSeg(sx, sy, ax, az, bx, bz) {
    const [pax, pay] = this.w2s(ax, az), [pbx, pby] = this.w2s(bx, bz);
    const dx = pbx - pax, dy = pby - pay; const l2 = dx * dx + dy * dy || 1;
    let t = ((sx - pax) * dx + (sy - pay) * dy) / l2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(sx - (pax + t * dx), sy - (pay + t * dy));
  }
  _alongWall(rect, wall, wx, wz) {
    if (wall === 'north') return wx - rect.xMin;
    if (wall === 'south') return rect.xMax - wx;
    if (wall === 'east') return wz - rect.zMin;
    return rect.zMax - wz;
  }
}

function fmt(v) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }
