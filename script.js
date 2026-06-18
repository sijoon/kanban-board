// ── Supabase 설정 ─────────────────────────────────────────
const SUPABASE_URL = 'https://pumjlplxtcljhbwoylbq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1bWpscGx4dGNsamhid295bGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjA3MjEsImV4cCI6MjA5NzI5NjcyMX0.kL6J1hw4vt6bSMVQWI3c6Zj_gDxEo7KIV6LUn5VmW9M';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ── 상태 ─────────────────────────────────────────────────

const state = {
  cards: {},
  currentGroupId: null,
};

let userGroups = [];

const COL_NAMES = { todo: 'To-do', inprogress: 'In-progress', done: 'Done' };

// ── Auth UI ───────────────────────────────────────────────

function showAuthOverlay() {
  document.getElementById('auth-overlay').classList.remove('hidden');
  document.getElementById('app-header').classList.add('hidden');
  document.getElementById('board').classList.add('hidden');

  state.cards = {};
  state.currentGroupId = null;
  userGroups = [];
  closeActivityPanel();
  renderAllCards();
  updateCardCounts();
}

async function showApp() {
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('app-header').classList.remove('hidden');
  document.getElementById('board').classList.remove('hidden');

  const email = currentUser?.email || currentUser?.user_metadata?.name || '';
  document.getElementById('user-email').textContent = email;

  await loadGroups();
  document.getElementById('btn-activity-log').classList.add('hidden');
  closeActivityPanel();
  await loadCards();
}

function setAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

function setSubmitLoading(loading) {
  const btn = document.getElementById('auth-submit');
  btn.disabled = loading;
  btn.textContent = loading ? '처리 중…' : (getCurrentTab() === 'signin' ? '로그인' : '회원가입');
}

function getCurrentTab() {
  return document.querySelector('.auth-tab.active')?.dataset.tab || 'signin';
}

// ── Auth Logic ────────────────────────────────────────────

async function signUp(email, password) {
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) throw error;
  // 이미 가입된 이메일: identities 배열이 비어있음
  if (data.user?.identities?.length === 0) {
    throw new Error('이미 가입된 이메일입니다. 로그인 탭을 이용하세요.');
  }
  return data;
}

async function signIn(email, password) {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function signOut() {
  await db.auth.signOut();
}

async function signInWithOAuth(provider) {
  const { data, error } = await db.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: location.origin + location.pathname,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  window.open(data.url, 'oauth_popup', 'width=520,height=680,resizable=yes');
}

// ── Auth 초기화 ───────────────────────────────────────────

async function initAuth() {
  // OAuth 팝업 창으로 열린 경우: 인증 완료 후 자동으로 닫기
  if (window.opener && !window.opener.closed) {
    db.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN') window.close();
    });
    return;
  }

  // 기존 세션 확인
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    await showApp();
  } else {
    showAuthOverlay();
  }

  // 세션 변화 감지 (팝업 로그인 완료 / 로그아웃)
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      await showApp();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showAuthOverlay();
    }
  });
}

// ── Auth 이벤트 리스너 ────────────────────────────────────

function attachAuthListeners() {
  // 탭 전환
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setAuthError('');
      document.getElementById('auth-submit').textContent =
        tab.dataset.tab === 'signin' ? '로그인' : '회원가입';
      document.getElementById('auth-password').autocomplete =
        tab.dataset.tab === 'signin' ? 'current-password' : 'new-password';
    });
  });

  // 이메일/비밀번호 폼 제출
  document.getElementById('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const tab      = getCurrentTab();

    if (!email || !password) {
      setAuthError('이메일과 비밀번호를 입력하세요.');
      return;
    }
    if (password.length < 6) {
      setAuthError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setAuthError('');
    setSubmitLoading(true);

    try {
      if (tab === 'signup') {
        await signUp(email, password);
        setAuthError('');
        alert('가입 확인 이메일을 발송했습니다. 받은편지함을 확인하세요.\n(이메일 확인을 비활성화한 경우 바로 로그인됩니다.)');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      const msg = AUTH_ERROR_MAP[err.message] || err.message;
      setAuthError(msg);
    } finally {
      setSubmitLoading(false);
    }
  });

  // Google 로그인
  document.getElementById('btn-google').addEventListener('click', async () => {
    try {
      await signInWithOAuth('google');
    } catch (err) {
      setAuthError('Google 로그인 중 오류가 발생했습니다.');
    }
  });

  // GitHub 로그인
  document.getElementById('btn-github').addEventListener('click', async () => {
    try {
      await signInWithOAuth('github');
    } catch (err) {
      setAuthError('GitHub 로그인 중 오류가 발생했습니다.');
    }
  });

  // 로그아웃
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut();
  });
}

