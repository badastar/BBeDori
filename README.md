# 빼도리 온라인 전시회 (Bbaedori Online Exhibition)

데이터베이스나 별도 백엔드 서버 없이 **GitHub Pages**에서 동작하는 순수 정적 온라인 미술관 웹사이트입니다.

---

## 주요 특징

- **다크 에디토리얼 메인 + 대표 작품 쇼케이스**: 세로형 작품 비율을 훼손하지 않는(`object-fit: contain`) 좌우 분할 대표 카드 (최대 3점)
- **Masonry 전체 작품 갤러리**: 이미지 원본 비율을 유지하는 반응형 매거진 배치, 카테고리 필터 및 작품명 검색 지원
- **화이트 뮤지엄 상세 감상 화면**: 작품 이미지 · 파일명 기반 자동 작품명 · Markdown 설명 · 선택적 유튜브 영상 · 자동 슬라이드(3/5/10/15/30초) · 키보드(`←`/`→`/`ESC`) 및 모바일 스와이프 지원
- **코드 수정 없는 작품 관리**: HTML, CSS, JavaScript를 수정하지 않고 이미지·Markdown·`manifest.json`만 편집해 새 작품을 추가할 수 있습니다.

---

## 폴더 구조

```text
procreate/
├── index.html                  # 메인 페이지 및 상세 뷰어 구조
├── README.md                   # 운영 및 작품 추가 가이드
├── .gitignore                  # 보안 키·압축 파일 업로드 방지
├── assets/
│   └── artworks/               # 전시 작품 이미지 (단일 폴더)
├── data/
│   ├── manifest.json           # 작품 목록, 분류, 정렬 순서, 대표작 여부
│   └── descriptions/           # 작품별 Markdown 설명 및 선택적 유튜브 링크
├── css/
│   └── style.css               # 전체 반응형 스타일
└── js/
    ├── data-parser.js          # 파일명 -> 작품명 변환 및 안전 Markdown/YAML 파서
    ├── youtube.js              # 유튜브 URL 검증 및 youtube-nocookie 임베드 모듈
    └── app.js                  # 갤러리 렌더링, 상세 뷰어, 슬라이드 제어
```

---

## 새 작품 추가 방법 (HTML/CSS/JS 수정 불필요)

### 1단계. 작품 이미지 넣기
`assets/artworks/` 폴더에 작품 이미지를 넣습니다.
- **파일명이 곧 화면에 표시되는 작품명**이 됩니다.
  - 파일명의 확장자(`.png`, `.PNG`, `.jpg`, `.webp`)는 자동으로 제거됩니다.
  - 밑줄(`_`)은 화면에서 공백으로 변환됩니다.
  - 예: `assets/artworks/메리메리_나무공장.jpg` → 화면 표시 작품명 **`메리메리 나무공장`**
- **주의**: GitHub Pages는 Linux 서버이므로 파일명과 확장자의 **대소문자**(`.png` vs `.PNG`)가 `manifest.json`과 정확히 일치해야 합니다.

### 2단계. 작품 설명 & 유튜브 영상 파일 작성 (`data/descriptions/`)
작품 이미지와 동일한 기본 이름으로 `.md` 파일을 생성합니다. (예: `data/descriptions/메리메리_나무공장.md`)

- **유튜브 영상이 있는 작품 예시** (`watch`, `youtu.be`, `embed`, `shorts` 형식 지원):
  ```markdown
  ---
  youtube: https://www.youtube.com/watch?v=영상ID
  ---

  # 작품 설명

  작품에 담긴 이야기를 자유롭게 적습니다.
  ```
- **유튜브 영상이 없는 작품 예시** (`---` 메타데이터 생략 가능):
  ```markdown
  # 작품 설명

  유튜브 주소가 없으면 상세 화면에 영상 영역과 빈 여백이 전혀 생성되지 않습니다.
  ```
- *(참고: `.md` 파일이 아직 없는 작품도 갤러리에서 정상 표시됩니다.)*

### 3단계. `data/manifest.json` 목록 등록
`data/manifest.json` 배열에 새 작품 항목을 추가합니다.

```json
{
  "id": "art072",
  "filename": "메리메리_나무공장.jpg",
  "category": "자연",
  "description": "메리메리_나무공장.md",
  "order": 72,
  "featured": false
}
```
- `id`: 고유 식별자 (`art001`, `art072` 등 중복 불가)
- `filename`: `assets/artworks/` 안의 정확한 파일명 (확장자 대소문자 일치)
- `category`: 분류명 (예: `곤충`, `동물`, `자연`, `기타` 등 — 입력한 값으로 필터 버튼 자동 생성)
- `description`: `data/descriptions/` 안의 `.md` 파일명
- `order`: 전시 정렬 순서 (숫자가 작을수록 먼저 노출)
- `featured`: `true` 지정 시 메인 상단 대표 쇼케이스에 노출 (`order` 순 최대 3개)

> **규칙**: `manifest.json`에는 `title`이나 `youtube` 주소를 중복 기재하지 않습니다.

---

## 로컬 확인 방법

정적 JSON 및 Markdown 파일을 `fetch()`로 읽어오므로, 탐색기에서 `index.html`을 직접 열지 말고 로컬 웹 서버로 실행하세요.

```bash
cd D:\python\MY\procreate
python -m http.server 8000
```
브라우저에서 `http://localhost:8000` 으로 접속하여 확인합니다.

---

## GitHub Pages 배포 방법 & 보안 주의사항

1. GitHub에서 새 저장소를 생성한 뒤 이 폴더의 파일들을 업로드(Push)합니다.
2. GitHub 저장소의 **Settings > Pages** 메뉴에서:
   - Source: **Deploy from a branch**
   - Branch: **`main`** / **`/(root)`** 선택 후 **Save**
3. 약 1~2분 뒤 `https://<계정명>.github.io/<저장소명>/` 주소로 사이트가 공개됩니다.
4. **보안 주의**: API 키, 서비스 계정 JSON(`service-account.json`), 비밀번호, `.zip` 백업 파일은 절대 저장소에 포함하지 마세요.
