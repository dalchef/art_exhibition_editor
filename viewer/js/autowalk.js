// viewer/js/autowalk.js — (M7) 오토 도슨트 워크.
// P: route 순서대로 자동 보행. 각 작품 정지점에서 dwell 초 대기 + 작품 응시.
// 룸 간 이동은 문 중심 경유 직선(선형 구조라 경로탐색 불필요). 아무 키나 누르면 해제.
import { wallLeftToWorld } from '../../shared/schema.js';

const VIEW_DIST = 2.0;   // 작품 앞 정지 거리
const SPEED = 1.6;       // 오토워크 이동 속도(느긋하게)

export class AutoWalk {
  constructor(controls, anchors, layout, project, opts = {}) {
    this.controls = controls;
    this.anchors = anchors;
    this.layout = layout;
    this.project = project;
    this.dwell = opts.dwell ?? 4;
    this.active = false;
    this.waypoints = [];
    this.wi = 0;
    this.state = 'idle';
    this.timer = 0;
    this._byId = {}; for (const a of anchors) this._byId[a.id] = a;
  }

  toggle() { this.active ? this.stop() : this.start(); }

  start() {
    const route = (this.project.route || []).filter(id => this._byId[id]);
    if (!route.length) return;
    this.active = true;
    this.state = 'move'; this.wi = 0;
    this.controls.enabled = false;
    this.waypoints = this._buildPath(route);
    this._cancel = () => this.stop();
    window.addEventListener('keydown', this._onKey = (e) => { if (e.key.toLowerCase() !== 'p') this.stop(); });
    window.addEventListener('pointerdown', this._cancel);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    // 유효한 각도로 복원(오토워크 종료 후 자유보행이 NaN 상태를 물려받지 않도록)
    const y = this.controls.avatar.rotation.y;
    if (isFinite(y)) { this.controls.avatarYaw = y; this.controls.camYaw = y; }
    this.controls.enabled = true;
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('pointerdown', this._cancel);
  }

  // route → [{x,z, look?:{x,z}, dwell?:bool}] (문 경유 + 작품 정지점)
  _buildPath(route) {
    const wps = [];
    let curRoom = this._roomOf(this.controls.pos.x, this.controls.pos.y);
    for (const id of route) {
      const a = this._byId[id];
      const targetRoom = a.roomIndex;
      // 로비(-1) 출발이면 먼저 로비→room[0] 문 중심을 경유 (벽 통과 방지)
      if (curRoom === -1 && targetRoom >= 0) {
        const lb = this.layout.lobby;
        wps.push({ x: (lb.xMin + lb.xMax) / 2, z: lb.zMin });
        curRoom = 0;
      }
      // 로비 작품(target -1)로 돌아가는 경우: 룸 문들을 역순 경유 후 로비 문
      if (targetRoom === -1 && curRoom >= 0) {
        for (let r = curRoom - 1; r >= 0; r--) wps.push(this._doorPoint(r));
        const lb = this.layout.lobby;
        wps.push({ x: (lb.xMin + lb.xMax) / 2, z: lb.zMin + 0.1 });
        curRoom = -1;
      }
      // 룸 간 이동: 사이 문 중심을 경유
      if (targetRoom > curRoom && curRoom >= 0) {
        for (let r = curRoom; r < targetRoom; r++) wps.push(this._doorPoint(r));
      } else if (targetRoom < curRoom) {
        for (let r = curRoom - 1; r >= targetRoom; r--) wps.push(this._doorPoint(r));
      }
      curRoom = targetRoom;
      // 작품 앞 정지점
      const vx = a.center.x + a.normal.x * VIEW_DIST;
      const vz = a.center.z + a.normal.z * VIEW_DIST;
      wps.push({ x: vx, z: vz, look: { x: a.center.x, z: a.center.z }, dwell: true });
    }
    return wps;
  }

  _doorPoint(roomIndex) {
    const room = this.project.rooms[roomIndex];
    const rect = this.layout.rooms[roomIndex].rect;
    if (!room.exitDoor) { // 로비→room0 통로는 room0 남쪽 중앙
      return { x: (rect.xMin + rect.xMax) / 2, z: rect.zMax + 0.1 };
    }
    const d = wallLeftToWorld(rect, room.exitDoor.wall, room.exitDoor.offset);
    return { x: d.x, z: d.z };
  }

  _roomOf(x, z) {
    for (let i = 0; i < this.layout.rooms.length; i++) {
      const r = this.layout.rooms[i].rect;
      if (x >= r.xMin - 0.3 && x <= r.xMax + 0.3 && z >= r.zMin - 0.3 && z <= r.zMax + 0.3) return i;
    }
    const lb = this.layout.lobby;
    if (lb && x >= lb.xMin - 0.3 && x <= lb.xMax + 0.3 && z >= lb.zMin - 0.3 && z <= lb.zMax + 0.3) return -1;
    return 0;
  }

  update(dt) {
    if (!this.active) return;
    const c = this.controls;
    if (this.wi >= this.waypoints.length) { this.stop(); return; }
    const wp = this.waypoints[this.wi];

    if (this.state === 'wait') {
      this.timer -= dt;
      // 응시 방향 유지
      if (wp.look) { const y = Math.atan2(wp.look.x - c.pos.x, wp.look.z - c.pos.y); if (isFinite(y)) c.avatarYaw = y; }
      c.camYaw = lerpAngle(c.camYaw, c.avatarYaw, dt * 1.5);
      if (this.timer <= 0) { this.wi++; this.state = 'move'; }
      if (c.avatar.userData.update) c.avatar.userData.update(dt, false, 0);
      return;
    }

    // move
    const dx = wp.x - c.pos.x, dz = wp.z - c.pos.y;
    const dist = Math.hypot(dx, dz);
    if (!(dist > 0.06)) {   // 도착(또는 dist가 NaN인 방어)
      if (wp.dwell) { this.state = 'wait'; this.timer = this.dwell; }
      else this.wi++;
      return;
    }
    const step = Math.min(dist, SPEED * dt);
    c.pos.x += (dx / dist) * step;
    c.pos.y += (dz / dist) * step;
    c.avatarYaw = Math.atan2(dx, dz);
    if (!isFinite(c.camYaw)) c.camYaw = c.avatarYaw;
    c.camYaw = lerpAngle(c.camYaw, c.avatarYaw, dt * 2.2);
    if (c.avatar.userData.update) c.avatar.userData.update(dt, true, 1);
  }
}

function lerpAngle(cur, target, k) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
}
