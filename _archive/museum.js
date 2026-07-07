// museum.js — Three.js 씬, 방(섹션) 구성, 캐릭터 빌드
// 의존: THREE (CDN), data.js, data_imgs.js

/* ============================================================
   상수
   ============================================================ */
const ROOM_W  = 24;   // 방 너비 (x)
const ROOM_D  = 20;   // 방 깊이 (z)
const WALL_H  = 5.5;  // 벽 높이
const WALL_T  = 0.28; // 벽 두께
const FLOOR_H = 0.12; // 바닥 두께
const ARTWORK_Y = 2.3; // 작품 중심 높이

const ROOM_Z_OFFSET = -ROOM_D;

// 문 크기 (buildDoorwayWall 과 동기화)
const DOOR_W = 3.2;
const DOOR_H = 4.0;

/* ============================================================
   씬 / 렌더러 초기화
   ============================================================ */
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('c'),
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0e4d0); // 따뜻한 베이지
// fog 제거 — 파스텔 밝은 전시 공간

const camera = new THREE.PerspectiveCamera(
  58, window.innerWidth / window.innerHeight, 0.1, 120
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ============================================================
   재료 팩토리
   ============================================================ */
const MAT = {
  wall:   (color) => new THREE.MeshBasicMaterial({ color }),   // 조명 영향 없음 — 색 그대로
  floor:  (color) => new THREE.MeshBasicMaterial({ color }),
  gold:   ()      => new THREE.MeshLambertMaterial({ color: 0xb8880a }),
  goldL:  ()      => new THREE.MeshLambertMaterial({ color: 0xd4a820 }),
  frame:  ()      => new THREE.MeshLambertMaterial({ color: 0x8a5c10 }),
  frameL: ()      => new THREE.MeshLambertMaterial({ color: 0xc89028 }),
  basic:  (color) => new THREE.MeshBasicMaterial({ color }),
};

/* ============================================================
   조명 헬퍼
   ============================================================ */
function addRoomLights(cx, cz) {
  const offsets = [[-5,-4],[0,-4],[5,-4],[-5,4],[0,4],[5,4]];
  offsets.forEach(([ox, oz]) => {
    const pl = new THREE.PointLight(0xfff8f0, 0.35, 18);
    pl.position.set(cx + ox, WALL_H - 0.5, cz + oz);
    scene.add(pl);

    const fix = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.06, 0.5),
      MAT.basic(0xffffff)
    );
    fix.position.set(cx + ox, WALL_H - 0.04, cz + oz);
    scene.add(fix);
  });
}

function addSpotOnArtwork(artWorldX, artWorldZ, wallNX, wallNZ) {
  const spot = new THREE.SpotLight(0xfff5e8, 3.0, 7.0, Math.PI / 7, 0.35);
  spot.position.set(
    artWorldX - wallNX * 1.4,
    WALL_H - 0.5,
    artWorldZ - wallNZ * 1.4
  );
  spot.target.position.set(artWorldX, ARTWORK_Y, artWorldZ);
  scene.add(spot);
  scene.add(spot.target);
}

/* ============================================================
   방 건설 헬퍼
   ============================================================ */
function buildRoom(cx, cz, wallColor, floorColor, ceilColor) {
  const geo = {
    wallLR: new THREE.BoxGeometry(WALL_T, WALL_H, ROOM_D),
    wallFB: new THREE.BoxGeometry(ROOM_W, WALL_H, WALL_T),
    floor:  new THREE.BoxGeometry(ROOM_W, FLOOR_H, ROOM_D),
    ceil:   new THREE.BoxGeometry(ROOM_W, FLOOR_H, ROOM_D),
  };

  const hw = ROOM_W / 2, hd = ROOM_D / 2, hh = WALL_H / 2;

  const placements = [
    { g: geo.wallLR, x: cx - hw, y: hh, z: cz },
    { g: geo.wallLR, x: cx + hw, y: hh, z: cz },
    { g: geo.wallFB, x: cx,      y: hh, z: cz - hd },
    { g: geo.wallFB, x: cx,      y: hh, z: cz + hd },
  ];
  const wMat = MAT.wall(wallColor);
  placements.forEach(p => {
    const m = new THREE.Mesh(p.g, wMat);
    m.position.set(p.x, p.y, p.z);
    scene.add(m);
  });

  const fl = new THREE.Mesh(geo.floor, MAT.floor(floorColor));
  fl.position.set(cx, -FLOOR_H / 2, cz);
  scene.add(fl);

  const cl = new THREE.Mesh(geo.ceil, MAT.floor(ceilColor));
  cl.position.set(cx, WALL_H + FLOOR_H / 2, cz);
  scene.add(cl);

  addMolding(cx, cz);
  addRoomLights(cx, cz);
}

