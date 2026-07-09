// editor/js/inspector.js — 작품 인스펙터(좌측 패널, 작품 선택 시).
import { PRESETS, RANGES } from '../../shared/schema.js';

export class Inspector {
  constructor(store, root, opts = {}) {
    this.store = store;
    this.root = root;
    this.onApiFill = opts.onApiFill || (() => {});
    store.on('select', () => this.render());
    store.on('load', () => this.render());
    store.on('undoredo', () => this.render());
    this.render();
  }

  render() {
    // 텍스트 오브젝트 컨트롤 (v1.3 P4) — 정면뷰에서 텍스트 선택 시
    const tid = this.store.selection.textId;
    if (tid) {
      const found = findText(this.store.project, tid);
      if (found) { this._renderText(found.t, found.space); return; }
    }
    const a = this.store.selectedArtwork;
    if (!a) { this.root.innerHTML = `<div class="inspector-empty">작품을 선택하면 속성이 표시됩니다.</div>`; return; }
    const route = this.store.project.route || [];
    const rpos = route.indexOf(a.id);
    const c = a.caption || {};
    this.root.innerHTML = `
      <div class="panel-title">작품 속성</div>
      <div class="field"><label>제목</label><input type="text" data-cap="title" value="${attr(c.title)}"></div>
      <div class="field"><label>작가</label><input type="text" data-cap="artist" value="${attr(c.artist)}"></div>
      <div class="field-row">
        <div class="field"><label>연도</label><input type="text" data-cap="year" value="${attr(c.year)}"></div>
        <div class="field"><label>재료</label><input type="text" data-cap="medium" value="${attr(c.medium)}"></div>
      </div>
      <div class="field"><label>소장처</label><input type="text" data-cap="collection" value="${attr(c.collection)}"></div>
      <div class="field"><label>크레딧</label><input type="text" data-cap="credit" value="${attr(c.credit)}"></div>
      <div class="field"><label>출처 URL</label><input type="text" data-cap="sourceUrl" value="${attr(c.sourceUrl)}"></div>
      <button class="tb-btn" id="ins-api" style="width:100%;margin-bottom:8px">🔎 API로 채우기</button>
      <button class="tb-btn" data-cover style="width:100%;margin-bottom:14px">${this.store.project.meta.coverId === a.id ? '★ 대표 이미지 (공유 미리보기)' : '☆ 대표 이미지로 지정'}</button>

      <div class="field-row">
        <div class="field"><label>실측 폭 (cm)</label><input type="number" step="0.1" data-size="w" value="${a.sizeCm.w}"></div>
        <div class="field"><label>실측 높이 (cm)</label><input type="number" step="0.1" data-size="h" value="${a.sizeCm.h}"></div>
      </div>
      <div class="field"><label>연출 배율 (scale)</label><input type="number" step="0.05" min="0.3" max="3" data-scale value="${a.scale ?? 1}"></div>

      <div class="field"><label>액자</label>
        <div class="seg" data-seg="frame">
          ${PRESETS.frame.map(f => `<button data-v="${f}" class="${(a.frame?.style || 'gold') === f ? 'on' : ''}">${frameLabel(f)}</button>`).join('')}
        </div>
      </div>
      <div class="toggle-row"><label>매트 (마운트)</label>
        <span style="display:flex;align-items:center;gap:8px">
          ${a.frame?.matte ? `<input type="color" data-matte-color value="${attr(a.frame?.matteColor || '#f3ead8')}" title="매트 색" style="width:30px;height:22px;border:none;border-radius:5px;background:none;cursor:pointer">` : ''}
          <div class="switch ${a.frame?.matte ? 'on' : ''}" data-toggle="matte"></div>
        </span></div>

      <div class="field" style="margin-top:12px"><label>스포트라이트 세기 (${RANGES.spotIntensity.join('–')})</label>
        <input type="range" min="0.5" max="2" step="0.1" data-light="intensity" value="${a.light?.intensity ?? 1.2}"></div>
      <div class="field"><label>색온도</label>
        <div class="seg" data-seg="temp">
          ${PRESETS.lightTemp.map(t => `<button data-v="${t}" class="${(a.light?.temp || 'warm') === t ? 'on' : ''}">${tempLabel(t)}</button>`).join('')}
        </div>
      </div>

      <div class="field"><label>관람 순서 (대본)</label>
        <div class="field-row" style="align-items:center">
          <span class="hint-note" style="margin:0">${rpos >= 0 ? `${rpos + 1} / ${route.length}` : '경로에 없음'}</span>
          <button class="tb-btn" data-route="up">▲</button>
          <button class="tb-btn" data-route="down">▼</button>
        </div>
      </div>

      <div class="field"><label>도슨트 메모 <span class="docent-label">비공개 — 게시 시 제거됨</span></label>
        <textarea data-docent>${text(a.docentNote)}</textarea></div>`;
    this._bind(a);
  }

