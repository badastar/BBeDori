# 10단계 최종 완료 보고서 — 빼도리 온라인 전시회 리뉴얼 (`renewal-completion-report.md`)

- **작성일**: 2026-11-11
- **프로젝트 저장소**: https://github.com/badastar/BBeDori
- **운영 사이트**: https://bbedori.vercel.app/
- **기술 스택**: 순수 HTML5 / CSS3 / 바닐라 JavaScript / JSON / Markdown (빌드 도구·DB·백엔드 미사용)

---

## 1. 최종 구현 기능 목록

1. **다크 에디토리얼 전시장 히어로 (3단계)**
   - `BBEODORI — A Small World, A Beautiful Life.` 콘셉트의 차분한 차콜(`#171717`) 전시장 무대
   - 상단 미니멀 헤더(`홈`, `전시작품` 메뉴 + `전시장 입장하기` CTA)
   - 세로형 대표 작품 1점 집중 쇼케이스(`aspect-ratio: 1640 / 2360`, `object-fit: contain` 비율 보존, 로딩 실패 대체 UI) 및 작품명·설명 발췌문 동기화
2. **대표 작품 8점 캐러셀 (4단계)**
   - 지정 순번(`01 / 08` ~ `08 / 08`), 이전/다음(`←`/`→`) 버튼, 하단 인디케이터 닷, 키보드 화살표 및 모바일 좌우 스와이프 지원
   - 6초(`6000ms`) 자동 전환, 수동 조작 시 12초 일시 정지, 상세 모달 열기/브라우저 탭 비활성화/`prefers-reduced-motion: reduce` 활성화 시 자동 전환 중지
   - 대표작 1점 이하 시 네비게이션 자동 숨김·비활성 처리, 2·3·8점 모두 지원
3. **자연의 빛과 반딧불이 입자 효과 (5단계)**
   - CSS 기반 은은한 스포트라이트 광채와 반딧불이 입자 8개 (`pointer-events: none`으로 클릭 방해 없음)
   - 모바일(`<=760px`) 4개 축소, `prefers-reduced-motion: reduce` 시 완전 비활성화
4. **전시장 입장 인터랙션 (6단계)**
   - `전시장 입장하기` / `전시작품` 클릭 시 짧고 부드러운 갤러리 페이드-업 전환(PC `0.42s`, 모바일 `0.22s`), URL 해시(`#gallerySection`) 및 포커스 이동으로 뒤로가기·새로고침 지원
5. **가나다 순 전체 작품 Masonry 갤러리 & 71개 공통 설명 (2단계 + 추가 요청)**
   - 전체 71점을 한국어 이름 **가나다 순**(`메도리` → `메도리(1)` 보정 포함)으로 정렬
   - 71점 전체에 대해 `data/descriptions/<작품명>.md` 공통 작품 이야기 + 클릭 가능한 유튜브 채널 링크(`https://www.youtube.com/@빼도리`) 생성
6. **화이트 뮤지엄 상세 감상 뷰어 개선 (기존 보존 + 버튼 배치 개선)**
   - 하단 버튼 배치: 1행 좌측 `← 이전 작품` / 우측 `다음 작품 →`, 2행 줄바꿈 우측 정렬 `[▶ 슬라이드] [5초 v]`
   - 조건부 `youtube-nocookie.com` 16:9 임베드 모듈, 자동 슬라이드(3/5/10/15/30초), 키보드(`←`/`→`/`ESC`), 모바일 스와이프, `?art=` 딥링크 보존
7. **푸터 크레딧 및 외부 채널 링크 (5·9단계 추가 요청)**
   - 하단 전시 소개 2줄 정리
   - 아이콘 단독 배치(`target="_blank" rel="noopener noreferrer"`): Font Awesome 유튜브 아이콘(`https://www.youtube.com/@%EB%B9%BC%EB%8F%84%EB%A6%AC%EB%84%A4`), `#087f8c` 둥근 정사각 `M` 로고(`http://datalyx.co.kr/`)
   - 크레딧 문구: `Static Digital Art Gallery · Powerd by NpDidim` (`https://npdidim.com`, 새 창)

---

## 2. 변경·추가된 파일 목록

