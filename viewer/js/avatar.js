// viewer/js/avatar.js — v1.1 아바타 개편: 시트 기반 동물 캐릭터 절차 생성.
// 정본 디자인: docs/character-sheets/*.png. 외부 3D 모델·텍스처·addons 사용 금지(자기완결).
// 구조:
//   root (controls 가 x/z·yaw 구동)
//    └ rig (걷기 바운스 y · 롤 z · 유휴 둘러보기 yaw)
//       └ 부위 메시들 (avatarPresets.js 의 상수로 조립)
// 좌표: 발바닥 y=0, 정면 +Z, 정수리 기준 1.30m (§3.1).
import * as THREE from '../../vendor/three.module.js';
import {
  AVATAR_PRESETS, DEFAULT_PRESET, LEGACY_PRESET_MAP,
  GARMENT_PALETTE, EYE_COLOR, LINE_COLOR,
} from './avatarPresets.js';

export { GARMENT_PALETTE };

const rad = THREE.MathUtils.degToRad;

// ---- 공통: 3단 toon gradientMap (§3.2) ------------------------------------
let _grad = null;
function toonGradient() {
  if (_grad) return _grad;
  const d = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1); // RGBA
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  _grad = t;
  return t;
}

// ---- 지오메트리 캐시: 단위 프리미티브를 mesh.scale 로 재사용 ----------------
const _geo = new Map();
function unitSphere(hi = true) {
  const k = hi ? 's-hi' : 's-lo';
  if (!_geo.has(k)) _geo.set(k, new THREE.SphereGeometry(1, hi ? 28 : 16, hi ? 20 : 12));
  return _geo.get(k);
}

// ---- 재질 키트: 역할별 1인스턴스 공유 (§3.2) -------------------------------
// 의상 색·몸 변형 변경 시 해당 역할 재질의 color 만 갱신하면 전 부위에 반영된다.
function makeKit(bodySet, garmentHex) {
  const mk = (hex) => new THREE.MeshToonMaterial({ color: new THREE.Color(hex), gradientMap: toonGradient() });
  const mats = { garment: mk(garmentHex), eye: mk(EYE_COLOR) };
  for (const [role, hex] of Object.entries(bodySet)) mats[role] = mk(hex);
  return mats;
}

// ---- 조립 헬퍼 -------------------------------------------------------------
function sph(mat, r, sx, sy, sz, x, y, z, hi = true) {
  const m = new THREE.Mesh(unitSphere(hi), mat);
  m.scale.set(r * sx, r * sy, r * sz);
  m.position.set(x, y, z);
  return m;
}

// 타원체(몸) 표면의 z 좌표: 표면 부착 부위(눈·볼 등) 배치용.
// bd = { y(중심), rx, ry, rz }
function surfZ(bd, x, y) {
  const xn = x / bd.rx, yn = (y - bd.y) / bd.ry;
  const t = 1 - xn * xn - yn * yn;
  return t > 0 ? Math.sqrt(t) * bd.rz : 0;
}

// ---- 얼굴·라인 데칼 유틸 (§3.4) --------------------------------------------
// 512px 투명 canvas 에 drawFn(ctx, size) 으로 그려 소형 Plane 에 입힌다.
// 표면에서 0.005m 띄우고 polygonOffset + renderOrder 로 z-fight 방지.
export function makeFaceDecal(drawFn, w, h) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = LINE_COLOR;
  g.fillStyle = LINE_COLOR;
  drawFn(g, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = 2;
  return mesh;
}

