// viewer/js/hud.js
// 풀스크린 캐릭터 선택(v1.2 P6 — v1.1 §6.3 대체), 조작법 팝업, 인게임 HUD,
// 모바일 가상 조이스틱, 녹화 토글(H/T), 시계 오버레이.
import * as THREE from '../../vendor/three.module.js';
import { makeAvatar } from './avatar.js';
import { AVATAR_PRESETS, PRESET_KEYS, LEGACY_PRESET_MAP, GARMENT_PALETTE } from './avatarPresets.js';

const HELP_SKIP_KEY = 'museum-help-skip';

export class HUD {
  constructor(project, opts = {}) {
    this.project = project;
    this.onEnter = opts.onEnter || (() => {});
    this.isMobile = opts.isMobile;
    this.controls = null;            // enter 후 주입
    this.hudHidden = false;
    this.clockOn = false;

    // 초기 선택 = avatarDefaults (구 스키마 a1~a4 는 매핑)
    const av = project.avatarDefaults || {};
    const preset = AVATAR_PRESETS[av.preset] ? av.preset
      : (LEGACY_PRESET_MAP[av.preset] || 'capybara');
    this.sel = {
      preset,
      body: AVATAR_PRESETS[preset].bodies[av.body] ? av.body : 'default',
      garment: (typeof av.garment === 'string' && av.garment.startsWith('#')) ? av.garment
        : (typeof av.topColor === 'string' && av.topColor.startsWith('#')) ? av.topColor
        : AVATAR_PRESETS[preset].garmentDefault,
    };

    this._buildSelect();
    this._buildInGame();
    this._bindKeys();
  }

  attachControls(controls) { this.controls = controls; }

  // =========================================================================
  // 풀스크린 캐릭터 선택 (P6)
  // =========================================================================
  _buildSelect() {
    const m = this.project.meta || {};
    const s = document.createElement('div');
    s.className = 'char-select';
    s.innerHTML = `
      <div class="cs-title-wrap">
        <div class="cs-kicker">${esc(m.curator || '')}</div>
        <h1 class="cs-title">${esc(m.title || '미술관')}</h1>
        <div class="cs-sub">${esc(m.subtitle || '')}</div>
      </div>
      <div class="cs-stage">
        <canvas class="cs-canvas"></canvas>
        <canvas class="cs-fx"></canvas>
        <div class="cs-labels"></div>
      </div>
      <div class="cs-custom">
        <div class="cs-row cs-garments" title="의상 색"></div>
        <div class="cs-row cs-bodies" title="몸 색"></div>
      </div>
      <button class="cs-enter">입장하기</button>`;
    document.body.appendChild(s);
    this.selectEl = s;

    this._buildLineup();
    this._renderSwatches();
    s.querySelector('.cs-enter').addEventListener('click', () => this._tryEnter());
  }