  _bind(a) {
    // 연속 타이핑/슬라이더는 coalesce 로 undo 1단계로 병합
    const upd = (fn, opts = {}) => this.store.mutate(
      p => { const aa = find(p, a.id); if (aa) fn(aa); },
      { detail: { silent: opts.silent !== false }, coalesce: opts.coalesce });

    this.root.querySelectorAll('[data-cap]').forEach(inp => inp.addEventListener('input', () => upd(x => { x.caption[inp.dataset.cap] = inp.value; }, { coalesce: `cap:${inp.dataset.cap}:${a.id}` })));
    this.root.querySelectorAll('[data-size]').forEach(inp => inp.addEventListener('input', () => upd(x => { const v = parseFloat(inp.value); if (v > 0) x.sizeCm[inp.dataset.size] = v; }, { coalesce: `awsize:${inp.dataset.size}:${a.id}` })));
    this.root.querySelector('[data-scale]').addEventListener('input', (e) => upd(x => { const v = parseFloat(e.target.value); if (v > 0) x.scale = v; }, { coalesce: `scale:${a.id}` }));

    this.root.querySelector('[data-seg=frame]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; upd(x => { x.frame.style = b.dataset.v; }, { silent: false }); this.render(); });
    this.root.querySelector('[data-seg=temp]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; upd(x => { x.light.temp = b.dataset.v; }, { silent: false }); this.render(); });
    this.root.querySelector('[data-toggle=matte]').addEventListener('click', () => { upd(x => { x.frame.matte = !x.frame.matte; }, { silent: false }); this.render(); });
    const mc = this.root.querySelector('[data-matte-color]');
    if (mc) mc.addEventListener('input', (e) => upd(x => { x.frame.matteColor = e.target.value; }, { coalesce: `matte:${a.id}` }));
    this.root.querySelector('[data-light=intensity]').addEventListener('input', (e) => upd(x => { x.light.intensity = parseFloat(e.target.value); }, { coalesce: `light:${a.id}` }));

    this.root.querySelector('[data-docent]').addEventListener('input', (e) => upd(x => { x.docentNote = e.target.value; }, { coalesce: `docent:${a.id}` }));

    this.root.querySelectorAll('[data-route]').forEach(b => b.addEventListener('click', () => this._moveRoute(a.id, b.dataset.route === 'up' ? -1 : 1)));
    this.root.querySelector('#ins-api').addEventListener('click', () => this.onApiFill(a));
    // P8-4: og:image 대표 작품 지정 (토글)
    this.root.querySelector('[data-cover]').addEventListener('click', () => {
      this.store.mutate(p => { p.meta.coverId = p.meta.coverId === a.id ? '' : a.id; }, { detail: {} });
      this.render();
    });
  }

  // ---- 텍스트 오브젝트 컨트롤 (v1.3 P4) ----
  _renderText(t, space) {
    const p = this.store.project;
    const isLobbySpace = space === p.lobby;
    const roleName = { title: '전시명', intro: '전시 서문', section: '섹션 패널', free: '자유 텍스트' }[t.role] || t.role;

    const seg = (key, cur, opts, labels = {}) =>
      `<div class="seg" data-tx-seg="${key}">${opts.map(o => `<button data-v="${o}" class="${String(cur) === String(o) ? 'on' : ''}">${labels[o] ?? o}</button>`).join('')}</div>`;
    const num = (key, val, step, min, max) =>
      `<input type="number" data-tx-num="${key}" value="${val}" step="${step}" min="${min}" max="${max}">`;
    const FONT_LABELS = { serif: '명조', sans: '고딕(기본)', 'noto-sans': 'Noto Sans', pretendard: 'Pretendard' };
    const styleBlock = (label, prefix, st) => `
      <div class="panel-title" style="margin-top:14px">${label}</div>
      <div class="field"><label>서체</label>${seg(prefix + '.font', st.font, ['serif', 'sans', 'noto-sans', 'pretendard'], FONT_LABELS)}</div>
      <div class="field-row">
        <div class="field"><label>굵기</label>${seg(prefix + '.weight', st.weight, [400, 700, 800], { 400: '보통', 700: '굵게', 800: '아주 굵게' })}</div>
        <div class="field"><label>이탤릭</label><div class="seg" data-tx-seg="${prefix}.italic"><button data-v="false" class="${!st.italic ? 'on' : ''}">기본</button><button data-v="true" class="${st.italic ? 'on' : ''}"><i>기울임</i></button></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>글자 높이(cm)</label>${num(prefix + '.sizeCm', st.sizeCm, 0.5, 1.5, 200)}</div>
        <div class="field"><label>색</label><input type="color" data-tx-num="${prefix}.color" value="${st.color}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>자간(em)</label>${num(prefix + '.letterSpacing', st.letterSpacing, 0.01, -0.05, 0.4)}</div>
        <div class="field"><label>행간</label>${num(prefix + '.lineHeight', st.lineHeight, 0.05, 1, 2.4)}</div>
      </div>
      <div class="field"><label>그림자</label>${seg(prefix + '.shadow', st.shadow || 'none', ['none', 'soft', 'drop', 'glow'], { none: '없음', soft: '부드럽게', drop: '드롭', glow: '글로우' })}</div>
      ${(st.shadow && st.shadow !== 'none') ? `<div class="field"><label>그림자 색 (비우면 기본)</label><input type="color" data-tx-num="${prefix}.shadowColor" value="${st.shadowColor || '#000000'}"></div>` : ''}`;

    // 내용 편집: 역할별로 연동 대상이 다름 (역할 데이터는 유지 — P4 역할/표시 분리)
    let contentHtml = '';
    if (t.role === 'free') {
      contentHtml = `<div class="field"><label>내용 (줄바꿈 가능)</label><textarea data-tx-content="text">${text(t.text)}</textarea></div>`;
    } else if (t.role === 'title') {
      contentHtml = `
        <div class="field"><label>전시명 (줄바꿈 가능 · 사이트 제목과 연동)</label><textarea data-tx-content="meta.title">${text(p.meta.title)}</textarea></div>
        <div class="field"><label>부제</label><input type="text" data-tx-content="meta.subtitle" value="${attr(p.meta.subtitle)}"></div>
        <div class="field"><label>큐레이터</label><input type="text" data-tx-content="meta.curator" value="${attr(p.meta.curator)}"></div>`;
    } else if (t.role === 'intro') {
      contentHtml = `<div class="field"><label>전시 서문 (메타데이터와 연동)</label><textarea data-tx-content="meta.intro">${text(p.meta.intro)}</textarea></div>`;
    } else if (t.role === 'section') {
      contentHtml = `
        <div class="field"><label>섹션명 (룸 데이터와 연동)</label><input type="text" data-tx-content="room.name" value="${attr(space?.name)}"></div>
        <div class="field"><label>섹션 서문</label><textarea data-tx-content="room.intro">${text(space?.intro)}</textarea></div>`;
    }

    this.root.innerHTML = `
      <div class="panel-title">텍스트 — ${roleName}</div>
      ${contentHtml}
      ${styleBlock(t.role === 'section' ? '제목 블록' : '스타일', 'style', t.style)}
      ${t.bodyStyle ? styleBlock('본문 블록', 'bodyStyle', t.bodyStyle) : ''}
      <div class="panel-title" style="margin-top:14px">패널</div>
      <div class="field"><label>벽 (이동 시 해당 벽 정면뷰로 전환)</label>${seg('placement.wall', t.placement.wall, ['north', 'east', 'south', 'west'], { north: '북', east: '동', south: '남', west: '서' })}</div>
      <div class="field-row">
        <div class="field"><label>정렬</label>${seg('panel.align', t.panel?.align || 'left', ['left', 'center', 'right'], { left: '왼쪽', center: '중앙', right: '오른쪽' })}</div>
        <div class="field"><label>폭(cm)</label>${num('widthCm', t.widthCm, 10, 40, 2000)}</div>
      </div>
      <div class="field"><label>배경</label>${seg('panel.bg', t.panel?.bg || 'none', ['none', 'light', 'dark'], { none: '벽면 인쇄', light: '라이트', dark: '다크' })}</div>
      <div class="toggle-row"><label>텍스트 스포트라이트</label><div class="switch ${t.light?.on ? 'on' : ''}" data-tx-light></div></div>
      <div class="field"><label>조명 세기 (0.5–2.0)</label>
        <input type="range" min="0.5" max="2" step="0.1" data-tx-num="light.intensity" value="${t.light?.intensity ?? 1.2}"></div>
      <div class="field"><label>색온도</label>${seg('light.temp', t.light?.temp || 'warm', ['warm', 'neutral', 'cool'], { warm: '웜', neutral: '뉴트럴', cool: '쿨' })}</div>
      <button class="tb-btn" data-tx-del style="width:100%;margin-top:10px;color:var(--danger)">${t.role === 'free' ? '텍스트 삭제' : '벽면 표시 제거 (데이터는 유지)'}</button>`;

    // 대상 텍스트 객체 갱신 (mutate 안에서 재탐색)
    const setPath = (obj, path, val) => {
      const parts = path.split('.');
      let o = obj;
      while (parts.length > 1) o = o[parts.shift()];
      o[parts[0]] = val;
    };
    const upd = (path, val, coalesce) => this.store.mutate(proj => {
      const f = findText(proj, t.id);
      if (f) setPath(f.t, path, val);
    }, { detail: {}, coalesce });

    this.root.querySelectorAll('[data-tx-seg]').forEach(el => el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const raw = b.dataset.v;
      const val = raw === 'true' ? true : raw === 'false' ? false : (isNaN(+raw) ? raw : +raw);
      upd(el.dataset.txSeg, val);
      // 벽 이동: 해당 벽 정면뷰로 따라가기 (선택 유지)
      if (el.dataset.txSeg === 'placement.wall') this.store.select({ wall: val });
      this.render();
    }));
    this.root.querySelectorAll('[data-tx-num]').forEach(inp => inp.addEventListener('input', () => {
      const val = inp.type === 'color' ? inp.value : parseFloat(inp.value);
      if (inp.type !== 'color' && !isFinite(val)) return;
      upd(inp.dataset.txNum, val, 'tx:' + inp.dataset.txNum + ':' + t.id);
    }));
    this.root.querySelector('[data-tx-light]').addEventListener('click', () => {
      this.store.mutate(proj => { const f = findText(proj, t.id); if (f) { f.t.light = f.t.light || {}; f.t.light.on = !f.t.light.on; } }, { detail: {} });
      this.render();
    });
    // 내용 편집 — 역할 연동 대상(메타/룸/자유 텍스트)에 기록
    this.root.querySelectorAll('[data-tx-content]').forEach(inp => inp.addEventListener('input', () => {
      const key = inp.dataset.txContent;
      this.store.mutate(proj => {
        const f = findText(proj, t.id);
        if (!f) return;
        if (key === 'text') f.t.text = inp.value;
        else if (key.startsWith('meta.')) proj.meta[key.slice(5)] = inp.value;
        else if (key.startsWith('room.')) { if (f.space && f.space !== proj.lobby) f.space[key.slice(5)] = inp.value; }
      }, { detail: { silent: true }, coalesce: 'txc:' + key + ':' + t.id });
    }));
    this.root.querySelector('[data-tx-del]').addEventListener('click', () => {
      this.store.mutate(proj => {
        const f = findText(proj, t.id);
        if (f) f.space.texts = f.space.texts.filter(x => x.id !== t.id);
      }, { detail: {} });
      this.store.select({ textId: null });
    });
  }

  _moveRoute(id, dir) {
    this.store.mutate(p => {
      const i = p.route.indexOf(id); if (i < 0) return;
      const j = i + dir; if (j < 0 || j >= p.route.length) return;
      [p.route[i], p.route[j]] = [p.route[j], p.route[i]];
    }, { detail: {} });
    this.render();
  }
}

function find(p, id) {
  for (const r of p.rooms) { const a = (r.artworks || []).find(x => x.id === id); if (a) return a; }
  return (p.lobby?.artworks || []).find(x => x.id === id) || null;
}
// 텍스트 오브젝트 탐색 (P4): 반환 { t, space } — space = room 또는 lobby
function findText(p, id) {
  for (const s of [...(p.rooms || []), p.lobby]) {
    const t = (s?.texts || []).find(x => x.id === id);
    if (t) return { t, space: s };
  }
  return null;
}
function attr(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function text(s) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
function frameLabel(f) { return { gold: '골드', wood: '우드', black: '블랙', none: '없음' }[f] || f; }
function tempLabel(t) { return { warm: '웜', neutral: '뉴트럴', cool: '쿨' }[t] || t; }
