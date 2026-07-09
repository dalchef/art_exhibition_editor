// editor/js/livePreview.js — 스플릿 3D 라이브 프리뷰 (v1.3 P1).
// 기존 previewBridge 의 postMessage 데이터 경로(buildPayload)를 iframe 임베드로 재사용한다.
// 뷰어는 ?preview=1&embed=1&skipIntro=1 로 로드 → 캐릭터 선택 없이 기본(또는 마지막 선택)
// 아바타로 즉시 갤러리 진입. 접으면 뷰어 렌더 루프 일시정지(museum-preview-pause).
import { buildPayload } from './previewBridge.js';

const VIEWER_URL = '../viewer/index.html?preview=1&embed=1&skipIntro=1';
const DEBOUNCE_MS = 300;          // 연속 입력(슬라이더) 디바운스
const RATIO_RANGE = [0.25, 0.75]; // 편집 pane 비율 클램프
const LS_RATIO = 'museum-editor-split-ratio';
const LS_OPEN = 'museum-editor-preview-open';

export class LivePreview {
  constructor(store, { onPaneResize } = {}) {
    this.store = store;
    this.onPaneResize = onPaneResize || (() => {});
    this.workarea = document.getElementById('workarea');
    this.pane = document.getElementById('preview-pane');
    this.divider = document.getElementById('split-divider');
    this.toggleBtn = document.getElementById('btn-preview-toggle');
    this.frame = document.getElementById('preview-frame');

    this.open = localStorage.getItem(LS_OPEN) !== '0';
    this._ready = false;
    this._dirtyWhileClosed = false;
    this._t = null;

    // 저장된 분할 비율 복원 (프리뷰 pane 의 flex-basis %)
    const ratio = parseFloat(localStorage.getItem(LS_RATIO));
    if (ratio >= RATIO_RANGE[0] && ratio <= RATIO_RANGE[1]) {
      this.pane.style.flexBasis = ((1 - ratio) * 100).toFixed(1) + '%';
    }

    this._wireMessages();
    this._wireStore();
    this._wireDivider();
    this.toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });

    this._applyOpen(false);
    this.frame.src = VIEWER_URL;
  }

  // ---- 뷰어 ↔ 에디터 메시지 ----
  _wireMessages() {
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.source !== this.frame.contentWindow || !e.data) return;
      if (e.data.type === 'museum-preview-ready') {
        this._ready = true;
        this._send();
        if (!this.open) this._post({ type: 'museum-preview-pause', paused: true });
      }
    });
  }

  _wireStore() {
    const queue = () => {
      if (!this.open) { this._dirtyWhileClosed = true; return; }
      clearTimeout(this._t);
      this._t = setTimeout(() => this._send(), DEBOUNCE_MS);
    };
    this.store.on('change', queue);
    this.store.on('load', queue);
  }

  _post(msg) {
    if (this.frame.contentWindow) this.frame.contentWindow.postMessage(msg, location.origin);
  }

  _send() {
    if (!this._ready) return;
    const { proj, blobs } = buildPayload(this.store);
    this._post({ type: 'museum-preview-data', project: proj, blobs });
  }

  // ---- 접기/펼치기 (접으면 뷰어 렌더 루프 정지) ----
  toggle() { this.open ? this.collapse() : this.expand(); }
  collapse() {
    this.open = false;
    this._applyOpen(true);
    this._post({ type: 'museum-preview-pause', paused: true });
  }
  expand() {
    this.open = true;
    this._applyOpen(true);
    this._post({ type: 'museum-preview-pause', paused: false });
    if (this._dirtyWhileClosed) { this._dirtyWhileClosed = false; this._send(); }
  }
  _applyOpen(notify) {
    this.workarea.classList.toggle('preview-collapsed', !this.open);
    this.toggleBtn.textContent = this.open ? '▶' : '◀';
    localStorage.setItem(LS_OPEN, this.open ? '1' : '0');
    if (notify) this.onPaneResize();
  }

  // ---- 분할 경계 드래그 ----
  _wireDivider() {
    let raf = 0;
    this.divider.addEventListener('pointerdown', (e) => {
      if (!this.open || e.target === this.toggleBtn) return;
      e.preventDefault();
      this.divider.setPointerCapture(e.pointerId);
      this.workarea.classList.add('split-dragging');
      const rect = this.workarea.getBoundingClientRect();
      const onMove = (ev) => {
        const f = Math.max(RATIO_RANGE[0], Math.min(RATIO_RANGE[1], (ev.clientX - rect.left) / rect.width));
        this.pane.style.flexBasis = ((1 - f) * 100).toFixed(1) + '%';
        localStorage.setItem(LS_RATIO, f.toFixed(3));
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => this.onPaneResize());
      };
      const onUp = (ev) => {
        this.divider.releasePointerCapture(ev.pointerId);
        this.divider.removeEventListener('pointermove', onMove);
        this.divider.removeEventListener('pointerup', onUp);
        this.workarea.classList.remove('split-dragging');
        this.onPaneResize();
      };
      this.divider.addEventListener('pointermove', onMove);
      this.divider.addEventListener('pointerup', onUp);
    });
  }
}
