# 2단계 산출물 — 작품 데이터 정렬 및 대표 작품 선정 (`featured-artworks.md`)

- **작성일**: 2026-11-11
- **전시 정렬 기준**: 작품명 **가나다 순** (`data/manifest.json` `order` 1~71 및 `js/data-parser.js` 한국어 로케일 `ko-KR` 정렬 동시 적용)
- **대표 작품 구성**: 사용자 지정 **8점** (`featured: true`, `featuredOrder: 1~8`)

---

## 1. 스키마 및 정렬 호환성 설계

기존 `data/manifest.json` 스키마(`id`, `filename`, `category`, `description`, `order`, `featured`)를 그대로 유지하면서, 대표 작품이 가나다 순과 별개의 지정 순서로 노출될 수 있도록 선택 필드 `featuredOrder`만 최소 확장했습니다.

```json
{
  "id": "art018",
  "filename": "땅강도리.png",
  "category": "작품",
  "description": "땅강도리.md",
  "order": 18,
  "featured": true,
  "featuredOrder": 1
}
```

- **전체 목록 정렬 (`normalizeManifest`)**: `title.localeCompare(..., 'ko-KR', { numeric: true, sensitivity: 'base' })`를 적용해 `가도리` → `화열도리` 가나다 순으로 정렬하며, `메도리`가 `메도리(1)`보다 먼저 오도록 보정했습니다.
- **대표작 추출 (`getFeaturedArtworks`)**: `featured === true` 항목을 추출해 `featuredOrder` 오름차순으로 정렬합니다. 중복 등록이나 전체 목록에서의 제거 없이 단일 항목으로 관리합니다.
- **예비 동작**: 대표작이 0점~2점이거나 일부 누락되어도 갤러리 로딩이 중단되지 않도록 방어 처리되어 있습니다.

---

## 2. 선정된 대표 작품 8점 목록 (실물·해상도·설명 연결 검증 완료)

| 순서 (`featuredOrder`) | ID | 작품명 | 실제 파일명 | 해상도 / 비율 | 설명 파일 |
| :---: | :---: | :--- | :--- | :---: | :--- |
| 1 | `art018` | 땅강도리 | `assets/artworks/땅강도리.png` | `1640 × 2360` (0.695) | `data/descriptions/땅강도리.md` |
| 2 | `art019` | 매도리 | `assets/artworks/매도리.PNG` | `1640 × 2360` (0.695) | `data/descriptions/매도리.md` |
| 3 | `art049` | 장수말벌 | `assets/artworks/장수말벌.PNG` | `1640 × 2360` (0.695) | `data/descriptions/장수말벌.md` |
| 4 | `art005` | 고잠도리 | `assets/artworks/고잠도리.png` | `1640 × 2360` (0.695) | `data/descriptions/고잠도리.md` |
| 5 | `art007` | 귀뚜도리 | `assets/artworks/귀뚜도리.png` | `1640 × 2360` (0.695) | `data/descriptions/귀뚜도리.md` |
| 6 | `art066` | 호박벌 | `assets/artworks/호박벌.png` | `1640 × 2360` (0.695) | `data/descriptions/호박벌.md` |
| 7 | `art024` | 미도리 | `assets/artworks/미도리.PNG` | `1640 × 2360` (0.695) | `data/descriptions/미도리.md` |
| 8 | `art067` | 호주불개미 | `assets/artworks/호주불개미.png` | `1640 × 2360` (0.695) | `data/descriptions/호주불개미.md` |

### 선정 근거 및 특징
1. 사용자 지정 8점 모두 `1640 × 2360px` 세로형 비율(`0.695`)을 갖추어 향후 3단계 히어로 캐러셀에서 일관된 구도로 전시할 수 있습니다.
2. 곤충·동물·자연 테마의 다채로운 색감과 형태가 뚜렷해 첫 화면 시선 집중에 적합합니다.
3. 8점 및 나머지 63점을 포함한 **71점 전체**에 대해 `data/descriptions/<작품명>.md` 공통 설명 파일 생성이 완료되어 상세 보기 시 404 오류가 발생하지 않습니다.

---

## 3. 공통 작품 설명 적용 현황 (`data/descriptions/*.md`)

- `가도리.md` ~ `화열도리.md`까지 **총 71개** Markdown 파일 일괄 생성 완료.
- 모든 파일에 요청하신 공통 작품 이야기 및 유튜브 채널 주소(`https://www.youtube.com/@빼도리`)를 반영했으며, `js/data-parser.js`의 안전 자동 링크 처리로 상세 화면에서 클릭 가능한 링크로 렌더링됩니다.
- *(참고: 개별 작품의 제작 과정 유튜브 영상 URL이 추가되는 경우, 해당 `.md` 파일 최상단 YAML에 `--- youtube: https://... ---`만 추가하면 기존 16:9 임베드가 자동 활성화됩니다.)*
