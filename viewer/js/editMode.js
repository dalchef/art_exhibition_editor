// viewer/js/editMode.js — 3D 편집 프리뷰 (v1.2 P2).
// ?preview=1&edit=1 (데스크톱 전용)일 때만 main.js 가 로드한다.
// Publish 산출물에 파일이 포함되어도 edit 파라미터 없이는 이 코드 경로에 진입하지 않는다.
//
// 범위: 기존 배치 작품의 위치·스케일 조정 전용. 신규 걸기·벽 간 이동·삭제는 정면뷰 담당.
// 스냅·겹침 규칙은 shared/placementRules.js — 정면뷰와 완전 동일.
import * as THREE from '../../vendor/three.module.js';
import { wallLeftToWorld, wallLength } from '../../shared/schema.js';
import { artworkOuterSize, resolvePlacement, resolveScale } from '../../shared/placementRules.js';
import { makeAvatar } from './avatar.js';
import { PlayerControls } from './controls.js';

const FLY_SPEED = 5.0;

export class EditMode {
  constructor(M, { onMessage } = {}) {
    this.M = M;                      // window.__museum 참조 (rebuild 후에도 최신 arts 접근)
    this.send = onMessage || (() => {});
    this.selected = null;            // anchor
    this.drag = null;
    this.walk = null;                // { avatar, controls }
    this.cam = { yaw: Math.PI, pitch: -0.05, pos: new THREE.Vector3(M.layout.spawn.x, 1.7, M.layout.spawn.z) };
    this.keys = new Set();
    this.ray = new THREE.Raycaster();

    this._buildGizmos();
    this._buildUi();
    this._bind();
    this._applyCam();
  }