- **수정된 파일**:
  - `index.html`: 전시장 히어로·캐러셀·입자 레이어, 인라인 SVG 파비콘, 푸터 2줄 소개·아이콘·`NpDidim` 크레딧 반영
  - `css/style.css`: 다크 히어로·캐러셀·입자·입장 전환·상세 하단 버튼 정렬·푸터 아이콘/링크·WCAG AA 대비(`--accent-on-light: #c84212`) 스타일 반영
  - `js/data-parser.js`: 한국어 로케일(`ko-KR`) 가나다 순 정렬, `featuredOrder` 우선 추출, 안전 URL 자동 링크, `width`/`height` 전달 추가
  - `js/app.js`: `renderHeroFeatured`, `goToFeatured`, `startHeroAutoplay`/`stopHeroAutoplay`, `enterExhibition`, `applyImageDimensions`, `popstate` 처리 추가
  - `data/manifest.json`: 71점 가나다 순 재정렬, 대표작 8점(`featured: true`, `featuredOrder: 1~8`), 전 작품 실측 `width`/`height` 반영
  - `data/descriptions/가도리.md`: 공통 작품 설명 및 유튜브 채널 링크로 갱신
  - `README.md`: Vercel 운영 URL·자동 배포·신규 기능·폴더 구조 기준으로 현행화
- **추가된 파일**:
  - `data/descriptions/` 내 70개 신규 `.md` 파일 (`갈도리.md` ~ `화열도리.md`, 총 71개 완비)
  - `docs/initial-audit.md` (1단계 진단 보고서)
  - `docs/featured-artworks.md` (2단계 대표작 선정 문서)
  - `docs/renewal-completion-report.md` (본 10단계 최종 완료 보고서)
  - `빼도리 온라인 전시회 — 첫 화면을 사로잡는 기능 기획.md` (기획 지시서)

---

## 3. 선정된 대표 작품 8점 및 식별자

| 순서 (`featuredOrder`) | ID | 작품명 | 파일 경로 | 해상도 |
| :---: | :---: | :--- | :--- | :---: |
| 1 | `art018` | 땅강도리 | `assets/artworks/땅강도리.png` | `1640 × 2360` |
| 2 | `art019` | 매도리 | `assets/artworks/매도리.PNG` | `1640 × 2360` |
| 3 | `art049` | 장수말벌 | `assets/artworks/장수말벌.PNG` | `1640 × 2360` |
| 4 | `art005` | 고잠도리 | `assets/artworks/고잠도리.png` | `1640 × 2360` |
| 5 | `art007` | 귀뚜도리 | `assets/artworks/귀뚜도리.png` | `1640 × 2360` |
| 6 | `art066` | 호박벌 | `assets/artworks/호박벌.png` | `1640 × 2360` |
| 7 | `art024` | 미도리 | `assets/artworks/미도리.PNG` | `1640 × 2360` |
| 8 | `art067` | 호주불개미 | `assets/artworks/호주불개미.png` | `1640 × 2360` |

> 대표작 8점은 기존 71점 전체 목록에도 단일 항목으로 그대로 유지되며 중복 카드가 생성되지 않습니다.

---

## 4. 기존 기능 보존 여부

- **보존 완료**: 71점 Masonry 갤러리, 검색·카테고리 필터, 화이트 상세 감상 뷰어, Markdown 설명 렌더링, 조건부 `youtube-nocookie.com` 임베드 모듈(`js/youtube.js`), 이전/다음·키보드(`←`/`→`/`ESC`)·모바일 스와이프·자동 슬라이드쇼(3~30초), `?art=` 딥링크 모두 정상 유지됩니다.

---

## 5. 데스크톱·모바일 테스트 결과 (Chrome Headless)

- **로컬 6개 표준 뷰포트 검증 (`STAGE8_PASS`, HTTP 오류 `0건`)**:
  - 작은 모바일 (`360×800`): 통과 (`scrollW=345`, 가로 넘침 없음, 상세 모달 정상)
  - 일반 모바일 (`390×844`): 통과 (`scrollW=375`, 가로 넘침 없음, 상세 모달 정상)
  - 큰 모바일 (`430×932`): 통과 (`scrollW=415`, 가로 넘침 없음, 상세 모달 정상)
  - 태블릿 (`768×1024`): 통과 (`scrollW=753`, 가로 넘침 없음)
  - 노트북 (`1366×768`): 통과 (`scrollW=1351`, 가로 넘침 없음)
  - 데스크톱 (`1920×1080`): 통과 (`scrollW=1905`, 푸터 설명 `2.00줄`, 상세 하단 버튼 정렬 오차 `0px`)
- **회귀 테스트 (`STAGE7_PASS`)**: 71/71 이미지 디코딩(`naturalWidth > 0`), 가나다 순 정렬, 대표작 중복 없음, 검색·필터·이전/다음·딥링크(`?art=art018`), JS 오류 `0건`, HTTP `404` `0건` 통과.
- **캐러셀 및 자동 전환 (`STAGE4_PASS`, `STAGE4_AUTOPLAY_PASS`)**: 8/3/2/1점 데이터셋 모두 정상 동작, 수동 클릭 시 일시 정지 및 `prefers-reduced-motion` 환경 자동 억제 확인.

---

## 6. 성능 및 접근성 점검 결과