function addMolding(cx, cz) {
  const hw = ROOM_W / 2, hd = ROOM_D / 2;
  const gM = (w, d) => new THREE.BoxGeometry(w, 0.06, d);
  const mat = MAT.goldL();

  const strips = [
    { g: gM(ROOM_W, 0.06), x: cx, y: 0.03, z: cz - hd + 0.03 },
    { g: gM(ROOM_W, 0.06), x: cx, y: 0.03, z: cz + hd - 0.03 },
    { g: gM(0.06, ROOM_D), x: cx - hw + 0.03, y: 0.03, z: cz },
    { g: gM(0.06, ROOM_D), x: cx + hw - 0.03, y: 0.03, z: cz },
    { g: gM(ROOM_W, 0.06), x: cx, y: WALL_H - 0.03, z: cz - hd + 0.03 },
    { g: gM(ROOM_W, 0.06), x: cx, y: WALL_H - 0.03, z: cz + hd - 0.03 },
    { g: gM(0.06, ROOM_D), x: cx - hw + 0.03, y: WALL_H - 0.03, z: cz },
    { g: gM(0.06, ROOM_D), x: cx + hw - 0.03, y: WALL_H - 0.03, z: cz },
  ];
  strips.forEach(s => {
    const m = new THREE.Mesh(s.g, mat);
    m.position.set(s.x, s.y, s.z);
    scene.add(m);
  });
}

/* 문틀 장식 */
function buildDoorway(cx, cz) {
  const DW = DOOR_W, DH = DOOR_H;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(DW + 0.4, 0.25, WALL_T + 0.1),
    MAT.goldL()
  );
  top.position.set(cx, DH + 0.12, cz);
  scene.add(top);

  [-1, 1].forEach(s => {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, DH, WALL_T + 0.1),
      MAT.goldL()
    );
    pillar.position.set(cx + s * (DW / 2 + 0.09), DH / 2, cz);
    scene.add(pillar);
  });
}

/* 뒤쪽 벽에 통로용 개구부
   wallCz + 0.01 오프셋: 현재 방(+z 방향)에서 항상 앞에 렌더링되어
   buildRoom 의 솔리드 벽을 가리고 현재 방 색이 보이게 함 */
function buildDoorwayWall(wallCx, wallCz, side, wallColor) {
  const DW = DOOR_W, DH = DOOR_H;
  const HW = ROOM_W / 2;
  const mat = MAT.wall(wallColor || 0xf0dfc8);
  const wz = wallCz + 0.01; // 현재 방 쪽으로 살짝 밀어 z-fighting 방지

  const lw = HW - DW / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(lw, WALL_H, WALL_T), mat);
  left.position.set(wallCx - DW / 2 - lw / 2, WALL_H / 2, wz);
  scene.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(lw, WALL_H, WALL_T), mat);
  right.position.set(wallCx + DW / 2 + lw / 2, WALL_H / 2, wz);
  scene.add(right);

  const topH = WALL_H - DH;
  const top = new THREE.Mesh(new THREE.BoxGeometry(DW, topH, WALL_T), mat);
  top.position.set(wallCx, DH + topH / 2, wz);
  scene.add(top);

  buildDoorway(wallCx, wz);
}

/* ============================================================
   작품 크기 정규화 헬퍼 — maxW × maxH 박스 안에 맞춤
   ============================================================ */
