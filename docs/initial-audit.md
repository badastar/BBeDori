# 빼도리 온라인 전시회 — 1단계 정밀 진단 보고서 (`initial-audit.md`)

- **작성일**: 2026-11-11
- **대상 저장소**: `D:\python\MY\procreate` (`https://github.com/badastar/BBeDori`)
- **운영 URL**: `https://bbedori.vercel.app/`
- **진단 시점 브랜치/커밋**: `main` / `ae62fbf` (`Simplify top nav (홈, 전시작품) and remove featured showcase section`)
- **작업 트리 상태**: 기존 소스 변경 없음 (`빼도리 온라인 전시회 — 첫 화면을 사로잡는 기능 기획.md` 신규 추가만 untracked 상태)

---

## 1. 실제 폴더·파일 구조

```text
procreate/
├── index.html                                           (225줄) 메인 HTML (히어로 + 갤러리 + 상세 모달)
├── README.md                                            (112줄) 운영/작품 추가 안내 문서
├── .gitignore                                           (19줄)  키/압축/구버전 PHP 파일 차단
├── 빼도리 온라인 전시회 — 최종 개발 지시서.md               (727줄) 기존 v1.2 구축 명세서
├── 빼도리 온라인 전시회 — 첫 화면을 사로잡는 기능 기획.md   (506줄) 신규 리뉴얼 작업 지시서
├── css/
│   └── style.css                                        (981줄) 다크 히어로 + Masonry + 화이트 상세 모달 스타일
├── js/
│   ├── data-parser.js                                   (380줄) manifest 정규화, 파일명->작품명, YAML/Markdown XSS 안전 파서
│   ├── youtube.js                                       (151줄) YouTube URL 검증 및 youtube-nocookie.com 임베드 모듈
│   └── app.js                                           (545줄) 상태 관리, 갤러리 렌더링, 상세 뷰어, 슬라이드/키보드/스와이프
├── data/
│   ├── manifest.json                                    (570줄) 전체 작품 목록 JSON (71점)
│   └── descriptions/
│       └── 가도리.md                                     (1개)  샘플 Markdown 설명 파일
└── assets/
    └── artworks/                                        (71개)  실제 작품 이미지 단일 폴더 (.PNG 58, .png 12, .jpg 1)
```

---

## 2. 주요 함수와 데이터 흐름

### 데이터 흐름
1. 페이지 로드(`DOMContentLoaded`) → [`js/app.js`](../js/app.js)의 `init()` 실행
2. `bindEvents()`로 검색, 상세 닫기/이전/다음, 슬라이드, 키보드(`←`/`→`/`ESC`), 모바일 터치 스와이프, TOP 버튼 이벤트 등록
3. `loadArtworks()`가 `fetch('./data/manifest.json')` 수행 → [`js/data-parser.js`](../js/data-parser.js)의 `BbaedoriData.normalizeManifest()` 호출
   - `order` 숫자 오름차순 정렬
   - `deriveTitleFromFilename()`으로 확장자 제거 및 `_` → 공백 변환해 작품명 자동 생성
   - `buildArtworkPath()`, `buildDescriptionPath()`로 `encodeURIComponent()` 경로 인코딩
4. `renderCategoryFilters()` → `applyFiltersAndRender()` → `renderMasonryGrid()` 실행으로 71개 카드 렌더링
5. 초기 진입 시 `handleInitialDeepLink()`가 URL 쿼리(`?art=` 또는 `?id=`) 확인 후 일치 작품이 있으면 `openDetail()` 자동 실행
6. 카드 클릭 시 `openDetail(artworkId, { list, triggerEl })` 호출:
   - `BbaedoriYouTube.clearVideoContainer()`로 기존 `iframe` 즉시 정지/제거
   - `fetchDescriptionMarkdown(art.descriptionUrl)`로 개별 `.md` 비동기 로드 (메모리 캐시 `descriptionCache` 사용, 요청 토큰 `detailRequestToken`으로 빠른 이동 시 경합 방지)
   - `BbaedoriData.parseArtworkMarkdown()`으로 YAML 프론트매터(`youtube`)와 안전 HTML 본문 분리
   - `BbaedoriYouTube.createVideoSectionElement()`로 유효한 YouTube 주소가 있을 때만 `youtube-nocookie.com/embed/{ID}` 생성