// Supabase 에러 메시지 한국어 매핑
const AUTH_ERROR_MAP = {
  'Invalid login credentials':           '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Email not confirmed':                 '이메일 인증이 필요합니다. 메일함을 확인하세요.',
  'User already registered':             '이미 가입된 이메일입니다.',
  'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 합니다.',
  'Unable to validate email address: invalid format': '올바른 이메일 형식이 아닙니다.',
  'For security purposes, you can only request this after':
    '잠시 후 다시 시도해 주세요. (재시도 제한)',
};

// ── Supabase Card CRUD ────────────────────────────────────

async function loadCards() {
  let query = db.from('cards').select('*').order('column_id').order('position');

  if (state.currentGroupId) {
    query = query.eq('group_id', state.currentGroupId);
  } else {
    query = query.is('group_id', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('카드 로드 실패:', error);
    renderAllCards();
    updateCardCounts();
    return;
  }

  state.cards = {};
  data.forEach(card => {
    state.cards[card.id] = {
      id: card.id,
      text: card.text,
      column: card.column_id,
    };
  });

  renderAllCards();
  updateCardCounts();
}

// ── Render ────────────────────────────────────────────────

function createCardElement(card) {
  const article = document.createElement('article');
  article.className = 'card';
  article.draggable = true;
  article.dataset.id = card.id;
  article.dataset.column = card.column;

  const p = document.createElement('p');
  p.className = 'card-text';
  p.textContent = card.text;

  const btn = document.createElement('button');
  btn.className = 'delete-btn';
  btn.setAttribute('aria-label', '카드 삭제');
  btn.textContent = '✕';

  article.appendChild(p);
  article.appendChild(btn);

  attachCardListeners(article);
  return article;
}

function renderCard(id) {
  const card = state.cards[id];
  const columnBody = document.querySelector(`.column-body[data-column="${card.column}"]`);
  columnBody.appendChild(createCardElement(card));
}

function renderAllCards() {
  document.querySelectorAll('.column-body').forEach(body => (body.innerHTML = ''));
  Object.values(state.cards).forEach(card => renderCard(card.id));
}

function updateCardCounts() {
  document.querySelectorAll('.column').forEach(col => {
    const columnId = col.dataset.column;
    const count = Object.values(state.cards).filter(c => c.column === columnId).length;
    col.querySelector('.card-count').textContent = count;
  });
}

// ── Drag and Drop ─────────────────────────────────────────

let draggedCardId = null;
let placeholder = null;

function createPlaceholder() {
  const div = document.createElement('div');
  div.className = 'drop-placeholder';
  return div;
}

function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll('.card:not(.dragging)')];
  return cards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function removePlaceholder() {
  if (placeholder) {
    placeholder.remove();
    placeholder = null;
  }
}

function attachCardListeners(cardEl) {
  cardEl.addEventListener('dragstart', handleDragStart);
  cardEl.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
  draggedCardId = e.currentTarget.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => e.currentTarget.classList.add('dragging'));
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.column-body').forEach(b => b.classList.remove('drag-over'));
  removePlaceholder();
  draggedCardId = null;
}

