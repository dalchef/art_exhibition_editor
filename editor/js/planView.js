// editor/js/planView.js — 2D 평면도 모드.
import { computeLayout, wallLeftToWorld, wallLength, LAYOUT, RANGES } from '../../shared/schema.js';

const WALLS = ['north', 'east', 'south', 'west'];

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
    this._bind();
    this.resize();
  }

  activate() { this.canvas.style.display = 'block'; this.resize(); }
  deactivate() { this.canvas.style.display = 'none'; }

  resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cw = r.width; this.ch = r.height;
    this._fit();
    this.render();
  }

  _fit() {
    const layout = computeLayout(this.store.project);
    const b = layout.bounds; if (!b) return;
    const bw = b.xMax - b.xMin, bh = b.zMax - b.zMin;
    const pad = 48;
    const s = Math.min((this.cw - pad * 2) / bw, (this.ch - pad * 2) / bh);
    this.view.scale = s;
    this.view.ox = (this.cw - bw * s) / 2 - b.xMin * s;
    this.view.oy = (this.ch - bh * s) / 2 - b.zMin * s;
    this.layout = layout;
  }

  w2s(x, z) { return [x * this.view.scale + this.view.ox, z * this.view.scale + this.view.oy]; }
  s2w(sx, sz) { return [(sx - this.view.ox) / this.view.scale, (sz - this.view.oy) / this.view.scale]; }

  render() {
    const g = this.ctx, { cw, ch } = this;
    g.clearRect(0, 0, cw, ch);
    g.fillStyle = '#14171c'; g.fillRect(0, 0, cw, ch);
    if (!this.layout) this._fit();
    const layout = this.layout;
    const selId = this.store.selection.roomId;

    // 나침반
    g.fillStyle = '#5a6472'; g.font = '600 12px Pretendard'; g.textAlign = 'center';
    g.fillText('N ↑', 24, 22);

    // 로비
    this._rect(layout.lobby, '#2a2f38', '#3a4250', false);
    const [lcx, lcy] = this.w2s((layout.lobby.xMin + layout.lobby.xMax) / 2, (layout.lobby.zMin + layout.lobby.zMax) / 2);
    g.fillStyle = '#6b7686'; g.font = '600 12px Pretendard'; g.textAlign = 'center';
    g.fillText('로비 · 타이틀월', lcx, lcy);

    // 룸
    layout.rooms.forEach((lr, i) => {
      const room = this.store.project.rooms[i];
      const on = room.id === selId;
      this._rect(lr.rect, on ? '#2f3a46' : '#262c35', on ? this.store._accent || '#c9a24c' : '#3a4250', on);
      const [cx, cy] = this.w2s((lr.rect.xMin + lr.rect.xMax) / 2, (lr.rect.zMin + lr.rect.zMax) / 2);
      g.fillStyle = on ? '#f0e3c4' : '#aab4c2'; g.font = '700 13px Pretendard'; g.textAlign = 'center';
      g.fillText(room.name || `룸 ${i + 1}`, cx, cy - 4);
      g.fillStyle = '#6b7686'; g.font = '400 11px Pretendard';
      g.fillText(`${room.size.w}×${room.size.d}m`, cx, cy + 12);

      // 작품 마커
      for (const aw of (room.artworks || [])) {
        const p = wallLeftToWorld(lr.rect, aw.placement.wall, aw.placement.x);
        const [mx, my] = this.w2s(p.x, p.z);
        g.fillStyle = '#e6c878'; g.beginPath(); g.arc(mx, my, 4, 0, 7); g.fill();
      }
      // exitDoor
      if (room.exitDoor) this._door(lr.rect, room.exitDoor, on, room.id);
    });

    // 겹침 경고
    if (layout.overlaps.length) {
      g.fillStyle = '#d06a6a'; g.font = '700 13px Pretendard'; g.textAlign = 'left';
      g.fillText('⚠ 룸이 겹칩니다 — 크기/순서/문 위치를 조정하세요', 16, ch - 16);
    }
  }

  _rect(rect, fill, stroke, bold) {
    const g = this.ctx;
    const [x0, y0] = this.w2s(rect.xMin, rect.zMin);
    const [x1, y1] = this.w2s(rect.xMax, rect.zMax);
    g.fillStyle = fill; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = stroke; g.lineWidth = bold ? 2.5 : 1.5; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  _door(rect, door, on, roomId) {
    const g = this.ctx;
    const c = wallLeftToWorld(rect, door.wall, door.offset);
    const half = LAYOUT.DOOR_W / 2;
    const a = wallLeftToWorld(rect, door.wall, door.offset - half);
    const b = wallLeftToWorld(rect, door.wall, door.offset + half);
    const [ax, ay] = this.w2s(a.x, a.z), [bx, by] = this.w2s(b.x, b.z);
    g.strokeStyle = on ? '#e6c878' : '#8a94a2'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    const [cx, cy] = this.w2s(c.x, c.z);
    g.fillStyle = '#e6c878'; g.beginPath(); g.arc(cx, cy, on ? 6 : 4, 0, 7); g.fill();
    if (on) this._doorHandle = { x: cx, y: cy, rect, wall: door.wall, roomId };
  }

  _bind() {
    const pos = (e) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    this.canvas.addEventListener('pointerdown', (e) => {
      const [sx, sy] = pos(e);
      // 문 핸들 히트
      if (this._doorHandle && Math.hypot(sx - this._doorHandle.x, sy - this._doorHandle.y) < 12) {
        this.drag = { type: 'door', ...this._doorHandle }; this.canvas.setPointerCapture(e.pointerId); return;
      }
      // 룸 히트 → 선택
      const hit = this._hitRoom(sx, sy);
      if (hit) {
        this.store.select({ roomId: hit.room.id });
        this.drag = { type: 'maybe-wall', sx, sy, hit };
        this.canvas.setPointerCapture(e.pointerId);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const [sx, sy] = pos(e);
      if (this.drag.type === 'door') {
        const [wx, wz] = this.s2w(sx, sy);
        const rect = this.drag.rect, wall = this.drag.wall;
        let t = this._alongWall(rect, wall, wx, wz);
        const len = wallLength(rect, wall);
        t = Math.max(LAYOUT.DOOR_W / 2, Math.min(len - LAYOUT.DOOR_W / 2, t));
        this.store.mutate(p => {
          const rr = p.rooms.find(r => r.id === this.drag.roomId);
          if (rr && rr.exitDoor) rr.exitDoor.offset = +t.toFixed(2);
        }, { detail: { silent: true }, coalesce: 'door:' + this.drag.roomId });
        this._fit(); this.render();
      } else if (this.drag.type === 'maybe-wall') {
        if (Math.hypot(sx - this.drag.sx, sy - this.drag.sy) > 6) this.drag.type = 'moved';
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (this.drag && this.drag.type === 'maybe-wall') {
        // 클릭(드래그 아님) → 벽 선택 후 정면뷰
        const [sx, sy] = pos(e);
        const wall = this._nearestWall(this.drag.hit, sx, sy);
        if (wall) { this.store.select({ roomId: this.drag.hit.room.id, wall }); this.onWallPick(this.drag.hit.room.id, wall); }
      }
      if (this.drag && this.drag.type === 'door') this.store.breakCoalesce();
      this.drag = null;
    });
  }

  _hitRoom(sx, sy) {
    const layout = this.layout;
    for (let i = 0; i < layout.rooms.length; i++) {
      const rect = layout.rooms[i].rect;
      const [x0, y0] = this.w2s(rect.xMin, rect.zMin);
      const [x1, y1] = this.w2s(rect.xMax, rect.zMax);
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) return { room: this.store.project.rooms[i], rect, index: i };
    }
    // 로비 (P3 — 선택·벽 편집 가능)
    const lb = layout.lobby;
    if (lb) {
      const [x0, y0] = this.w2s(lb.xMin, lb.zMin);
      const [x1, y1] = this.w2s(lb.xMax, lb.zMax);
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) return { room: { id: '__lobby__' }, rect: lb, index: -1 };
    }
    return null;
  }

  _nearestWall(hit, sx, sy) {
    const rect = hit.rect;
    const edges = {
      north: this._distToSeg(sx, sy, rect.xMin, rect.zMin, rect.xMax, rect.zMin),
      south: this._distToSeg(sx, sy, rect.xMin, rect.zMax, rect.xMax, rect.zMax),
      west: this._distToSeg(sx, sy, rect.xMin, rect.zMin, rect.xMin, rect.zMax),
      east: this._distToSeg(sx, sy, rect.xMax, rect.zMin, rect.xMax, rect.zMax),
    };
    return Object.entries(edges).sort((a, b) => a[1] - b[1])[0][0];
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