// ---- 캐릭터 빌더: 카피바라 (§5.2 · 일체형 · 목도리) -------------------------
function buildCapybara(rig, mats, P) {
  const parts = { appendages: [] };
  const B = P.body;
  const bd = { y: B.y, rx: B.r * B.s[0], ry: B.r * B.s[1], rz: B.r * B.s[2] };

  // 몸통(머리 겸) — 숨쉬기 스케일 대상
  const body = sph(mats.body, B.r, ...B.s, 0, B.y, 0);
  rig.add(body);
  parts.breath = body;

  // 주둥이 + 코·입 데칼 (세로선 + 양갈래 입)
  const M = P.muzzle;
  const muzzle = sph(mats.muzzle, M.r, ...M.s, ...M.pos);
  rig.add(muzzle);
  const face = makeFaceDecal((g, S) => {
    g.lineWidth = S * 0.035;
    // 코: 둥근 역삼각 채움
    const cx = S / 2, ny = S * 0.30, nw = S * 0.20, nh = S * 0.15;
    g.beginPath();
    g.moveTo(cx - nw / 2, ny);
    g.quadraticCurveTo(cx, ny - nh * 0.35, cx + nw / 2, ny);
    g.quadraticCurveTo(cx + nw * 0.30, ny + nh, cx, ny + nh);
    g.quadraticCurveTo(cx - nw * 0.30, ny + nh, cx - nw / 2, ny);
    g.fill();
    // 세로선(인중)
    g.beginPath();
    g.moveTo(cx, ny + nh * 0.9);
    g.lineTo(cx, S * 0.58);
    g.stroke();
    // 양갈래 입
    g.beginPath();
    g.moveTo(cx, S * 0.58);
    g.quadraticCurveTo(cx - S * 0.055, S * 0.67, cx - S * 0.115, S * 0.665);
    g.moveTo(cx, S * 0.58);
    g.quadraticCurveTo(cx + S * 0.055, S * 0.67, cx + S * 0.115, S * 0.665);
    g.stroke();
  }, 0.20, 0.18);
  face.position.set(0, M.pos[1] + 0.015, M.pos[2] + M.r * M.s[2] + 0.005);
  rig.add(face);

  // 귀 ×2 (몸 색)
  for (const sx of [-1, 1]) rig.add(sph(mats.body, P.ears.r, 1, 1, 1, sx * P.ears.x, P.ears.y, P.ears.z, false));

  // 눈 ×2 — 주둥이보다 위, 몸 표면
  for (const sx of [-1, 1]) {
    const z = surfZ(bd, P.eyes.x, P.eyes.y) + 0.005;
    rig.add(sph(mats.eye, P.eyes.r, 1, 1, 1, sx * P.eyes.x, P.eyes.y, z, false));
  }

  // 볼 ×2 — 납작 구를 표면 법선 방향으로 향하게
  for (const sx of [-1, 1]) {
    const x = sx * P.cheeks.x, y = P.cheeks.y;
    const z = surfZ(bd, x, y) + 0.004;
    const ch = sph(mats.cheek, P.cheeks.r, 1, 1, 0.35, x, y, z, false);
    ch.lookAt(x * 3, y, z * 3);
    rig.add(ch);
  }

  // 목도리: 토러스 밴드 + 앞자락(박스+술) — 앞자락은 관성 애니메이션 피벗
  const SC = P.scarf;
  const band = new THREE.Mesh(new THREE.TorusGeometry(SC.torus.R, SC.torus.t, 14, 28), mats.garment);
  band.rotation.x = Math.PI / 2 + SC.torus.tiltX;
  band.position.set(0, SC.torus.y, 0);
  rig.add(band);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(...SC.tail.pivot);
  const [tw, th, td] = SC.tail.box;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), mats.garment);
  tail.position.set(0, -th / 2, 0);
  tailPivot.add(tail);
  const fr = SC.fringe;
  const frGeo = new THREE.CapsuleGeometry(fr.r, fr.len, 3, 6);
  for (let i = 0; i < fr.n; i++) {
    const f = new THREE.Mesh(frGeo, mats.garment);
    f.position.set((i - (fr.n - 1) / 2) * (tw / fr.n), -th - fr.len / 2 + 0.01, 0);
    tailPivot.add(f);
  }
  rig.add(tailPivot);
  parts.appendages.push({ node: tailPivot, gain: 1, base: 0 });

  // 팔 ×2 (몸에 반쯤 묻힌 스텁 — 일체형은 팔 스윙 없음 §7)
  const A = P.arms;
  for (const sx of [-1, 1]) rig.add(sph(mats.body, A.r, ...A.s, sx * A.pos[0], A.pos[1], A.pos[2]));

  // 발 ×2 (주둥이 색)
  const F = P.feet;
  for (const sx of [-1, 1]) rig.add(sph(mats.muzzle, F.r, ...F.s, sx * F.pos[0], F.pos[1], F.pos[2], false));

  // 꼬리
  rig.add(sph(mats.body, P.tail.r, 1, 1, 1, ...P.tail.pos, false));

  return parts;
}