function normArtSize(art, maxW, maxH) {
  const scale = Math.min(maxW / art.w, maxH / art.h);
  return { w: art.w * scale, h: art.h * scale };
}

/* ============================================================
   액자 + 캔버스 빌드
   ============================================================ */
const texLoader = new THREE.TextureLoader();
window.artMeshes = [];

function buildArtwork(art, worldX, worldZ, rotY, displayW, displayH) {
  // displayW/H 미지정 시 data.js 값 그대로
  const dw = displayW || art.w;
  const dh = displayH || art.h;

  const nx = Math.sin(rotY);
  const nz = Math.cos(rotY);
  const offset = 0.15;

  const FW = dw + 0.28, FH = dh + 0.28;

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(FW, FH, 0.14),
    MAT.frame()
  );
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(FW - 0.05, FH - 0.05, 0.145),
    MAT.frameL()
  );

  const tex = texLoader.load(IMGS[art.key] || '');
  tex.encoding = THREE.sRGBEncoding;
  const painting = new THREE.Mesh(
    new THREE.PlaneGeometry(dw, dh),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  painting.position.z = 0.075;

  const lc = document.createElement('canvas');
  lc.width = 512; lc.height = 80;
  const ctx = lc.getContext('2d');
  ctx.fillStyle = 'rgba(5,2,0,0.88)';
  ctx.fillRect(0, 0, 512, 80);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0e070';
  ctx.font = 'bold 19px sans-serif';
  ctx.fillText(art.title, 256, 26);
  ctx.fillStyle = '#c8a050';
  ctx.font = '13px sans-serif';
  ctx.fillText(`${art.artist}  ·  ${art.year}`, 256, 52);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(dw * 0.86, 0.3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lc), transparent: true })
  );
  label.position.set(0, -dh / 2 - 0.24, 0.076);

  const grp = new THREE.Group();
  grp.add(frame, lip, painting, label);
  grp.position.set(worldX + nx * offset, ARTWORK_Y, worldZ + nz * offset);
  grp.rotation.y = rotY;
  scene.add(grp);

  addSpotOnArtwork(worldX, worldZ, nx, nz);

  window.artMeshes.push({
    grp,
    art,
    worldPos: new THREE.Vector3(worldX + nx * offset, ARTWORK_Y, worldZ + nz * offset),
    wallNormal: new THREE.Vector3(nx, 0, nz),
  });
}

/* ============================================================
   섹션 방 작품 배치
   2개: 좌벽 1 + 우벽 1 (크게)
   4개: 좌벽 2 + 우벽 2
   ============================================================ */
function layoutArtworks(sectionIdx, cx, cz) {
  const sec = SECTIONS[sectionIdx];
  const arts = sec.artworks;
  const hw = ROOM_W / 2 - WALL_T / 2 - 0.12;
  const hd = ROOM_D / 2 - WALL_T / 2 - 0.12;

  if (arts.length === 2) {
    // 좌벽 1개 + 우벽 1개 — 크게 표시
    const sz0 = normArtSize(arts[0], 3.8, 3.2);
    const sz1 = normArtSize(arts[1], 3.8, 3.2);
    buildArtwork(arts[0], cx - hw, cz, Math.PI / 2, sz0.w, sz0.h);
    buildArtwork(arts[1], cx + hw, cz, -Math.PI / 2, sz1.w, sz1.h);
  } else if (arts.length === 4) {
    // 좌벽 앞/뒤 2개, 우벽 앞/뒤 2개
    const zOff = 3.4;
    const sz = [0,1,2,3].map(i => normArtSize(arts[i], 3.0, 2.6));
    buildArtwork(arts[0], cx - hw, cz - zOff * 0.7, Math.PI / 2, sz[0].w, sz[0].h);
    buildArtwork(arts[1], cx - hw, cz + zOff * 0.7, Math.PI / 2, sz[1].w, sz[1].h);
    buildArtwork(arts[2], cx + hw, cz - zOff * 0.7, -Math.PI / 2, sz[2].w, sz[2].h);
    buildArtwork(arts[3], cx + hw, cz + zOff * 0.7, -Math.PI / 2, sz[3].w, sz[3].h);
  }
}

