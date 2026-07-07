// editor/js/libraryPanel.js
// 업로드 파이프라인(장변 2048 리사이즈 → WebP q0.85, 미지원 시 JPEG 폴백, 256 썸네일),
// My Artworks 그리드.
import { makeArtwork } from '../../shared/schema.js';

const MAX_EDGE = 2048;
const THUMB_EDGE = 256;

async function toBlobPreferWebp(canvas) {
  const webp = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.85));
  if (webp) return webp;
  return await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
}

// 대형 원본(8000px급)도 createImageBitmap 으로 안전하게 처리.
// maxEdge: 작품 2048(기본) / 커스텀 패턴 1024 (P5)
export async function processImageFile(file, maxEdge = MAX_EDGE) {
  const bmp = await createImageBitmap(file);
  const w = bmp.width, h = bmp.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));

  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  c.getContext('2d', { alpha: false }).drawImage(bmp, 0, 0, tw, th);
  const blob = await toBlobPreferWebp(c);

  const ts = Math.min(1, THUMB_EDGE / Math.max(tw, th));
  const c2 = document.createElement('canvas'); c2.width = Math.max(1, Math.round(tw * ts)); c2.height = Math.max(1, Math.round(th * ts));
  c2.getContext('2d', { alpha: false }).drawImage(c, 0, 0, c2.width, c2.height);
  const thumbBlob = await toBlobPreferWebp(c2);

  bmp.close && bmp.close();
  return { blob, thumbBlob, width: w, height: h };
}

export class LibraryPanel {
  constructor(store, root) {
    this.store = store;
    this.root = root;
    this.render();
    store.on('images', () => this.renderGrid());
    store.on('load', () => this.renderGrid());
    // 배치/해제/undo 후 배지·목록 갱신. 연속 변경(드래그/타이핑, silent)은 디바운스.
    store.on('change', (e) => {
      if (e.detail && e.detail.silent) { clearTimeout(this._rt); this._rt = setTimeout(() => this.renderGrid(), 300); }
      else this.renderGrid();
    });
    store.on('select', () => this.renderGrid());  // 선택 하이라이트 갱신
  }

  render() {
    this.root.innerHTML = `
      <div class="lib-drop" id="lib-drop">
        <div class="lib-drop-inner">
          <div class="lib-drop-icon">⬆</div>
          <div>이미지를 끌어다 놓거나 <label class="lib-browse">파일 선택<input type="file" accept="image/*" multiple hidden></label></div>
          <div class="lib-hint">PNG · JPG · WEBP · 대형 원본 OK · 자동으로 2048px WebP 최적화</div>
        </div>
      </div>
      <div class="lib-status" id="lib-status"></div>
      <div class="lib-grid" id="lib-grid"></div>`;
    const drop = this.root.querySelector('#lib-drop');
    const input = this.root.querySelector('input[type=file]');
    input.addEventListener('change', (e) => this.handleFiles([...e.target.files]));
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => this.handleFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))));
    this.renderGrid();
  }

  async handleFiles(files) {
    const status = this.root.querySelector('#lib-status');
    let n = 0;
    for (const file of files) {
      status.textContent = `최적화 중… (${++n}/${files.length}) ${file.name}`;
      try {
        const res = await processImageFile(file);
        const art = makeArtwork({
          sizeCm: this._guessSize(res.width, res.height),
          caption: { title: file.name.replace(/\.[^.]+$/, '') },
        });
        art._px = { w: res.width, h: res.height }; // 비율 자동계산용(에디터 전용, export 시 제거)
        await this.store.addImage(art.id, res.blob, res.thumbBlob);
        // 라이브러리에만 등록(아직 배치 전) → project.rooms 밖의 보관함
        this.store.mutate(p => {
          p._library = p._library || [];
          p._library.push(art);
        }, { detail: { libraryAdd: art.id } });
      } catch (err) {
        console.error('업로드 실패', file.name, err);
        status.textContent = `실패: ${file.name} — ${err.message}`;
      }
    }
    status.textContent = files.length ? `${files.length}개 업로드 완료. 크기(cm)를 확인하세요.` : '';
    this.renderGrid();
  }

  _guessSize(pw, ph) {
    // 기본 장변 80cm 로 가정, 비율 유지(사용자가 인스펙터에서 실측 입력)
    const ratio = pw / ph;
    if (ratio >= 1) return { w: 80, h: +(80 / ratio).toFixed(1) };
    return { w: +(80 * ratio).toFixed(1), h: 80 };
  }

  // 라이브러리 = 배치 전 보관함(_library) + 이미 배치된 작품 모두 표시
  allArtworks() {
    const lib = this.store.project._library || [];
    const placed = [];
    for (const r of this.store.project.rooms) for (const a of (r.artworks || [])) placed.push({ a, roomId: r.id });
    for (const a of (this.store.project.lobby?.artworks || [])) placed.push({ a, roomId: '__lobby__' });
    return { lib, placed };
  }

  renderGrid() {
    const grid = this.root.querySelector('#lib-grid');
    if (!grid) return;
    const { lib, placed } = this.allArtworks();
    const cell = (a, isPlaced) => `
      <div class="lib-cell${this.store.selection.artworkId === a.id ? ' sel' : ''}${isPlaced ? ' placed' : ''}"
           draggable="true" data-id="${a.id}">
        <img src="${this.store.getThumbURL(a.id)}" alt="">
        <div class="lib-cap">${esc(a.caption?.title || a.id)}</div>
        ${isPlaced ? '<span class="lib-badge">배치됨</span>' : ''}
      </div>`;
    grid.innerHTML =
      (lib.length ? `<div class="lib-sec">보관함</div>` + lib.map(a => cell(a, false)).join('') : '') +
      (placed.length ? `<div class="lib-sec">전시 중</div>` + placed.map(p => cell(p.a, true)).join('') : '') ||
      `<div class="lib-empty">아직 업로드된 작품이 없습니다.</div>`;

    grid.querySelectorAll('.lib-cell').forEach(el => {
      const id = el.dataset.id;
      el.addEventListener('click', () => this.store.select({ artworkId: id }));
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/artwork-id', id); e.dataTransfer.effectAllowed = 'copy'; });
    });
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
