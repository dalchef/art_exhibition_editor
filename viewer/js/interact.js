// viewer/js/interact.js
// 근접 감지(2.2m + 시선 ±35°) → 프롬프트, E/탭 → 줌 모드(HTML 풀스크린 오버레이).
// v1.3 P5: 터치 기기 프롬프트 분기(pointer: coarse) + 감상 모드 핀치 줌/패닝.
const NEAR = 2.2;
const COS35 = Math.cos(35 * Math.PI / 180);
const ZOOM_MAX = 5;

export class Interactions {
  constructor(controls, anchors, hudRoot) {
    this.controls = controls;
    this.anchors = anchors;
    this.current = null;
    this.isOpen = false;
    this.kenBurns = false;
    this.zoom = { s: 1, tx: 0, ty: 0 };
    this._pointers = new Map();
    this._buildDom(hudRoot);
    this._bindKeys();
  }

  _buildDom(root) {
    // 프롬프트 — P5: 입력 방식 분기 (포인터 타입 기준, ?touch=1 로 강제 가능)
    const coarse = new URLSearchParams(location.search).get('touch') === '1'
      || !!window.matchMedia?.('(pointer: coarse)').matches;
    this.prompt = document.createElement('button');
    this.prompt.className = 'zoom-prompt no-cam-drag';
    this.prompt.innerHTML = coarse
      ? `<span>자세히 보기 (터치)</span>`
      : `<span class="kbd">E</span><span>자세히 보기</span>`;
    this.prompt.style.display = 'none';
    this.prompt.addEventListener('click', (e) => { e.stopPropagation(); this.open(); });
    root.appendChild(this.prompt);

    // 오버레이
    this.overlay = document.createElement('div');
    this.overlay.className = 'zoom-overlay';
    this.overlay.innerHTML = `
      <div class="zoom-stage"><img class="zoom-img" alt=""></div>
      <div class="zoom-panel">
        <div class="zp-title"></div>
        <div class="zp-artist"></div>
        <dl class="zp-meta"></dl>
        <div class="zp-credit"></div>
      </div>
      <div class="zoom-tools no-cam-drag">
        <button class="zt-kb">🎞 켄번즈</button>
        <button class="zt-close">✕ 닫기 (ESC)</button>
      </div>`;
    this.overlay.addEventListener('pointerdown', (e) => { if (e.target === this.overlay) this.close(); });
    this.overlay.querySelector('.zt-close').addEventListener('click', () => this.close());
    this.overlay.querySelector('.zt-kb').addEventListener('click', () => this.toggleKenBurns());
    root.appendChild(this.overlay);
    this.img = this.overlay.querySelector('.zoom-img');
    this._bindZoomGestures(this.overlay.querySelector('.zoom-stage'));
  }

  // P5: 감상 모드 — 두 손가락 핀치 줌 + (줌 상태) 한 손가락 패닝 + 휠 줌
  _bindZoomGestures(stage) {
    stage.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._pinch0 = { d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), s: this.zoom.s };
      }
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      const prev = this._pointers.get(e.pointerId);
      const cur = { x: e.clientX, y: e.clientY };
      this._pointers.set(e.pointerId, cur);
      if (this._pointers.size === 2 && this._pinch0) {
        const [a, b] = [...this._pointers.values()];
        this._applyZoom(this._pinch0.s * (Math.hypot(a.x - b.x, a.y - b.y) / this._pinch0.d));
      } else if (this._pointers.size === 1 && this.zoom.s > 1) {
        this.zoom.tx += cur.x - prev.x;
        this.zoom.ty += cur.y - prev.y;
        this._applyTransform();
      }
    });
    const up = (e) => { this._pointers.delete(e.pointerId); if (this._pointers.size < 2) this._pinch0 = null; };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => {
      if (!this.isOpen) return;
      e.preventDefault();
      this._applyZoom(this.zoom.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    }, { passive: false });
  }

  _applyZoom(s) {
    this.zoom.s = Math.max(1, Math.min(ZOOM_MAX, s));
    if (this.zoom.s === 1) { this.zoom.tx = 0; this.zoom.ty = 0; }
    if (this.kenBurns) this._setKenBurns(false); // 켄번즈와 transform 충돌 방지
    this._applyTransform();
  }

  _applyTransform() {
    // 패닝 클램프: 이미지가 화면 밖으로 완전히 사라지지 않게
    const mx = (this.img.clientWidth * this.zoom.s) / 2;
    const my = (this.img.clientHeight * this.zoom.s) / 2;
    this.zoom.tx = Math.max(-mx, Math.min(mx, this.zoom.tx));
    this.zoom.ty = Math.max(-my, Math.min(my, this.zoom.ty));
    this.img.style.transform = this.zoom.s === 1 ? '' :
      `translate(${this.zoom.tx.toFixed(1)}px, ${this.zoom.ty.toFixed(1)}px) scale(${this.zoom.s.toFixed(3)})`;
  }

  _resetZoom() {
    this.zoom = { s: 1, tx: 0, ty: 0 };
    this._pointers.clear();
    this._pinch0 = null;
    this.img.style.transform = '';
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'e' && !this.isOpen && this.current) { e.preventDefault(); this.open(); }
      else if (k === 'escape' && this.isOpen) { e.preventDefault(); this.close(); }
    });
  }

  update() {
    if (this.isOpen) return;
    const px = this.controls.pos.x, pz = this.controls.pos.y;
    const yaw = this.controls.avatarYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best = null, bestD = Infinity;
    for (const a of this.anchors) {
      const dx = a.center.x - px, dz = a.center.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > NEAR || d < 0.05) continue;
      const dot = (dx / d) * fx + (dz / d) * fz;   // 시선과 작품 방향 정렬
      if (dot < COS35) continue;
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best !== this.current) {
      this.current = best;
      this.prompt.style.display = best ? 'flex' : 'none';
    }
  }

  open() {
    if (!this.current || this.isOpen) return;
    const a = this.current, c = a.artwork.caption;
    this.isOpen = true;
    this.controls.enabled = false;
    this.prompt.style.display = 'none';
    this.img.src = a.imageUrl;
    this.overlay.querySelector('.zp-title').textContent = c.title || '';
    this.overlay.querySelector('.zp-artist').textContent = c.artist || '';
    const meta = this.overlay.querySelector('.zp-meta');
    const rows = [
      ['연도', c.year], ['재료', c.medium],
      ['실측', a.artwork.sizeCm ? `${a.artwork.sizeCm.w} × ${a.artwork.sizeCm.h} cm` : ''],
      ['소장', c.collection],
    ].filter(r => r[1]);
    meta.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('');
    this.overlay.querySelector('.zp-credit').textContent = c.credit || '';
    this.overlay.classList.add('open');
    this._resetZoom();
    this._setKenBurns(false);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('open');
    this._resetZoom();
    this._setKenBurns(false);
    // 이동 재개 (녹화 모드 등 외부에서 비활성화 안 했다면)
    this.controls.enabled = true;
  }

  toggleKenBurns() { this._setKenBurns(!this.kenBurns); }
  _setKenBurns(on) {
    this.kenBurns = on;
    if (on) this._resetZoom(); // 켄번즈는 자체 transform 애니메이션 사용
    this.img.classList.toggle('ken-burns', on);
    const btn = this.overlay.querySelector('.zt-kb');
    btn.classList.toggle('active', on);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