### 주요 모듈 및 함수 목록
- `js/data-parser.js` (`window.BbaedoriData`): `escapeHtml`, `deriveTitleFromFilename`, `buildArtworkPath`, `buildDescriptionPath`, `parseYamlFrontmatter`, `renderSafeMarkdown`, `parseArtworkMarkdown`, `normalizeManifest`, `getFeaturedArtworks`
- `js/youtube.js` (`window.BbaedoriYouTube`): `parseYouTubeUrl`, `createVideoSectionElement`, `clearVideoContainer`
- `js/app.js` (`window.BbaedoriApp`): `init`, `loadArtworks`, `renderCategoryFilters`, `applyFiltersAndRender`, `renderMasonryGrid`, `openDetail`, `closeDetail`, `navigateDetail`, `startSlideshow`, `pauseSlideshow`, `stopSlideshow`, `updateUrlQuery`, `handleInitialDeepLink`

---

## 3. 작품 데이터 스키마 예시 (`data/manifest.json`)

```json
{
  "id": "art001",
  "filename": "가도리.PNG",
  "category": "작품",
  "description": "가도리.md",
  "order": 1,
  "featured": false
}
```

- **총 작품 수**: **71점** (`manifest.json` 71개 항목 = `assets/artworks/` 디스크 파일 71개, 1:1 일치)
- **`featured` 필드 현황**: 스키마상 모든 71개 항목에 boolean 타입의 `"featured"` 필드가 이미 존재하며, 현재는 모두 `false`로 설정되어 있음 (`featured: true` 0건).
- **유지되는 유틸리티**: `data-parser.js`의 `getFeaturedArtworks(sortedArtworks, maxCount)` 함수도 그대로 존재함.

---

## 4. 기존 기능 목록 (보존 대상)

1. 다크 에디토리얼 상단 헤더(`빼도리`, `홈`, `전시작품`, `전시 관람하기` CTA) 및 히어로 문구(`작은 생명과 자연을 그리는 시선`)
2. CSS Columns 기반 Masonry 갤러리 (PC 4~5열 / 태블릿 3열 / 모바일 2열, 원본 세로 비율 유지)
3. 카테고리 필터 (`renderCategoryFilters`) 및 실시간 작품명 검색 (`#artworkSearchInput`)
4. 화이트 뮤지엄 상세 모달 (`#detailOverlay`): 좌측 매트 액자 이미지 + 우측 작품 정보/설명
5. 파일명 기반 작품명 자동 생성 및 `data/descriptions/*.md` 비동기 파싱 (XSS 이스케이프 처리 포함)
6. 조건부 YouTube 임베드 (`watch`, `youtu.be`, `embed`, `shorts` 지원, `youtube-nocookie.com`)
7. 상세 화면 이전/다음 순환 이동, 키보드(`←`, `→`, `ESC`), 모바일 스와이프, URL 딥링크(`?art=`)
8. 자동 슬라이드쇼 (시작/일시정지/종료, 3·5·10·15·30초 간격, 닫기 시 자동 종료)
9. `prefers-reduced-motion` 모션 감소 지원 및 TOP 플로팅 버튼

---

## 5. 기준선 테스트 결과 (실제 운영 URL `https://bbedori.vercel.app/` 확인)

| 검증 항목 | 결과 | 근거 (실측 결과) |
| :--- | :---: | :--- |
| 첫 화면 정상 표시 | 통과 | 데스크톱(`1920×1080`), 모바일(`390×844`) 모두 타이틀 및 레이아웃 정상 로드 |
| 작품 목록 로딩 및 작품 수 일치 | 통과 | 데이터 `71점` = 화면 `#galleryCountText` `'총 71점 전시 중'` = `.masonry-card` `71개` (`0점` 버그 미발생) |
| 모든 작품 이미지 HTTP 로딩 | 통과 | 71개 이미지 전체 `HEAD` 요청 `71/71` HTTP `200 OK` 확인 |
| 작품 상세 열기 / 닫기 & 설명 표시 | 통과 | `?art=art001`(`가도리`, `.md` 존재) 본문 표시 확인 / `?art=art002`(`갈도리`, `.md` 미존재) 안내 문구 정상 폴백 확인 |
| 이전/다음, 검색/필터, 가로 스크롤 없음 | 통과(사전 검증) | 커밋 `ae62fbf` 배포 직전 Chrome Headless(`1440×900`, `375×812`)에서 71점/검색/닫기/가로넘침 0 확인 |
| YouTube 영상 연결 작품 실제 재생 | **미검증** | 모듈(`youtube.js`) 테스트는 통과했으나, 현재 `data/descriptions/` 내 유튜브 URL이 들어있는 실데이터 작품이 0건이므로 실데이터 기준 재생은 미검증 |

---

