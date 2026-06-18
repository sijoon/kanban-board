# Kanban Board

To-do / In-progress / Done 3컬럼 칸반보드.  
Supabase Auth + PostgreSQL 기반 사용자 인증 및 카드 저장, 그룹 공유, 활동 기록을 지원합니다.

## 데모

**https://sijoon.github.io/kanban-board/**

---

## 기능

### 보드 기본

| 기능 | 설명 |
|------|------|
| 3컬럼 보드 | To-do / In-progress / Done |
| 드래그앤드롭 | 컬럼 간 카드 이동, 드롭 위치 미리보기(placeholder) |
| 카드 추가 | 각 컬럼 하단 폼, Ctrl+Enter 확인 / Escape 취소 |
| 카드 삭제 | hover 시 ✕ 버튼 표시 |
| 카드 수 배지 | 컬럼 헤더에 실시간 카드 수 표시 |
| 모바일 반응형 | 680px 이하 세로 컬럼 배치 |

### 인증

| 기능 | 설명 |
|------|------|
| 이메일 로그인 | 회원가입 / 로그인 / 로그아웃 |
| Google 로그인 | OAuth 2.0 팝업 방식 |
| GitHub 로그인 | OAuth 팝업 방식 |
| 세션 유지 | 새로고침 후 자동 로그인 복원 |

### 그룹 공유

| 기능 | 설명 |
|------|------|
| 그룹 만들기 | 이름 입력 → 6자리 초대 코드 자동 생성 |
| 코드 참여 | 초대 코드 입력으로 그룹 가입 |
| 멀티 그룹 | 여러 그룹 동시 소속 가능 |
| 보드 전환 | 헤더 셀렉터로 내 보드 ↔ 그룹 보드 전환 |
| 동등 권한 | 모든 그룹 멤버가 카드 추가·이동·삭제 가능 |

### 보드 간 카드 이동

| 기능 | 설명 |
|------|------|
| 개인 → 그룹 | 카드 hover 시 → 버튼, 클릭으로 그룹 이동 |
| 그룹 → 개인 | 카드 hover 시 ← 버튼, 클릭으로 내 보드 복귀 |
| 그룹 선택 모달 | 그룹이 여러 개일 때 대상 그룹 선택 팝업 |

### 활동 기록

| 기능 | 설명 |
|------|------|
| 자동 기록 | 그룹 보드에서 카드 추가·이동·삭제 시 자동 로그 |
| 활동 패널 | 우측 슬라이드 패널에서 최신 50건 표시 |
| 상대 시간 | 방금 / N분 전 / N시간 전 / 어제 형식 |
| 새로고침 | 패널 내 새로고침 버튼으로 최신 기록 재조회 |

---

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

---

## 파일 구조

```
kanban-board/
├── index.html   — 마크업 (인증 오버레이 + 보드 UI + 모달 + 활동 패널)
├── style.css    — 전체 스타일 (드래그앤드롭·모달·활동 패널·이동 버튼 포함)
└── script.js    — 상태 관리, DnD, Supabase 인증/CRUD, 그룹, 활동 기록
```

---

## 아키텍처

### 인증 흐름

```
페이지 로드
  → initAuth() → getSession()
      ├── 세션 있음 → showApp() → loadGroups() → loadCards()
      └── 세션 없음 → showAuthOverlay()

소셜 로그인 (Google / GitHub)
  → signInWithOAuth() → 팝업 창 → 인증 완료 → 팝업 닫힘
  → onAuthStateChange('SIGNED_IN') → showApp()
```

### 카드 CRUD 패턴 (낙관적 업데이트)

모든 카드 조작은 **UI 먼저 반영 → Supabase API 호출 → 실패 시 롤백** 순서로 동작합니다.

| 조작 | UI | API | 롤백 |
|------|----|-----|------|
| 추가 | tempId로 즉시 렌더 | INSERT → UUID 교체 | DOM 제거 |
| 이동(DnD) | 드롭 위치로 즉시 이동 | UPDATE column_id | 이전 컬럼 재렌더 |
| 삭제 | 즉시 DOM 제거 | DELETE | 카드 복원 |
| 그룹 이동 | 현재 보드에서 즉시 제거 | UPDATE group_id | 카드 복원 |

### 데이터베이스 스키마

```sql
-- 카드
cards (
  id UUID PK, user_id UUID FK→auth.users,
  text TEXT, column_id TEXT, position SMALLINT,
  group_id UUID FK→kanban_groups  -- NULL: 개인 보드
)

-- 그룹
kanban_groups (
  id UUID PK, name TEXT,
  invite_code TEXT UNIQUE,  -- 6자리 자동 생성
  owner_id UUID FK→auth.users
)

-- 그룹 멤버
kanban_group_members (
  group_id UUID FK→kanban_groups,
  user_id  UUID FK→auth.users,
  PRIMARY KEY (group_id, user_id)
)

-- 활동 기록
activity_logs (
  id UUID PK, group_id UUID FK→kanban_groups,
  user_id UUID, user_email TEXT,
  action TEXT CHECK (action IN ('add','move','delete')),
  card_text TEXT, from_col TEXT, to_col TEXT
)
```

**RLS 정책**: 인증된 사용자는 본인 카드 및 소속 그룹 카드·로그만 접근 가능.

---

## 로컬 실행

```bash
git clone https://github.com/sijoon/kanban-board.git
cd kanban-board
python3 -m http.server 8080
# http://localhost:8080 접속
```

---

## Supabase 설정 정보

| 항목 | 값 |
|------|-----|
| Project Ref | `pumjlplxtcljhbwoylbq` |
| Region | Northeast Asia (Seoul) |
| Auth Providers | Email / Google / GitHub |
| Deployed URL | `https://sijoon.github.io/kanban-board/` |
