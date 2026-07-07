// viewer/js/avatarPresets.js — v1.1 아바타 캐릭터 설정 상수.
// 형태 파라미터·색 테이블·몸 변형 세트를 로직(avatar.js)과 분리한다.
// 정본 디자인: docs/character-sheets/*.png (런타임에 로드하지 않음 — 참고용 정답지).
// 수치는 패치지시문 §5 표의 시작값 기준이며, 시트 대조로 ±20% 내에서 조정된 값이다.
// 부위 구성·개수·정본 HEX 는 고정(§3.1). displayName 은 v1.2 P6 확정 명칭.

// 의상 색 팔레트 8색 (§6.1)
export const GARMENT_PALETTE = [
  '#D97A5C', '#8DA98A', '#D9B35A', '#F2E9DB',
  '#7A8FA6', '#C98A8A', '#5B5B5B', '#A9744F',
];

export const EYE_COLOR = '#2B2B2B';   // 점 눈 — 하이라이트 없음 (§3.2)
export const LINE_COLOR = '#5B4636';  // 데칼 선 색 (§3.4)

// 캐릭터별 설정.
// bodies: 몸 색 변형 세트 — role(부위 역할) → HEX. default = 시트 정본(§4).
//         추가 세트는 구현자 제안 큐레이션(§6.1 — 임의 자동 산출 아님, 상수 고정).
// parts:  §5 형태 분해 명세의 치수·배치 상수.
export const AVATAR_PRESETS = {

  // ---- 부엉이 (일체형 · 조끼) — §5.1 --------------------------------------
  owl: {
    id: 'owl',
    displayName: '부루',
    type: 'onepiece',
    garmentDefault: '#D97A5C',
    bodies: {
      default: { body: '#A88266', face: '#F2E9DB', cheek: '#F3CDBE', accent: '#E09A4E' },
      gray:    { body: '#9B9088', face: '#F2EDE3', cheek: '#F3CDBE', accent: '#E09A4E' },
      snowy:   { body: '#E6DFD2', face: '#FAF6EE', cheek: '#F3CDBE', accent: '#D9964A' },
    },
    bodyLabels: { default: '브라운', gray: '그레이', snowy: '스노위' },
    parts: {
      body:   { r: 0.48, s: [1, 1.35, 0.95], y: 0.65 },     // 정수리 ≈1.30
      faceDisc: { r: 0.17, sz: 0.30, x: 0.115, y: 1.00, z: 0.368 },
      eyes:   { r: 0.032, x: 0.11, y: 1.02, z: 0.435 },
      cheeks: { r: 0.05, x: 0.20, y: 0.93 },
      beak:   { r: 0.035, h: 0.07, y: 0.96, z: 0.435 },
      tufts:  { r: 0.055, h: 0.13, x: 0.17, y: 1.28, tilt: 0.52 }, // 바깥 30°
      vest:   { grow: 1.07, thetaStart: 1.171, thetaLength: 0.545 }, // y≈0.55~0.92 밴드
      buttons: { r: 0.024, x: 0.04, ys: [0.78, 0.68], zs: [0.489, 0.497] },
      wings:  { r: 0.17, s: [0.35, 1.05, 0.55], pivot: [0.50, 0.84, 0.02], drop: 0.16, tiltZ: 0.10, tiltY: 0.18 },
      feet:   { r: 0.09, s: [1, 0.5, 1.1], pos: [0.15, 0.05, 0.28], toes: { r: 0.03, dz: 0.10, dx: 0.035 } },
      tail:   { r: 0.07, sz: 0.6, pos: [0, 0.30, -0.40] },
    },
  },

  // ---- 카피바라 (일체형 · 목도리) — §5.2 -----------------------------------
  capybara: {
    id: 'capybara',
    displayName: '보리',
    type: 'onepiece',
    garmentDefault: '#8DA98A',
    bodies: {
      default: { body: '#D9A66B', muzzle: '#B07D4F', cheek: '#F0BFA9' },
      darktan: { body: '#B9884F', muzzle: '#8C6136', cheek: '#EAB69E' },
    },
    bodyLabels: { default: '탠', darktan: '다크탠' },
    parts: {
      body:   { r: 0.47, s: [1, 1.38, 0.98], y: 0.65 },      // 정수리 ≈1.30
      muzzle: { r: 0.20, s: [1.05, 0.75, 0.75], pos: [0, 0.95, 0.40] },
      ears:   { r: 0.06, x: 0.20, y: 1.28, z: -0.05 },
      eyes:   { r: 0.030, x: 0.15, y: 1.06 },
      cheeks: { r: 0.05, x: 0.26, y: 0.96 },
      scarf: {
        // 토러스 외경이 몸 반경보다 커야 밴드가 몸 밖으로 보인다 (몸 r@y0.87 ≈ 0.44)
        torus: { R: 0.385, t: 0.095, y: 0.87, tiltX: 0.06 },
        tail:  { box: [0.13, 0.28, 0.055], pivot: [-0.14, 0.79, 0.44] }, // 앞자락(관성 애니메이션 대상)
        fringe: { r: 0.015, len: 0.05, n: 3 },
      },
      arms:   { r: 0.095, s: [0.6, 1.35, 0.6], pos: [0.46, 0.60, 0.09] },
      feet:   { r: 0.10, s: [1, 0.5, 1.15], pos: [0.16, 0.05, 0.26] },
      tail:   { r: 0.035, pos: [0, 0.28, -0.40] },
    },
  },

  // ---- 토끼 (분리형 · 네커치프) — §5.3 -------------------------------------
  rabbit: {
    id: 'rabbit',
    displayName: '모아',
    type: 'split',
    garmentDefault: '#D97A5C',
    bodies: {
      default: { body: '#F2E9DB', inner: '#F1C9B6', cheek: '#F3CDBE' },
      gray:    { body: '#CFC9C1', inner: '#EBBBA8', cheek: '#F3CDBE' },
      brown:   { body: '#CBA37A', inner: '#F0C4AA', cheek: '#F3CDBE' },
    },
    bodyLabels: { default: '크림', gray: '그레이', brown: '브라운' },
    parts: {
      body:   { r: 0.34, s: [1, 1.28, 0.95], y: 0.44 },
      head:   { r: 0.30, s: [1, 1.05, 0.97], y: 1.05 },       // 정수리 ≈1.37
      // 귀: 캡슐 전장≈0.45(len 0.30 + 양단 r). 피벗은 기부 — 관성 애니메이션 대상.
      ears:   { r: 0.075, len: 0.30, base: [0.13, 1.32, -0.02], tiltZ: 0.175, tiltX: -0.087, flat: 0.8,
                inner: { s: [0.55, 0.8, 0.22], dz: 0.062 } },
      eyes:   { r: 0.030, x: 0.115, yLocal: 0.05, z: 0.265 }, // head-local
      noseDecal: { yLocal: -0.03, z: 0.295, w: 0.16, h: 0.14 },
      cheeks: { r: 0.05, x: 0.20, yLocal: -0.03, z: 0.215 },
      kerchief: {
        torus: { R: 0.21, t: 0.045, y: 0.86, tiltX: 0.06 },
        tri:   { r: 0.21, h: 0.26, sz: 0.25, pos: [0, 0.74, 0.225] },  // 앞 삼각, 꼭짓점 아래
        knot:  { r: 0.05, pos: [0, 0.88, -0.27] },
      },
      arms:   { r: 0.06, len: 0.10, pivot: [0.31, 0.66, 0.07], drop: 0.08, tiltZ: 0.12 }, // 스윙 팔
      feet:   { r: 0.095, s: [1, 0.55, 1.2], pos: [0.13, 0.05, 0.20] },
      tail:   { r: 0.07, pos: [0, 0.35, -0.32] },
    },
  },

  // ---- 용 (분리형 · 오픈 조끼) — §5.4 --------------------------------------
  dragon: {
    id: 'dragon',
    displayName: '새롬',
    type: 'split',
    garmentDefault: '#D9B35A',
    bodies: {
      default:   { body: '#B6CDB5', belly: '#F2E3C6', horn: '#E9C293', fin: '#8FB9A1', cheek: '#F3CDBE' },
      dustyblue: { body: '#A7BECB', belly: '#EFE7D2', horn: '#E3C08F', fin: '#7E9FAF', cheek: '#F3CDBE' },
      lilac:     { body: '#C4B3CE', belly: '#F3E9DA', horn: '#E9C293', fin: '#9F8FB3', cheek: '#F3CDBE' },
    },
    bodyLabels: { default: '민트', dustyblue: '더스티블루', lilac: '라일락' },
    parts: {
      body:   { r: 0.36, s: [1, 1.22, 0.95], y: 0.47 },
      belly:  { r: 0.26, s: [0.85, 1.05, 0.35], pos: [0, 0.52, 0.26],
                decal: { w: 0.34, h: 0.42, z: 0.36, lineColor: '#E4D3AC', lines: 4 } },
      head:   { r: 0.31, s: [1.08, 0.98, 0.98], y: 1.05 },    // 정수리 ≈1.35
      muzzle: { r: 0.17, s: [1.1, 0.6, 0.7], posLocal: [0, -0.08, 0.26] },
      horns:  { rTop: 0.02, rBot: 0.05, h: 0.16, xLocal: 0.15, yLocal: 0.30, z: 0.02, tilt: 0.436 }, // 바깥 25°
      crest:  { r: 0.045, s: [1, 1.2, 0.8], posLocal: [0, 0.32, -0.02] },
      spikes: { n: 6, rMax: 0.05, rMin: 0.02, yTop: 1.15, yBot: 0.35 },  // 둥근 혹 — 뾰족 금지
      wings:  { lobes: [
                  { r: 0.10, p: [0.05, 0, 0] },
                  { r: 0.075, p: [0.135, 0.05, 0] },
                  { r: 0.055, p: [0.205, 0.10, 0] },
                ], flat: 0.035, pivot: [0.34, 0.80, -0.22], tilt: 0.61 }, // 바깥·위 35°
      tail:   { chain: [
                  { r: 0.13, p: [0, 0.00, -0.02] },
                  { r: 0.10, p: [0, -0.03, -0.15] },
                  { r: 0.07, p: [0, -0.02, -0.27] },
                  { r: 0.045, p: [0, 0.02, -0.36] },   // 끝이 살짝 들림 (시트 커브)
                ], pivot: [0, 0.30, -0.38], spike: { r: 0.02 } },
      vest:   { grow: 1.07, thetaStart: 0.851, thetaLength: 0.956,
                phiStart: 2.5307, phiLength: 4.3633 },        // y≈0.36~0.78, 전면 110° 개방
      eyes:   { r: 0.030, x: 0.13, yLocal: 0.05, z: 0.276 },  // head-local
      muzzleDecal: { w: 0.20, h: 0.12 },
      cheeks: { r: 0.05, x: 0.23, yLocal: -0.05, z: 0.215 },
      arms:   { r: 0.06, len: 0.09, pivot: [0.38, 0.67, 0.09], drop: 0.075 },
      feet:   { r: 0.10, s: [1, 0.55, 1.15], pos: [0.14, 0.05, 0.20] },
    },
  },
};

export const DEFAULT_PRESET = 'capybara';
export const PRESET_KEYS = ['owl', 'capybara', 'rabbit', 'dragon'];

// v1.0 프리셋(a1~a4) 하위호환 매핑 — 구 저장 프로젝트 로드용.
export const LEGACY_PRESET_MAP = { a1: 'owl', a2: 'capybara', a3: 'rabbit', a4: 'dragon' };