function attachColumnListeners() {
  document.querySelectorAll('.column-body').forEach(body => {
    body.addEventListener('dragover', handleDragOver);
    body.addEventListener('dragleave', handleDragLeave);
    body.addEventListener('drop', handleDrop);
    body.addEventListener('click', handleColumnBodyClick);
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const columnBody = e.currentTarget;
  columnBody.classList.add('drag-over');

  if (!placeholder) placeholder = createPlaceholder();

  const afterElement = getDragAfterElement(columnBody, e.clientY);
  if (afterElement == null) {
    columnBody.appendChild(placeholder);
  } else {
    columnBody.insertBefore(placeholder, afterElement);
  }
}

function handleDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove('drag-over');
  removePlaceholder();
}

function handleDrop(e) {
  e.preventDefault();
  if (!draggedCardId) return;

  const columnBody = e.currentTarget;
  const targetColumn = columnBody.dataset.column;
  const cardEl = document.querySelector(`.card[data-id="${draggedCardId}"]`);
  const previousColumn = state.cards[draggedCardId].column;
  // dragend 후 draggedCardId가 null이 되므로 미리 캡처
  const cardId = draggedCardId;
  const cardText = state.cards[draggedCardId].text;

  // 낙관적 업데이트: UI 먼저 반영
  if (placeholder && placeholder.parentNode === columnBody) {
    columnBody.insertBefore(cardEl, placeholder);
  } else {
    columnBody.appendChild(cardEl);
  }

  cardEl.dataset.column = targetColumn;
  state.cards[cardId].column = targetColumn;

  columnBody.classList.remove('drag-over');
  removePlaceholder();
  updateCardCounts();

  // 같은 컬럼 내 이동이면 API 불필요
  if (previousColumn === targetColumn) return;

  // Supabase 업데이트
  db.from('cards')
    .update({ column_id: targetColumn })
    .eq('id', cardId)
    .then(({ error }) => {
      if (error) {
        console.error('카드 이동 실패:', error);
        state.cards[cardId].column = previousColumn;
        renderAllCards();
        updateCardCounts();
      } else {
        logActivity('move', cardText, previousColumn, targetColumn);
      }
    });
}

// ── Delete ────────────────────────────────────────────────

function handleColumnBodyClick(e) {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;

  const cardEl = btn.closest('.card');
  const id = cardEl.dataset.id;
  const previousCard = { ...state.cards[id] };

  // 낙관적 삭제: UI 먼저 제거
  cardEl.remove();
  delete state.cards[id];
  updateCardCounts();

  // Supabase 삭제
  db.from('cards')
    .delete()
    .eq('id', id)
    .then(({ error }) => {
      if (error) {
        console.error('카드 삭제 실패:', error);
        state.cards[id] = previousCard;
        renderCard(id);
        updateCardCounts();
      } else {
        logActivity('delete', previousCard.text, previousCard.column, null);
      }
    });
}

// ── Add Card ──────────────────────────────────────────────

function attachAddCardListeners() {
  document.querySelectorAll('.add-card-btn').forEach(btn => {
    btn.addEventListener('click', () => openForm(btn.dataset.target));
  });

  document.querySelectorAll('.confirm-add-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmAdd(btn.dataset.target));
  });

  document.querySelectorAll('.cancel-add-btn').forEach(btn => {
    btn.addEventListener('click', () => closeForm(btn.dataset.target));
  });

  document.querySelectorAll('.card-input').forEach(textarea => {
    textarea.addEventListener('keydown', e => {
      const columnId = textarea.closest('.add-card-form').dataset.form;
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        confirmAdd(columnId);
      }
      if (e.key === 'Escape') closeForm(columnId);
    });
  });
}

function openForm(columnId) {
  const col = document.querySelector(`.column[data-column="${columnId}"]`);
  col.querySelector('.add-card-btn').classList.add('hidden');
  const form = col.querySelector('.add-card-form');
  form.classList.remove('hidden');
  form.querySelector('.card-input').focus();
}

function closeForm(columnId) {
  const col = document.querySelector(`.column[data-column="${columnId}"]`);
  const form = col.querySelector('.add-card-form');
  form.querySelector('.card-input').value = '';
  form.classList.add('hidden');
  col.querySelector('.add-card-btn').classList.remove('hidden');
}

async function confirmAdd(columnId) {
  const col = document.querySelector(`.column[data-column="${columnId}"]`);
  const textarea = col.querySelector('.card-input');
  const text = textarea.value.trim();
  if (!text) return;

  const position = Object.values(state.cards).filter(c => c.column === columnId).length;

  // 낙관적 업데이트: 임시 ID로 즉시 UI에 추가
  const tempId = 'temp_' + Date.now();
  state.cards[tempId] = { id: tempId, text, column: columnId };
  renderCard(tempId);
  updateCardCounts();
  closeForm(columnId);

  const { data, error } = await db.from('cards').insert({
    user_id: currentUser.id,
    text,
    column_id: columnId,
    position,
    group_id: state.currentGroupId || null,
  }).select().single();

  if (error) {
    console.error('카드 추가 실패:', error);
    // 롤백: 임시 카드 제거
    const cardEl = document.querySelector(`.card[data-id="${tempId}"]`);
    if (cardEl) cardEl.remove();
    delete state.cards[tempId];
    updateCardCounts();
    return;
  }

  // 임시 ID를 Supabase UUID로 교체
  const cardEl = document.querySelector(`.card[data-id="${tempId}"]`);
  if (cardEl) cardEl.dataset.id = data.id;
  delete state.cards[tempId];
  state.cards[data.id] = { id: data.id, text, column: columnId };
  logActivity('add', text, null, columnId);
}

// ── Group ─────────────────────────────────────────────────