// ---- 캐릭터 빌더: 부엉이 (§5.1 · 일체형 · 조끼) -----------------------------
function buildOwl(rig, mats, P) {
  const parts = { appendages: [] };
  const B = P.body;
  const bd = { y: B.y, rx: B.r * B.s[0], ry: B.r * B.s[1], rz: B.r * B.s[2] };

  const body = sph(mats.body, B.r, ...B.s, 0, B.y, 0);
  rig.add(body);
  parts.breath = body;

  // 얼굴 디스크 ×2 — 좌우 겹침 → 하트형 마스크, 상단 중앙 V자에 몸색이 보임
  const FD = P.faceDisc;
  for (const sx of [-1, 1]) {
    const d = sph(mats.face, FD.r, 1, 1, FD.sz, sx * FD.x, FD.y, FD.z, true);
    d.lookAt(sx * FD.x * 1.6, FD.y + 0.06, FD.z * 3);
    rig.add(d);
  }
  // 눈 ×2 (디스크 중앙)
  for (const sx of [-1, 1]) rig.add(sph(mats.eye, P.eyes.r, 1, 1, 1, sx * P.eyes.x, P.eyes.y, P.eyes.z, false));
  // 볼 ×2
  for (const sx of [-1, 1]) {
    const x = sx * P.cheeks.x, y = P.cheeks.y, z = surfZ(bd, x, y) + 0.06; // 디스크 위
    const ch = sph(mats.cheek, P.cheeks.r, 1, 1, 0.3, x, y, z, false);
    ch.lookAt(x * 3, y, z * 3);
    rig.add(ch);
  }
  // 부리 — 아래로 숙인 콘
  const beak = new THREE.Mesh(new THREE.ConeGeometry(P.beak.r, P.beak.h, 12), mats.accent);
  beak.position.set(0, P.beak.y, P.beak.z);
  beak.rotation.x = Math.PI * 0.62; // 앞·아래를 향함
  rig.add(beak);
  // 귀깃 ×2 — 바깥 기울임
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(P.tufts.r, P.tufts.h, 10), mats.body);
    t.position.set(sx * P.tufts.x, P.tufts.y, 0);
    t.rotation.z = -sx * P.tufts.tilt;
    rig.add(t);
  }
  // 조끼 — 몸 클론 ×grow 세로 밴드 + 단추 ×2 (조끼 정체성의 핵심)
  const V = P.vest;
  const vest = new THREE.Mesh(
    new THREE.SphereGeometry(B.r * V.grow, 28, 20, 0, Math.PI * 2, V.thetaStart, V.thetaLength),
    mats.garment);
  vest.scale.set(B.s[0], B.s[1], B.s[2]);
  vest.position.set(0, B.y, 0);
  rig.add(vest);
  const BT = P.buttons;
  BT.ys.forEach((y, i) => {
    rig.add(sph(mats.accent, BT.r, 1, 1, 1, BT.x, y, BT.zs[i] + 0.012, false));
  });
  // 날개팔 ×2 — 어깨 피벗 스윙 (§7)
  const W = P.wings;
  const mkWing = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * W.pivot[0], W.pivot[1], W.pivot[2]);
    const m = sph(mats.body, W.r, ...W.s, 0, -W.drop, 0);
    g.add(m);
    g.rotation.z = -sx * W.tiltZ;
    g.rotation.y = -sx * W.tiltY; // 끝이 살짝 앞으로
    rig.add(g);
    return g;
  };
  parts.swingL = mkWing(-1);
  parts.swingR = mkWing(1);
  // 발 ×2 + 발가락 ×3
  const F = P.feet;
  for (const sx of [-1, 1]) {
    rig.add(sph(mats.accent, F.r, ...F.s, sx * F.pos[0], F.pos[1], F.pos[2], false));
    for (const k of [-1, 0, 1]) {
      rig.add(sph(mats.accent, F.toes.r, 1, 0.8, 1.2, sx * F.pos[0] + k * F.toes.dx, F.pos[1] - 0.01, F.pos[2] + F.toes.dz, false));
    }
  }
  // 꼬리
  rig.add(sph(mats.body, P.tail.r, 1, 1, P.tail.sz, ...P.tail.pos, false));
  return parts;
}

