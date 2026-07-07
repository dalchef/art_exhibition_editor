// shared/placementRules.js — 작품 배치 규칙 단일 소스 (v1.2 P0).
// 정면뷰(editor/elevationView)와 3D 편집(viewer/editMode)이 동일 로직을 공유해
// "정면뷰 배치 ↔ 3D 표시" 불일치를 원천 차단한다.
//
// 핵심: 작품의 화면 점유 크기는 그림(실측×scale)이 아니라
//       [그림 + 매트(옵션) + 액자] 를 합한 "외곽(outer)" 기준이다.
//       3D(artwork.js)는 원래 외곽으로 렌더하므로, 배치·스냅·겹침 판정도 외곽으로 통일한다.
import { LAYOUT } from './schema.js';

// 액자 프리셋 — 3D 렌더(artwork.js)와 정면뷰가 공용으로 사용 (§7 v1.0)
export const FRAME_STYLES = Object.freeze({
  gold:  { color: 0xc9a24c, metalness: 0.55, roughness: 0.35, w: 0.09, d: 0.07, double: true },
  wood:  { color: 0x6e4a2e, metalness: 0.0,  roughness: 0.7,  w: 0.08, d: 0.06, double: false },
  black: { color: 0x1a1a1c, metalness: 0.2,  roughness: 0.5,  w: 0.04, d: 0.05, double: false },
  none:  null,
});

export const MATTE_BORDER = 0.08;   // 매트 폭(m) — artwork.js 와 동일
export const EYE_LEVEL_CM = 150;    // 아이레벨 스냅 기준
const EDGE_PAD = 0.05;              // 벽 끝 여유
const GAP = 0.04;                   // 작품 간 최소 간격(겹침 판정 여유)

// 그림/매트/액자 치수 분해. 반환 값(m):
//   pw/ph = 그림, matte = 매트 폭, frameW = 액자 폭, w/h = 외곽(전체)
export function artworkOuterSize(aw) {
  const scale = aw.scale || 1;
  const pw = (aw.sizeCm.w / 100) * scale;
  const ph = (aw.sizeCm.h / 100) * scale;
  const matte = aw.frame?.matte ? MATTE_BORDER : 0;
  const style = FRAME_STYLES[aw.frame?.style ?? 'gold'];
  const frameW = style ? style.w : 0;
  return { pw, ph, matte, frameW, w: pw + 2 * (matte + frameW), h: ph + 2 * (matte + frameW) };
}

// 배치 해석: 스냅(아이레벨/중심 정렬) → 벽 클램프 → 문 간섭 회피 → 작품 겹침 밀어냄.
// args: { wallLen, wallH, u, v(m), aw, others[], door: {offset}|null, snap=true, alt=false }
// 반환 { u, v, guides:{u?,v?}, outer, snappedEye }
export function resolvePlacement(args) {
  const { wallLen, wallH, aw, others = [], door = null } = args;
  let { u, v } = args;
  const snap = args.snap !== false && !args.alt;
  const o = artworkOuterSize(aw);
  const guides = {};
  let snappedEye = false;

  const clampU = (x) => Math.max(o.w / 2 + EDGE_PAD, Math.min(wallLen - o.w / 2 - EDGE_PAD, x));

  // 아이레벨 150cm 수평 스냅
  if (snap && Math.abs(v - EYE_LEVEL_CM / 100) < 0.08) {
    v = EYE_LEVEL_CM / 100;
    guides.v = v;
    snappedEye = true;
  }
  // 다른 작품 중심 x 정렬 스냅
  if (snap) {
    for (const ot of others) {
      if (Math.abs(ot.placement.x - u) < 0.12) { u = ot.placement.x; guides.u = u; break; }
    }
  }
  u = clampU(u);
  v = Math.max(o.h / 2 + EDGE_PAD, Math.min(wallH - o.h / 2 - EDGE_PAD, v));

  // 문 개구부 간섭 방지 (외곽 기준)
  if (door && typeof door.offset === 'number') {
    const dl = door.offset - LAYOUT.DOOR_W / 2 - o.w / 2 - 0.08;
    const dr = door.offset + LAYOUT.DOOR_W / 2 + o.w / 2 + 0.08;
    if (v - o.h / 2 < LAYOUT.DOOR_H && u > dl && u < dr) {
      u = (u < door.offset) ? Math.min(u, dl) : Math.max(u, dr);
      u = clampU(u);
    }
  }

  // 작품 간 겹침: 가까운 쪽으로 밀어냄 (외곽 기준, 최대 4회 해소)
  for (let it = 0; it < 4; it++) {
    const hit = others.find(ot => {
      const oo = artworkOuterSize(ot);
      const ov = ot.placement.centerHeightCm / 100;
      return Math.abs(ot.placement.x - u) < (oo.w + o.w) / 2 + GAP &&
             Math.abs(ov - v) < (oo.h + o.h) / 2 + GAP;
    });
    if (!hit) break;
    const hw = artworkOuterSize(hit).w;
    u = (u < hit.placement.x) ? hit.placement.x - (hw + o.w) / 2 - GAP - 0.02
                              : hit.placement.x + (hw + o.w) / 2 + GAP + 0.02;
    u = clampU(u);
  }

  return { u, v, guides, outer: o, snappedEye };
}

// scale 값 정규화: 범위 클램프 + 1.0(실측) 흡착 스냅 (P1)
export function resolveScale(raw, { alt = false } = {}) {
  let s = Math.max(0.3, Math.min(3, raw));
  const snapped = !alt && Math.abs(s - 1.0) < 0.06;
  if (snapped) s = 1.0;
  return { scale: +s.toFixed(3), snapped };
}
