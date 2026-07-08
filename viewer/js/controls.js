// viewer/js/controls.js
// 데스크톱 키보드 이동 + 포인터 드래그 카메라 + (M2)모바일 조이스틱.
// 3인칭 후방추적 카메라(위치·회전 댐핑) + 벽 근접 시 당겨오기.
// v1.3 P6: 수직 시점(피치, 위 ~82°) + 휠/핀치 카메라 거리 줌 + 바닥·천장·벽 관통 방지.
import * as THREE from '../../vendor/three.module.js';

// v1.1 §3.1: 충돌 반경 0.40 (통통 체형) · 카메라 추적 타깃 높이 1.0m
const WALK = 2.2, RUN = 3.6, RADIUS = 0.40;
const CAM_DIST = 4.2, HEAD_Y = 1.0;
const PIVOT_Y = HEAD_Y + 0.4;          // 카메라 궤도 중심 (머리 위)
const CAM_MIN = 0.8, CAM_MAX = 7.0;    // 휠 줌 거리 범위 (1인칭 근접 ~ 넓은 3인칭)
const PITCH_UP_MAX = 1.43;             // 위 약 82° (완전 수직 제외 — 멀미 방지)
const PITCH_DOWN_MAX = -0.6;           // 아래 약 34°
const PITCH_DEFAULT = -0.23;           // 기존 프레이밍과 동등한 살짝 내려다보기
const FLOOR_Y = 0.35, CEIL_SAFE = 3.3; // 카메라 바닥/보수적 천장 한계