async function loadGroups() {
  const { data, error } = await db
    .from('kanban_group_members')
    .select('group_id, kanban_groups(id, name, invite_code, owner_id)')
    .eq('user_id', currentUser.id);

  if (error) { console.error('그룹 로드 실패:', error); return; }

  userGroups = (data || []).map(row => row.kanban_groups);

  const sel = document.getElementById('group-selector');
  sel.innerHTML = '<option value="">내 보드</option>';
  userGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    sel.appendChild(opt);
  });
  sel.value = state.currentGroupId || '';
}

async function createGroup(name) {
  // 그룹 생성
  const { data: group, error: groupErr } = await db
    .from('kanban_groups')
    .insert({ name, owner_id: currentUser.id })
    .select()
    .single();
  if (groupErr) throw groupErr;

  // 생성자를 멤버로 자동 등록
  const { error: memberErr } = await db
    .from('kanban_group_members')
    .insert({ group_id: group.id, user_id: currentUser.id });
  if (memberErr) throw memberErr;

  return group;
}

async function joinGroup(inviteCode) {
  const { data: group, error: findErr } = await db
    .from('kanban_groups')
    .select('id, name')
    .eq('invite_code', inviteCode.toUpperCase())
    .maybeSingle();

  if (findErr) throw findErr;
  if (!group) throw new Error('유효하지 않은 초대 코드입니다.');

  const { data: existing } = await db
    .from('kanban_group_members')
    .select('group_id')
    .eq('group_id', group.id)
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (existing) throw new Error('이미 참여한 그룹입니다.');

  const { error: joinErr } = await db
    .from('kanban_group_members')
    .insert({ group_id: group.id, user_id: currentUser.id });
  if (joinErr) throw joinErr;

  return group;
}

async function switchGroup(groupId) {
  state.currentGroupId = groupId || null;
  document.getElementById('group-selector').value = groupId || '';
  const actBtn = document.getElementById('btn-activity-log');
  if (groupId) {
    actBtn.classList.remove('hidden');
  } else {
    actBtn.classList.add('hidden');
    closeActivityPanel();
  }
  await loadCards();
}

function setGroupError(modalId, msg) {
  const el = document.getElementById(modalId);
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

function attachGroupListeners() {
  // 그룹 셀렉터 변경
  document.getElementById('group-selector').addEventListener('change', e => {
    switchGroup(e.target.value);
  });

  // 그룹 만들기 버튼 → 모달 열기
  document.getElementById('btn-create-group').addEventListener('click', () => {
    document.getElementById('group-name-input').value = '';
    setGroupError('create-group-error', '');
    document.getElementById('modal-create-group').classList.remove('hidden');
    document.getElementById('group-name-input').focus();
  });

  // 그룹 만들기 취소
  document.getElementById('btn-create-group-cancel').addEventListener('click', () => {
    document.getElementById('modal-create-group').classList.add('hidden');
  });

  // 그룹 만들기 확인
  document.getElementById('btn-create-group-confirm').addEventListener('click', async () => {
    const name = document.getElementById('group-name-input').value.trim();
    if (!name) { setGroupError('create-group-error', '그룹 이름을 입력하세요.'); return; }

    const btn = document.getElementById('btn-create-group-confirm');
    btn.disabled = true;
    btn.textContent = '처리 중…';
    setGroupError('create-group-error', '');

    try {
      const group = await createGroup(name);
      document.getElementById('modal-create-group').classList.add('hidden');
      document.getElementById('invite-code-display').textContent = group.invite_code;
      document.getElementById('modal-invite-code').classList.remove('hidden');
      await loadGroups();
      await switchGroup(group.id);
    } catch (err) {
      setGroupError('create-group-error', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '만들기';
    }
  });

  // 그룹 만들기 input Enter 키
  document.getElementById('group-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-create-group-confirm').click();
    if (e.key === 'Escape') document.getElementById('btn-create-group-cancel').click();
  });

  // 초대 코드 복사
  document.getElementById('btn-copy-invite-code').addEventListener('click', () => {
    const code = document.getElementById('invite-code-display').textContent;
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btn-copy-invite-code');
      btn.textContent = '복사됨!';
      setTimeout(() => { btn.textContent = '복사'; }, 1500);
    });
  });

  // 초대 코드 닫기
  document.getElementById('btn-close-invite-code').addEventListener('click', () => {
    document.getElementById('modal-invite-code').classList.add('hidden');
  });

  // 코드 참여 버튼 → 모달 열기
  document.getElementById('btn-join-group').addEventListener('click', () => {
    document.getElementById('invite-code-input').value = '';
    setGroupError('join-group-error', '');
    document.getElementById('modal-join-group').classList.remove('hidden');
    document.getElementById('invite-code-input').focus();
  });

  // 참여 취소
  document.getElementById('btn-join-group-cancel').addEventListener('click', () => {
    document.getElementById('modal-join-group').classList.add('hidden');
  });

  // 참여 확인
  document.getElementById('btn-join-group-confirm').addEventListener('click', async () => {
    const code = document.getElementById('invite-code-input').value.trim();
    if (!code) { setGroupError('join-group-error', '초대 코드를 입력하세요.'); return; }

    const btn = document.getElementById('btn-join-group-confirm');
    btn.disabled = true;
    btn.textContent = '처리 중…';
    setGroupError('join-group-error', '');

    try {
      const group = await joinGroup(code);
      document.getElementById('modal-join-group').classList.add('hidden');
      await loadGroups();
      await switchGroup(group.id);
    } catch (err) {
      setGroupError('join-group-error', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '참여';
    }
  });

  // 참여 input Enter 키
  document.getElementById('invite-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join-group-confirm').click();
    if (e.key === 'Escape') document.getElementById('btn-join-group-cancel').click();
  });
}

