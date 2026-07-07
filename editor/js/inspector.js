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
    // 텍스트월 타이포 컨트롤 (P4) — 정면뷰에서 텍스트월 선택 시
    const tw = this.store.selection.textWall;
    if (tw) { this._renderTextWall(tw); return; }
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
      <button class="tb-btn" id="ins-api" style="width:100%;margin-bottom:14px">🔎 API로 채우기</button>

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
  }

  // ---- 텍스트월 타이포 컨트롤 (P4) ----
  _renderTextWall(tw) {
    const p = this.store.project;
    const isTitle = tw.type === 'title';
    const room = isTitle ? null : p.rooms.find(r => r.id === tw.roomId);
    if (!isTitle && !room) { this.root.innerHTML = ''; return; }
    const tStyle = isTitle ? p.titleStyle : room.introTitleStyle;
    const bStyle = isTitle ? p.introStyle : room.introBodyStyle;
    const panel = isTitle ? p.titlePanel : room.introPanel;

    const seg = (key, cur, opts, labels = {}) =>
      `<div class="seg" data-tw-seg="${key}">${opts.map(o => `<button data-v="${o}" class="${String(cur) === String(o) ? 'on' : ''}">${labels[o] ?? o}</button>`).join('')}</div>`;
    const num = (key, val, step, min, max) =>
      `<input type="number" data-tw-num="${key}" value="${val}" step="${step}" min="${min}" max="${max}">`;
    const styleBlock = (label, prefix, st) => `
      <div class="panel-title" style="margin-top:14px">${label}</div>
      <div class="field"><label>서체</label>${seg(prefix + '.font', st.font, ['serif', 'sans'], { serif: '명조', sans: '고딕' })}</div>
      <div class="field-row">
        <div class="field"><label>굵기</label>${seg(prefix + '.weight', st.weight, [400, 700], { 400: '보통', 700: '굵게' })}</div>
        <div class="field"><label>글자 높이(cm)</label>${num(prefix + '.sizeCm', st.sizeCm, 0.5, 2, 120)}</div>
      </div>
      <div class="field-row">
        <div class="field"><label>색</label><input type="color" data-tw-num="${prefix}.color" value="${st.color}"></div>
        <div class="field"><label>자간(em)</label>${num(prefix + '.letterSpacing', st.letterSpacing, 0.01, -0.05, 0.4)}</div>
        <div class="field"><label>행간</label>${num(prefix + '.lineHeight', st.lineHeight, 0.05, 1, 2.4)}</div>
      </div>`;

    this.root.innerHTML = `
      <div class="panel-title">${isTitle ? '타이틀월 타이포그래피' : `섹션 패널 — ${attr(room.name)}`}</div>
      ${styleBlock('제목 블록', 't', tStyle)}
      ${styleBlock('본문 블록', 'b', bStyle)}
      <div class="panel-title" style="margin-top:14px">패널</div>
      <div class="field-row">
        <div class="field"><label>정렬</label>${seg('p.align', panel.align, ['left', 'center'], { left: '왼쪽', center: '중앙' })}</div>
        <div class="field"><label>폭(cm)</label>${num('p.widthCm', panel.widthCm, 10, 80, 2000)}</div>
      </div>
      <div class="field"><label>배경</label>${seg('p.bg', panel.bg, ['none', 'light', 'dark'], { none: '벽면 인쇄', light: '라이트', dark: '다크' })}</div>
      <div class="toggle-row"><label>텍스트 스포트라이트</label><div class="switch ${panel.light?.on ? 'on' : ''}" data-tw-light></div></div>
      <div class="field"><label>조명 세기 (0.5–2.0)</label>
        <input type="range" min="0.5" max="2" step="0.1" data-tw-num="p.light.intensity" value="${panel.light?.intensity ?? 1.2}"></div>
      <div class="field"><label>색온도</label>${seg('p.light.temp', panel.light?.temp || 'warm', ['warm', 'neutral', 'cool'], { warm: '웜', neutral: '뉴트럴', cool: '쿨' })}</div>
      <div class="hint-note">프리뷰 창이 열려 있으면 즉시 반영됩니다.</div>`;

    // 대상 객체 경로 해석: t=제목 스타일, b=본문 스타일, p=패널
    const resolve = (proj) => {
      const rr = isTitle ? null : (proj.rooms.find(r => r.id === tw.roomId));
      return {
        t: isTitle ? proj.titleStyle : rr.introTitleStyle,
        b: isTitle ? proj.introStyle : rr.introBodyStyle,
        p: isTitle ? proj.titlePanel : rr.introPanel,
      };
    };
    const setPath = (obj, path, val) => {
      const parts = path.split('.');
      const rootKey = parts.shift();
      let t = obj[rootKey];
      while (parts.length > 1) t = t[parts.shift()];
      t[parts[0]] = val;
    };
    const upd = (path, val, coalesce) => this.store.mutate(proj => {
      setPath(resolve(proj), path, val);
    }, { detail: { textWall: true }, coalesce });

    this.root.querySelectorAll('[data-tw-seg]').forEach(el => el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const raw = b.dataset.v;
      upd(el.dataset.twSeg, isNaN(+raw) ? raw : +raw);
      this.render();
    }));
    this.root.querySelectorAll('[data-tw-num]').forEach(inp => inp.addEventListener('input', () => {
      const val = inp.type === 'color' ? inp.value : parseFloat(inp.value);
      if (inp.type !== 'color' && !(isFinite(val))) return;
      upd(inp.dataset.twNum, val, 'tw:' + inp.dataset.twNum);
    }));
    this.root.querySelector('[data-tw-light]').addEventListener('click', () => {
      this.store.mutate(proj => { const t = resolve(proj).p; t.light = t.light || {}; t.light.on = !t.light.on; }, { detail: { textWall: true } });
      this.render();
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
function attr(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function text(s) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
function frameLabel(f) { return { gold: '골드', wood: '우드', black: '블랙', none: '없음' }[f] || f; }
function tempLabel(t) { return { warm: '웜', neutral: '뉴트럴', cool: '쿨' }[t] || t; }
