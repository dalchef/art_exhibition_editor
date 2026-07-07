// editor/js/apiSearch.js — Met + AIC 병렬 검색 → 캡션 자동 채움 (키 불필요, 공개 API).
// API 장애·미응답이 수동 입력을 절대 막지 않는다(§6.7).
const MET_SEARCH = 'https://collectionapi.metmuseum.org/public/collection/v1/search';
const MET_OBJ = 'https://collectionapi.metmuseum.org/public/collection/v1/objects/';
const AIC_SEARCH = 'https://api.artic.edu/api/v1/artworks/search';
const AIC_IIIF = 'https://www.artic.edu/iiif/2';

let modal;

export function openApiSearch(store, artwork) {
  if (!modal) modal = buildModal();
  modal.classList.add('open');
  const input = modal.querySelector('.api-input');
  input.value = artwork.caption?.title || artwork.caption?.artist || '';
  modal.querySelector('.api-results').innerHTML = '<div class="api-hint">검색어를 입력하고 [검색]을 누르세요. (Met + Art Institute of Chicago)</div>';
  modal._artworkId = artwork.id;
  modal._store = store;
  input.focus();
  const go = () => runSearch(store, input.value.trim());
  modal.querySelector('.api-go').onclick = go;
  input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

async function runSearch(store, q) {
  const results = modal.querySelector('.api-results');
  if (!q) { results.innerHTML = '<div class="api-hint">검색어가 비어 있습니다.</div>'; return; }
  results.innerHTML = '<div class="api-hint">검색 중…</div>';
  const [met, aic] = await Promise.allSettled([searchMet(q), searchAic(q)]);
  const cards = [];
  if (met.status === 'fulfilled') cards.push(...met.value); else console.warn('Met 실패', met.reason);
  if (aic.status === 'fulfilled') cards.push(...aic.value); else console.warn('AIC 실패', aic.reason);

  if (!cards.length) {
    results.innerHTML = `<div class="api-hint">결과가 없거나 API에 연결하지 못했습니다.<br>제목/작가를 직접 입력해 계속 진행하세요.</div>`;
    return;
  }
  results.innerHTML = cards.map((c, i) => `
    <div class="api-card" data-i="${i}">
      <div class="api-thumb">${c.thumb ? `<img src="${c.thumb}" loading="lazy" alt="">` : '<div class="api-noimg">이미지 없음</div>'}</div>
      <div class="api-info">
        <div class="api-title">${esc(c.title)}</div>
        <div class="api-artist">${esc(c.artist || '')} · ${esc(c.year || '')}</div>
        <div class="api-src">${c.source}${c.pd ? ' · <b class="pd">Public Domain</b>' : ' · <span class="notpd">저작권 확인 필요</span>'}</div>
      </div>
    </div>`).join('');
  results.querySelectorAll('.api-card').forEach(el => el.addEventListener('click', () => { fillCaption(store, cards[+el.dataset.i]); modal.classList.remove('open'); }));
}

async function searchMet(q) {
  const s = await fetchJson(`${MET_SEARCH}?hasImages=true&q=${encodeURIComponent(q)}`);
  const ids = (s.objectIDs || []).slice(0, 6);
  const objs = await Promise.all(ids.map(id => fetchJson(MET_OBJ + id).catch(() => null)));
  return objs.filter(Boolean).map(o => ({
    source: 'Met', title: o.title, artist: o.artistDisplayName, year: o.objectDate,
    medium: o.medium, dims: o.dimensions, thumb: o.primaryImageSmall,
    pd: o.isPublicDomain, collection: 'Metropolitan Museum of Art, New York',
    sourceUrl: o.objectURL || '',
  }));
}

async function searchAic(q) {
  const url = `${AIC_SEARCH}?q=${encodeURIComponent(q)}&fields=id,title,artist_display,date_display,medium_display,dimensions,image_id,is_public_domain&limit=6`;
  const s = await fetchJson(url);
  const iiif = s.config?.iiif_url || AIC_IIIF;
  return (s.data || []).map(o => ({
    source: 'AIC', title: o.title, artist: (o.artist_display || '').split('\n')[0], year: o.date_display,
    medium: o.medium_display, dims: o.dimensions,
    thumb: o.image_id ? `${iiif}/${o.image_id}/full/200,/0/default.jpg` : '',
    pd: o.is_public_domain, collection: 'Art Institute of Chicago',
    sourceUrl: `https://www.artic.edu/artworks/${o.id}`,
  }));
}

function fillCaption(store, c) {
  const size = parseDims(c.dims);
  store.mutate(p => {
    const a = findArt(p, modal._artworkId); if (!a) return;
    a.caption.title = c.title || a.caption.title;
    a.caption.artist = c.artist || a.caption.artist;
    a.caption.year = c.year || a.caption.year;
    a.caption.medium = c.medium || a.caption.medium;
    a.caption.collection = c.collection || a.caption.collection;
    a.caption.credit = c.pd ? 'Public domain' : a.caption.credit;
    a.caption.sourceUrl = c.sourceUrl || a.caption.sourceUrl;
    if (size) { a.sizeCm.w = size.w; a.sizeCm.h = size.h; }
  }, { detail: {} });
  store.emit('select'); // 인스펙터 갱신
  window.__toast?.(c.pd ? '캡션을 채웠습니다.' : '캡션을 채웠습니다(저작권 확인 필요).');
}

// "73.2 × 93.4 cm" / "28 x 36 in. (73.2 × 93.4 cm)" → { w, h } (미술관 표기: 높이 × 폭)
function parseDims(s) {
  if (!s) return null;
  const cm = s.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*cm/i);
  if (!cm) return null;
  const h = parseFloat(cm[1]), w = parseFloat(cm[2]);
  if (!(h > 0 && w > 0)) return null;
  return { w, h };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' → ' + res.status);
  return res.json();
}
function findArt(p, id) {
  for (const r of p.rooms) { const a = (r.artworks || []).find(x => x.id === id); if (a) return a; }
  return (p.lobby?.artworks || []).find(x => x.id === id) || null;
}
function esc(s) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

