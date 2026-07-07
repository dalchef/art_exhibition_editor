// viewer/js/controls.js
// 데스크톱 키보드 이동 + 포인터 드래그 카메라 + (M2)모바일 조이스틱.
// 3인칭 후방추적 카메라(위치·회전 댐핑) + 벽 근접 시 당겨오기.
import * as THREE from '../../vendor/three.module.js';

// v1.1 §3.1: 충돌 반경 0.40 (통통 체형) · 카메라 추적 타깃 높이 1.0m
const WALK = 2.2, RUN = 3.6, RADIUS = 0.40;
const CAM_DIST = 4.2, CAM_HEIGHT = 2.4, HEAD_Y = 1.0;

export class PlayerControls {
  constructor(avatar, camera, colliders, dom, opts = {}) {
    this.avatar = avatar;
    this.camera = camera;
    this.colliders = colliders;
    this.dom = dom;
    this.pos = new THREE.Vector2(opts.spawnX || 0, opts.spawnZ || 0);
    this.camYaw = Math.PI;        // 북(-Z)을 바라봄
    this.avatarYaw = Math.PI;
    this.camPos = new THREE.Vector3();
    this.enabled = true;
    this.moving = false;
    this.keys = new Set();
    this.joy = { active: false, x: 0, y: 0 };   // 모바일 조이스틱 (-1..1)
    this._drag = { on: false, px: 0, py: 0, moved: 0 };
    this._manualUntil = 0;
    this._t = 0;

    const f = this._forward(this.camYaw);
    this.camPos.set(this.pos.x - f.x * CAM_DIST, CAM_HEIGHT, this.pos.y - f.y * CAM_DIST);
    camera.position.copy(this.camPos);
    avatar.position.set(this.pos.x, 0, this.pos.y);
    avatar.rotation.y = this.avatarYaw;

    this._bind();
  }

  _forward(yaw) { return { x: Math.sin(yaw), y: Math.cos(yaw) }; }
  _right(yaw) { const f = this._forward(yaw); return { x: -f.y, y: f.x }; }

  _bind() {
    this._onKey = (e, down) => {
      const k = e.key.toLowerCase();
      const map = { w: 1, a: 1, s: 1, d: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1, shift: 1 };
      if (!map[k]) return;
      if (down) this.keys.add(k); else this.keys.delete(k);
    };
    this._kd = (e) => this._onKey(e, true);
    this._ku = (e) => this._onKey(e, false);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);

    this.dom.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('.no-cam-drag')) return;
      this._drag.on = true; this._drag.px = e.clientX; this._drag.py = e.clientY; this._drag.moved = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this._drag.on) return;
      const dx = e.clientX - this._drag.px;
      this._drag.moved += Math.abs(dx) + Math.abs(e.clientY - this._drag.py);
      this.camYaw -= dx * 0.006;
      this._drag.px = e.clientX; this._drag.py = e.clientY;
      this._manualUntil = this._t + 1.6;
    });
    window.addEventListener('pointerup', () => { this._drag.on = false; });
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
  }

  setJoystick(x, y) { this.joy.active = (x || y) ? true : false; this.joy.x = x; this.joy.y = y; }

  _inputVector() {
    let fwd = 0, str = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) fwd += 1;
    if (k.has('s') || k.has('arrowdown')) fwd -= 1;
    if (k.has('d') || k.has('arrowright')) str += 1;
    if (k.has('a') || k.has('arrowleft')) str -= 1;
    if (this.joy.active) { str += this.joy.x; fwd += -this.joy.y; }
    return { fwd, str, run: k.has('shift') };
  }

  _circleHit(x, z) {
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
    }
    return false;
  }

  update(dt) {
    this._t += dt;
    if (!this.enabled) {
      // 오토워크 등 외부 구동 시: pos/avatarYaw 를 아바타 메시에 반영 + 카메라 팔로우
      this.avatar.position.x = this.pos.x; this.avatar.position.z = this.pos.y;
      this.avatar.rotation.y = smoothAngle(this.avatar.rotation.y, this.avatarYaw, dt * 10);
      this._follow(dt); return;
    }

    const inp = this._inputVector();
    const f = this._forward(this.camYaw), r = this._right(this.camYaw);
    let mx = f.x * inp.fwd + r.x * inp.str;
    let mz = f.y * inp.fwd + r.y * inp.str;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.001;

    if (this.moving) {
      mx /= len; mz /= len;
      const speed = (inp.run ? RUN : WALK) * Math.min(1, len);
      let nx = this.pos.x + mx * speed * dt;
      if (!this._circleHit(nx, this.pos.y)) this.pos.x = nx;
      let nz = this.pos.y + mz * speed * dt;
      if (!this._circleHit(this.pos.x, nz)) this.pos.y = nz;
      this.avatarYaw = Math.atan2(mx, mz);
    }

    this.avatar.rotation.y = smoothAngle(this.avatar.rotation.y, this.avatarYaw, dt * 10);
    this.avatar.position.x = this.pos.x;
    this.avatar.position.z = this.pos.y;
    if (this.avatar.userData.update) this.avatar.userData.update(dt, this.moving, 1);

    if (this.moving && this._t > this._manualUntil) {
      this.camYaw = smoothAngle(this.camYaw, this.avatarYaw, dt * 2.2);
    }
    this._follow(dt);
  }

  _follow(dt) {
    if (!isFinite(this.camYaw)) this.camYaw = isFinite(this.avatarYaw) ? this.avatarYaw : Math.PI;
    const f = this._forward(this.camYaw);
    const headX = this.pos.x, headZ = this.pos.y;
    let dist = CAM_DIST;
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * CAM_DIST;
      const sx = headX - f.x * t, sz = headZ - f.y * t;
      if (this._segHit(sx, sz)) { dist = Math.max(0.5, t - 0.25); break; }
    }
    const targetX = headX - f.x * dist;
    const targetZ = headZ - f.y * dist;
    const targetY = HEAD_Y + (CAM_HEIGHT - HEAD_Y) * (dist / CAM_DIST);

    const kp = 1 - Math.exp(-dt * 6);
    this.camPos.x += (targetX - this.camPos.x) * kp;
    this.camPos.y += (targetY - this.camPos.y) * kp;
    this.camPos.z += (targetZ - this.camPos.z) * kp;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(headX, HEAD_Y, headZ);
  }

  _segHit(x, z) {
    const M = 0.15;
    for (const c of this.colliders) {
      if (x > c.minX - M && x < c.maxX + M && z > c.minZ - M && z < c.maxZ + M) return true;
    }
    return false;
  }
}

function smoothAngle(cur, target, k) {
  if (!isFinite(target)) return isFinite(cur) ? cur : 0;
  if (!isFinite(cur)) return target;
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
}