// ── Activity Log ──────────────────────────────────────────

async function logActivity(action, cardText, fromCol, toCol) {
  if (!state.currentGroupId || !currentUser) return;
  const userEmail = currentUser.email || currentUser.user_metadata?.email || '';
  await db.from('activity_logs').insert({
    group_id: state.currentGroupId,
    user_id: currentUser.id,
    user_email: userEmail,
    action,
    card_text: cardText,
    from_col: fromCol || null,
    to_col: toCol || null,
  });
}

function formatRelativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '어제';
  if (day < 7) return `${day}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function renderActivityLog(logs) {
  const list = document.getElementById('activity-list');
  if (!logs.length) {
    list.innerHTML = '<p class="activity-empty">아직 활동 기록이 없습니다.</p>';
    return;
  }
  list.innerHTML = '';
  logs.forEach(log => {
    const item = document.createElement('div');
    item.className = 'activity-entry';

    const displayName = (log.user_email || '').split('@')[0] || '사용자';
    const initial = displayName[0].toUpperCase();
    const shortText = log.card_text.length > 28
      ? log.card_text.slice(0, 28) + '…'
      : log.card_text;

    let actionHtml = '';
    if (log.action === 'add') {
      actionHtml = `<b>${COL_NAMES[log.to_col] || log.to_col}</b>에 카드 추가`;
    } else if (log.action === 'move') {
      actionHtml = `<b>${COL_NAMES[log.from_col]}</b> → <b>${COL_NAMES[log.to_col]}</b> 이동`;
    } else if (log.action === 'delete') {
      actionHtml = `카드 삭제`;
    }

    item.innerHTML = `
      <div class="activity-avatar">${initial}</div>
      <div class="activity-content">
        <div class="activity-user">${displayName}</div>
        <div class="activity-action">${actionHtml}</div>
        <div class="activity-card-text">"${shortText}"</div>
        <div class="activity-time">${formatRelativeTime(log.created_at)}</div>
      </div>`;
    list.appendChild(item);
  });
}

async function loadActivityLog() {
  const list = document.getElementById('activity-list');
  list.innerHTML = '<p class="activity-empty">로딩 중…</p>';

  const { data, error } = await db
    .from('activity_logs')
    .select('*')
    .eq('group_id', state.currentGroupId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    list.innerHTML = '<p class="activity-empty">로드 실패. 다시 시도해 주세요.</p>';
    return;
  }
  renderActivityLog(data);
}

function openActivityPanel() {
  document.getElementById('activity-panel').classList.add('open');
  loadActivityLog();
}

function closeActivityPanel() {
  const panel = document.getElementById('activity-panel');
  if (panel) panel.classList.remove('open');
}

function attachActivityListeners() {
  document.getElementById('btn-activity-log').addEventListener('click', () => {
    const panel = document.getElementById('activity-panel');
    if (panel.classList.contains('open')) closeActivityPanel();
    else openActivityPanel();
  });

  document.getElementById('btn-activity-refresh').addEventListener('click', loadActivityLog);
  document.getElementById('btn-activity-close').addEventListener('click', closeActivityPanel);
}

// ── Init ──────────────────────────────────────────────────

async function init() {
  attachAuthListeners();
  attachGroupListeners();
  attachActivityListeners();
  await initAuth();
  attachColumnListeners();
  attachAddCardListeners();
}

document.addEventListener('DOMContentLoaded', init);
