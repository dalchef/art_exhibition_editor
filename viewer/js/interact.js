// viewer/js/interact.js
// 근접 감지(2.2m + 시선 ±35°) → 프롬프트, E/탭 → 줌 모드(HTML 풀스크린 오버레이).
const NEAR = 2.2;
const COS35 = Math.cos(35 * Math.PI / 180);

export class Interactions {
  constructor(controls, anchors, hudRoot) {
    this.controls = controls;
    this.anchors = anchors;
    this.current = null;
    this.isOpen = false;
    this.kenBurns = false;
    this._buildDom(hudRoot);
    this._bindKeys();
  }

  _buildDom(root) {
    // 프롬프트
    this.prompt = document.createElement('button');
    this.prompt.className = 'zoom-prompt no-cam-drag';
    this.prompt.innerHTML = `<span class="kbd">E</span><span>자세히 보기</span>`;
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
    this._setKenBurns(false);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('open');
    this._setKenBurns(false);
    // 이동 재개 (녹화 모드 등 외부에서 비활성화 안 했다면)
    this.controls.enabled = true;
  }

  toggleKenBurns() { this._setKenBurns(!this.kenBurns); }
  _setKenBurns(on) {
    this.kenBurns = on;
    this.img.classList.toggle('ken-burns', on);
    const btn = this.overlay.querySelector('.zt-kb');
    btn.classList.toggle('active', on);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
