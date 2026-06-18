// ── Supabase 설정 ─────────────────────────────────────────
const SUPABASE_URL = 'https://pumjlplxtcljhbwoylbq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1bWpscGx4dGNsamhid295bGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjA3MjEsImV4cCI6MjA5NzI5NjcyMX0.kL6J1hw4vt6bSMVQWI3c6Zj_gDxEo7KIV6LUn5VmW9M';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ── 상태 ─────────────────────────────────────────────────

const state = {
  cards: {},
};

// ── Auth UI ───────────────────────────────────────────────

function showAuthOverlay() {
  document.getElementById('auth-overlay').classList.remove('hidden');
  document.getElementById('app-header').classList.add('hidden');
  document.getElementById('board').classList.add('hidden');

  state.cards = {};
  renderAllCards();
  updateCardCounts();
}

async function showApp() {
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('app-header').classList.remove('hidden');
  document.getElementById('board').classList.remove('hidden');

  const email = currentUser?.email || currentUser?.user_metadata?.name || '';
  document.getElementById('user-email').textContent = email;

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
  const { data, error } = await db
    .from('cards')
    .select('*')
    .order('column_id')
    .order('position');

  if (error) {
    console.error('카드 로드 실패:', error);
    renderAllCards();
    updateCardCounts();
    return;
  }

  state.cards = {};
  // Supabase 응답(column_id)을 내부 상태(column)로 매핑
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

  // 낙관적 업데이트: UI 먼저 반영
  if (placeholder && placeholder.parentNode === columnBody) {
    columnBody.insertBefore(cardEl, placeholder);
  } else {
    columnBody.appendChild(cardEl);
  }

  cardEl.dataset.column = targetColumn;
  state.cards[draggedCardId].column = targetColumn;

  columnBody.classList.remove('drag-over');
  removePlaceholder();
  updateCardCounts();

  // 같은 컬럼 내 이동이면 API 불필요
  if (previousColumn === targetColumn) return;

  // Supabase 업데이트
  db.from('cards')
    .update({ column_id: targetColumn })
    .eq('id', draggedCardId)
    .then(({ error }) => {
      if (error) {
        console.error('카드 이동 실패:', error);
        // 롤백: 이전 컬럼으로 복원
        state.cards[draggedCardId].column = previousColumn;
        renderAllCards();
        updateCardCounts();
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
        // 롤백: 삭제된 카드 복원 (컬럼 끝에 추가)
        state.cards[id] = previousCard;
        renderCard(id);
        updateCardCounts();
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
}

// ── Init ──────────────────────────────────────────────────

async function init() {
  attachAuthListeners();
  await initAuth();
  attachColumnListeners();
  attachAddCardListeners();
}

document.addEventListener('DOMContentLoaded', init);