// ---- 캐릭터 빌더: 토끼 (§5.3 · 분리형 · 네커치프) ---------------------------
function buildRabbit(rig, mats, P) {
  const parts = { appendages: [] };
  const B = P.body, H = P.head;

  const body = sph(mats.body, B.r, ...B.s, 0, B.y, 0);
  rig.add(body);
  parts.breath = body;

  // 머리 그룹 (둘러보기 회전 노드) — 귀·이목구비 포함
  const headG = new THREE.Group();
  headG.position.set(0, H.y, 0);
  rig.add(headG);
  parts.look = headG;
  const head = sph(mats.body, H.r, ...H.s, 0, 0, 0);
  headG.add(head);

  // 귀 ×2 — 기부 피벗(관성 애니메이션), 내이 인셋
  const E = P.ears;
  const earGeo = new THREE.CapsuleGeometry(E.r, E.len, 6, 12);
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * E.base[0], E.base[1] - H.y, E.base[2]); // head-local
    const ear = new THREE.Mesh(earGeo, mats.body);
    ear.position.y = E.len / 2 + E.r * 0.6;
    ear.scale.z = E.flat || 1;
    pivot.add(ear);
    const inner = new THREE.Mesh(earGeo, mats.inner);
    inner.scale.set(E.inner.s[0], E.inner.s[1], E.inner.s[2]);
    inner.position.set(0, ear.position.y - 0.01, E.inner.dz);
    pivot.add(inner);
    pivot.rotation.z = -sx * E.tiltZ; // 바깥 10°
    pivot.rotation.x = E.tiltX;       // 뒤 5°
    headG.add(pivot);
    parts.appendages.push({ node: pivot, gain: 0.9, base: E.tiltX });
  }

  // 눈·볼·코입 데칼 (head-local)
  for (const sx of [-1, 1]) headG.add(sph(mats.eye, P.eyes.r, 1, 1, 1, sx * P.eyes.x, P.eyes.yLocal, P.eyes.z + 0.005, false));
  for (const sx of [-1, 1]) {
    const ch = sph(mats.cheek, P.cheeks.r, 1, 1, 0.35, sx * P.cheeks.x, P.cheeks.yLocal, P.cheeks.z + 0.004, false);
    ch.lookAt(sx * P.cheeks.x * 3, P.cheeks.yLocal, P.cheeks.z * 3);
    headG.add(ch);
  }
  const ND = P.noseDecal;
  const inner = mats.inner.color.getStyle();
  const nose = makeFaceDecal((g, S) => {
    // 코 채움(#F1C9B6) + w자 입
    const cx = S / 2;
    g.fillStyle = inner;
    g.beginPath();
    g.moveTo(cx - S * 0.085, S * 0.22);
    g.quadraticCurveTo(cx, S * 0.16, cx + S * 0.085, S * 0.22);
    g.quadraticCurveTo(cx + S * 0.05, S * 0.34, cx, S * 0.36);
    g.quadraticCurveTo(cx - S * 0.05, S * 0.34, cx - S * 0.085, S * 0.22);
    g.fill();
    g.lineWidth = S * 0.030;
    g.beginPath();
    g.moveTo(cx, S * 0.36);
    g.lineTo(cx, S * 0.46);
    g.moveTo(cx, S * 0.46);
    g.quadraticCurveTo(cx - S * 0.06, S * 0.56, cx - S * 0.12, S * 0.50);
    g.moveTo(cx, S * 0.46);
    g.quadraticCurveTo(cx + S * 0.06, S * 0.56, cx + S * 0.12, S * 0.50);
    g.stroke();
  }, ND.w, ND.h);
  nose.position.set(0, ND.yLocal, ND.z);
  headG.add(nose);

  // 네커치프: 목 밴드 토러스 + 앞 삼각 + 뒤 매듭
  const K = P.kerchief;
  const band = new THREE.Mesh(new THREE.TorusGeometry(K.torus.R, K.torus.t, 12, 24), mats.garment);
  band.rotation.x = Math.PI / 2 + K.torus.tiltX;
  band.position.set(0, K.torus.y, 0);
  rig.add(band);
  const tri = new THREE.Mesh(new THREE.ConeGeometry(K.tri.r, K.tri.h, 4, 1), mats.garment);
  tri.rotation.z = Math.PI;          // 꼭짓점 아래
  tri.rotation.y = Math.PI / 4;      // 사각뿔 → 다이아 정면
  tri.scale.z = K.tri.sz;
  tri.position.set(...K.tri.pos);
  rig.add(tri);
  rig.add(sph(mats.garment, K.knot.r, 1, 1, 1, ...K.knot.pos, false));

  // 팔 ×2 — 스윙 피벗, 안쪽 기울임
  const A = P.arms;
  const armGeo = new THREE.CapsuleGeometry(A.r, A.len, 4, 8);
  const mkArm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * A.pivot[0], A.pivot[1], A.pivot[2]);
    const m = new THREE.Mesh(armGeo, mats.body);
    m.position.y = -A.drop;
    g.add(m);
    g.rotation.z = sx * A.tiltZ;
    rig.add(g);
    return g;
  };
  parts.swingL = mkArm(-1);
  parts.swingR = mkArm(1);

  // 발·꼬리
  const F = P.feet;
  for (const sx of [-1, 1]) rig.add(sph(mats.body, F.r, ...F.s, sx * F.pos[0], F.pos[1], F.pos[2], false));
  rig.add(sph(mats.body, P.tail.r, 1, 1, 1, ...P.tail.pos, false));
  return parts;
}

