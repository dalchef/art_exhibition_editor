/* viewer/css/viewer.css */
@font-face {
  font-family: 'Pretendard';
  src: url('../../vendor/pretendard/PretendardVariable.woff2') format('woff2-variations');
  font-weight: 45 920;
  font-display: swap;
}
@font-face {
  font-family: 'Noto Serif KR';
  src: url('../../vendor/noto-serif-kr/NotoSerifKR-400.woff2') format('woff2');
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: 'Noto Serif KR';
  src: url('../../vendor/noto-serif-kr/NotoSerifKR-700.woff2') format('woff2');
  font-weight: 700; font-display: swap;
}

@font-face {
  font-family: 'Noto Sans KR';
  src: url('../../vendor/noto-sans-kr/NotoSansKR-400.woff2') format('woff2');
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: 'Noto Sans KR';
  src: url('../../vendor/noto-sans-kr/NotoSansKR-700.woff2') format('woff2');
  font-weight: 700; font-display: swap;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #14100e; }
body { font-family: 'Pretendard', system-ui, -apple-system, sans-serif; -webkit-user-select: none; user-select: none; touch-action: none; }
canvas#scene { display: block; width: 100%; height: 100%; }

.overlay {
  position: fixed; inset: 0; z-index: 100;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, #221a15 0%, #100c0a 100%);
  color: #e8dcc4; gap: 18px; transition: opacity .6s ease;
}
.overlay.hidden { opacity: 0; pointer-events: none; }
.load-title { font-size: 22px; font-weight: 700; letter-spacing: .02em; }
.load-bar { width: 260px; height: 4px; background: rgba(255,255,255,.12); border-radius: 3px; overflow: hidden; }
.load-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #c9a24c, #e6c878); transition: width .25s ease; }
.load-pct { font-size: 13px; color: #b6a986; }

#hud { position: fixed; inset: 0; z-index: 50; pointer-events: none; }
#hud > * { pointer-events: auto; }

/* 근접 프롬프트 */
.zoom-prompt {
  position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  background: rgba(24,18,14,.82); color: #f0e4cc; border: 1px solid rgba(201,162,76,.55);
  padding: 11px 20px; border-radius: 999px; font-size: 15px; font-weight: 600;
  cursor: pointer; backdrop-filter: blur(6px); box-shadow: 0 6px 24px rgba(0,0,0,.4);
  animation: promptrise .25s ease;
}
@keyframes promptrise { from { opacity: 0; transform: translate(-50%, 8px);} to { opacity: 1; transform: translateX(-50%);} }
.zoom-prompt .kbd {
  display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px;
  padding: 0 6px; border-radius: 6px; background: rgba(201,162,76,.22);
  border: 1px solid rgba(201,162,76,.6); font-size: 13px; font-weight: 700; color: #f0d080;
}

/* 줌 모드 오버레이 */
.zoom-overlay {
  position: fixed; inset: 0; z-index: 200; display: none;
  background: rgba(10,8,7,.94); backdrop-filter: blur(4px);
  grid-template-columns: 1fr minmax(280px, 360px); gap: 0;
  opacity: 0; transition: opacity .3s ease;
}
.zoom-overlay.open { display: grid; opacity: 1; }
@media (max-width: 760px) { .zoom-overlay { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } }
.zoom-stage { overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 3vmin; }
.zoom-img { max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 10px 60px rgba(0,0,0,.6); transform-origin: center; }
.zoom-img.ken-burns { animation: kenburns 18s ease-in-out infinite alternate; }
@keyframes kenburns {
  0%   { transform: scale(1.0) translate(0,0); }
  100% { transform: scale(1.18) translate(-3%, 2%); }
}
.zoom-panel {
  background: linear-gradient(180deg,#1c1611,#141009); color: #e9dcc4;
  padding: 40px 30px; overflow-y: auto; border-left: 1px solid rgba(201,162,76,.18);
}
.zp-title { font-size: 26px; font-weight: 800; line-height: 1.3; color: #f4e8cf; }
.zp-artist { font-size: 17px; font-weight: 500; color: #cdb891; margin-top: 6px; }
.zp-meta { margin-top: 22px; display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 14px; }
.zp-meta dt { color: #9a8a6e; font-weight: 600; }
.zp-meta dd { color: #e2d6be; }
.zp-credit { margin-top: 22px; font-size: 12px; color: #8a7d64; letter-spacing: .02em; }
.zoom-tools { position: fixed; top: 16px; right: 18px; display: flex; gap: 10px; z-index: 210; }
.zoom-tools button {
  background: rgba(30,24,18,.85); color: #e9dcc4; border: 1px solid rgba(201,162,76,.4);
  padding: 9px 15px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
  font-family: inherit;
}
.zoom-tools button.active { background: rgba(201,162,76,.28); color: #f0d080; }

/* P5: 터치 기기 — 닫기/프롬프트 터치 영역 확대 */
@media (pointer: coarse) {
  .zoom-tools { top: max(16px, env(safe-area-inset-top, 16px)); gap: 12px; }
  .zoom-tools button { padding: 14px 22px; font-size: 15px; border-radius: 12px; }
  .zoom-prompt { padding: 14px 26px; font-size: 16px; }
}

/* H 토글: HUD 전체 숨김 (녹화 모드) */
#hud.hidden { display: none; }

/* 풀스크린 캐릭터 선택 (P6) */
.char-select {
  position: fixed; inset: 0; z-index: 300; display: flex; flex-direction: column; align-items: center;
  background: radial-gradient(ellipse at 50% 24%, #2b1f16 0%, #17100b 62%, #0c0805 100%);
  transition: opacity .5s ease; padding: max(3vh, 16px) 16px 22px; overflow: hidden;
}
.char-select.gone { opacity: 0; pointer-events: none; }
.cs-title-wrap { text-align: center; color: #e9dcc4; flex: 0 0 auto; }
.cs-kicker { font-size: 13px; color: #b89b6a; letter-spacing: .1em; margin-bottom: 6px; }
.cs-title { font-family: 'Noto Serif KR', 'Pretendard', serif; font-size: clamp(24px, 4vw, 40px); font-weight: 700; color: #f4e8cf; line-height: 1.25; letter-spacing: .04em; }
.cs-sub { font-size: 15px; color: #cdb891; margin-top: 6px; }
.cs-stage { position: relative; width: min(1080px, 96vw); flex: 1 1 auto; min-height: 240px; }
.cs-canvas, .cs-fx { position: absolute; inset: 0; width: 100%; height: 100%; }
.cs-fx { pointer-events: none; }
.cs-labels { position: absolute; inset: 0; pointer-events: none; }
.cs-name {
  position: absolute; transform: translate(-50%, -100%); font-size: 15px; font-weight: 700;
  color: #cbbfa6; letter-spacing: .12em; transition: color .25s, text-shadow .25s;
}
.cs-name.on { color: #f0d080; text-shadow: 0 0 14px rgba(240,208,128,.5); }
.cs-custom { flex: 0 0 auto; display: flex; flex-direction: column; gap: 10px; align-items: center; margin: 6px 0 4px; }
.cs-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
.cs-lab { font-size: 12px; color: #9a8a6e; font-weight: 700; letter-spacing: .08em; margin-right: 2px; }
.cs-sw { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.cs-sw.on { border-color: #f0d080; box-shadow: 0 0 0 2px rgba(240,208,128,.35); }
.cs-chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px;
  background: rgba(255,255,255,.05); border: 1.5px solid transparent; color: #cbbfa6; font-size: 12px;
  font-family: inherit; cursor: pointer;
}
.cs-chip.on { border-color: #c9a24c; color: #f0e3c4; background: rgba(201,162,76,.13); }
.cs-dot { width: 14px; height: 14px; border-radius: 50%; }
.cs-enter {
  flex: 0 0 auto; margin-top: 8px; width: min(360px, 86vw); padding: 14px; border: none; border-radius: 12px;
  cursor: pointer; background: linear-gradient(90deg,#c9a24c,#e6c878); color: #2a1e0e;
  font-family: inherit; font-size: 16px; font-weight: 800;
}
.cs-enter:hover { filter: brightness(1.06); }

/* 조작법 팝업 */
.help-pop {
  position: fixed; inset: 0; z-index: 320; display: flex; align-items: center; justify-content: center;
  background: rgba(8,6,4,.66); backdrop-filter: blur(3px);
}
.help-card {
  width: min(400px, 92vw); background: linear-gradient(180deg,#211913,#171009);
  border: 1px solid rgba(201,162,76,.25); border-radius: 16px; padding: 26px 24px; color: #e9dcc4;
  box-shadow: 0 24px 80px rgba(0,0,0,.6);
}
.help-title { font-size: 17px; font-weight: 800; color: #f0e3c4; margin-bottom: 14px; text-align: center; letter-spacing: .06em; }
.help-grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; align-items: center; font-size: 13px; }
.help-grid .gk { font-weight: 700; color: #f0d080; background: rgba(201,162,76,.14); border: 1px solid rgba(201,162,76,.35); border-radius: 6px; padding: 3px 9px; font-size: 12px; text-align: center; }
.help-grid span:not(.gk) { color: #c3b596; }
.help-skip { display: flex; align-items: center; gap: 7px; margin-top: 16px; font-size: 12px; color: #9a8a6e; cursor: pointer; }
.help-start {
  margin-top: 14px; width: 100%; padding: 12px; border: none; border-radius: 10px; cursor: pointer;
  background: linear-gradient(90deg,#c9a24c,#e6c878); color: #2a1e0e; font-family: inherit; font-size: 15px; font-weight: 800;
}

/* 인게임 힌트 */
.ingame-hint {
  position: fixed; top: 16px; left: 16px; font-size: 13px; color: #e9dcc4;
  background: rgba(20,14,10,.5); padding: 7px 13px; border-radius: 8px; backdrop-filter: blur(4px);
}
.ingame-hint b { color: #f0d080; }

/* 모바일 조이스틱 */
.joy-zone { position: fixed; left: 0; bottom: 0; width: 45vw; height: 45vh; z-index: 60; }
.joy-base {
  position: absolute; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%;
  background: rgba(255,255,255,.08); border: 1.5px solid rgba(255,255,255,.22); opacity: .5;
  left: 100px; top: calc(100% - 110px);
}
.joy-knob {
  position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px;
  border-radius: 50%; background: rgba(201,162,76,.55); border: 1.5px solid rgba(240,208,128,.7);
}

/* 3D 편집 바 (P2 — ?preview=1&edit=1 전용) */
.edit-bar {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 120;
  display: flex; align-items: center; gap: 10px;
  background: rgba(20,16,12,.85); border: 1px solid rgba(110,163,214,.5); border-radius: 10px;
  padding: 8px 14px; color: #dfe8f2; backdrop-filter: blur(6px); font-size: 12px;
}
.eb-badge { font-weight: 800; color: #6ea3d6; letter-spacing: .06em; }
.edit-bar button {
  background: rgba(110,163,214,.15); border: 1px solid rgba(110,163,214,.5); color: #cfe2f4;
  border-radius: 7px; padding: 6px 11px; font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
}
.edit-bar button.on { background: rgba(110,163,214,.4); color: #fff; }
.eb-hint { color: #93a3b3; line-height: 1.5; }

/* 시계 오버레이 (T) */
.clock-overlay {
  position: fixed; left: 22px; bottom: 22px; z-index: 55;
  background: rgba(18,13,9,.62); border: 1px solid rgba(255,255,255,.12); border-radius: 14px;
  padding: 12px 18px; color: #f2e9d6; text-align: left; backdrop-filter: blur(6px);
  box-shadow: 0 6px 24px rgba(0,0,0,.35);
}
.clk-time { display: block; font-size: 22px; font-weight: 700; letter-spacing: .02em; }
.clk-date { display: block; font-size: 13px; color: #c2b192; margin-top: 2px; }

