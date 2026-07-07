// interaction.js — 이동, 카메라, 작품 감지, 모달, UI 업데이트
// 의존: museum.js 가 먼저 로드되어 window.player, museumCamera 등 설정됨

/* ============================================================
   카메라 상태
   ============================================================ */
let camH = 0;
let camV = 0.22;
let camDist = 4.5;

/* ============================================================
   키보드 입력
   ============================================================ */
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))
    e.preventDefault();

  // 스페이스: 모달 닫기
  if (e.key === ' ') closeModal();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

/* ============================================================
   마우스 드래그 (카메라)
   ============================================================ */
let drag = false, lmx = 0, lmy = 0;
window.addEventListener('mousedown', e => {
  if (e.target.id === 'c') { drag = true; lmx = e.clientX; lmy = e.clientY; }
});
window.addEventListener('mousemove', e => {
  if (!drag) return;
  camH -= (e.clientX - lmx) * 0.006;
  camV = Math.max(0.05, Math.min(0.78, camV + (e.clientY - lmy) * 0.004));
  lmx = e.clientX; lmy = e.clientY;
});
window.addEventListener('mouseup', () => { drag = false; });

/* 스크롤 줌 */
window.addEventListener('wheel', e => {
  camDist = Math.max(2.0, Math.min(8.0, camDist + e.deltaY * 0.01));
}, { passive: true });

/* ============================================================
   터치 (모바일 카메라 드래그)
   ============================================================ */
let camTouchId = null;
window.addEventListener('touchstart', e => {
  const jRect = document.getElementById('joystick-zone').getBoundingClientRect();
  document.getElementById('joystick-zone').style.display = 'block';
  for (const t of e.touches) {
    const inJoy = t.clientX >= jRect.left && t.clientX <= jRect.right &&
                  t.clientY >= jRect.top  && t.clientY <= jRect.bottom;
    if (!inJoy && camTouchId === null) {
      camTouchId = t.identifier; lmx = t.clientX; lmy = t.clientY; drag = true; break;
    }
  }
}, { passive: true });

window.addEventListener('touchmove', e => {
  if (!drag || camTouchId === null) return;
  for (const t of e.changedTouches) {
    if (t.identifier === camTouchId) {
      camH -= (t.clientX - lmx) * 0.007;
      camV = Math.max(0.05, Math.min(0.78, camV + (t.clientY - lmy) * 0.005));
      lmx = t.clientX; lmy = t.clientY; break;
    }
  }
}, { passive: true });

window.addEventListener('touchend', e => {
  for (const t of e.changedTouches)
    if (t.identifier === camTouchId) { drag = false; camTouchId = null; break; }
});

/* ============================================================
   가상 조이스틱
   ============================================================ */
const joyZone = document.getElementById('joystick-zone');
const joyKnob = document.getElementById('joystick-knob');
let joyActive = false, joyTouchId = null;
const joyVec = { x: 0, y: 0 };
const JOY_R = 39;

joyZone.addEventListener('touchstart', e => {
  e.stopPropagation();
  if (joyTouchId !== null) return;
  const t = e.changedTouches[0];
  joyTouchId = t.identifier;
  joyActive = true;
  updateJoy(t);
}, { passive: true });

joyZone.addEventListener('touchmove', e => {
  e.stopPropagation();
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) { updateJoy(t); break; }
  }
}, { passive: true });

['touchend','touchcancel'].forEach(ev => {
  joyZone.addEventListener(ev, e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyTouchId) {
        joyActive = false; joyTouchId = null;
        joyVec.x = 0; joyVec.y = 0;
        joyKnob.style.transform = 'translate(0,0)';
        break;
      }
    }
  }, { passive: true });
});

function updateJoy(touch) {
  const r = joyZone.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = touch.clientX - cx, dy = touch.clientY - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
  joyVec.x = dx / JOY_R;
  joyVec.y = dy / JOY_R;
  joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
}

/* ============================================================
   현재 섹션 감지 & 배지 업데이트
   ============================================================ */
