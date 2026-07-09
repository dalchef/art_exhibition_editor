# 온라인 미술관 메이커

퍼블릭 도메인 미술 작품으로 3D 전시 공간을 큐레이팅(**에디터**)하고,
미술관별 독립 정적 사이트로 내보내(**뷰어**) 아바타로 걸어다니며 관람하는 웹 도구.

- 빌드 스텝 없음. 순수 ES Modules + vendored `three.module.js`.
- 스키마 버전: 1

---

## 폴더 구조

```
editor/    에디터(제작 도구) — 평면도/정면뷰/인스펙터/업로드/Publish
viewer/    뷰어(관람 엔진) — 3D 월드/아바타/조작/줌모드/HUD
vendor/    three.js, JSZip, Pretendard (전부 로컬 vendored, CDN 의존 0)
shared/    schema.js (editor·viewer 공용 스키마/검증/레이아웃)
samples/   vincent-demo (샘플 museum.json + 퍼블릭 도메인 작품 3점)
```

---

## 로컬에서 실행하기

`fetch()` 를 사용하므로 **`file://` 로 직접 열면 동작하지 않습니다.**
반드시 로컬 웹서버로 띄워야 합니다. 아래 중 하나를 폴더 루트에서 실행하세요.

```bash
# 방법 A) Python 3 (가장 간단)
python -m http.server 8777

# 방법 B) Node.js 가 있다면
npx http-server -p 8777 -c-1
```

그다음 브라우저에서:

- **에디터**: <http://localhost:8777/editor/>
- **뷰어(샘플 관람)**: <http://localhost:8777/viewer/?src=../samples/vincent-demo/museum.json>
- 뷰어 디버그(공간 조망) 카메라: 위 주소 뒤에 `&cam=orbit`

> 뷰어의 프로덕션 기본 데이터 경로는 `./data/museum.json` 입니다(배포 번들 구조).
> 개발 중에는 `?src=` 파라미터로 임의 museum.json 을 지정합니다.

---

## 사내 NAS(Synology Web Station) 배치

1. Web Station 패키지 설치 → "가상 호스트" 또는 "웹 서비스 포털" 생성.
2. 이 저장소 폴더를 NAS 공유폴더(예: `/web/museum-maker/`)에 업로드.
3. 문서 루트를 해당 폴더로 지정하면 사내 IP로 에디터에 접속 가능.
4. 에디터는 **내부 전용**입니다. 외부 공개는 Publish 로 내보낸 배포본만 사용하세요.

---

## 관람 사이트로 내보내기 (Publish)

에디터의 **[Publish]** 버튼 → 미술관별 ZIP 생성.
압축 해제 후 GitHub Pages 또는 아무 정적 호스팅에 올리면 즉시 동작하는
완전 자기완결 번들입니다(외부 CDN 의존 없음). 자세한 배포법은 내보낸 ZIP 안의
`README.md` 참조.

---

## 라이선스

- 코드: 발주처(슈가풀컴퍼니) 소유.
- 번들 라이브러리 고지: [`NOTICE.md`](NOTICE.md) 참조
  (three.js MIT, JSZip MIT, Pretendard OFL).
- 취급 작품: **퍼블릭 도메인 전용.**