// ---- 캐릭터 빌더: 용 (§5.4 · 분리형 · 오픈 조끼) ----------------------------
function buildDragon(rig, mats, P) {
  const parts = { appendages: [] };
  const B = P.body, H = P.head;
  const bodyBd = { y: B.y, rx: B.r * B.s[0], ry: B.r * B.s[1], rz: B.r * B.s[2] };
  const headBd = { y: H.y, rx: H.r * H.s[0], ry: H.r * H.s[1], rz: H.r * H.s[2] };

  const body = sph(mats.body, B.r, ...B.s, 0, B.y, 0);
  rig.add(body);
  parts.breath = body;

  // 배 패치 + 가로 라인 데칼
  const BL = P.belly;
  rig.add(sph(mats.belly, BL.r, ...BL.s, ...BL.pos));
  const bellyLines = makeFaceDecal((g, S) => {
    g.strokeStyle = BL.decal.lineColor;
    g.lineWidth = S * 0.028;
    for (let i = 1; i <= BL.decal.lines; i++) {
      const y = S * (0.22 + 0.16 * i);
      const wHalf = S * (0.30 - 0.028 * Math.abs(i - 2.2));
      g.beginPath();
      g.moveTo(S / 2 - wHalf, y);
      g.quadraticCurveTo(S / 2, y + S * 0.035, S / 2 + wHalf, y);
      g.stroke();
    }
  }, BL.decal.w, BL.decal.h);
  bellyLines.position.set(0, BL.pos[1], BL.decal.z);
  rig.add(bellyLines);

  // 머리 그룹 (둘러보기 노드)
  const headG = new THREE.Group();
  headG.position.set(0, H.y, 0);
  rig.add(headG);
  parts.look = headG;
  headG.add(sph(mats.body, H.r, ...H.s, 0, 0, 0));

  // 주둥이 + 스마일·콧구멍 데칼
  const M = P.muzzle;
  headG.add(sph(mats.body, M.r, ...M.s, ...M.posLocal));
  const MD = P.muzzleDecal;
  const smile = makeFaceDecal((g, S) => {
    g.lineWidth = S * 0.032;
    // 콧구멍 2점
    g.beginPath(); g.arc(S * 0.40, S * 0.30, S * 0.022, 0, 7); g.fill();
    g.beginPath(); g.arc(S * 0.60, S * 0.30, S * 0.022, 0, 7); g.fill();
    // 스마일
    g.beginPath();
    g.moveTo(S * 0.28, S * 0.52);
    g.quadraticCurveTo(S / 2, S * 0.70, S * 0.72, S * 0.52);
    g.stroke();
  }, MD.w, MD.h);
  smile.position.set(0, M.posLocal[1] + 0.005, M.posLocal[2] + M.r * M.s[2] + 0.006);
  headG.add(smile);

  // 뿔 ×2 (테이퍼 실린더 + 구 캡) + 중앙 돌기
  const HN = P.horns;
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * HN.xLocal, HN.yLocal, HN.z);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(HN.rTop, HN.rBot, HN.h, 10), mats.horn);
    cyl.position.y = HN.h / 2;
    g.add(cyl);
    const cap = sph(mats.horn, HN.rTop * 1.15, 1, 1, 1, 0, HN.h, 0, false);
    g.add(cap);
    g.rotation.z = -sx * HN.tilt; // 바깥 25°
    headG.add(g);
  }
  const C = P.crest;
  headG.add(sph(mats.fin, C.r, ...C.s, ...C.posLocal));

  // 등 돌기 ×6 — 척추선, 둥근 혹 (머리 뒤→몸 뒤 표면)
  const SP = P.spikes;
  const backZ = (y) => {
    let z = 0;
    const hy = (y - headBd.y) / headBd.ry;
    if (Math.abs(hy) < 1) z = Math.min(z, -Math.sqrt(1 - hy * hy) * headBd.rz);
    const by = (y - bodyBd.y) / bodyBd.ry;
    if (Math.abs(by) < 1) z = Math.min(z, -Math.sqrt(1 - by * by) * bodyBd.rz);
    return z;
  };
  for (let i = 0; i < SP.n; i++) {
    const t = i / (SP.n - 1);
    const y = SP.yTop + (SP.yBot - SP.yTop) * t;
    const r = SP.rMax + (SP.rMin - SP.rMax) * t;
    const z = backZ(y) - r * 0.25;
    const s = sph(mats.fin, r, 1, 1.15, 0.85, 0, y, z, false);
    if (y > 0.95) { s.position.y -= H.y; headG.add(s); } // 머리 쪽 돌기는 머리와 함께 회전
    else rig.add(s);
  }

  // 날개 ×2 — 납작 구 3개 부채꼴, 바깥·위 35°
  const W = P.wings;
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * W.pivot[0], W.pivot[1], W.pivot[2]);
    for (const lobe of W.lobes) {
      const m = sph(mats.fin, lobe.r, 1, 1.2, 1, sx * lobe.p[0], lobe.p[1], lobe.p[2], false);
      m.scale.z = W.flat; // 균일 납작 (부채꼴 실루엣)
      g.add(m);
    }
    g.rotation.z = -sx * W.tilt;
    rig.add(g);
  }

  // 꼬리 — 구 체인 + 미니 돌기, 피벗(관성 애니메이션)
  const T = P.tail;
  const tailG = new THREE.Group();
  tailG.position.set(...T.pivot);
  for (const seg of T.chain) tailG.add(sph(mats.body, seg.r, 1, 1, 1, ...seg.p, false));
  const s1 = T.chain[1], s2 = T.chain[2];
  tailG.add(sph(mats.fin, T.spike.r, 1, 1.2, 0.85, s1.p[0], s1.p[1] + s1.r * 0.9, s1.p[2], false));
  tailG.add(sph(mats.fin, T.spike.r * 0.8, 1, 1.2, 0.85, s2.p[0], s2.p[1] + s2.r * 0.9, s2.p[2], false));
  rig.add(tailG);
  parts.appendages.push({ node: tailG, gain: 1, base: 0 });

  // 오픈 조끼 — phi 로 전면 개방(배가 보임)
  const V = P.vest;
  const vest = new THREE.Mesh(
    new THREE.SphereGeometry(B.r * V.grow, 28, 20, V.phiStart, V.phiLength, V.thetaStart, V.thetaLength),
    mats.garment);
  vest.scale.set(B.s[0], B.s[1], B.s[2]);
  vest.position.set(0, B.y, 0);
  rig.add(vest);

  // 눈·볼 (head-local)
  for (const sx of [-1, 1]) headG.add(sph(mats.eye, P.eyes.r, 1, 1, 1, sx * P.eyes.x, P.eyes.yLocal, P.eyes.z + 0.005, false));
  for (const sx of [-1, 1]) {
    const ch = sph(mats.cheek, P.cheeks.r, 1, 1, 0.35, sx * P.cheeks.x, P.cheeks.yLocal, P.cheeks.z + 0.004, false);
    ch.lookAt(sx * P.cheeks.x * 3, P.cheeks.yLocal, P.cheeks.z * 3);
    headG.add(ch);
  }

  // 팔 ×2 — 스윙 피벗
  const A = P.arms;
  const armGeo = new THREE.CapsuleGeometry(A.r, A.len, 4, 8);
  const mkArm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * A.pivot[0], A.pivot[1], A.pivot[2]);
    const m = new THREE.Mesh(armGeo, mats.body);
    m.position.y = -A.drop;
    g.add(m);
    rig.add(g);
    return g;
  };
  parts.swingL = mkArm(-1);
  parts.swingR = mkArm(1);

  // 발 ×2
  const F = P.feet;
  for (const sx of [-1, 1]) rig.add(sph(mats.body, F.r, ...F.s, sx * F.pos[0], F.pos[1], F.pos[2], false));
  return parts;
}