## 6. 발견된 오류, 위험 요소 및 README와 실제 구현의 차이

### 발견된 오류 및 위험
1. **미등록 `.md` 파일 요청 시 브라우저 네트워크 404 발생**:
   - `manifest.json` 71점 전체에 `"description": "<작품명>.md"`가 지정되어 있으나 실제 `data/descriptions/`에는 `가도리.md` 1개만 존재합니다.
   - `galdori`(`art002`) 등 나머지 70점 상세 화면을 열면 JS에서는 예외를 잡아 안내 문구를 표시하지만, 네트워크 탭에는 해당 `.md` 파일에 대한 `404` 요청이 기록됩니다.
2. **직전 UI 변경(`ae62fbf`)으로 대표작 섹션 삭제 상태**:
   - 직전 요청으로 `#featuredSection` HTML/CSS/`renderFeaturedCards` JS가 삭제되고 모든 `featured`가 `false`인 상태이므로, 2~4단계에서 히어로 쇼케이스 및 캐러셀을 새로 안전하게 설계·추가해야 합니다.
3. **로컬 파일 직접 열기(`file://`) 불가**:
   - `fetch('./data/manifest.json')` 구조이므로 `http://localhost`나 Vercel(`https://`)에서는 정상이나, 탐색기에서 `index.html`을 더블클릭하면 `0점`으로 보일 위험이 있습니다.
4. **첫 화면 전시장 몰입감 부족**:
   - 현재 `#homeSection`은 상단 텍스트 히어로(약 300px) 직후 바로 밝은 목록으로 이어져 첫 화면에서 작품을 직접 감상하는 전시회 인상이 약합니다.

### README / 푸터와 실제 구현의 차이
1. **호스팅 표기 불일치**: [`README.md`](../README.md)는 GitHub Pages 배포 기준으로 안내하고, [`index.html`](../index.html#L125) 푸터에도 `Hosted on GitHub Pages`라고 표기되어 있으나, 실제 운영 사이트는 **Vercel (`https://bbedori.vercel.app/`)** 입니다.
2. **대표 작품 기능 불일치**: `README.md` 9행·87행에는 `featured: true` 지정 시 메인 상단 대표 쇼케이스에 최대 3개 노출된다고 적혀 있으나, 현재 `index.html`·`css/style.css`·`js/app.js`에는 해당 섹션이 삭제되어 동작하지 않습니다(`ae62fbf`).
3. **카테고리 필터**: `README.md`에는 `곤충/동물/자연/기타` 예시가 적혀 있으나 실제 `manifest.json`은 모든 항목이 `"category": "작품"` 단일 값입니다.

---

## 7. 2단계 이후 리뉴얼 수정 대상 파일 및 예상 영향

- **수정 예정 파일**:
  1. `data/manifest.json` (2단계): 실제 작품 3점을 `"featured": true`로 지정 (필요 시 대표작 노출 순서를 위한 선택적 `featuredOrder` 또는 기존 `order` 활용 여부 결정).
  2. `index.html` (3~6단계): `#homeSection` 내부에 전시장 히어로 쇼케이스/캐러셀/입자 레이어/입장 CTA 마크업 추가, 9단계에서 푸터 호스팅 문구 정비. (기존 `#gallerySection`, `#detailOverlay` DOM ID와 구조는 그대로 보존)
  3. `css/style.css` (3~6·8단계): `hero-`, `featured-`, `ambient-` 접두어를 사용해 다크 전시장 히어로, 세로 비율 보존(`object-fit: contain`), CSS 입자, 전환 연출 및 반응형/모션 감소 스타일 추가.
  4. `js/app.js` (3~6·8단계): 대표작 3점 히어로 캐러셀(수동 이전/다음, `01 / 03`, 5~7초 자동 전환, 탭 비활성화/수동 조작 시 일시정지, 클릭 시 기존 `openDetail()` 연결) 및 부드러운 전시장 입장 연출 추가.
  5. `README.md` 및 `docs/*` (2~10단계): `docs/featured-artworks.md`, `docs/renewal-completion-report.md` 작성 및 `README.md` 현행화.
- **기존 기능 영향 범위**:
  - `js/data-parser.js` 및 `js/youtube.js`는 그대로 유지하여 기존 파일명→작품명, Markdown/YAML 파서, YouTube 임베드 규칙에 영향 없음.
  - `#masonryGrid`, 검색, 카테고리 필터, `#detailOverlay`, 키보드/스와이프/슬라이드, `?art=` 딥링크 모두 기존 이벤트·DOM ID를 보존하여 회귀 위험을 최소화함.