/* ============================================================
   섹션 타이틀 — 문 왼쪽 벽면에 텍스트 패널
   ============================================================ */
const SECTION_DESCS = [
  '사랑이 탄생한 순간',
  '사랑은 놀이다',
  '사랑의 은밀한 순간들',
  '사랑이 역사를 만들 때',
];

/* buildSectionTitle(sec, cx, wallZ)
   wallZ = 문 벽의 z 위치 (예: cz + ROOM_D/2)
   패널은 현재 방 쪽(z = wallZ + 0.2) 의 문 왼편에 배치
   현재 방에서 다음 섹션 문에 다가갈 때 텍스트가 보임 */
function buildSectionTitle(sec, cx, wallZ) {
  // 캔버스 비율: panelW:panelH = 약 2.7:1
  const lc = document.createElement('canvas');
  lc.width = 864; lc.height = 512;
  const ctx = lc.getContext('2d');

  ctx.clearRect(0, 0, 864, 512);

  // 구분선 위
  ctx.strokeStyle = 'rgba(120,70,20,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(40, 90); ctx.lineTo(824, 90); ctx.stroke();

  // 섹션 번호
  ctx.fillStyle = 'rgba(120,70,20,0.7)';
  ctx.font = '300 28px "Cormorant Garamond", serif';
  ctx.textAlign = 'left';
  ctx.fillText(sec.title, 40, 78);

  // 한글 제목
  ctx.fillStyle = '#2a1000';
  ctx.font = '300 110px "Noto Serif KR", serif';
  ctx.fillText(sec.titleKr, 40, 240);

  // 설명
  ctx.fillStyle = 'rgba(60,30,5,0.7)';
  ctx.font = '300 36px "Noto Serif KR", serif';
  ctx.fillText(SECTION_DESCS[sec.id - 1], 40, 320);

  // 구분선 아래
  ctx.strokeStyle = 'rgba(120,70,20,0.35)';
  ctx.beginPath(); ctx.moveTo(40, 370); ctx.lineTo(520, 370); ctx.stroke();

  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(lc),
    transparent: true,
    side: THREE.FrontSide,  // 현재 방에서만 보임
  });

  // 문 왼쪽 벽 구간 중앙 x
  const HW = ROOM_W / 2;
  const leftPieceW = HW - DOOR_W / 2;         // 10.4
  const panelCenterX = cx - DOOR_W / 2 - leftPieceW / 2;  // = -6.8

  // 패널은 현재 방 쪽 벽 표면 (wallZ + WALL_T/2 + 0.02)
  const panelZ = wallZ + WALL_T / 2 + 0.02;
  const panelW = leftPieceW * 0.88;
  const panelH = 3.0;

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), mat);
  // rotation.y = 0 → 법선 +z (현재 방 방향으로 향함, 현재 방 플레이어에게 보임)
  panel.position.set(panelCenterX, WALL_H / 2 + 0.1, panelZ);
  scene.add(panel);
}

/* ============================================================
   입구 홀 (Room 0)
   - 왼쪽 벽: 전시명 텍스트
   - 오른쪽 벽: 메인 작품 (까막잡기 놀이)
   - 앞쪽 문 벽: 포스터 없음 (문만)
   ============================================================ */
