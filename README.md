# 빼도리 온라인 전시회 (Bbaedori Online Exhibition)

데이터베이스나 별도 백엔드 서버 없이 순수 HTML / CSS / JavaScript로 구축되어 **GitHub 연동 Vercel**에서 운영되는 개인 온라인 미술관 웹사이트입니다.

- **운영 사이트**: https://bbedori.vercel.app/
- **GitHub 저장소**: https://github.com/badastar/BBeDori

---

## 주요 특징

- **다크 전시장 히어로 & 대표 작품 캐러셀**: 첫 화면에서 세로형 대표 작품(`object-fit: contain`) 8점을 1점씩 집중 전시하며, 이전/다음 버튼·도트·모바일 스와이프 및 6초 자동 전환(수동 조작·탭 이탈·모션 감소 시 자동 정지)을 지원합니다.
- **자연의 빛과 반딧불이 입자 효과**: CSS 기반의 은은한 광채와 빛 입자(`pointer-events: none`, 모바일 축소, `prefers-reduced-motion` 시 비활성)를 적용했습니다.
- **Masonry 전체 작품 갤러리 (가나다 순 정렬)**: 71점 전체 작품이 한국어 이름 가나다 순으로 정렬되며, 원본 세로 비율을 유지한 Masonry 배치, 카테고리 필터, 작품명 검색을 제공합니다.
- **화이트 뮤지엄 상세 감상 화면**: 작품 이미지 · 파일명 기반 자동 작품명 · Markdown 설명 · 선택적 YouTube `youtube-nocookie.com` 16:9 영상 · 자동 슬라이드(3/5/10/15/30초) · 키보드(`←`/`→`/`ESC`) 및 모바일 스와이프를 지원합니다.
- **코드 수정 없는 작품 관리**: HTML, CSS, JavaScript를 수정하지 않고 이미지·Markdown·`manifest.json`만 편집해 새 작품을 추가할 수 있습니다.

---

## 폴더 구조

```text
procreate/
├── index.html                  # 메인 전시장 히어로, Masonry 갤러리, 상세 뷰어
├── README.md                   # 운영 및 작품 추가 가이드
├── .gitignore                  # 보안 키·압축·구버전 서버 파일 차단
├── assets/
│   └── artworks/               # 전시 작품 이미지 (단일 폴더, 71점)
├── data/
│   ├── manifest.json           # 작품 목록, 분류, 가나다 정렬 순서, 대표작 여부, 해상도
│   └── descriptions/           # 작품별 Markdown 설명 및 선택적 유튜브 링크 (71개)
├── css/
│   └── style.css               # 다크 히어로·캐러셀·입자·Masonry·상세뷰 통합 스타일
├── js/
│   ├── data-parser.js          # 파일명 -> 작품명 변환, 가나다 정렬, 안전 Markdown/YAML 파서
│   ├── youtube.js              # 유튜브 URL 검증 및 youtube-nocookie 임베드 모듈
│   └── app.js                  # 히어로 캐러셀, 갤러리 렌더링, 입장 전환, 상세/슬라이드 제어
└── docs/
    ├── initial-audit.md        # 1단계 저장소/운영 사이트 정밀 진단 보고서
    └── featured-artworks.md    # 2단계 대표 작품 선정 및 정렬 기준 문서
```

---

## 새 작품 추가 방법 (HTML/CSS/JS 수정 불필요)

### 1단계. 작품 이미지 넣기
`assets/artworks/` 폴더에 작품 이미지를 넣습니다.
- **파일명이 곧 화면에 표시되는 작품명**이 됩니다.
  - 확장자(`.png`, `.PNG`, `.jpg`, `.webp`)는 자동으로 제거되며, 밑줄(`_`)은 공백으로 변환됩니다.
  - 예: `assets/artworks/메리메리_나무공장.jpg` → 화면 표시 작품명 **`메리메리 나무공장`**
- **주의**: Vercel(Linux) 환경은 **대소문자를 엄격히 구분**하므로, 파일명과 확장자의 대소문자(`.PNG` vs `.png`)를 `manifest.json`과 정확히 일치시켜 주세요.

### 2단계. 작품 설명 & 유튜브 영상 파일 작성 (`data/descriptions/`)
작품 이미지와 동일한 기본 이름으로 `.md` 파일을 생성합니다. (예: `data/descriptions/메리메리_나무공장.md`)

- **개별 유튜브 제작 영상이 있는 작품 예시** (`watch`, `youtu.be`, `embed`, `shorts` 지원):
  ```markdown
  ---
  youtube: https://www.youtube.com/watch?v=영상ID
  ---

  # 작품 설명

  작품에 담긴 이야기를 자유롭게 적습니다.
  ```
- **개별 유튜브 영상이 없는 작품 예시** (`---` 메타데이터 생략 가능):
  ```markdown
  # 작품 설명

  유튜브 주소가 없으면 상세 화면에 영상 플레이어 영역이나 빈 여백이 생성되지 않습니다.
  ```

### 3단계. `data/manifest.json` 목록 등록
`data/manifest.json` 배열에 새 작품 항목을 추가합니다.

```json
{
  "id": "art072",
  "filename": "메리메리_나무공장.jpg",
  "category": "작품",
  "description": "메리메리_나무공장.md",
  "order": 72,
  "featured": false,
  "width": 1640,
  "height": 2360
}
```
- `id`: 고유 식별자 (`art001`, `art072` 등)
- `filename`: `assets/artworks/` 안의 정확한 파일명 (확장자 대소문자 일치)
- `category`: 분류명 (예: `작품`, `곤충`, `동물`, `자연` 등 — 입력값 기준 필터 자동 생성)
- `description`: `data/descriptions/` 안의 `.md` 파일명
- `order`: 기본 순번 (화면에서는 작품명 한국어 **가나다 순** 자동 정렬 적용)
- `featured` / `featuredOrder`: `featured: true` 지정 시 첫 화면 히어로 캐러셀에 노출 (`featuredOrder` 오름차순)
- `width` / `height`: 선택적 원본 해상도 (지정 시 레이아웃 이동 최소화)

> **규칙**: `manifest.json`에는 `title`이나 `youtube` 주소를 중복 기재하지 않습니다.

---

## 로컬 확인 방법

정적 JSON 및 Markdown 파일을 `fetch()`로 읽어오므로, 탐색기에서 `index.html`을 직접 열지 말고 로컬 웹 서버로 실행하세요.

```bash
cd D:\python\MY\procreate
python -m http.server 8000
```
브라우저에서 `http://localhost:8000` 으로 접속해 확인합니다.

---

## Vercel 배포 및 보안 주의사항

1. 이 저장소는 별도 빌드 명령이나 출력 디렉터리(`Output Directory`) 설정 없이 루트 정적 파일 그대로 Vercel에서 호스팅됩니다.
2. GitHub `main` 브랜치에 변경 사항을 푸시하면 Vercel이 자동으로 감지해 약 15~30초 내 `https://bbedori.vercel.app/` 에 반영합니다.
3. **보안 주의**: API 키, 서비스 계정 JSON(`service-account.json`), 비밀번호, `.zip` 백업 파일은 절대 저장소에 포함하지 마세요.
