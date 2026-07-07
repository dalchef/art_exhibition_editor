// editor/js/previewBridge.js — [Preview] 뷰어를 새 창으로 열고 postMessage 로 데이터 전달.
// v1.2: 프리뷰 창이 열려 있는 동안 상태 변경을 디바운스 재전송 → 즉시 반영(P4/P5/P2).
let _win = null;
let _wired = false;

function buildPayload(store) {
  // 프리뷰용 프로젝트 사본: 이미지 경로 = 작품 id, blobs 로 실제 URL 전달.
  // docentNote 는 프리뷰에서 유지(§6.8).
  const proj = JSON.parse(JSON.stringify(store.project));
  delete proj._library;
  const blobs = {};
  const packArt = (a) => {
    delete a._px; delete a._screen;
    const url = store.getImageURL(a.id);
    const turl = store.getThumbURL(a.id) || url;
    a.image = a.id;
    a.thumb = a.id + '#thumb';
    if (url) blobs[a.id] = url;
    if (turl) blobs[a.id + '#thumb'] = turl;
  };
  for (const r of proj.rooms) for (const a of (r.artworks || [])) packArt(a);
  for (const a of (proj.lobby?.artworks || [])) packArt(a);
  // 커스텀 패턴 에셋 (P5)
  for (const key of store.patternAssetIds ? store.patternAssetIds() : []) {
    const url = store.getImageURL(key);
    if (url) blobs[key] = url;
  }
  return { proj, blobs };
}

export function openPreview(store) {
  const win = window.open('../viewer/index.html?preview=1', 'museum-preview');
  if (!win) { window.__toast?.('팝업이 차단되었습니다. 허용 후 다시 시도하세요.', true); return; }
  _win = win;

  const send = () => {
    if (!_win || _win.closed) return;
    const { proj, blobs } = buildPayload(store);
    _win.postMessage({ type: 'museum-preview-data', project: proj, blobs }, location.origin);
  };

  const onMsg = (e) => {
    if (e.source === win && e.origin === location.origin && e.data && e.data.type === 'museum-preview-ready') {
      send();
      window.removeEventListener('message', onMsg);
    }
  };
  window.addEventListener('message', onMsg);

  // 상태 변경 → 디바운스 재전송 (창이 열린 동안 실시간 반영)
  if (!_wired) {
    _wired = true;
    let t = null;
    store.on('change', () => {
      if (!_win || _win.closed) return;
      clearTimeout(t);
      t = setTimeout(send, 350);
    });
    // 3D 편집(P2) 역방향: preview → editor. 에디터 상태가 단일 소스 — undo 1스텝 후 재전송됨.
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !_win || e.source !== _win || !e.data) return;
      const d = e.data;
      if (d.type === 'museum-edit-transform') {
        store.mutate(p => {
          const a = findAnyArt(p, d.artworkId);
          if (a) {
            a.placement.x = d.placement.x;
            a.placement.centerHeightCm = d.placement.centerHeightCm;
            if (typeof d.scale === 'number') a.scale = d.scale;
          }
        }, { detail: {} });
      } else if (d.type === 'museum-edit-select') {
        store.select({ artworkId: d.artworkId });
      }
    });
  }
}

function findAnyArt(p, id) {
  for (const r of p.rooms) { const a = (r.artworks || []).find(x => x.id === id); if (a) return a; }
  return (p.lobby?.artworks || []).find(x => x.id === id) || null;
}
