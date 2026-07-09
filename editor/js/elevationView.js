// editor/js/elevationView.js — 벽면 정면(입면) 배치 모드.
// P0: 3D와 동일한 "액자 포함 외곽" 기준 렌더·판정 (shared/placementRules.js 공용 로직).
//     그림/매트/액자 경계 구분 표시 + 룸 조명 무드 틴트 + 걸레받이·몰딩 실척 반영.
// P1: 4코너 스케일 핸들(비율 고정) + 실시간 치수 라벨 + scale 1.0 실측 스냅(Alt=미세 조정).
import { computeLayout, wallLength, wallLeftToWorld, LAYOUT, doorCovered, textBlocks } from '../../shared/schema.js';
import { artworkOuterSize, resolvePlacement, resolveScale, FRAME_STYLES, EYE_LEVEL_CM } from '../../shared/placementRules.js';
import { WALL_COLORS, wallStyleCanvas, styledTextCanvas } from '../../viewer/js/textures.js';
import { makeArtwork } from '../../shared/schema.js';

const HANDLE_PX = 9;           // 코너 핸들 화면 크기(px)
const MOOD_TINT = {            // 조명 무드 근사 틴트 (P0 — 색 체감 차이 축소)
  warm: 'rgba(255,187,120,0.10)',
  neutral: 'rgba(255,255,255,0.0)',
  cool: 'rgba(150,182,255,0.10)',
};
const FRAME_CSS = { gold: '#c9a24c', wood: '#6e4a2e', black: '#1a1a1c' };

export class ElevationView {
  constructor(store, host) {
    this.store = store;
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'elev-toolbar'; this.toolbar.style.display = 'none';
    this.toolbar.innerHTML = `<button data-a="dup">복제</button><button data-a="del">삭제</button>`;
    this.host.appendChild(this.toolbar);
    this.drag = null; this.guide = null; this.dimLabel = null;
    this._bind();
  }

  activate() { this.canvas.style.display = 'block'; this.resize(); }
  deactivate() { this.canvas.style.display = 'none'; this.toolbar.style.display = 'none'; }

  get room() { return this.store.selectedRoom; }
  get wall() { return this.store.selection.wall || 'north'; }

  resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cw = r.width; this.ch = r.height;
    this._fit(); this.render();
  }

  _fit() {
    const room = this.room; if (!room) return;
    const layout = computeLayout(this.store.project);
    this._layout = layout;
    this.rect = room.id === '__lobby__' ? layout.lobby
      : (layout.rooms.find(r => r.id === room.id)?.rect || null);
    const wlen = this._wallLen(), h = room.size.h;
    const pad = 60;
    this.scale = Math.min((this.cw - pad * 2) / wlen, (this.ch - pad * 2) / h) * 0.92;
    this.originX = (this.cw - wlen * this.scale) / 2;
    this.floorY = (this.ch + h * this.scale) / 2;
  }

  _wallLen() {
    // 실제 배치 rect 기준. east/west 진행 룸은 축이 회전되어 size.w/d 와 다르다.
    if (this.rect) return wallLength(this.rect, this.wall);
    const room = this.room;
    return (this.wall === 'north' || this.wall === 'south') ? room.size.w : room.size.d;
  }
  u2s(u) { return this.originX + u * this.scale; }
  v2s(v) { return this.floorY - v * this.scale; }
  s2u(sx) { return (sx - this.originX) / this.scale; }
  s2v(sy) { return (this.floorY - sy) / this.scale; }

  render() {
    const room = this.room; if (!room) return;
    this._fit();
    const g = this.ctx, wlen = this._wallLen(), h = room.size.h;
    g.clearRect(0, 0, this.cw, this.ch);
    g.fillStyle = '#14171c'; g.fillRect(0, 0, this.cw, this.ch);

    // 벽면 (P5: 색+패턴 동일 렌더 + P0: 조명 무드 틴트 + P3: 면 단위 스타일)
    const wx = this.u2s(0), wy = this.v2s(h), ww = wlen * this.scale, wh = h * this.scale;
    const faceDef = (room.wallFaces && room.wallFaces[this.wall]) || room.wall;
    const patImg = faceDef.pattern === 'custom' && faceDef.patternAsset
      ? this._img(this.store.getImageURL(faceDef.patternAsset)) : null;
    const { canvas: patCv, tileM } = wallStyleCanvas(faceDef, (patImg && patImg.complete && patImg.naturalWidth) ? patImg : null);
    const pat = g.createPattern(patCv, 'repeat');
    const s = (tileM * this.scale) / patCv.width;
    pat.setTransform(new DOMMatrix().translateSelf(wx, this.floorY).scaleSelf(s, s));
    g.fillStyle = pat;
    g.fillRect(wx, wy, ww, wh);
    const tint = MOOD_TINT[room.lighting?.mood || 'warm'];
    if (tint) { g.fillStyle = tint; g.fillRect(wx, wy, ww, wh); }
    g.strokeStyle = '#454d59'; g.lineWidth = 2; g.strokeRect(wx, wy, ww, wh);

    // 상단 몰딩(0.10m) + 걸레받이(0.14m) — 실척 (P0)
    g.fillStyle = '#e9e0d0';
    g.fillRect(wx, wy, ww, Math.max(2, 0.10 * this.scale));
    g.fillStyle = '#2c2622';
    g.fillRect(wx, this.floorY - 0.14 * this.scale, ww, 0.14 * this.scale);
    g.strokeStyle = '#3a4250'; g.beginPath(); g.moveTo(wx, this.floorY); g.lineTo(wx + ww, this.floorY); g.stroke();

    // 문 개구부 (로비 북벽 = 입장 문 포함) — P2: 무효 문(인접 공간 없음)은 빨간 점선
    const doorInfo = this._door();
    if (doorInfo) {
      const valid = this._layout ? doorCovered(this._layout, room.id, this.wall, doorInfo.offset) : true;
      const dcx = doorInfo.offset, dw = LAYOUT.DOOR_W, dh = LAYOUT.DOOR_H;
      const dx = this.u2s(dcx - dw / 2), dy = this.v2s(dh);
      g.fillStyle = valid ? '#0e1116' : 'rgba(224,86,86,.12)';
      g.fillRect(dx, dy, dw * this.scale, dh * this.scale);
      g.strokeStyle = valid ? '#5a6472' : '#e05656';
      if (!valid) g.setLineDash([6, 4]);
      g.strokeRect(dx, dy, dw * this.scale, dh * this.scale);
      g.setLineDash([]);
      g.fillStyle = valid ? '#6b7686' : '#e05656'; g.font = '600 12px Pretendard'; g.textAlign = 'center';
      g.fillText(valid ? '문' : '문 (인접 공간 없음)', this.u2s(dcx), this.v2s(dh) - 8);
    }

    // 아이레벨 150cm 가이드
    const gy = this.v2s(EYE_LEVEL_CM / 100);
    g.strokeStyle = 'rgba(110,163,214,.35)'; g.setLineDash([6, 6]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(wx, gy); g.lineTo(wx + ww, gy); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(110,163,214,.7)'; g.font = '400 11px Pretendard'; g.textAlign = 'left';
    g.fillText('아이레벨 150cm', wx + 6, gy - 4);

    // 텍스트 오브젝트 (v1.3 P4): 실제 스타일 렌더 미리보기 + 선택/드래그/스케일
    this._texts = [];
    for (const t of (room.texts || [])) {
      if ((t.placement?.wall || 'north') === this.wall) this._drawText(t);
    }

    // 작품들 (액자 포함 외곽 기준)
    const arts = (room.artworks || []).filter(a => a.placement.wall === this.wall);
    for (const a of arts) this._drawArt(a);

    // 이동 가이드
    if (this.guide) {
      g.strokeStyle = 'rgba(201,162,76,.8)'; g.setLineDash([4, 4]);
      if (this.guide.v != null) { const y = this.v2s(this.guide.v); g.beginPath(); g.moveTo(wx, y); g.lineTo(wx + ww, y); g.stroke(); }
      if (this.guide.u != null) { const x = this.u2s(this.guide.u); g.beginPath(); g.moveTo(x, wy); g.lineTo(x, this.floorY); g.stroke(); }
      g.setLineDash([]);
    }

    // P7 스마트 가이드 (빨간 점선 + 균등 간격 화살표/치수)
    if (this.smartGuides?.length) {
      g.strokeStyle = '#e05656'; g.fillStyle = '#e05656'; g.lineWidth = 1.5; g.setLineDash([6, 4]);
      for (const gd of this.smartGuides) {
        if (gd.type === 'line' && gd.orient === 'v') {
          const x = this.u2s(gd.at);
          g.beginPath(); g.moveTo(x, wy); g.lineTo(x, this.floorY); g.stroke();
        } else if (gd.type === 'line' && gd.orient === 'h') {
          const y = this.v2s(gd.at);
          g.beginPath(); g.moveTo(wx, y); g.lineTo(wx + ww, y); g.stroke();
        } else if (gd.type === 'gap') {
          g.setLineDash([]);
          const y = this.v2s(gd.y);
          for (const [s0, e0] of gd.spans) {
            const x0 = this.u2s(s0), x1 = this.u2s(e0);
            g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
            for (const [xx, dir] of [[x0, 1], [x1, -1]]) {
              g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + 5 * dir, y - 4);
              g.moveTo(xx, y); g.lineTo(xx + 5 * dir, y + 4); g.stroke();
            }
            g.font = '700 10px Pretendard'; g.textAlign = 'center';
            g.fillText(`${(e0 - s0).toFixed(2)}m`, (x0 + x1) / 2, y - 6);
          }
          g.setLineDash([6, 4]);
        }
      }
      g.setLineDash([]); g.lineWidth = 1;
    }

    // 치수 라벨 (P1 — 드래그/스케일 중)
    if (this.dimLabel) {
      const { x, y, text, tick } = this.dimLabel;
      g.font = '700 12px Pretendard'; g.textAlign = 'left';
      const tw = g.measureText(text).width;
      g.fillStyle = 'rgba(20,22,28,.92)';
      g.fillRect(x, y - 16, tw + 14 + (tick ? 40 : 0), 22);
      g.fillStyle = '#f0e3c4';
      g.fillText(text, x + 7, y);
      if (tick) { g.fillStyle = '#7ec98a'; g.fillText('실측 ✓', x + tw + 14, y); }
    }

    // 면 소속/치수 안내는 상단 face bar(app.js)가 표시 (P3)

    this._positionToolbar();
  }

  // 텍스트 오브젝트 렌더 (v1.3 P4) — 뷰어와 동일한 styledTextCanvas 로 실제 미리보기
  _drawText(t) {
    const g = this.ctx;
    const wlen = this._wallLen();
    const blocks = textBlocks(this.store.project, this.room, t).filter(b => b.text);
    const cx = this.u2s(t.placement.x), cy = this.v2s((t.placement.centerHeightCm ?? 160) / 100);
    let box;
    if (blocks.length) {
      const r = styledTextCanvas({
        blocks,
        panel: { align: t.panel?.align || 'left', bg: t.panel?.bg || 'none',
                 widthCm: Math.min(t.widthCm || 300, Math.max(40, wlen * 100 - 20)) },
      });
      const wPx = r.wM * this.scale, hPx = r.hM * this.scale;
      g.drawImage(r.canvas, cx - wPx / 2, cy - hPx / 2, wPx, hPx);
      box = { x: cx - wPx / 2, y: cy - hPx / 2, w: wPx, h: hPx, cx, cy, wM: r.wM, hM: r.hM };
    } else {
      // 내용 없는 역할 오브젝트: 자리 표시(선택/이동 가능, 뷰어에는 렌더 안 됨)
      const wPx = Math.min((t.widthCm || 300) / 100, wlen - 0.2) * this.scale, hPx = 0.5 * this.scale;
      box = { x: cx - wPx / 2, y: cy - hPx / 2, w: wPx, h: hPx, cx, cy, wM: wPx / this.scale, hM: 0.5 };
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.setLineDash([5, 4]); g.lineWidth = 1;
      g.strokeRect(box.x, box.y, wPx, hPx); g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '600 11px Pretendard'; g.textAlign = 'center';
      g.fillText(`T ${roleLabel(t.role)} (내용 없음)`, cx, cy + 4);
    }
    const sel = this.store.selection.textId === t.id;
    if (sel) {
      g.strokeStyle = '#6ea3d6'; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6); g.setLineDash([]);
      g.fillStyle = '#6ea3d6';
      for (const [hx, hy] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]) {
        g.fillRect(hx - HANDLE_PX / 2, hy - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
      }
      g.fillStyle = '#8fb8de'; g.font = '600 10px Pretendard'; g.textAlign = 'left';
      g.fillText(`T ${roleLabel(t.role)}`, box.x, box.y - 8);
    }
    t._screen = box;
    this._texts.push(t);
  }

  _drawArt(a) {
    const g = this.ctx;
    const o = artworkOuterSize(a);
    const cx = this.u2s(a.placement.x), cy = this.v2s(a.placement.centerHeightCm / 100);
    const oW = o.w * this.scale, oH = o.h * this.scale;   // 외곽(액자 포함)
    const x = cx - oW / 2, y = cy - oH / 2;
    const sel = a.id === this.store.selection.artworkId;

    // 액자 (외곽 → 안쪽으로 frameW)
    const fCss = FRAME_CSS[a.frame?.style] || null;
    if (o.frameW > 0 && fCss) {
      g.fillStyle = fCss;
      g.fillRect(x, y, oW, oH);
    }
    // 매트
    const mx = x + o.frameW * this.scale, my = y + o.frameW * this.scale;
    const mW = oW - 2 * o.frameW * this.scale, mH = oH - 2 * o.frameW * this.scale;
    if (o.matte > 0) {
      g.fillStyle = a.frame.matteColor || '#f3ead8';
      g.fillRect(mx, my, mW, mH);
    }
    // 그림
    const pW = o.pw * this.scale, pH = o.ph * this.scale;
    const px = cx - pW / 2, py = cy - pH / 2;
    const url = this.store.getThumbURL(a.id);
    const img = this._img(url);
    if (img && img.complete && img.naturalWidth) g.drawImage(img, px, py, pW, pH);
    else { g.fillStyle = '#3a4250'; g.fillRect(px, py, pW, pH); }
    // 그림/액자 경계 구분선
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
    g.strokeRect(px + 0.5, py + 0.5, pW - 1, pH - 1);

    if (sel) {
      g.strokeStyle = '#6ea3d6'; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.strokeRect(x - 3, y - 3, oW + 6, oH + 6); g.setLineDash([]);
      // 4코너 스케일 핸들 (P1)
      g.fillStyle = '#6ea3d6';
      for (const [hx, hy] of [[x, y], [x + oW, y], [x, y + oH], [x + oW, y + oH]]) {
        g.fillRect(hx - HANDLE_PX / 2, hy - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
      }
    }
    // P2 배치물 보호: 벽 축소 등으로 벽 범위를 벗어난 작품 → 빨간 경고 (자동 삭제 없음)
    const wlen = this._wallLen();
    if (a.placement.x - o.w / 2 < -0.01 || a.placement.x + o.w / 2 > wlen + 0.01) {
      g.strokeStyle = '#e05656'; g.lineWidth = 2.5; g.setLineDash([6, 4]);
      g.strokeRect(x - 4, y - 4, oW + 8, oH + 8); g.setLineDash([]);
      g.fillStyle = '#e05656'; g.font = '700 11px Pretendard'; g.textAlign = 'center';
      g.fillText('벽 범위 벗어남', cx, y - 10);
    }
    a._screen = { x, y, w: oW, h: oH, cx, cy };
  }

  _img(url) {
    this._imgs = this._imgs || new Map();
    if (!url) return null;
    if (!this._imgs.has(url)) { const im = new Image(); im.onload = () => this.render(); im.src = url; this._imgs.set(url, im); }
    return this._imgs.get(url);
  }

  _positionToolbar() {
    const a = this.store.selectedArtwork;
    if (!a || !a._screen || a.placement.wall !== this.wall || this.store.selection.artworkId !== a.id) { this.toolbar.style.display = 'none'; return; }
    this.toolbar.style.display = 'flex';
    this.toolbar.style.left = (a._screen.x + a._screen.w / 2) + 'px';
    this.toolbar.style.top = (a._screen.y - 40) + 'px';
  }

  _bind() {
    const pos = (e) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    // 라이브러리에서 드래그해 걸기
    this.canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/artwork-id'); if (!id) return;
      const [sx, sy] = pos(e);
      this._placeFromLibrary(id, this.s2u(sx), this.s2v(sy));
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      const [sx, sy] = pos(e);
      const hitCorner = (s) => s && [[s.x, s.y], [s.x + s.w, s.y], [s.x, s.y + s.h], [s.x + s.w, s.y + s.h]]
        .some(([hx, hy]) => Math.abs(sx - hx) <= HANDLE_PX && Math.abs(sy - hy) <= HANDLE_PX);
      // 선택 텍스트의 코너 핸들 → 스케일 (P4: 폭+글자 크기 비례)
      const selText = this._findText(this.store.selection.textId);
      if (selText && selText._screen && hitCorner(selText._screen)) {
        const s = selText._screen;
        this.drag = {
          type: 'tscale', id: selText.id, d0: Math.max(Math.hypot(sx - s.cx, sy - s.cy), 4),
          w0: selText.widthCm || 300, s0: selText.style?.sizeCm || 10, b0: selText.bodyStyle?.sizeCm || 0,
        };
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      // 선택 작품의 코너 핸들 → 스케일 드래그 (P1)
      const selArt = this.store.selectedArtwork;
      if (selArt && selArt._screen && selArt.placement.wall === this.wall && hitCorner(selArt._screen)) {
        const s = selArt._screen;
        this.drag = { type: 'scale', id: selArt.id, d0: Math.max(Math.hypot(sx - s.cx, sy - s.cy), 4), scale0: selArt.scale || 1 };
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      const a = this._hitArt(sx, sy);
      const t = a ? null : this._hitText(sx, sy);
      if (a) {
        this.store.select({ artworkId: a.id, textId: null, textWall: null });
        this.drag = { type: 'move', id: a.id, offu: this.s2u(sx) - a.placement.x, offv: this.s2v(sy) - a.placement.centerHeightCm / 100 };
        this.canvas.setPointerCapture(e.pointerId);
      } else if (t) {
        // 텍스트 오브젝트 선택 + 드래그 이동 (P4 — 작품과 동일 UX)
        this.store.select({ artworkId: null, textId: t.id, textWall: null });
        this.drag = { type: 'tmove', id: t.id, offu: this.s2u(sx) - t.placement.x, offv: this.s2v(sy) - (t.placement.centerHeightCm ?? 160) / 100 };
        this.canvas.setPointerCapture(e.pointerId);
      } else { this.store.select({ artworkId: null, textId: null, textWall: null }); }
      this.render();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const [sx, sy] = pos(e);
      if (this.drag.type === 'move') {
        const u = this.s2u(sx) - this.drag.offu;
        const v = this.s2v(sy) - this.drag.offv;
        this._applyMove(this.drag.id, u, v, { alt: e.altKey });
      } else if (this.drag.type === 'scale') {
        const a = this._findInRoom(this.drag.id); if (!a) return;
        const d = Math.hypot(sx - a._screen.cx, sy - a._screen.cy);
        const { scale, snapped } = resolveScale(this.drag.scale0 * (d / this.drag.d0), { alt: e.altKey });
        this._applyScale(this.drag.id, scale, snapped);
      } else if (this.drag.type === 'tmove') {
        this._applyTextMove(this.drag.id, this.s2u(sx) - this.drag.offu, this.s2v(sy) - this.drag.offv, { alt: e.altKey });
      } else if (this.drag.type === 'tscale') {
        const t = this._findText(this.drag.id); if (!t || !t._screen) return;
        const f = Math.max(0.25, Math.min(4, Math.hypot(sx - t._screen.cx, sy - t._screen.cy) / this.drag.d0));
        this._applyTextScale(this.drag.id, f);
      }
    });
    this.canvas.addEventListener('pointerup', () => {
      if (this.drag) {
        const wasScale = this.drag.type === 'scale' || this.drag.type === 'tscale';
        this.drag = null; this.guide = null; this.dimLabel = null; this.smartGuides = null;
        this.store.breakCoalesce(); this.store.save();
        if (wasScale) this.store.emit('select'); // 인스펙터 수치 필드 동기 (P1/P4)
        this.render();
      }
    });

    this.toolbar.addEventListener('click', (e) => {
      const act = e.target.dataset.a; if (!act) return;
      const a = this.store.selectedArtwork; if (!a) return;
      if (act === 'del') this._delete(a.id);
      else if (act === 'dup') this._duplicate(a.id);
    });
  }

  _hitArt(sx, sy) {
    const arts = (this.room.artworks || []).filter(a => a.placement.wall === this.wall);
    for (let i = arts.length - 1; i >= 0; i--) { const s = arts[i]._screen; if (s && sx >= s.x && sx <= s.x + s.w && sy >= s.y && sy <= s.y + s.h) return arts[i]; }
    return null;
  }

  _findInRoom(id) { return (this.room.artworks || []).find(x => x.id === id) || null; }

  // ==========================================================================
  // P7: 스마트 정렬 가이드 (PPT 동일 UX) — 작품+텍스트 공통.
  // 벽 중앙 / 아이레벨 / 오브젝트 정렬(좌·중·우, 상·중·하) / 균등 간격.
  // 임계 = 화면 기준 약 7px. Alt 드래그 = 스냅 무시.
  // ==========================================================================

  // 같은 벽의 스냅 대상(드래그 대상 제외): { u, v, w, h }
  _wallItems(excludeId) {
    const items = [];
    for (const a of (this.room.artworks || [])) {
      if (a.id === excludeId || a.placement.wall !== this.wall) continue;
      const o = artworkOuterSize(a);
      items.push({ u: a.placement.x, v: a.placement.centerHeightCm / 100, w: o.w, h: o.h });
    }
    for (const t of (this.room.texts || [])) {
      if (t.id === excludeId || (t.placement?.wall || 'north') !== this.wall) continue;
      const s = t._screen; if (!s) continue;
      items.push({ u: t.placement.x, v: (t.placement.centerHeightCm ?? 160) / 100, w: s.wM || 1, h: s.hM || 0.5 });
    }
    return items;
  }

  // (u,v)=원하는 중심, (w,h)=외곽. 반환 { u, v, uSnapped, vSnapped } + this.smartGuides 채움.
  _smartSnap(u, v, w, h, excludeId, alt) {
    this.smartGuides = [];
    if (alt) return { u, v, uSnapped: false, vSnapped: false };
    const thr = 7 / this.scale;
    const wlen = this._wallLen(), wallH = this.room.size.h;
    const items = this._wallItems(excludeId);

    let bestU = null, bestV = null;
    const considerU = (target, guideAt, kind, extra) => {
      const d = Math.abs(target - u);
      if (d < thr && (!bestU || d < bestU.d)) bestU = { d, u: target, guideAt, kind, extra };
    };
    const considerV = (target, guideAt, kind) => {
      const d = Math.abs(target - v);
      if (d < thr && (!bestV || d < bestV.d)) bestV = { d, v: target, guideAt, kind };
    };

    // 벽면 정중앙 (수평/수직) + 아이레벨
    considerU(wlen / 2, wlen / 2, 'center');
    considerV(wallH / 2, wallH / 2, 'center');
    considerV(EYE_LEVEL_CM / 100, EYE_LEVEL_CM / 100, 'align');

    // 오브젝트 간 정렬: 좌/중/우 (u), 상/중/하 (v)
    for (const it of items) {
      considerU(it.u, it.u, 'align');
      considerU(it.u - it.w / 2 + w / 2, it.u - it.w / 2, 'align');
      considerU(it.u + it.w / 2 - w / 2, it.u + it.w / 2, 'align');
      considerV(it.v, it.v, 'align');
      considerV(it.v + it.h / 2 - h / 2, it.v + it.h / 2, 'align');
      considerV(it.v - it.h / 2 + h / 2, it.v - it.h / 2, 'align');
    }

    // 균등 간격 (같은 높이 밴드의 다른 오브젝트 2개 이상 = 총 3개 이상)
    const band = items.filter(it => Math.abs(it.v - v) < Math.max(h, it.h) * 0.9).sort((p, q) => p.u - q.u);
    for (let i = 0; i < band.length - 1; i++) {
      const A = band[i], B = band[i + 1];
      const aL = A.u - A.w / 2, aR = A.u + A.w / 2;
      const bL = B.u - B.w / 2, bR = B.u + B.w / 2;
      const G = bL - aR;
      if (G <= 0.05) continue;
      if (G > w + 0.1) {
        // 두 오브젝트 사이 중앙 = 좌우 간격 균등
        const cu = (aR + bL) / 2, gap = (G - w) / 2;
        considerU(cu, null, 'gap', { y: v, spans: [[aR, cu - w / 2], [cu + w / 2, bL]] });
      }
      // 행 연장: 기존 간격 G 를 복제해 오른쪽/왼쪽에 배치
      considerU(bR + G + w / 2, null, 'gap', { y: v, spans: [[aR, bL], [bR, bR + G]] });
      considerU(aL - G - w / 2, null, 'gap', { y: v, spans: [[aL - G, aL], [aR, bL]] });
    }

    if (bestU) {
      u = bestU.u;
      if (bestU.kind === 'gap') this.smartGuides.push({ axis: 'u', type: 'gap', ...bestU.extra });
      else this.smartGuides.push({ axis: 'u', type: 'line', orient: 'v', at: bestU.guideAt });
    }
    if (bestV) {
      v = bestV.v;
      this.smartGuides.push({ axis: 'v', type: 'line', orient: 'h', at: bestV.guideAt });
    }
    return { u, v, uSnapped: !!bestU, vSnapped: !!bestV };
  }

  // 실제 확정 좌표가 스냅 좌표에서 벗어나면(겹침 밀어냄 등) 해당 축 가이드 제거
  _pruneGuides(su, sv, ru, rv) {
    if (!this.smartGuides) return;
    this.smartGuides = this.smartGuides.filter(gd =>
      gd.axis === 'u' ? Math.abs(ru - su) < 0.02 : Math.abs(rv - sv) < 0.02);
  }

  // ---- 텍스트 오브젝트 (v1.3 P4) ----
  _findText(id) { return id ? (this.room.texts || []).find(x => x.id === id) : null; }
  _hitText(sx, sy) {
    const list = this._texts || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]._screen;
      if (s && sx >= s.x && sx <= s.x + s.w && sy >= s.y && sy <= s.y + s.h) return list[i];
    }
    return null;
  }
  // 이동: 벽면 내 자유 배치 + P7 스마트 가이드 (박스가 벽 밖으로 나가지 않게 클램프)
  _applyTextMove(id, u, v, { alt = false } = {}) {
    const t = this._findText(id); if (!t || !t._screen) return;
    const wlen = this._wallLen(), h = this.room.size.h;
    const halfW = (t._screen.wM || 1) / 2, halfH = (t._screen.hM || 0.5) / 2;
    const s = this._smartSnap(u, v, halfW * 2, halfH * 2, id, alt);
    const cu = Math.max(halfW, Math.min(wlen - halfW, s.u));
    const cv = Math.max(halfH + 0.02, Math.min(h - halfH - 0.02, s.v));
    this._pruneGuides(s.u, s.v, cu, cv);
    this.store.mutate(p => {
      const rr = this._roomRef(p); const tt = (rr.texts || []).find(x => x.id === id);
      if (tt) { tt.placement.x = +cu.toFixed(2); tt.placement.centerHeightCm = Math.round(cv * 100); }
    }, { detail: { silent: true }, coalesce: 'tx-move:' + id });
    this.render();
  }
  // 스케일: 패널 폭 + 글자 크기 비례 (코너 핸들)
  _applyTextScale(id, f) {
    const d = this.drag;
    this.store.mutate(p => {
      const rr = this._roomRef(p); const tt = (rr.texts || []).find(x => x.id === id);
      if (!tt) return;
      tt.widthCm = Math.round(Math.max(40, Math.min(2000, d.w0 * f)));
      tt.style.sizeCm = +Math.max(1.5, Math.min(200, d.s0 * f)).toFixed(1);
      if (tt.bodyStyle && d.b0) tt.bodyStyle.sizeCm = +Math.max(1, Math.min(200, d.b0 * f)).toFixed(1);
    }, { detail: { silent: true }, coalesce: 'tx-scale:' + id });
    this.render();
  }

  _others(id) {
    return (this.room.artworks || []).filter(o => o.id !== id && o.placement.wall === this.wall);
  }

  _door() {
    const room = this.room;
    // 로비 북쪽 벽 = 전시 입장 문 (중앙 고정)
    if (room.id === '__lobby__') {
      return this.wall === 'north' ? { offset: this._wallLen() / 2 } : null;
    }
    return (room.exitDoor && room.exitDoor.wall === this.wall) ? room.exitDoor : null;
  }

  _roomRef(p) { return this.room.id === '__lobby__' ? p.lobby : p.rooms.find(r => r.id === this.room.id); }

  // 이동: 공용 배치 규칙 적용 (P0 — 정면뷰/3D 동일 로직)
  // P7: 스마트 가이드 스냅 우선 적용 (기존 내장 아이레벨/중심 스냅은 스마트 후보에 통합됨)
  _applyMove(id, u, v, { alt = false } = {}) {
    const room = this.room;
    const a = this._findInRoom(id); if (!a) return;
    const o = artworkOuterSize(a);
    const s = this._smartSnap(u, v, o.w, o.h, id, alt);
    const res = resolvePlacement({
      wallLen: this._wallLen(), wallH: room.size.h,
      u: s.u, v: s.v, aw: a, others: this._others(id), door: this._door(), snap: false,
    });
    this._pruneGuides(s.u, s.v, res.u, res.v);
    this.guide = res.guides;
    this._setDimLabel(a, res.outer, res.u, res.v, false);
    this.store.mutate(p => {
      const rr = this._roomRef(p); const aa = rr.artworks.find(x => x.id === id);
      aa.placement.x = +res.u.toFixed(2); aa.placement.centerHeightCm = Math.round(res.v * 100);
    }, { detail: { silent: true }, coalesce: 'aw-move:' + id });
    this.render();
  }

  // 스케일: 비율 고정 균등 (P1). 위치 규칙도 재적용(커진 만큼 벽/문/이웃과 재조정)
  _applyScale(id, scale, snapped) {
    const room = this.room;
    const a = this._findInRoom(id); if (!a) return;
    this.store.mutate(p => {
      const rr = this._roomRef(p); const aa = rr.artworks.find(x => x.id === id);
      aa.scale = scale;
      const res = resolvePlacement({
        wallLen: this._wallLen(), wallH: room.size.h,
        u: aa.placement.x, v: aa.placement.centerHeightCm / 100,
        aw: aa, others: this._others(id), door: this._door(), snap: false,
      });
      aa.placement.x = +res.u.toFixed(2); aa.placement.centerHeightCm = Math.round(res.v * 100);
    }, { detail: { silent: true }, coalesce: 'aw-scale:' + id });
    const cur = this._findInRoom(id);
    this._setDimLabel(cur, artworkOuterSize(cur), cur.placement.x, cur.placement.centerHeightCm / 100, snapped);
    // 인스펙터 scale 필드 실시간 동기 (P1)
    const inp = document.querySelector('#inspector-root [data-scale]');
    if (inp) inp.value = scale;
    this.render();
  }

  _setDimLabel(a, outer, u, v, tick) {
    const wcm = Math.round(a.sizeCm.w * (a.scale || 1));
    const hcm = Math.round(a.sizeCm.h * (a.scale || 1));
    this.dimLabel = {
      x: this.u2s(u + outer.w / 2) + 10,
      y: this.v2s(v),
      text: `${wcm} × ${hcm} cm (scale ${(a.scale || 1).toFixed(2)})`,
      tick,
    };
  }

  _placeFromLibrary(id, u, v) {
    const p = this.store.project;
    const lib = p._library || [];
    const idx = lib.findIndex(a => a.id === id);
    const already = this._findArt(id);
    const room = this.room;
    this.store.mutate(pp => {
      const rr = this._roomRef(pp);
      let art;
      if (idx >= 0) { art = pp._library.splice(pp._library.findIndex(a => a.id === id), 1)[0]; }
      else if (already) { return; } // 이미 배치됨
      else { art = makeArtwork({ id }); }
      const res = resolvePlacement({
        wallLen: this._wallLen(), wallH: room.size.h,
        u: u || 2, v: v || EYE_LEVEL_CM / 100,
        aw: art, others: (rr.artworks || []).filter(o => o.placement.wall === this.wall), door: this._door(),
      });
      art.placement = { wall: this.wall, x: +res.u.toFixed(2), centerHeightCm: Math.round(res.v * 100) };
      rr.artworks = rr.artworks || []; rr.artworks.push(art);
      if (!pp.route.includes(id)) pp.route.push(id);
    }, { detail: { place: id } });
    this.store.breakCoalesce();
    this.store.select({ artworkId: id });
    this.render();
  }

  _findArt(id) {
    for (const r of this.store.project.rooms) { const a = (r.artworks || []).find(x => x.id === id); if (a) return { a, room: r }; }
    const la = (this.store.project.lobby?.artworks || []).find(x => x.id === id);
    if (la) return { a: la, room: { id: '__lobby__' } };
    return null;
  }

  _delete(id) {
    this.store.mutate(p => {
      const pools = [...p.rooms, p.lobby].filter(Boolean);
      for (const r of pools) { const i = (r.artworks || []).findIndex(x => x.id === id); if (i >= 0) { const [a] = r.artworks.splice(i, 1); p._library = p._library || []; p._library.push(a); } }
      p.route = p.route.filter(x => x !== id);
    }, { detail: { unplace: id } });
    this.store.select({ artworkId: null });
    this.render();
  }
  _duplicate(id) {
    const found = this._findArt(id); if (!found) return;
    const clone = JSON.parse(JSON.stringify(found.a));
    clone.id = 'aw-' + Math.random().toString(36).slice(2, 8);
    this.store.mutate(p => {
      const rr = found.room.id === '__lobby__' ? p.lobby : p.rooms.find(r => r.id === found.room.id);
      const res = resolvePlacement({
        wallLen: this._wallLen(), wallH: this.room.size.h,
        u: clone.placement.x + 0.5, v: clone.placement.centerHeightCm / 100,
        aw: clone, others: (rr.artworks || []).filter(o => o.placement.wall === this.wall), door: this._door(), snap: false,
      });
      clone.placement.x = +res.u.toFixed(2);
      rr.artworks.push(clone);
      if (!p.route.includes(clone.id)) p.route.push(clone.id);
    }, { detail: { dup: clone.id } });
    const im = this.store.images.get(id);
    if (im) this.store.addImage(clone.id, im.blob, im.thumbBlob);
    this.store.select({ artworkId: clone.id });
    this.render();
  }
}

export function roleLabel(role) {
  return { title: '전시명', intro: '전시 서문', section: '섹션 패널', free: '자유 텍스트' }[role] || role;
}