function buildEntranceHall() {
  const cx = 0, cz = 0;
  const hallColor = 0xf0dfc8;  // 따뜻한 크림 베이지
  buildRoom(cx, cz, hallColor, 0xe0c8a8, 0xf8eed8);

  const hd = ROOM_D / 2 - WALL_T / 2 - 0.05;
  const hw = ROOM_W / 2 - WALL_T / 2 - 0.05;

  /* ── 왼쪽 벽 — 전시명 텍스트 ── */
  // 왼쪽 벽: x = -hw, 방향 = +x (rotation.y = Math.PI/2)
  // 패널 크기: ROOM_D - 0.6 (깊이) × WALL_H - 0.4 (높이)
  const panelDepth = ROOM_D - 0.6;  // 19.4
  const panelHeight = WALL_H - 0.4; // 5.1
  // 캔버스 비율을 패널 비율에 맞춤: 19.4:5.1 ≈ 3.8:1
  const lc = document.createElement('canvas');
  lc.width = 1920; lc.height = 512;
  const ctx = lc.getContext('2d');

  ctx.clearRect(0, 0, 1920, 512);

  // 구분선 위
  ctx.strokeStyle = 'rgba(160,100,40,0.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(120, 80); ctx.lineTo(1800, 80); ctx.stroke();

  // 상단 라벨
  ctx.fillStyle = 'rgba(160,100,40,0.65)';
  ctx.font = '300 38px "Cormorant Garamond", serif';
  ctx.textAlign = 'center';
  ctx.fillText('18세기 프랑스 회화 전시', 960, 68);

  // 메인 타이틀
  ctx.fillStyle = '#3a1a00';
  ctx.font = '300 140px "Noto Serif KR", serif';
  ctx.fillText('사랑을 그리다', 960, 270);

  // 서브타이틀
  ctx.fillStyle = '#8a5010';
  ctx.font = 'italic 300 68px "Cormorant Garamond", serif';
  ctx.fillText('— 로코코의 연인들 —', 960, 370);

  // 구분선 아래
  ctx.strokeStyle = 'rgba(160,100,40,0.35)';
  ctx.beginPath(); ctx.moveTo(560, 420); ctx.lineTo(1360, 420); ctx.stroke();

  // 컬렉션 텍스트
  ctx.fillStyle = 'rgba(140,80,20,0.6)';
  ctx.font = '300 30px "Noto Serif KR", serif';
  ctx.fillText('정우철 미술관 컬렉션', 960, 465);

  const lMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(lc),
    transparent: true,
    side: THREE.DoubleSide,
  });
  const leftPanel = new THREE.Mesh(new THREE.PlaneGeometry(panelDepth, panelHeight), lMat);
  leftPanel.position.set(cx - hw + 0.02, WALL_H / 2, cz);
  leftPanel.rotation.y = Math.PI / 2; // 방 안쪽을 향해 (+x 방향)
  scene.add(leftPanel);

  /* ── 오른쪽 벽 — 메인 작품 (까막잡기 놀이) ── */
  // SECTIONS[1].artworks[1] = 까막잡기 놀이 (sec2_2)
  const mainArt = SECTIONS[1].artworks[1];
  const mainSz = normArtSize(mainArt, 4.2, 3.5);
  buildArtwork(mainArt, cx + hw, cz, -Math.PI / 2, mainSz.w, mainSz.h);

  // buildMuseum이 섹션1 앞 문 벽(z=-10)을 처리함
  // 뒤쪽(z=+10)은 buildRoom이 이미 솔리드 벽으로 생성함
  // addRoomLights는 buildRoom 내부에서 이미 호출됨
}

/* ============================================================
   전체 전시관 조립
   ============================================================ */

// 입구홀 벽 색상 (buildMuseum 에서 prevColor 계산에 사용)
const ENTRANCE_HALL_COLOR = 0xf0dfc8;

// 섹션별 파스텔 색상 (MeshBasicMaterial 사용 — 조명 영향 없이 색 그대로 표시)
const SECTION_WALL_COLORS = [
  0xf5b8d0,  // Section 1: 파스텔 핑크
  0xf5e89a,  // Section 2: 파스텔 노랑
  0xa8c8f0,  // Section 3: 파스텔 하늘색
  0xc8b8f0,  // Section 4: 파스텔 라벤더
];
const SECTION_FLOOR_COLORS = [
  0xe8a0b8,  // 핑크 플로어
  0xe8d878,  // 노랑 플로어
  0x88a8d8,  // 하늘 플로어
  0xb0a0e0,  // 라벤더 플로어
];
const SECTION_CEIL_COLORS = [
  0xfce0ec,  // 핑크 천장
  0xfaf5c0,  // 노랑 천장
  0xd0e4f8,  // 하늘 천장
  0xe0d4f8,  // 라벤더 천장
];