- **성능**:
  - 첫 화면 대표작 이미지만 `loading="eager"` + `fetchpriority="high"` 우선 로딩, 아래 71점 Masonry 이미지는 모두 `loading="lazy"` 적용.
  - `manifest.json` 71점 전체에 실측 `width`/`height`를 기록해 DOM 이미지 속성에 반영함으로써 레이아웃 이동(CLS) 방지.
  - 원본 이미지(35.59 MB) 무손실 보존 및 외부 JS 라이브러리 미도입.
- **접근성**:
  - 장식 레이어(`.ambient-layer`, `.stage-grid-lines`, `.brand-dots`, `.featured-stage-spotlight`, 아이콘 내부 심볼) `aria-hidden="true"` 처리.
  - 주요 버튼·링크 `aria-label` 및 `44px+` 터치 영역 확보, 밝은 배경용 `--accent-on-light: #c84212` 대비 개선, `prefers-reduced-motion: reduce` 완벽 지원.

---

## 7. 미해결 문제 및 후속 권장사항

1. **카테고리 세분화 (선택)**: 현재 `manifest.json`의 `category`가 모두 `"작품"` 단일 값입니다. 추후 `manifest.json`에서 `"곤충"`, `"동물"`, `"자연"` 등으로 분류명만 수정하면 코드 변경 없이 필터 버튼이 자동 확장됩니다.
2. **개별 유튜브 영상 연결 (선택)**: 현재 71개 `.md` 파일에는 채널 링크만 공통 포함돼 있으며, 특정 작품의 제작 영상 플레이어를 띄우고 싶을 때 해당 `.md` 최상단에 `--- youtube: https://www.youtube.com/watch?v=... ---`를 추가하면 즉시 16:9 플레이어가 활성화됩니다.
3. **로컬 열람 안내**: 브라우저 CORS 정책상 탐색기에서 `index.html`을 직접(`file://`) 열면 `fetch()`가 차단되므로 로컬 확인 시 `python -m http.server 8000` 또는 운영 URL을 이용하세요.

---

## 8. Git 커밋 내역 (`main` 브랜치)

- `c41cc74` — `Initial release: Bbaedorine Online Exhibition (v1.2 pure static)`
- `ae62fbf` — `Simplify top nav (홈, 전시작품) and remove featured showcase section`
- `fb65300` — `docs: add initial project audit and featured artworks documentation`
- `8190b2c` — `feat: sort exhibition alphabetically in Korean and add 71 common artwork descriptions`
- `96568ec` — `feat: add immersive hero showcase, carousel, ambient particles, entrance transition and footer links`
- `ae3abcf` — `docs: update README for Vercel deployment and current features`

---

## 9. Vercel 배포 URL 및 상태

- **배포 URL**: https://bbedori.vercel.app/
- **배포 상태**: **정상 운영 중 (HTTP 200 OK)** — GitHub `origin/main` 푸시와 연동되어 최신 리뉴얼 본이 라이브 반영되었으며, 주요 정적 에셋(`css/style.css`, `js/*.js`, `data/manifest.json`, `땅강도리.md`, `땅강도리.png`) 및 데스크톱/모바일/딥링크(`?art=art018`) 모두 실접속 검증 완료 (`LIVE_VERCEL_PASS`).

---

## 10. 실제 검증 항목 vs 미검증 항목 구분

- **실제 검증 완료 항목**:
  - `manifest.json` 71점·이미지 71개·`.md` 71개 1:1 존재 및 대소문자/해상도 일치 검증
  - Chrome Headless를 통한 6개 정확한 뷰포트(`360×800` ~ `1920×1080`) 레이아웃·가로 넘침 0·접근성 속성·지연 로딩·모션 감소/일반 모드 캐러셀·입장 전환·버튼 정렬·0 JS 오류·0 HTTP 404 검증
  - 운영 URL(`https://bbedori.vercel.app/`) 실접속 HTTP 200 및 데스크톱·모바일 렌더링·딥링크(`?art=art018`) 검증
- **직접 검증하지 못한 항목 (미검증)**:
  - **실데이터 기반 YouTube 영상 재생**: 현재 운영 중인 71개 `.md` 파일에 `youtube:` YAML 영상 ID가 기입된 항목이 0건이므로, YouTube 임베드 기능은 모의 `.md` 데이터 주입 테스트로만 검증되었음
  - **물리적 실기기 터치 스와이프 및 스크린리더 음성**: 터치 이벤트 및 `aria-*` 속성은 코드와 Headless DOM 검증으로 확인했으며, 실제 스마트폰 터치 제스처와 NVDA/VoiceOver 실사용 테스트는 미진행
  - **Vercel 대시보드 내부 빌드 로그 UI**: Vercel 웹 대시보드 화면 자체는 직접 열람하지 않고 실사이트 HTTP/DOM 결과로 배포 성공을 확인함
