# 빈센트 반고흐 
영혼의 그림자 — 배포본

이 폴더는 **완전 자기완결 정적 사이트**입니다. 외부 CDN 의존이 없으며,
압축을 풀어 아무 정적 호스팅에 올리면 즉시 동작합니다.

## ① GitHub Pages 로 배포
1. GitHub 에서 새 저장소를 만든다(예: `my-museum`).
2. 이 폴더 안의 **모든 파일**을 저장소에 업로드(끌어다 놓기).
3. Settings → Pages → Branch 를 `main` / `/(root)` 로 지정하고 저장.
4. 잠시 후 `https://<사용자명>.github.io/my-museum/` 에서 관람할 수 있다.

## ② 자체 호스팅
- 웹서버(Nginx/Apache/NAS Web Station 등)의 공개 폴더에 이 폴더를 그대로 업로드.

## ③ 로컬에서 확인
`file://` 로 직접 열면 동작하지 않습니다(브라우저 보안 정책).
폴더에서 아래 중 하나를 실행 후 표시되는 주소로 접속하세요.
```
python -m http.server 8000
# 또는
npx http-server -p 8000 -c-1
```

## 저작권
- 전시 작품: 퍼블릭 도메인.
- 업로드한 패턴·이미지의 저작권 확인은 제작자 책임입니다.
- 번들 오픈소스 고지: `NOTICE.md` (three.js MIT, Pretendard OFL, Noto Serif KR OFL).