function buildMuseum() {
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  scene.add(new THREE.HemisphereLight(0xfff8f0, 0xf0e8d8, 0.35));

  buildEntranceHall();

  SECTIONS.forEach((sec, i) => {
    const cz = ROOM_Z_OFFSET * (i + 1);
    const cx = 0;
    const wc = SECTION_WALL_COLORS[i];
    const fc = SECTION_FLOOR_COLORS[i];
    const cc = SECTION_CEIL_COLORS[i];

    buildRoom(cx, cz, wc, fc, cc);

    // 앞쪽 문 벽 — 이전 방 색 사용 (현재 방 진입 전 색이 안 보이게)
    const frontZ = cz + ROOM_D / 2;
    const prevColor = (i === 0) ? ENTRANCE_HALL_COLOR : SECTION_WALL_COLORS[i - 1];
    buildDoorwayWall(cx, frontZ, 'front', prevColor);
    // 섹션 타이틀은 앞 문에 달지 않음 (입구홀에서는 텍스트 없음)

    if (i < SECTIONS.length - 1) {
      // 뒤쪽 문 벽 — 현재 방 색
      const backZ = cz - ROOM_D / 2;
      buildDoorwayWall(cx, backZ, 'back', wc);
      // 이 섹션의 타이틀: 뒤쪽 문 왼편, 방 안에서 보임
      buildSectionTitle(sec, cx, backZ);
    } else {
      // 마지막 방: 뒷벽은 막힌 벽
      const backWallZ = cz - ROOM_D / 2;
      const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(ROOM_W, WALL_H, WALL_T),
        MAT.wall(wc)
      );
      backWall.position.set(cx, WALL_H / 2, backWallZ);
      scene.add(backWall);
      // 마지막 섹션 타이틀: 뒷벽 왼편 (문이 없어도 같은 위치에)
      buildSectionTitle(sec, cx, backWallZ);
    }

    // 작품 배치
    layoutArtworks(i, cx, cz);
  });
}

/* ============================================================
   캐릭터 빌드
   ============================================================ */
window.player = null;
window.playerParts = {};

function buildCharacter() {
  const grp = new THREE.Group();

  function box(w, h, d, color, px, py, pz) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    m.position.set(px, py, pz);
    grp.add(m);
    return m;
  }

  box(0.50, 0.46, 0.46, 0xf0c890, 0, 1.12, 0);
  box(0.24, 0.18, 0.24, 0xe8c080, 0, 0.90, 0);
  box(0.54, 0.12, 0.50, 0x1a0e04, 0, 1.38, 0.0);
  box(0.54, 0.60, 0.36, 0x8b1a1a, 0, 0.58, 0);
  box(0.50, 0.30, 0.32, 0x2a1a0a, 0, 0.18, 0);
  box(0.16, 0.50, 0.16, 0x8b1a1a, -0.35, 0.58, 0);
  box(0.16, 0.50, 0.16, 0x8b1a1a,  0.35, 0.58, 0);

  const legL = box(0.18, 0.32, 0.18, 0x1a0e04, -0.14, -0.16, 0);
  const legR = box(0.18, 0.32, 0.18, 0x1a0e04,  0.14, -0.16, 0);

  box(0.20, 0.08, 0.26, 0x0a0604, -0.14, -0.36, 0.04);
  box(0.20, 0.08, 0.26, 0x0a0604,  0.14, -0.36, 0.04);

  window.playerParts = { legL, legR };
  window.player = grp;

  // 시작 위치: 입구 홀 한가운데
  grp.position.set(0, 0, 0);
  scene.add(grp);
}

/* ============================================================
   내보내기 (interaction.js 에서 참조)
   ============================================================ */
window.museumScene    = scene;
window.museumCamera   = camera;
window.museumRenderer = renderer;
window.ROOM_W_CONST   = ROOM_W;
window.ROOM_D_CONST   = ROOM_D;
window.WALL_H_CONST   = WALL_H;
window.DOOR_W_CONST   = DOOR_W;
window.SECTIONS_COUNT = SECTIONS.length;
window.ROOM_Z_FN      = (i) => ROOM_Z_OFFSET * i;