const BUILDERS = { owl: buildOwl, capybara: buildCapybara, rabbit: buildRabbit, dragon: buildDragon };

// ---- 공통 애니메이션 (§7) ---------------------------------------------------
// 걷기: 바운스 ±0.03m + 롤 ±3.5° (+분리형·부엉이 팔 스윙 ±15°)
// 부속물 관성: 보행 위상 지연 + 가감속 스프링 (±5° 스케일)
// 유휴: 숨쉬기 ±1% (2.5s) + 8초 주기 미세 둘러보기
function makeUpdater(rig, parts) {
  let phase = 0, t = 0, amp = 0, prevSpeed = 0;
  let apVel = 0, apRot = 0;
  const breathBaseY = parts.breath ? parts.breath.scale.y : 1;
  return function update(dt, moving, speed01) {
    t += dt;
    const speed = moving ? (speed01 ?? 1) : 0;
    amp += ((moving ? 1 : 0) - amp) * Math.min(1, dt * 8);
    if (moving) phase += dt * (7 + 4 * speed);

    // 걷기 바운스 + 좌우 롤(일체형의 뒤뚱거림)
    rig.position.y = Math.abs(Math.sin(phase)) * 0.03 * amp;
    rig.rotation.z = Math.sin(phase) * rad(3.5) * amp;

    // 팔 스윙 (등록된 캐릭터만)
    if (parts.swingL) {
      parts.swingL.rotation.x = Math.sin(phase) * rad(15) * amp;
      parts.swingR.rotation.x = -Math.sin(phase) * rad(15) * amp;
    }

    // 부속물 관성: 위상 지연 스윙 + 가감속 킥 스프링 (합산 목표 ±5° 내외 §7)
    const dv = speed - prevSpeed; prevSpeed = speed;
    apVel += (-apRot * 40 - apVel * 7) * dt - dv * 1.8;
    apRot = THREE.MathUtils.clamp(apRot + apVel * dt, -0.09, 0.09);
    const lag = Math.sin(phase - 0.7) * rad(5) * amp;
    for (const ap of parts.appendages) {
      ap.node.rotation.x = (ap.base || 0) + (lag + apRot) * (ap.gain ?? 1);
    }

    // 유휴 숨쉬기 (이동 중엔 감쇠)
    if (parts.breath) {
      parts.breath.scale.y = breathBaseY * (1 + Math.sin(t * Math.PI * 2 / 2.5) * 0.01 * (1 - amp * 0.7));
    }

    // 8초마다 미세 좌우 둘러보기 (정지 중에만)
    let yaw = 0;
    const lk = t % 8;
    if (lk > 6.6) { const u = (lk - 6.6) / 1.4; yaw = Math.sin(u * Math.PI * 2) * rad(7); }
    const lookNode = parts.look || rig;
    lookNode.rotation.y += (yaw * (1 - amp) - lookNode.rotation.y) * Math.min(1, dt * 5);
  };
}

