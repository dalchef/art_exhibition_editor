// viewer/js/textures.js
// 모든 벽지·바닥·명제판 텍스처를 코드로 절차 생성한다. 외부 이미지 파일 0개.
import * as THREE from '../../vendor/three.module.js';

// 프리셋 색상 팔레트 -------------------------------------------------------
export const WALL_COLORS = {
  'deep-red': { base: '#5e2626', light: '#743232', dark: '#4a1d1d' },
  'green':    { base: '#2c4436', light: '#375343', dark: '#213328' },
  'navy':     { base: '#26324e', light: '#31405f', dark: '#1c2740' },
  'gray':     { base: '#5f5a53', light: '#6e6860', dark: '#4c4842' },
};

export const FLOOR_COLORS = {
  'walnut-herringbone': { a: '#6b4a30', b: '#5a3d27', grain: '#4a3120', kind: 'herringbone' },
  'oak-herringbone':    { a: '#b08855', b: '#9c7748', grain: '#836035', kind: 'herringbone' },
  'ash-plank':          { a: '#c3ac86', b: '#b7a078', grain: '#9c855f', kind: 'plank' },
  'walnut-plank':       { a: '#5c3f2b', b: '#4e3524', grain: '#3d2919', kind: 'plank' },
};

const _cache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// 벽지: 베이스 색 + (옵션) 다마스크풍 모티프 -------------------------------
export function wallTexture(preset = 'deep-red', pattern = true) {
  const key = `wall:${preset}:${pattern}`;
  if (_cache.has(key)) return _cache.get(key).clone ? _reuse(key) : _cache.get(key);
  const pal = WALL_COLORS[preset] || WALL_COLORS['deep-red'];
  const S = 512;
  const cv = canvas(S), g = cv.getContext('2d');
  g.fillStyle = pal.base; g.fillRect(0, 0, S, S);

  // 은은한 수직 그라데이션(위가 살짝 밝음)
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.10)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);

  if (pattern) {
    // 다마스크풍: 대칭 잎사귀/마름모 모티프를 격자로 반복
    const draw = (cx, cy, s, color) => {
      g.save(); g.translate(cx, cy); g.fillStyle = color;
      g.globalAlpha = 0.5;
      // 4방향 대칭 페탈
      for (let k = 0; k < 4; k++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(s * 0.5, -s * 0.2, s * 0.5, -s * 0.8, 0, -s);
        g.bezierCurveTo(-s * 0.5, -s * 0.8, -s * 0.5, -s * 0.2, 0, 0);
        g.fill();
      }
      g.restore();
    };
    const cell = S / 2;
    for (let iy = 0; iy < 2; iy++) {
      for (let ix = 0; ix < 2; ix++) {
        const cx = ix * cell + cell / 2, cy = iy * cell + cell / 2;
        draw(cx, cy, cell * 0.34, pal.light);
        // 오프셋 다이아몬드
        draw(cx + cell / 2, cy + cell / 2, cell * 0.22, pal.dark);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _cache.set(key, tex);
  return tex;
}

// 바닥: 헤링본 또는 플랭크 우드 --------------------------------------------
export function floorTexture(preset = 'walnut-herringbone') {
  const key = `floor:${preset}`;
  if (_cache.has(key)) return _cache.get(key);
  const pal = FLOOR_COLORS[preset] || FLOOR_COLORS['walnut-herringbone'];
  const S = 512;
  const cv = canvas(S), g = cv.getContext('2d');
  g.fillStyle = pal.grain; g.fillRect(0, 0, S, S);

  const plank = (x, y, w, h, col) => {
    g.save(); g.translate(x, y);
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    // 나뭇결 라인
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      const yy = (h / 4) * (i + 1);
      g.moveTo(2, yy); g.lineTo(w - 2, yy + (i % 2 ? 1 : -1)); g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(0.5, 0.5, w - 1, h - 1);
    g.restore();
  };

  if (pal.kind === 'herringbone') {
    // 45도 헤링본: 대각선 방향 판자쌍 반복
    const L = S / 4;      // 판자 길이
    const W = L / 2.4;    // 판자 폭
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(Math.PI / 4);
    for (let iy = -3; iy <= 3; iy++) {
      for (let ix = -3; ix <= 3; ix++) {
        const col = ((ix + iy) & 1) ? pal.a : pal.b;
        plank(ix * L, iy * (W * 2), L - 2, W - 1, col);
        plank(ix * L + L / 2, iy * (W * 2) + W, L - 2, W - 1, ((ix + iy) & 1) ? pal.b : pal.a);
      }
    }
    g.restore();
  } else {
    // 플랭크: 가로 긴 판자
    const H = S / 6;
    for (let iy = 0; iy < 6; iy++) {
      const off = (iy % 2) * (S / 4);
      for (let ix = -1; ix < 3; ix++) {
        const col = ((ix + iy) & 1) ? pal.a : pal.b;
        plank(ix * (S / 2) + off, iy * H, S / 2 - 2, H - 1, col);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _cache.set(key, tex);
  return tex;
}

function _reuse(key) { return _cache.get(key); }

// ============================================================================
// P5: 자유 색 + 패턴 확장 + 커스텀 업로드
// ============================================================================
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(hex, f) { // f>0 밝게, f<0 어둡게 (톤온톤)
  const [r, g, b] = hexToRgb(hex);
  const t = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${t(r)},${t(g)},${t(b)})`;
}

export const WALL_PATTERNS = ['damask', 'stripes', 'plaster', 'fabric', 'dots', 'plain'];

// 벽 스타일 캔버스: 절차 패턴 6종(벽 색 톤온톤 틴트) + custom(업로드 이미지).
// style: { color, pattern, patternOpacity(0..1), patternScale(m), patternMirror }
// imageEl: pattern==='custom' 일 때 업로드 이미지 (사전 로드된 HTMLImageElement)
// 반환 { canvas, tileM }
export function wallStyleCanvas(style, imageEl) {
  const color = style.color || '#5e2626';
  const pattern = style.pattern || 'damask';
  const op = Math.max(0, Math.min(1, style.patternOpacity ?? 1));
  const tileM = style.patternScale || (pattern === 'custom' ? 1 : 2.6);
  const S = 512;
  const cv = canvas(S), g = cv.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  // 은은한 수직 그라데이션
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.10)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);

  const light = shade(color, 0.16), dark = shade(color, -0.22);
  g.globalAlpha = op;
  if (pattern === 'custom' && imageEl) {
    g.drawImage(imageEl, 0, 0, S, S);
  } else if (pattern === 'damask') {
    const draw = (cx, cy, s, col) => {
      g.save(); g.translate(cx, cy); g.fillStyle = col; g.globalAlpha = op * 0.5;
      for (let k = 0; k < 4; k++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(s * 0.5, -s * 0.2, s * 0.5, -s * 0.8, 0, -s);
        g.bezierCurveTo(-s * 0.5, -s * 0.8, -s * 0.5, -s * 0.2, 0, 0);
        g.fill();
      }
      g.restore();
    };
    const cell = S / 2;
    for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
      const cx = ix * cell + cell / 2, cy = iy * cell + cell / 2;
      draw(cx, cy, cell * 0.34, light);
      draw(cx + cell / 2, cy + cell / 2, cell * 0.22, dark);
    }
  } else if (pattern === 'stripes') {
    g.fillStyle = light; g.globalAlpha = op * 0.35;
    const w = S / 24;
    for (let x = 0; x < S; x += w * 2) g.fillRect(x, 0, w, S);
  } else if (pattern === 'plaster') {
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = (i & 1) ? light : dark;
      g.globalAlpha = op * (0.03 + Math.random() * 0.07);
      const r = 0.6 + Math.random() * 1.8;
      g.fillRect(Math.random() * S, Math.random() * S, r, r);
    }
  } else if (pattern === 'fabric') {
    g.strokeStyle = light; g.lineWidth = 1.4; g.globalAlpha = op * 0.28;
    const step = S / 16;
    for (let y = 0; y < S; y += step) {
      for (let x = 0; x < S; x += step) {
        const up = ((x + y) / step) % 2 < 1;
        g.beginPath();
        if (up) { g.moveTo(x, y + step); g.lineTo(x + step, y); }
        else { g.moveTo(x, y); g.lineTo(x + step, y + step); }
        g.stroke();
      }
    }
  } else if (pattern === 'dots') {
    g.fillStyle = light; g.globalAlpha = op * 0.4;
    const step = S / 10;
    for (let y = step / 2; y < S; y += step) {
      for (let x = step / 2; x < S; x += step) {
        g.beginPath(); g.arc(x, y, S / 110, 0, 7); g.fill();
      }
    }
  } // plain: 패턴 없음
  g.globalAlpha = 1;
  return { canvas: cv, tileM };
}

// 벽 스타일 텍스처 (캐시). 커스텀 이미지는 imageEl 로 사전 로드되어 있어야 함.
export function wallStyleTexture(style, imageEl) {
  const key = 'wallS:' + JSON.stringify([style.color, style.pattern, style.patternOpacity, style.patternScale, !!style.patternMirror, !!imageEl, imageEl?.src?.slice(-24)]);
  if (_cache.has(key)) return _cache.get(key);
  const { canvas: cv, tileM } = wallStyleCanvas(style, imageEl);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = style.patternMirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  const out = { tex, tileM };
  _cache.set(key, out);
  return out;
}

// 바닥: 프리셋 4종 유지 + 커스텀 업로드 슬롯 (P5)
export function floorStyleTexture(floorDef, imageEl) {
  if (floorDef?.preset === 'custom' && imageEl) {
    const key = 'floorS:' + (imageEl.src?.slice(-24) || '') + ':' + (floorDef.mirror ? 'm' : 'r');
    if (_cache.has(key)) return _cache.get(key);
    const S = 512;
    const cv = canvas(S), g = cv.getContext('2d');
    g.drawImage(imageEl, 0, 0, S, S);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = floorDef.mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    const out = { tex, tileM: floorDef.scale || 1 };
    _cache.set(key, out);
    return out;
  }
  return { tex: floorTexture(floorDef?.preset || 'walnut-herringbone'), tileM: 1.15 };
}

// ---- 텍스트월 스타일 렌더 (v1.2 P4 / v1.3 P4 확장) ---------------------------
// blocks: [{ text, style:{font,weight,italic,sizeCm,color,letterSpacing,lineHeight,shadow,shadowColor}, gapCm? }]
// panel:  { align, bg, widthCm }
// styledTextCanvas → { canvas, wM, hM } (에디터 정면뷰 공용) / styledTextTexture → THREE 텍스처 래핑.
// ctx.letterSpacing 미지원 브라우저는 글자 단위 수동 렌더로 폴백(실측 감지).
const FONT_FAMILY = {
  serif: `'Noto Serif KR', 'Pretendard', serif`,          // 명조
  sans: `'Pretendard', sans-serif`,                        // 고딕(기본)
  'noto-sans': `'Noto Sans KR', 'Pretendard', sans-serif`, // v1.3 P4
  pretendard: `'Pretendard', sans-serif`,                  // v1.3 P4 (명시 선택지)
};
const PANEL_BG = { none: null, light: 'rgba(245,238,225,0.94)', dark: 'rgba(24,18,14,0.92)' };
const _lsSupported = (() => {
  try { return 'letterSpacing' in CanvasRenderingContext2D.prototype; } catch (e) { return false; }
})();

// 그림자 프리셋 (v1.3 P4): 글자 크기(px) 비례
function applyShadow(g, st, px) {
  const kind = st.shadow || 'none';
  if (kind === 'soft') { g.shadowColor = st.shadowColor || 'rgba(0,0,0,0.55)'; g.shadowOffsetX = px * 0.04; g.shadowOffsetY = px * 0.07; g.shadowBlur = px * 0.18; }
  else if (kind === 'drop') { g.shadowColor = st.shadowColor || 'rgba(0,0,0,0.85)'; g.shadowOffsetX = px * 0.05; g.shadowOffsetY = px * 0.05; g.shadowBlur = 0; }
  else if (kind === 'glow') { g.shadowColor = st.shadowColor || '#FFD9A0'; g.shadowOffsetX = 0; g.shadowOffsetY = 0; g.shadowBlur = px * 0.35; }
  else { g.shadowColor = 'rgba(0,0,0,0)'; g.shadowOffsetX = 0; g.shadowOffsetY = 0; g.shadowBlur = 0; }
}
const fontStr = (st, px) => `${st.italic ? 'italic ' : ''}${st.weight || 400} ${px}px ${FONT_FAMILY[st.font] || FONT_FAMILY.sans}`;

export function styledTextCanvas({ blocks, panel }) {
  const wM = Math.max(0.4, (panel.widthCm || 300) / 100);
  const pxPerM = Math.min(2048 / wM, 700);
  const W = Math.round(wM * pxPerM);
  const padPx = Math.round(pxPerM * 0.09);
  const maxW = W - padPx * 2;

  // 1) 측정 패스: 블록별 줄바꿈(단어 단위, 초과 시 글자 단위) → 전체 높이 산출
  const meas = document.createElement('canvas').getContext('2d');
  const laidOut = [];
  let totalH = padPx;
  for (const b of blocks) {
    if (!b.text) continue;
    const st = b.style;
    const px = Math.max(6, (st.sizeCm / 100) * pxPerM);
    const ls = (st.letterSpacing || 0) * px;
    meas.font = fontStr(st, px);
    const wordW = (t) => meas.measureText(t).width + ls * Math.max(0, t.length - (_lsSupported ? 0 : 1));
    const lines = [];
    for (const para of String(b.text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const cand = line ? line + ' ' + word : word;
        if (wordW(cand) <= maxW || !line) {
          if (wordW(word) > maxW && !line) {
            // 한 단어가 폭 초과 → 글자 단위
            let chunk = '';
            for (const ch of word) {
              if (wordW(chunk + ch) > maxW && chunk) { lines.push(chunk); chunk = ch; }
              else chunk += ch;
            }
            line = chunk;
          } else line = cand;
        } else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    const lineH = px * (st.lineHeight || 1.5);
    const gapPx = ((b.gapCm || 0) / 100) * pxPerM;
    laidOut.push({ st, px, ls, lines, lineH, gapPx });
    totalH += lines.length * lineH + gapPx;
  }
  totalH += padPx;
  const H = Math.max(32, Math.round(totalH));

  // 2) 렌더 패스
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const bg = PANEL_BG[panel.bg || 'none'];
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
  g.textBaseline = 'top';
  const align = panel.align || 'left';
  let y = padPx;
  for (const lo of laidOut) {
    g.font = fontStr(lo.st, lo.px);
    g.fillStyle = lo.st.color || '#e8e0d0';
    applyShadow(g, lo.st, lo.px); // 그림자 프리셋 (v1.3 P4)
    if (_lsSupported) g.letterSpacing = lo.ls + 'px';
    for (const line of lo.lines) {
      const lw = g.measureText(line).width + (_lsSupported ? 0 : lo.ls * Math.max(0, line.length - 1));
      const x = align === 'center' ? (W - lw) / 2 : (align === 'right' ? W - padPx - lw : padPx);
      if (_lsSupported) {
        g.fillText(line, x, y);
      } else {
        // 폴백: 글자 단위 수동 자간
        let cx = x;
        for (const ch of line) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + lo.ls; }
      }
      y += lo.lineH;
    }
    if (_lsSupported) g.letterSpacing = '0px';
    y += lo.gapPx;
  }
  applyShadow(g, {}, 0); // 그림자 리셋

  return { canvas: cv, wM, hM: H / pxPerM };
}

export function styledTextTexture({ blocks, panel }) {
  const { canvas: cv, wM, hM } = styledTextCanvas({ blocks, panel });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, wM, hM };
}

// 텍스트 라벨(명제판·타이틀월·서문 패널)을 canvas 로 렌더 → 텍스처 --------
// opts: { w,h (px), lines:[{text,size,weight,color,gap}], align, bg, padding }
export function textTexture(opts) {
  const dpr = 2;
  const W = opts.w, H = opts.h;
  const cv = document.createElement('canvas');
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, W, H); }
  const pad = opts.padding ?? 24;
  const align = opts.align || 'left';
  g.textAlign = align;
  g.textBaseline = 'top';
  const x = align === 'center' ? W / 2 : (align === 'right' ? W - pad : pad);
  let y = opts.startY ?? pad;
  for (const ln of opts.lines) {
    g.fillStyle = ln.color || '#2a2a2a';
    const weight = ln.weight || 500;
    g.font = `${weight} ${ln.size}px Pretendard, sans-serif`;
    // 단순 줄바꿈(폭 초과 시)
    const maxW = W - pad * 2;
    const words = (ln.text || '').split('');
    let line = '';
    const emit = (t) => { g.fillText(t, x, y); y += ln.size * 1.28; };
    for (const ch of words) {
      if (g.measureText(line + ch).width > maxW && line) { emit(line); line = ch; }
      else line += ch;
    }
    if (line || (ln.text || '') === '') emit(line);
    y += (ln.gap || 0);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