function buildModal() {
  const m = document.createElement('div');
  m.className = 'api-modal';
  m.innerHTML = `
    <div class="api-box">
      <div class="api-head">
        <input class="api-input" type="text" placeholder="제목 또는 작가로 검색 (예: Starry Night)">
        <button class="api-go tb-btn primary">검색</button>
        <button class="api-close tb-btn">✕</button>
      </div>
      <div class="api-results"></div>
      <div class="api-foot">모든 필드는 채운 뒤 직접 수정할 수 있습니다. 퍼블릭 도메인 작품만 취급하세요.<br>
      이미지 파일은 자동으로 가져오지 않습니다 — 출처 페이지(캡션의 출처 URL)에서 내려받아 [작품] 탭에 업로드하세요.</div>
    </div>`;
  m.addEventListener('pointerdown', (e) => { if (e.target === m) m.classList.remove('open'); });
  m.querySelector('.api-close').addEventListener('click', () => m.classList.remove('open'));
  document.body.appendChild(m);
  injectStyle();
  return m;
}

function injectStyle() {
  if (document.getElementById('api-style')) return;
  const s = document.createElement('style'); s.id = 'api-style';
  s.textContent = `
  .api-modal{position:fixed;inset:0;z-index:500;display:none;align-items:center;justify-content:center;background:rgba(8,10,14,.7)}
  .api-modal.open{display:flex}
  .api-box{width:min(680px,94vw);max-height:84vh;display:flex;flex-direction:column;background:#232830;border:1px solid #363d48;border-radius:14px;overflow:hidden}
  .api-head{display:flex;gap:8px;padding:14px;border-bottom:1px solid #363d48}
  .api-input{flex:1;background:#2b313b;border:1px solid #363d48;border-radius:8px;color:#e6e9ee;padding:10px 12px;font-size:14px}
  .api-results{overflow-y:auto;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .api-hint{grid-column:1/3;color:#8a94a2;text-align:center;padding:30px 10px;font-size:14px;line-height:1.6}
  .api-card{display:flex;gap:10px;background:#2b313b;border:1px solid #363d48;border-radius:10px;padding:8px;cursor:pointer}
  .api-card:hover{border-color:#c9a24c}
  .api-thumb{width:64px;height:64px;flex:0 0 auto;border-radius:6px;overflow:hidden;background:#191d23}
  .api-thumb img{width:100%;height:100%;object-fit:cover}
  .api-noimg{font-size:10px;color:#6f7987;display:flex;align-items:center;justify-content:center;height:100%}
  .api-info{min-width:0}
  .api-title{font-size:13px;font-weight:700;color:#e6e9ee;line-height:1.3}
  .api-artist{font-size:12px;color:#9aa4b2;margin-top:3px}
  .api-src{font-size:11px;color:#6f7987;margin-top:5px}
  .api-src .pd{color:#7ec98a}.api-src .notpd{color:#d0a06a}
  .api-foot{padding:12px 14px;border-top:1px solid #363d48;font-size:12px;color:#6f7987}`;
  document.head.appendChild(s);
}
