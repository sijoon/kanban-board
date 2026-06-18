# Kanban Board

To-do / In-progress / Done 3컬럼 칸반보드.
Supabase 인증과 PostgreSQL 기반 카드 저장을 지원합니다.

## 데모

**https://sijoon.github.io/kanban-board/**

## 기능

| 기능 | 설명 |
|------|------|
| 3컬럼 보드 | To-do / In-progress / Done |
| 드래그앤드롭 | 컬럼 간 카드 이동, 드롭 위치 미리보기 |
| 카드 추가 | 각 컬럼 하단 폼, Ctrl+Enter 확인 / Escape 취소 |
| 카드 삭제 | hover 시 X 버튼 표시 |
| 카드 수 배지 | 컬럼 헤더에 실시간 카드 수 표시 |
| 이메일 인증 | 회원가입 / 로그인 / 로그아웃 |
| Google 로그인 | OAuth 2.0 팝업 방식 |
| GitHub 로그인 | OAuth 팝업 방식 |
| 데이터 영속성 | Supabase PostgreSQL에 카드 저장, 로그인 계정별 격리 |
| 모바일 반응형 | 680px 이하 세로 컬럼 배치 |

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 마크업 | HTML5 (Semantic, HTML5 DnD API) |
| 스타일 | CSS3 (Flexbox, CSS 변수, 미디어 쿼리) |
| 로직 | Vanilla JavaScript ES6+ (async/await) |
| 인증 | Supabase Auth (Email / Google / GitHub OAuth) |
| 데이터베이스 | Supabase PostgreSQL (RLS 적용) |
| 배포 | GitHub Pages |
| 빌드 도구 | 없음 (CDN으로 Supabase JS SDK 로드) |

## 파일 구조

```
kanban-board/
├── index.html   — 마크업 (인증 오버레이 + 보드 UI)
├── style.css    — 전체 스타일 (드래그앤드롭 피드백 포함)
└── script.js    — 상태 관리, DnD, Supabase 인증/CRUD
```

## 아키텍처

### 인증 흐름

```
페이지 로드
  → initAuth() → getSession()
      ├── 세션 있음 → showApp() → loadCards()
      └── 세션 없음 → showAuthOverlay()

소셜 로그인 (Google / GitHub)
  → signInWithOAuth() → 팝업 창 → 인증 완료 → 팝업 닫힘
  → onAuthStateChange('SIGNED_IN') → showApp() → loadCards()
```

### 카드 CRUD 패턴 (낙관적 업데이트)

모든 카드 조작은 **UI 먼저 반영 → Supabase API 호출 → 실패 시 롤백** 순서로 동작합니다.

| 조작 | UI | API | 롤백 |
|------|----|-----|------|
| 추가 | tempId로 즉시 렌더 | INSERT → UUID 교체 | DOM 제거 |
| 이동 | 드롭 위치로 즉시 이동 | UPDATE column_id | 이전 컬럼 재렌더 |
| 삭제 | 즉시 DOM 제거 | DELETE | 카드 복원 |

### 데이터베이스 스키마

```sql
cards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  column_id  TEXT NOT NULL CHECK (column_id IN ('todo', 'inprogress', 'done')),
  position   SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

Row Level Security: 인증된 사용자는 본인 카드(`user_id = auth.uid()`)만 접근 가능.

## 로컬 실행

```bash
git clone https://github.com/sijoon/kanban-board.git
cd kanban-board
python3 -m http.server 8080
# http://localhost:8080 접속
```

## Supabase 설정 정보

| 항목 | 값 |
|------|-----|
| Project Ref | `pumjlplxtcljhbwoylbq` |
| Region | Northeast Asia (Seoul) |
| Auth Providers | Email / Google / GitHub |
| Deployed URL | `https://sijoon.github.io/kanban-board/` |