function getCurrentSection() {
  const pz = window.player.position.z;
  for (let i = 0; i <= SECTIONS_COUNT; i++) {
    const cz = ROOM_Z_FN(i);
    const halfD = ROOM_D_CONST / 2;
    if (pz >= cz - halfD && pz <= cz + halfD) return i;
  }
  return 0;
}

const badge = document.getElementById('section-badge');
const badgeName = document.getElementById('badge-sec-name');
let lastSecIdx = -1;

function updateSectionBadge() {
  const idx = getCurrentSection();
  if (idx === lastSecIdx) return;
  lastSecIdx = idx;
  if (idx === 0) {
    document.getElementById('badge-sec-label').textContent = 'ENTRANCE';
    badgeName.textContent = '사랑을 그리다';
  } else {
    const sec = SECTIONS[idx - 1];
    document.getElementById('badge-sec-label').textContent = sec.title;
    badgeName.textContent = sec.titleKr;
  }
}

/* ============================================================
   모달 (작품 상세)
   ============================================================ */
const modal = document.getElementById('modal');
let modalOpen = false;
let currentArt = null;

function openModal() {
  if (!currentArt || modalOpen) return;
  const art = currentArt.art;
  document.getElementById('modal-img').src = IMGS[art.key] || '';
  document.getElementById('ml-title').textContent  = art.title;
  document.getElementById('ml-meta').textContent   = `${art.artist}  ·  ${art.year}`;
  document.getElementById('ml-desc').textContent   = art.desc;
  document.getElementById('ml-museum').textContent = `📍 ${art.museum}`;
  modal.style.display = 'flex';
  modalOpen = true;
}

function closeModal() {
  if (!modalOpen) return;
  modal.style.display = 'none';
  modalOpen = false;
}

modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});
document.getElementById('modal-close').addEventListener('click', closeModal);

// info-bar "크게 보기" 버튼 (호환성 유지)
const viewBtn = document.getElementById('view-btn');
if (viewBtn) viewBtn.addEventListener('click', openModal);

/* ============================================================
   작품 근접 감지 — 가까이 가면 모달 자동 오픈
   ============================================================ */
const AUTO_MODAL_DIST = 3.8;

function checkNearArtwork() {
  const pp = window.player.position;
  let found = null, best = AUTO_MODAL_DIST;

  for (const am of window.artMeshes) {
    const dx = pp.x - am.worldPos.x;
    const dz = pp.z - am.worldPos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) { best = d; found = am; }
  }

  if (found !== currentArt) {
    currentArt = found;
    // 이전 작품 스케일 복원
    window.artMeshes.forEach(am => { am._targetScale = 1.0; });

    if (found) {
      found._targetScale = 1.08;
      openModal(); // 가까이 가면 자동으로 모달 오픈
    } else {
      closeModal(); // 멀어지면 모달 닫기
    }
  }
}

/* ============================================================
   HUD 자동 숨기기
   ============================================================ */
let hudHidden = false;
function hideHudOnce() {
  if (hudHidden) return;
  hudHidden = true;
  setTimeout(() => {
    document.getElementById('hud').classList.add('hidden');
  }, 4000);
}
window.addEventListener('keydown',  hideHudOnce, { once: true });
window.addEventListener('mousedown', hideHudOnce, { once: true });
window.addEventListener('touchstart', hideHudOnce, { once: true });

/* ============================================================
   문 충돌 처리 — 내부 벽 z 좌표 (문 구멍: |x| < DOOR_W/2)
   ============================================================ */
// 각 섹션 방의 앞쪽 문 벽 z 위치
// 입구홀(cz=0) front wall: z = 0 - ROOM_D/2 = -10
// 섹션i(cz=-20i) front wall: z = -20i + ROOM_D/2 = -20i + 10
// 실제로 buildDoorwayWall 이 호출되는 위치:
//   입구홀: cz - hd = -10  (front door)
//   섹션1 front: -20+10 = -10  (같은 벽, 두 번 생성되지만 동일 위치)
//   섹션1 back: -20-10 = -30
//   섹션2 front: -40+10 = -30 (같은 벽)
//   섹션2 back: -40-10 = -50
//   등...
// 즉 실제 내부 벽 z 위치: -10, -30, -50, -70
const DOOR_WALL_ZS = [];
for (let i = 0; i < SECTIONS.length; i++) {
  DOOR_WALL_ZS.push(-ROOM_D_CONST * (i + 1) + ROOM_D_CONST / 2); // front wall of section i+1
}
// = [-10, -30, -50, -70]