  // 4캐릭터 실시간 3D 라인업
  _buildLineup() {
    const stage = this.selectEl.querySelector('.cs-stage');
    const canvas = stage.querySelector('.cs-canvas');
    const fx = stage.querySelector('.cs-fx');
    const labels = stage.querySelector('.cs-labels');

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.25 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._csRenderer = renderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff2dc, 0x4a3b30, 1.1));
    const key = new THREE.DirectionalLight(0xffe6c0, 1.6);
    key.position.set(2, 6, 5);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(38, 2, 0.1, 30);
    this._csScene = scene; this._csCamera = camera; // 디버그/검증용 참조

    // 아바타 4체 + 섀도 블롭 + 이름 라벨
    const X = [-2.05, -0.7, 0.7, 2.05];
    this._csAvatars = {};
    const blobTex = radialTexture('rgba(0,0,0,0.34)', 'rgba(0,0,0,0)');
    const glowTex = radialTexture('rgba(255,214,150,0.55)', 'rgba(255,214,150,0)');
    this._csGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this._csGlow.scale.set(2.4, 2.4, 1);
    scene.add(this._csGlow);

    PRESET_KEYS.forEach((keyName, i) => {
      const av = makeAvatar({ preset: keyName, garment: keyName === this.sel.preset ? this.sel.garment : undefined, body: keyName === this.sel.preset ? this.sel.body : undefined });
      av.position.set(X[i], 0, 0);
      scene.add(av);
      // 재질 기본색 보존(딤 처리용)
      av.traverse(o => { if (o.isMesh && o.material?.color) o.material.userData = { base: o.material.color.clone() }; });
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.5), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
      blob.rotation.x = -Math.PI / 2;
      blob.position.set(X[i], 0.012, 0.1);
      scene.add(blob);

      const label = document.createElement('div');
      label.className = 'cs-name';
      label.textContent = AVATAR_PRESETS[keyName].displayName;
      labels.appendChild(label);
      this._csAvatars[keyName] = { av, label, blob, x: X[i] };
    });

    // 선택/스와이프 입력
    const ray = new THREE.Raycaster();
    let downX = 0, downT = 0;
    canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downT = performance.now(); });
    canvas.addEventListener('pointerup', (e) => {
      const dx = e.clientX - downX;
      if (Math.abs(dx) > 44 && performance.now() - downT < 600) {
        // 가로 스와이프 → 이웃 선택 (모바일)
        const i = PRESET_KEYS.indexOf(this.sel.preset);
        const ni = Math.max(0, Math.min(PRESET_KEYS.length - 1, i + (dx < 0 ? 1 : -1)));
        this._select(PRESET_KEYS[ni]);
        return;
      }
      const r = canvas.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, camera);
      for (const k of PRESET_KEYS) {
        if (ray.intersectObject(this._csAvatars[k].av, true).length) { this._select(k); return; }
      }
    });

    // 스파클 파티클(선택 이펙트) + 골드 배경 파티클 — 2D 캔버스
    const fg = fx.getContext('2d');
    this._sparks = [];
    this._dust = Array.from({ length: 36 }, () => ({
      x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6,
      vy: 0.008 + Math.random() * 0.02, ph: Math.random() * 7,
    }));

    // 렌더 루프
    const clock = { t: performance.now() };
    const resize = () => {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false);
      fx.width = w; fx.height = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // P5: 모바일 세로 화면 — 라인업 간격 압축 + 카메라 거리 자동 피팅으로
      // 4캐릭터(부루/보리/모아/새롬)가 스크롤 없이 모두 보이고 탭 선택 가능하게.
      const portrait = camera.aspect < 0.95;
      const f = portrait ? 0.62 : 1;
      PRESET_KEYS.forEach((k, i) => {
        const rec = this._csAvatars[k];
        rec.x = X[i] * f;
        rec.av.position.x = rec.x;
        if (rec.blob) rec.blob.position.x = rec.x;
      });
      const halfExtent = 2.05 * f + 0.75; // 라인업 좌우 끝 + 여백
      const dist = Math.max(4.9, halfExtent / (Math.tan((38 / 2) * Math.PI / 180) * camera.aspect));
      camera.position.set(0, 1.15, dist);
      camera.lookAt(0, 0.82, 0);
    };
    resize();
    window.addEventListener('resize', this._csResize = resize);

    const loop = () => {
      if (!this._csRenderer) return;
      this._csRaf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - clock.t) / 1000, 0.05);
      clock.t = now;
      for (const k of PRESET_KEYS) {
        const rec = this._csAvatars[k];
        rec.av.userData.update(dt, false, 0);
        const target = k === this.sel.preset ? 1.05 : 1.0;
        const cur = rec.av.scale.x;
        rec.av.scale.setScalar(cur + (target - cur) * Math.min(1, dt * 8));
        // 딤 처리
        const dim = k === this.sel.preset ? 1 : 0.72;
        rec.av.traverse(o => {
          if (o.isMesh && o.material?.userData?.base) o.material.color.copy(o.material.userData.base).multiplyScalar(dim);
        });
      }
      const selRec = this._csAvatars[this.sel.preset];
      this._csGlow.position.set(selRec.x, 0.85, -0.45);
      renderer.render(scene, camera);
      // 라벨 위치 (머리 위)
      const v = new THREE.Vector3();
      for (const k of PRESET_KEYS) {
        const rec = this._csAvatars[k];
        v.set(rec.x, 1.86, 0).project(camera);
        rec.label.style.left = ((v.x + 1) / 2 * fx.width) + 'px';
        rec.label.style.top = ((1 - (v.y + 1) / 2) * fx.height) + 'px';
        rec.label.classList.toggle('on', k === this.sel.preset);
      }
      // FX 캔버스
      fg.clearRect(0, 0, fx.width, fx.height);
      fg.fillStyle = '#e8c17a';
      for (const d of this._dust) {
        d.y -= d.vy * dt * 10; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
        fg.globalAlpha = 0.18 + 0.16 * Math.sin(now / 700 + d.ph);
        fg.beginPath(); fg.arc(d.x * fx.width, d.y * fx.height, d.r, 0, 7); fg.fill();
      }
      for (let i = this._sparks.length - 1; i >= 0; i--) {
        const sp = this._sparks[i];
        sp.life -= dt; if (sp.life <= 0) { this._sparks.splice(i, 1); continue; }
        sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 0.5 * dt;
        fg.globalAlpha = Math.max(0, sp.life / sp.max);
        fg.beginPath(); fg.arc(sp.x, sp.y, sp.r, 0, 7); fg.fill();
      }
      fg.globalAlpha = 1;
    };
    loop();
  }

  _select(key) {
    if (this.sel.preset === key) return;
    this.sel.preset = key;
    const preset = AVATAR_PRESETS[key];
    if (!preset.bodies[this.sel.body]) this.sel.body = 'default';
    const rec = this._csAvatars[key];
    rec.av.userData.setGarment(this.sel.garment);
    rec.av.userData.setBody(this.sel.body);
    rec.av.traverse(o => { if (o.isMesh && o.material?.color) o.material.userData = { base: o.material.color.clone() }; });
    this._renderSwatches();
    // 반짝 파티클 (≤60, canvas 스프라이트)
    const fx = this.selectEl.querySelector('.cs-fx');
    const v = new THREE.Vector3(rec.x, 0.9, 0);
    // 대략적 화면 위치: 라벨과 같은 투영을 루프에서 쓰므로 여기선 라벨 위치 재활용
    const lx = parseFloat(rec.label.style.left) || fx.width / 2;
    const ly = (parseFloat(rec.label.style.top) || fx.height / 2) + fx.height * 0.3;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 130;
      this._sparks.push({ x: lx, y: ly, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, r: 1 + Math.random() * 2.2, life: 0.7, max: 0.7 });
    }
    if (this._sparks.length > 60) this._sparks.splice(0, this._sparks.length - 60);
  }

  _renderSwatches() {
    const preset = AVATAR_PRESETS[this.sel.preset];
    const gRow = this.selectEl.querySelector('.cs-garments');
    gRow.innerHTML = `<span class="cs-lab">의상</span>` + GARMENT_PALETTE.map(c =>
      `<button class="cs-sw${c === this.sel.garment ? ' on' : ''}" data-g="${c}" style="background:${c}"></button>`).join('');
    gRow.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => {
      this.sel.garment = b.dataset.g;
      this._csAvatars[this.sel.preset].av.userData.setGarment(b.dataset.g);
      this._refreshBase(this.sel.preset);
      this._renderSwatches();
    }));
    const bRow = this.selectEl.querySelector('.cs-bodies');
    const keys = Object.keys(preset.bodies);
    bRow.innerHTML = `<span class="cs-lab">몸 색</span>` + keys.map(k =>
      `<button class="cs-chip${k === this.sel.body ? ' on' : ''}" data-b="${k}">
         <span class="cs-dot" style="background:${preset.bodies[k].body}"></span>${(preset.bodyLabels || {})[k] || k}</button>`).join('');
    bRow.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => {
      this.sel.body = b.dataset.b;
      this._csAvatars[this.sel.preset].av.userData.setBody(b.dataset.b);
      this._refreshBase(this.sel.preset);
      this._renderSwatches();
    }));
  }

  _refreshBase(key) {
    this._csAvatars[key].av.traverse(o => {
      if (o.isMesh && o.material?.color) o.material.userData = { base: o.material.color.clone() };
    });
  }

  // ---- 입장 → 조작법 팝업 ----
  _tryEnter() {
    if (localStorage.getItem(HELP_SKIP_KEY) === '1') { this._enter(); return; }
    this._showHelp(() => this._enter());
  }

  _showHelp(onStart) {
    const touch = this.isMobile || (navigator.maxTouchPoints || 0) > 0 && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const rows = touch
      ? [['조이스틱', '이동'], ['화면 드래그', '시점 회전 (상하 포함)'], ['두 손가락 핀치', '카메라 거리 줌'], ['프롬프트 탭', '작품 자세히 보기'], ['닫기 버튼', '돌아가기']]
      : [['WASD / ←↑↓→', '이동'], ['Shift', '달리기'], ['마우스 드래그', '시점 회전 (상하 포함)'], ['휠', '카메라 거리 줌'], ['E', '작품 자세히 보기'], ['ESC', '닫기'],
         ['H', '화면 UI 숨기기(녹화용)'], ['T', '시계 표시'], ['P', '자동 도슨트 워크']];
    const pop = document.createElement('div');
    pop.className = 'help-pop';
    pop.innerHTML = `
      <div class="help-card">
        <div class="help-title">조작법</div>
        <div class="help-grid">${rows.map(r => `<span class="gk">${r[0]}</span><span>${r[1]}</span>`).join('')}</div>
        <label class="help-skip"><input type="checkbox"> 다시 보지 않기</label>
        <button class="help-start">시작</button>
      </div>`;
    document.body.appendChild(pop);
    pop.querySelector('.help-start').addEventListener('click', () => {
      if (pop.querySelector('input').checked) localStorage.setItem(HELP_SKIP_KEY, '1');
      pop.remove();
      onStart();
    });
  }

  _enter() {
    // 마지막 선택 저장 (P1 임베드 프리뷰가 "마지막 선택 아바타"로 즉시 입장할 때 사용)
    try { localStorage.setItem('museum-avatar-last', JSON.stringify(this.sel)); } catch (e) { /* 무시 */ }
    // 라인업 정리
    cancelAnimationFrame(this._csRaf);
    window.removeEventListener('resize', this._csResize);
    this._csRenderer.dispose();
    this._csRenderer = null;
    this.selectEl.classList.add('gone');
    setTimeout(() => this.selectEl.remove(), 500);
    this.onEnter({ ...this.sel });
  }

  // =========================================================================
  // 인게임 HUD (기존 유지: 힌트 + 조이스틱 + 시계 + H/T)
  // =========================================================================
  _buildInGame() {
    const hud = document.getElementById('hud');
    const hint = document.createElement('div');
    hint.className = 'ingame-hint';
    hint.innerHTML = this.isMobile
      ? `왼쪽 조이스틱으로 이동 · 화면 드래그로 시점 · 핀치로 줌`
      : `<b>WASD</b> 이동 · <b>드래그</b> 시점 · <b>휠</b> 줌 · <b>E</b> 자세히 · <b>H</b> UI숨김 · <b>T</b> 시계`;
    hud.appendChild(hint);
    this.hint = hint;

    if (this.isMobile) this._buildJoystick(hud);

    const clock = document.createElement('div');
    clock.className = 'clock-overlay';
    clock.style.display = 'none';
    document.body.appendChild(clock);
    this.clockEl = clock;
  }

  _buildJoystick(hud) {
    const zone = document.createElement('div');
    zone.className = 'joy-zone no-cam-drag';
    zone.innerHTML = `<div class="joy-base"><div class="joy-knob"></div></div>`;
    hud.appendChild(zone);
    const base = zone.querySelector('.joy-base');
    const knob = zone.querySelector('.joy-knob');
    let id = null, cx = 0, cy = 0;
    const R = 52;
    const start = (e) => {
      id = e.pointerId; const r = zone.getBoundingClientRect();
      cx = e.clientX; cy = e.clientY;
      base.style.left = (cx - r.left) + 'px'; base.style.top = (cy - r.top) + 'px';
      base.style.opacity = '1';
      zone.setPointerCapture(id);
    };
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, R);
      dx = dx / len * cl; dy = dy / len * cl;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      if (this.controls) this.controls.setJoystick(dx / R, dy / R);
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; knob.style.transform = ''; base.style.opacity = '.5';
      if (this.controls) this.controls.setJoystick(0, 0);
    };
    zone.addEventListener('pointerdown', start);
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  // ---- 녹화 토글 ----
  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'h') { this.toggleHud(); }
      else if (k === 't') { this.toggleClock(); }
    });
  }
  toggleHud() {
    this.hudHidden = !this.hudHidden;
    document.getElementById('hud').classList.toggle('hidden', this.hudHidden);
  }
  toggleClock() {
    this.clockOn = !this.clockOn;
    this.clockEl.style.display = this.clockOn ? 'block' : 'none';
    if (this.clockOn) this._tickClock();
  }
  _tickClock() {
    if (!this.clockOn) return;
    const d = new Date();
    let h = d.getHours(); const ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    const mm = String(d.getMinutes()).padStart(2, '0');
    this.clockEl.innerHTML = `<span class="clk-time">${ap} ${h}:${mm}</span><span class="clk-date">${d.getMonth() + 1}월 ${d.getDate()}일</span>`;
    clearTimeout(this._ct);
    this._ct = setTimeout(() => this._tickClock(), 1000 * (60 - d.getSeconds()));
  }
}

// 라디얼 그라데이션 텍스처 (섀도 블롭/글로우)
function radialTexture(inner, outer) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