  // ---- 기즈모: 외곽 하이라이트 + 4코너 스프라이트 핸들 + 아이레벨 가이드 ----
  _buildGizmos() {
    const M = this.M;
    const dotCv = document.createElement('canvas');
    dotCv.width = dotCv.height = 64;
    const dg = dotCv.getContext('2d');
    dg.fillStyle = '#6ea3d6';
    dg.strokeStyle = '#fff';
    dg.lineWidth = 6;
    dg.beginPath(); dg.arc(32, 32, 24, 0, 7); dg.fill(); dg.stroke();
    const dotTex = new THREE.CanvasTexture(dotCv);
    this.handles = [];
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, depthTest: false }));
      sp.scale.set(0.14, 0.14, 1);
      sp.renderOrder = 10;
      sp.visible = false;
      sp.userData.corner = i;
      M.scene.add(sp);
      this.handles.push(sp);
    }
    const boxGeo = new THREE.BufferGeometry();
    boxGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(15).fill(0), 3));
    this.outline = new THREE.Line(boxGeo, new THREE.LineBasicMaterial({ color: 0x6ea3d6, depthTest: false }));
    this.outline.renderOrder = 9;
    this.outline.visible = false;
    M.scene.add(this.outline);
    // 아이레벨 150cm 가이드 (드래그 중 표시)
    this.eyeGuide = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3)),
      new THREE.LineDashedMaterial({ color: 0x6ea3d6, dashSize: 0.15, gapSize: 0.1, depthTest: false }));
    this.eyeGuide.renderOrder = 9;
    this.eyeGuide.visible = false;
    M.scene.add(this.eyeGuide);
  }

  _buildUi() {
    const bar = document.createElement('div');
    bar.className = 'edit-bar no-cam-drag';
    bar.innerHTML = `
      <span class="eb-badge">3D 편집</span>
      <button data-eb="face" title="선택 작품의 벽 정면으로 카메라 이동">벽 정면 보기</button>
      <button data-eb="walk">걷기 모드</button>
      <span class="eb-hint">클릭 선택 · 몸통 드래그 이동 · 코너 드래그 크기 (Alt = 스냅 해제)<br>신규 걸기·삭제는 에디터 정면뷰에서</span>`;
    document.body.appendChild(bar);
    this.bar = bar;
    bar.querySelector('[data-eb=face]').addEventListener('click', () => this._faceWall());
    bar.querySelector('[data-eb=walk]').addEventListener('click', () => this._toggleWalk());
  }

  _bind() {
    const dom = this.M.renderer.domElement;
    this._kd = (e) => { this.keys.add(e.key.toLowerCase()); };
    this._ku = (e) => { this.keys.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);

    let look = null;
    dom.addEventListener('pointerdown', (e) => {
      if (this.walk) return;
      const hit = this._pick(e);
      if (hit.handle != null && this.selected) {
        const o = artworkOuterSize(this.selected.artwork);
        this.drag = { type: 'scale', d0: this._cursorDistToCenter(e), scale0: this.selected.artwork.scale || 1 };
        dom.setPointerCapture(e.pointerId);
      } else if (hit.anchor) {
        this._select(hit.anchor);
        const uv = this._wallUV(e, hit.anchor);
        this.drag = uv ? {
          type: 'move',
          offU: uv.u - hit.anchor.artwork.placement.x,
          offV: uv.v - hit.anchor.artwork.placement.centerHeightCm / 100,
        } : null;
        dom.setPointerCapture(e.pointerId);
      } else if (e.target === dom) {
        if (this.selected) { this._select(null); }
        look = { x: e.clientX, y: e.clientY };
      }
    });
    dom.addEventListener('pointermove', (e) => {
      if (this.walk) return;
      if (this.drag && this.selected) {
        if (this.drag.type === 'move') this._dragMove(e);
        else this._dragScale(e);
      } else if (look) {
        this.cam.yaw -= (e.clientX - look.x) * 0.005;
        this.cam.pitch = Math.max(-1.3, Math.min(1.3, this.cam.pitch - (e.clientY - look.y) * 0.004));
        look = { x: e.clientX, y: e.clientY };
      }
    });
    dom.addEventListener('pointerup', () => {
      if (this.drag && this.selected) {
        const a = this.selected.artwork;
        // 확정치 에디터 전송 (에디터가 undo 1스텝으로 반영 → 갱신 프로젝트 재수신)
        this.send({
          type: 'museum-edit-transform',
          artworkId: a.id,
          placement: { x: a.placement.x, centerHeightCm: a.placement.centerHeightCm },
          scale: a.scale || 1,
        });
      }
      this.drag = null;
      look = null;
      this.eyeGuide.visible = false;
    });
  }

  // ---- 피킹 ----
  _pick(e) {
    const dom = this.M.renderer.domElement;
    const r = dom.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(p, this.M.camera);
    // 핸들 우선
    const hs = this.ray.intersectObjects(this.handles.filter(h => h.visible));
    if (hs.length) return { handle: hs[0].object.userData.corner };
    const hits = this.ray.intersectObject(this.M.arts.group, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.artworkId) o = o.parent;
      if (o) {
        const anchor = this.M.arts.anchors.find(a => a.id === o.userData.artworkId);
        if (anchor) return { anchor };
      }
    }
    return {};
  }

  // 커서 → 선택 작품 벽 평면의 (u, v)
  _wallUV(e, anchor = this.selected) {
    const dom = this.M.renderer.domElement;
    const r = dom.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(p, this.M.camera);
    const n = anchor.normal;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, anchor.center);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(plane, hit)) return null;
    const left = wallLeftToWorld(anchor.rect, anchor.wall, 0);
    const u = (hit.x - left.x) * left.along[0] + (hit.z - left.z) * left.along[1];
    return { u, v: hit.y };
  }

  _roomOf(anchor) {
    const M = this.M;
    if (anchor.roomIndex === -1) return { def: M.project.lobby, others: M.project.lobby.artworks, wallH: M.project.lobby.size?.h ?? 8, door: anchor.wall === 'north' ? { offset: wallLength(anchor.rect, 'north') / 2 } : null };
    const room = M.project.rooms[anchor.roomIndex];
    return {
      def: room, others: room.artworks, wallH: room.size.h,
      door: (room.exitDoor && room.exitDoor.wall === anchor.wall) ? room.exitDoor : null,
    };
  }

  _dragMove(e) {
    const anchor = this.selected;
    const uv = this._wallUV(e);
    if (!uv) return;
    const info = this._roomOf(anchor);
    const res = resolvePlacement({
      wallLen: wallLength(anchor.rect, anchor.wall), wallH: info.wallH,
      u: uv.u - this.drag.offU, v: uv.v - this.drag.offV,
      aw: anchor.artwork,
      others: info.others.filter(o => o.id !== anchor.id && o.placement.wall === anchor.wall),
      door: info.door, alt: e.altKey,
    });
    // 낙관적 반영: 로컬 project + holder/anchor 이동 (확정치는 에디터 재전송으로 동기화)
    anchor.artwork.placement.x = +res.u.toFixed(2);
    anchor.artwork.placement.centerHeightCm = Math.round(res.v * 100);
    const p = wallLeftToWorld(anchor.rect, anchor.wall, res.u);
    const n = anchor.normal;
    const off = 0.13;
    anchor.center.set(p.x + n.x * off, res.v, p.z + n.z * off);
    anchor.holder.position.copy(anchor.center);
    this._updateGizmos();
    this.eyeGuide.visible = !!res.guides.v;
  }

  _cursorDistToCenter(e) {
    const c = this.selected.center.clone().project(this.M.camera);
    const dom = this.M.renderer.domElement;
    const r = dom.getBoundingClientRect();
    const sx = (c.x + 1) / 2 * r.width + r.left, sy = (1 - (c.y + 1) / 2) * r.height + r.top;
    return Math.max(6, Math.hypot(e.clientX - sx, e.clientY - sy));
  }

  _dragScale(e) {
    const anchor = this.selected;
    const { scale, snapped } = resolveScale(this.drag.scale0 * (this._cursorDistToCenter(e) / this.drag.d0), { alt: e.altKey });
    const prev = anchor.artwork.scale || 1;
    anchor.artwork.scale = scale;
    // 낙관적: holder 스케일 (리빌드 시 정확 렌더로 대체)
    anchor.holder.scale.setScalar(anchor.holder.scale.x * (scale / prev));
    this._updateGizmos();
  }

  _select(anchor) {
    this.selected = anchor;
    this.outline.visible = !!anchor;
    for (const h of this.handles) h.visible = !!anchor;
    if (anchor) this._updateGizmos();
    this.send({ type: 'museum-edit-select', artworkId: anchor ? anchor.id : null });
  }

  _updateGizmos() {
    const a = this.selected;
    if (!a) return;
    const o = artworkOuterSize(a.artwork);
    const left = wallLeftToWorld(a.rect, a.wall, 0);
    const ax = left.along[0], az = left.along[1];
    const c = a.center;
    const hw = o.w / 2, hh = o.h / 2;
    const n = a.normal.clone().multiplyScalar(0.02);
    const corner = (su, sv) => [c.x + ax * su * hw + n.x, c.y + sv * hh, c.z + az * su * hw + n.z];
    const cs = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
    this.handles.forEach((h, i) => h.position.set(...cs[i]));
    const pos = this.outline.geometry.attributes.position;
    [...cs, cs[0]].forEach((p, i) => pos.setXYZ(i, p[0], p[1], p[2]));
    pos.needsUpdate = true;
    // 아이레벨 가이드: 벽을 따라 y=1.5
    const wl = wallLength(a.rect, a.wall);
    const l0 = wallLeftToWorld(a.rect, a.wall, 0), l1 = wallLeftToWorld(a.rect, a.wall, wl);
    const gp = this.eyeGuide.geometry.attributes.position;
    gp.setXYZ(0, l0.x + n.x * 2, 1.5, l0.z + n.z * 2);
    gp.setXYZ(1, l1.x + n.x * 2, 1.5, l1.z + n.z * 2);
    gp.needsUpdate = true;
    this.eyeGuide.computeLineDistances();
  }

  // ---- 카메라 ----
  _applyCam() {
    if (this.walk) return;
    const M = this.M;
    M.camera.position.copy(this.cam.pos);
    const d = new THREE.Vector3(
      Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch),
      Math.sin(this.cam.pitch),
      Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch));
    M.camera.lookAt(this.cam.pos.clone().add(d));
  }

  _faceWall() {
    const a = this.selected || this.M.arts.anchors[0];
    if (!a) return;
    this.cam.pos.copy(a.center.clone().add(a.normal.clone().multiplyScalar(3.5)));
    this.cam.pos.y = Math.max(1.2, a.center.y);
    this.cam.yaw = Math.atan2(-a.normal.x, -a.normal.z);
    this.cam.pitch = 0;
    this._applyCam();
  }

  _toggleWalk() {
    const M = this.M;
    if (this.walk) {
      M.scene.remove(this.walk.avatar);
      this.walk.controls.dispose();
      this.walk = null;
      this.bar.querySelector('[data-eb=walk]').classList.remove('on');
      this._applyCam();
    } else {
      this._select(null);
      const avatar = makeAvatar(M.project.avatarDefaults || {});
      M.scene.add(avatar);
      const controls = new PlayerControls(avatar, M.camera, M.world.colliders, M.renderer.domElement, {
        spawnX: this.cam.pos.x, spawnZ: this.cam.pos.z,
      });
      this.walk = { avatar, controls };
      this.bar.querySelector('[data-eb=walk]').classList.add('on');
    }
  }

  // 에디터 재전송(리빌드) 후 앵커 참조 복원
  onRebuild() {
    if (this.walk) this.walk.controls.colliders = this.M.world.colliders;
    if (this.selected) {
      const again = this.M.arts.anchors.find(a => a.id === this.selected.id);
      this.selected = again || null;
      this.outline.visible = !!this.selected;
      for (const h of this.handles) h.visible = !!this.selected;
      if (this.selected) this._updateGizmos();
    }
  }

  update(dt) {
    if (this.walk) { this.walk.controls.update(dt); return; }
    // 자유 비행: WASD 이동, Q/E 상하, Shift 가속
    const k = this.keys;
    const sp = FLY_SPEED * (k.has('shift') ? 2.6 : 1) * dt;
    const fwd = new THREE.Vector3(Math.sin(this.cam.yaw), 0, Math.cos(this.cam.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    if (k.has('w') || k.has('arrowup')) this.cam.pos.addScaledVector(fwd, sp);
    if (k.has('s') || k.has('arrowdown')) this.cam.pos.addScaledVector(fwd, -sp);
    if (k.has('d') || k.has('arrowright')) this.cam.pos.addScaledVector(right, sp);
    if (k.has('a') || k.has('arrowleft')) this.cam.pos.addScaledVector(right, -sp);
    if (k.has('e')) this.cam.pos.y += sp;
    if (k.has('q')) this.cam.pos.y = Math.max(0.3, this.cam.pos.y - sp);
    this._applyCam();
  }
}