const DOOR_HALF_W = (window.DOOR_W_CONST || 3.2) / 2; // 1.6

/* ============================================================
   메인 애니메이션 루프
   ============================================================ */
let lastT = 0, walkT = 0;

function animate(ts) {
  requestAnimationFrame(animate);
  const dt = Math.min((ts - lastT) / 1000, 0.05);
  lastT = ts;

  const scene    = window.museumScene;
  const camera   = window.museumCamera;
  const renderer = window.museumRenderer;
  const pl       = window.player;
  const parts    = window.playerParts;

  if (!pl) { renderer.render(scene, camera); return; }

  /* ── 이동 벡터 계산 ── */
  const fwd = new THREE.Vector3(Math.sin(camH), 0, Math.cos(camH));
  const rgt = new THREE.Vector3(Math.cos(camH), 0, -Math.sin(camH));
  const mv  = new THREE.Vector3();

  if (keys['w'] || keys['W'] || keys['ArrowUp'])    mv.sub(fwd);
  if (keys['s'] || keys['S'] || keys['ArrowDown'])  mv.add(fwd);
  if (keys['a'] || keys['A'] || keys['ArrowLeft'])  mv.sub(rgt);
  if (keys['d'] || keys['D'] || keys['ArrowRight']) mv.add(rgt);

  if (joyActive && (Math.abs(joyVec.x) > 0.06 || Math.abs(joyVec.y) > 0.06)) {
    mv.sub(fwd.clone().multiplyScalar(-joyVec.y));
    mv.add(rgt.clone().multiplyScalar(joyVec.x));
  }

  /* ── 이동 적용 ── */
  const HW = ROOM_W_CONST / 2 - 0.55;
  const minZ = ROOM_Z_FN(SECTIONS_COUNT) - ROOM_D_CONST / 2 + 0.55;
  const maxZ = ROOM_D_CONST / 2 - 0.55;

  if (mv.lengthSq() > 0) {
    mv.normalize().multiplyScalar(4.8 * dt);

    // X 이동
    pl.position.x = Math.max(-HW, Math.min(HW, pl.position.x + mv.x));

    // Z 이동 — 문 충돌 처리
    let newZ = pl.position.z + mv.z;

    for (const wz of DOOR_WALL_ZS) {
      const crossingWall =
        (pl.position.z > wz && newZ <= wz) ||
        (pl.position.z < wz && newZ >= wz);
      if (crossingWall && Math.abs(pl.position.x) >= DOOR_HALF_W) {
        // 문 구멍 밖이므로 벽에 막힘
        newZ = pl.position.z > wz ? wz + 0.12 : wz - 0.12;
        break;
      }
    }

    pl.position.z = Math.max(minZ, Math.min(maxZ, newZ));
    pl.rotation.y = Math.atan2(mv.x, mv.z);
    walkT += dt;
    parts.legL.rotation.x =  Math.sin(walkT * 11) * 0.40;
    parts.legR.rotation.x = -Math.sin(walkT * 11) * 0.40;
  } else {
    parts.legL.rotation.x *= 0.80;
    parts.legR.rotation.x *= 0.80;
  }

  /* ── 작품 스케일 lerp ── */
  window.artMeshes.forEach(am => {
    if (am._targetScale === undefined) am._targetScale = 1.0;
    const cur = am.grp.scale.x;
    const next = cur + (am._targetScale - cur) * 0.12;
    am.grp.scale.setScalar(next);
  });

  /* ── 근접 감지 & 배지 ── */
  checkNearArtwork();
  updateSectionBadge();

  /* ── 카메라 추적 ── */
  const px = pl.position.x, py = 0.9, pz = pl.position.z;
  camera.position.set(
    px + camDist * Math.sin(camH) * Math.cos(camV),
    py + camDist * Math.sin(camV),
    pz + camDist * Math.cos(camH) * Math.cos(camV)
  );
  camera.lookAt(px, py, pz);

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
