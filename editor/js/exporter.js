// editor/js/exporter.js — Publish: 완전 자기완결 정적 사이트 ZIP 생성.
// 배포 번들 구조({slug}/):
//   index.html           (viewer/index.html 을 루트로 이식 + OG 메타)
//   viewer/js|css/…      (엔진)
//   shared/schema.js
//   vendor/three*, pretendard woff2   (jszip 제외)
//   data/museum.json     (docentNote 제거)  + data/assets/{artworks,thumbs}/*
//   NOTICE.md, README.md
export async function exportPublishZip(store) {
  const JSZip = window.JSZip;
  const zip = new JSZip();
  const slug = (store.project.meta.slug || 'museum').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const base = zip.folder(slug);

  // 1) 엔진 파일 목록 = manifest 기준(경로 이중관리 방지)
  const manifest = await (await fetch('../viewer/manifest.json')).json();
  const copy = async (path, dest) => {
    const res = await fetch('../' + path);
    if (!res.ok) throw new Error(`엔진 파일 없음: ${path}`);
    base.file(dest || path, await res.blob());
  };
  for (const p of manifest.viewer) if (!p.endsWith('index.html')) await copy(p);
  for (const p of manifest.shared) await copy(p);
  for (const p of manifest.vendor) await copy(p);
  for (const p of manifest.root) await copy(p);

  // 2) 데이터 + 에셋 (data/ 하위에 배치 → 뷰어 baseDir 로직과 일치)
  const proj = JSON.parse(JSON.stringify(store.project));
  delete proj._library;
  let coverThumb = '';
  const firstId = (proj.route && proj.route[0]) || null;
  const packArt = (a) => {
    delete a.docentNote;          // §4: 배포본에서 반드시 제거
    delete a._px;
    delete a._screen;
    const im = store.images.get(a.id);
    if (im) {
      const ext = im.blob.type.includes('webp') ? 'webp' : im.blob.type.includes('png') ? 'png' : 'jpg';
      a.image = `assets/artworks/${a.id}.${ext}`;
      a.thumb = `assets/thumbs/${a.id}.${ext}`;
      base.file(`data/${a.image}`, im.blob);
      base.file(`data/${a.thumb}`, im.thumbBlob || im.blob);
      if (a.id === firstId || !coverThumb) coverThumb = `data/${a.thumb}`;
    }
  };
  for (const r of proj.rooms) for (const a of (r.artworks || [])) packArt(a);
  for (const a of (proj.lobby?.artworks || [])) packArt(a);  // P3 로비 포스터

  // 커스텀 패턴 (P5): assets/patterns/ 로 포함 + 경로 재작성
  const packPattern = (holder, field) => {
    const id = holder?.[field];
    if (!id || String(id).startsWith('assets/')) return;
    const im = store.images.get(id);
    if (!im) return;
    const ext = im.blob.type.includes('webp') ? 'webp' : im.blob.type.includes('png') ? 'png' : 'jpg';
    const path = `assets/patterns/${id}.${ext}`;
    holder[field] = path;
    base.file(`data/${path}`, im.blob);
  };
  for (const r of proj.rooms) { packPattern(r.wall, 'patternAsset'); packPattern(r.floor, 'asset'); }
  if (proj.lobby) { packPattern(proj.lobby.wall, 'patternAsset'); packPattern(proj.lobby.floor, 'asset'); }

  base.file('data/museum.json', JSON.stringify(proj, null, 2));

  // 3) 루트 index.html (viewer/index.html 이식 + 경로 재작성 + OG 메타)
  const viewerHtml = await (await fetch('../viewer/index.html')).text();
  base.file('index.html', buildIndexHtml(viewerHtml, proj.meta, coverThumb));

  // 4) 배포 README (한국어)
  base.file('README.md', deployReadme(proj.meta, slug));

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${slug}.zip`);
  return blob;
}

function buildIndexHtml(html, meta, coverThumb) {
  const og = `
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escAttr(meta.title || '온라인 미술관')}">
  <meta property="og:description" content="${escAttr((meta.intro || meta.subtitle || '').slice(0, 120))}">
  ${coverThumb ? `<meta property="og:image" content="${coverThumb}">` : ''}
  <meta name="twitter:card" content="summary_large_image">`;
  return html
    .replace('<title>온라인 미술관</title>', `<title>${escHtml(meta.title || '온라인 미술관')}</title>${og}`)
    .replace('href="css/viewer.css"', 'href="viewer/css/viewer.css"')
    .replace('src="js/main.js"', 'src="viewer/js/main.js"');
}

function deployReadme(meta, slug) {
  return `# ${meta.title || '온라인 미술관'} — 배포본

이 폴더는 **완전 자기완결 정적 사이트**입니다. 외부 CDN 의존이 없으며,
압축을 풀어 아무 정적 호스팅에 올리면 즉시 동작합니다.

## ① GitHub Pages 로 배포
1. GitHub 에서 새 저장소를 만든다(예: \`${slug}\`).
2. 이 폴더 안의 **모든 파일**을 저장소에 업로드(끌어다 놓기).
3. Settings → Pages → Branch 를 \`main\` / \`/(root)\` 로 지정하고 저장.
4. 잠시 후 \`https://<사용자명>.github.io/${slug}/\` 에서 관람할 수 있다.

## ② 자체 호스팅
- 웹서버(Nginx/Apache/NAS Web Station 등)의 공개 폴더에 이 폴더를 그대로 업로드.

## ③ 로컬에서 확인
\`file://\` 로 직접 열면 동작하지 않습니다(브라우저 보안 정책).
폴더에서 아래 중 하나를 실행 후 표시되는 주소로 접속하세요.
\`\`\`
python -m http.server 8000
# 또는
npx http-server -p 8000 -c-1
\`\`\`

## 저작권
- 전시 작품: 퍼블릭 도메인.
- 업로드한 패턴·이미지의 저작권 확인은 제작자 책임입니다.
- 번들 오픈소스 고지: \`NOTICE.md\` (three.js MIT, Pretendard OFL, Noto Serif KR OFL).
`;
}

function triggerDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escHtml(s) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