export class PlayerControls {
  constructor(avatar, camera, colliders, dom, opts = {}) {
    this.avatar = avatar;
    this.camera = camera;
    this.colliders = colliders;
    this.dom = dom;
    this.pos = new THREE.Vector2(opts.spawnX || 0, opts.spawnZ || 0);
    this.camYaw = Math.PI;        // 북(-Z)을 바라봄
    this.camPitch = PITCH_DEFAULT;
    this.camDist = CAM_DIST;
    this.camDistTarget = CAM_DIST;
    this.avatarYaw = Math.PI;
    this.camPos = new THREE.Vector3();
    this.enabled = true;
    this.moving = false;
    this.keys = new Set();
    this.joy = { active: false, x: 0, y: 0 };   // 모바일 조이스틱 (-1..1)
    this._drag = { on: false, px: 0, py: 0, moved: 0 };
    this._pts = new Map();        // P6: 활성 포인터 (이동 중 두 손가락 핀치 감지)
    this._pinch = null;
    this._manualUntil = 0;
    this._t = 0;

    const f = this._forward(this.camYaw);
    this.camPos.set(this.pos.x - f.x * CAM_DIST, PIVOT_Y + 1.0, this.pos.y - f.y * CAM_DIST);
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
      this._pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pts.size === 2) {
        // P6: 이동 중 두 손가락 핀치 = 카메라 거리 (감상 모드 핀치와 모드가 달라 충돌 없음)
        const [a, b] = [...this._pts.values()];
        this._pinch = { d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), dist: this.camDistTarget };
        this._drag.on = false;
      } else {
        this._drag.on = true; this._drag.px = e.clientX; this._drag.py = e.clientY; this._drag.moved = 0;
      }
    });
    this._pm = (e) => {
      if (this._pts.has(e.pointerId)) this._pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pinch && this._pts.size === 2) {
        const [a, b] = [...this._pts.values()];
        const d = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
        // 벌림 = 확대 = 가까워짐 (감상 모드 핀치와 방향 일관)
        this.camDistTarget = clamp(this._pinch.dist * (this._pinch.d / d), CAM_MIN, CAM_MAX);
        return;
      }
      if (!this._drag.on) return;
      const dx = e.clientX - this._drag.px;
      const dy = e.clientY - this._drag.py;
      this._drag.moved += Math.abs(dx) + Math.abs(dy);
      this.camYaw -= dx * 0.006;
      // P6: 수직 드래그 = 피치 (위로 드래그 = 위 보기, 위 ~82°까지)
      this.camPitch = clamp(this.camPitch - dy * 0.004, PITCH_DOWN_MAX, PITCH_UP_MAX);
      this._drag.px = e.clientX; this._drag.py = e.clientY;
      this._manualUntil = this._t + 1.6;
    };
    this._pu = (e) => {
      this._pts.delete(e.pointerId);
      if (this._pts.size < 2) this._pinch = null;
      if (this._pts.size === 1) {
        const [p] = [...this._pts.values()];
        this._drag.on = true; this._drag.px = p.x; this._drag.py = p.y;
      } else {
        this._drag.on = false;
      }
    };
    window.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
    window.addEventListener('pointercancel', this._pu);

    // P6: 마우스 휠 = 카메라 거리. 휠 당김(deltaY>0) = 가까워짐 · 밀기 = 뒤로 (스펙 규약)
    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.88 : 1 / 0.88;
      this.camDistTarget = clamp(this.camDistTarget * f, CAM_MIN, CAM_MAX);
    };
    this.dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('pointermove', this._pm);
    window.removeEventListener('pointerup', this._pu);
    window.removeEventListener('pointercancel', this._pu);
    this.dom.removeEventListener('wheel', this._onWheel);
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

  // P6: 피벗(머리 위 1.4m) 중심 궤도 카메라 — camera = pivot - viewDir·edist, lookAt(pivot).
  // 시선 피치가 정확히 camPitch 로 유지되고, 바닥/천장/벽 관통은 edist 축소로 방지
  // (방향 유지 스케일이라 피치는 변하지 않는다).
  _follow(dt) {
    if (!isFinite(this.camYaw)) this.camYaw = isFinite(this.avatarYaw) ? this.avatarYaw : Math.PI;
    if (!isFinite(this.camPitch)) this.camPitch = PITCH_DEFAULT;
    // 휠/핀치 거리 부드러운 전환
    this.camDist += (this.camDistTarget - this.camDist) * (1 - Math.exp(-dt * 8));
    const p = this.camPitch;
    const f = this._forward(this.camYaw);
    const headX = this.pos.x, headZ = this.pos.y;

    let edist = this.camDist;
    // 바닥 관통 방지 (위 보기: 카메라가 내려감)
    if (p > 0.05) edist = Math.min(edist, (PIVOT_Y - FLOOR_Y) / Math.sin(p));
    // 보수적 천장 관통 방지 (아래 보기: 카메라가 올라감 — 최저 룸 높이 3.5m 기준)
    if (p < -0.05) edist = Math.min(edist, (CEIL_SAFE - PIVOT_Y) / Math.sin(-p));

    // 벽 충돌: 수평 투영 경로 레이마치(고정 0.18m 스텝) → 유효 거리 축소.
    // 백오프 0.35m — 니어클립이 벽을 뚫지 않을 여유 확보.
    const horiz = Math.cos(p) * edist;
    if (horiz > 0.05) {
      for (let t = 0.18; t <= horiz; t += 0.18) {
        const sx = headX - f.x * t, sz = headZ - f.y * t;
        if (this._segHit(sx, sz)) {
          edist *= Math.max(0.3, t - 0.35) / horiz;
          break;
        }
      }
    }

    const targetX = headX - f.x * Math.cos(p) * edist;
    const targetZ = headZ - f.y * Math.cos(p) * edist;
    const targetY = Math.max(FLOOR_Y, PIVOT_Y - Math.sin(p) * edist);

    const kp = 1 - Math.exp(-dt * 6);
    this.camPos.x += (targetX - this.camPos.x) * kp;
    this.camPos.y += (targetY - this.camPos.y) * kp;
    this.camPos.z += (targetZ - this.camPos.z) * kp;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(headX, PIVOT_Y, headZ);
    // 근접(준1인칭) 또는 고피치(위 보기)에서는 아바타가 시야를 가리므로 숨김
    this.avatar.visible = edist > 0.95 && p < 1.05;
  }

  _segHit(x, z) {
    const M = 0.15;
    for (const c of this.colliders) {
      if (x > c.minX - M && x < c.maxX + M && z > c.minZ - M && z < c.maxZ + M) return true;
    }
    return false;
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function smoothAngle(cur, target, k) {
  if (!isFinite(target)) return isFinite(cur) ? cur : 0;
  if (!isFinite(cur)) return target;
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
}