// ---- 진입점 ----------------------------------------------------------------
// opts: { preset: 'owl'|'capybara'|'rabbit'|'dragon', body: 변형 키, garment: HEX }
// (v1.0 호환: preset a1~a4 / topColor 는 임시 매핑 — 스키마 교체 시 제거)
export function makeAvatar(opts = {}) {
  const key = AVATAR_PRESETS[opts.preset] ? opts.preset
    : (LEGACY_PRESET_MAP[opts.preset] && AVATAR_PRESETS[LEGACY_PRESET_MAP[opts.preset]] ? LEGACY_PRESET_MAP[opts.preset] : DEFAULT_PRESET);
  const preset = AVATAR_PRESETS[key];
  const bodyKey = preset.bodies[opts.body] ? opts.body : 'default';
  const garment = (typeof opts.garment === 'string' && opts.garment.startsWith('#')) ? opts.garment
    : (typeof opts.topColor === 'string' && opts.topColor.startsWith('#')) ? opts.topColor
    : preset.garmentDefault;

  const mats = makeKit(preset.bodies[bodyKey], garment);
  const root = new THREE.Group();
  root.name = 'avatar';
  const rig = new THREE.Group();
  root.add(rig);

  const builder = BUILDERS[key] || BUILDERS[DEFAULT_PRESET];
  const parts = builder(rig, mats, preset.parts);

  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  root.userData.update = makeUpdater(rig, parts);
  root.userData.preset = key;
  root.userData.parts = parts;
  root.userData.setGarment = (hex) => { mats.garment.color.set(hex); };
  root.userData.setBody = (k) => {
    const set = preset.bodies[k];
    if (!set) return;
    for (const [role, hex] of Object.entries(set)) if (mats[role]) mats[role].color.set(hex);
  };
  // §3.1 충돌 캡슐·카메라 타깃 (controls.js 가 참조 가능)
  root.userData.collision = { radius: 0.40, height: 1.30, camTargetY: 1.0 };
  return root;
}
