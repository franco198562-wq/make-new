// ==============================
// Staff Documentation Portal
// Access code: PMB123
// ==============================

const ACCESS_CODE = '';
let currentPermissions = [];
async function refreshDiscordAuth(){ const r=await fetch('/api/me',{credentials:'include',cache:'no-store'}); const m=await r.json(); isLoggedIn=!!m.loggedIn; currentPermissions=m.permissions||[]; return m; }
const STORAGE_KEY = 'staff_portal_v2';
const AUTH_KEY = 'staff_portal_auth';
const AUTO_SAVE_DELAY = 1500;

// ---------- State ----------
let data = { departments: [], books: [] };
let currentDeptId = null;
let currentBookId = null;
let isEditing = false;
let isLoggedIn = false;
let autoSaveTimer = null;
let lastSavedSnapshot = null;
let pendingDelete = null;
let editingDeptId = null;
let editingBookId = null;
let tempDeptImage = null;
let tempBookCover = null;

// ---------- DOM ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const loginBtn = $('#loginBtn');
const logoutBtn = $('#logoutBtn');
const newDeptBtn = $('#newDeptBtn');
const newBookBtn = $('#newBookBtn');
const editDeptBtn = $('#editDeptBtn');
const deleteDeptBtn = $('#deleteDeptBtn');
const editBookBtn = $('#editBookBtn');
const deleteBookBtn = $('#deleteBookBtn');
const backToDepts = $('#backToDepts');
const backToDept = $('#backToDept');
const logoBtn = $('#logoBtn');

const viewDepartments = $('#viewDepartments');
const viewDeptDetail = $('#viewDeptDetail');
const viewBook = $('#viewBook');
const deptGrid = $('#deptGrid');
const bookGrid = $('#bookGrid');
const deptEmpty = $('#deptEmpty');
const bookEmpty = $('#bookEmpty');
const deptTitle = $('#deptTitle');
const deptDesc = $('#deptDesc');
const deptBreadcrumb = $('#deptBreadcrumb');
const bookBreadcrumb = $('#bookBreadcrumb');
const bookTitleInput = $('#bookTitleInput');
const bookDescDisplay = $('#bookDescDisplay');
const bookContent = $('#bookContent');
const formatBar = $('#formatBar');
const saveStatus = $('#saveStatus');
const metaBox = $('#metaBox');
const metaContent = $('#metaContent');

const sidebarHome = $('#sidebarHome');
const sidebarDept = $('#sidebarDept');
const sidebarBook = $('#sidebarBook');

const globalSearch = $('#globalSearch');
const searchResults = $('#searchResults');

const loginModal = $('#loginModal');
const codeInput = $('#codeInput');
const loginError = $('#loginError');
const deptModal = $('#deptModal');
const deptModalTitle = $('#deptModalTitle');
const deptNameInput = $('#deptNameInput');
const deptDescInput = $('#deptDescInput');
const deptImageInput = $('#deptImageInput');
const deptImagePreview = $('#deptImagePreview');
const bookModal = $('#bookModal');
const bookModalTitle = $('#bookModalTitle');
const bookNameInput = $('#bookNameInput');
const bookDescInput = $('#bookDescInput');
const bookCoverInput = $('#bookCoverInput');
const bookCoverPreview = $('#bookCoverPreview');
const deleteModal = $('#deleteModal');
const deleteMessage = $('#deleteMessage');
const imageInput = $('#imageInput');

// ---------- Shared storage ----------
const API_BASE = '/api';

async function loadData() {
  try {
    const response = await fetch(`${API_BASE}/data`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load shared data');
    data = await response.json();
    if (!data.departments) data.departments = [];
    if (!data.books) data.books = [];
  } catch (error) {
    console.error(error);
    data = { departments: [], books: [] };
    alert('Unable to load shared data. Please check the API deployment.');
  }
}

async function saveData() {
  try {
    const response = await fetch(`${API_BASE}/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to save shared data');
  } catch (error) {
    console.error(error);
    alert('Unable to save shared data. Please check the API deployment.');
  }
}

function loadAuth() {
  isLoggedIn = localStorage.getItem(AUTH_KEY) === '1';
}

function setAuth(v) {
  isLoggedIn = v;
  if (v) localStorage.setItem(AUTH_KEY, '1');
  else localStorage.removeItem(AUTH_KEY);
}

// ---------- Auth UI ----------
function renderAuth() {
  if (isLoggedIn) {
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    newDeptBtn.classList.remove('hidden');
    newBookBtn.classList.remove('hidden');
    editDeptBtn.classList.remove('hidden');
    deleteDeptBtn.classList.remove('hidden');
    editBookBtn.classList.remove('hidden');
    deleteBookBtn.classList.remove('hidden');
  } else {
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    newDeptBtn.classList.add('hidden');
    newBookBtn.classList.add('hidden');
    editDeptBtn.classList.add('hidden');
    deleteDeptBtn.classList.add('hidden');
    editBookBtn.classList.add('hidden');
    deleteBookBtn.classList.add('hidden');
  }
}

// ---------- Views ----------
function showView(name) {
  viewDepartments.classList.add('hidden');
  viewDeptDetail.classList.add('hidden');
  viewBook.classList.add('hidden');
  sidebarHome.classList.add('hidden');
  sidebarDept.classList.add('hidden');
  sidebarBook.classList.add('hidden');
  metaBox.classList.add('hidden');

  if (name === 'departments') {
    viewDepartments.classList.remove('hidden');
    sidebarHome.classList.remove('hidden');
    currentDeptId = null;
    currentBookId = null;
    isEditing = false;
    renderDepartments();
  } else if (name === 'dept') {
    viewDeptDetail.classList.remove('hidden');
    sidebarDept.classList.remove('hidden');
    currentBookId = null;
    isEditing = false;
    renderDeptDetail();
  } else if (name === 'book') {
    viewBook.classList.remove('hidden');
    sidebarBook.classList.remove('hidden');
    renderBookView();
  }
  renderAuth();
}

function renderDepartments() {
  deptGrid.innerHTML = '';
  if (data.departments.length === 0) {
    deptEmpty.classList.remove('hidden');
    return;
  }
  deptEmpty.classList.add('hidden');

  const sorted = [...data.departments].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach(dept => {
    const count = booksInDept(dept.id).length;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-cover">
        ${dept.image
          ? `<img src="${dept.image}" alt="">`
          : `<span class="placeholder">📁</span>`}
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(dept.name)}</div>
        <div class="card-desc">${escapeHtml(dept.description || '')}</div>
        <div class="card-meta">${count} book${count !== 1 ? 's' : ''}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      currentDeptId = dept.id;
      showView('dept');
    });
    deptGrid.appendChild(card);
  });
}

function renderDeptDetail() {
  const dept = getDept(currentDeptId);
  if (!dept) { showView('departments'); return; }

  deptTitle.textContent = dept.name;
  deptDesc.textContent = dept.description || '';
  deptBreadcrumb.innerHTML = `
    <span data-go="departments">Departments</span>
    <span class="sep">›</span>
    <span class="current">${escapeHtml(dept.name)}</span>
  `;
  deptBreadcrumb.querySelector('[data-go]')?.addEventListener('click', () => showView('departments'));

  metaBox.classList.remove('hidden');
  metaContent.innerHTML = `
    Created ${formatDate(dept.createdAt)}<br>
    Updated ${formatDate(dept.updatedAt)}
  `;

  const books = booksInDept(currentDeptId);
  bookGrid.innerHTML = '';
  if (books.length === 0) {
    bookEmpty.classList.remove('hidden');
    return;
  }
  bookEmpty.classList.add('hidden');

  books.forEach(book => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-cover">
        ${book.cover
          ? `<img src="${book.cover}" alt="">`
          : `<span class="placeholder">📄</span>`}
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(book.title)}</div>
        <div class="card-desc">${escapeHtml(book.description || '')}</div>
        <div class="card-meta">Updated ${formatDate(book.updatedAt)}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      currentBookId = book.id;
      showView('book');
    });
    bookGrid.appendChild(card);
  });
}

function renderBookView() {
  const book = getBook(currentBookId);
  const dept = getDept(book?.departmentId);
  if (!book || !dept) { showView('departments'); return; }

  bookBreadcrumb.innerHTML = `
    <span data-go="departments">Departments</span>
    <span class="sep">›</span>
    <span data-go="dept">${escapeHtml(dept.name)}</span>
    <span class="sep">›</span>
    <span class="current">${escapeHtml(book.title)}</span>
  `;
  bookBreadcrumb.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.go === 'departments') showView('departments');
      else if (el.dataset.go === 'dept') {
        currentDeptId = dept.id;
        showView('dept');
      }
    });
  });

  bookTitleInput.value = book.title;
  bookDescDisplay.textContent = book.description || '';
  bookContent.innerHTML = book.content || '';

  if (isEditing && isLoggedIn) {
    bookTitleInput.removeAttribute('readonly');
    bookContent.contentEditable = 'true';
    formatBar.classList.remove('hidden');
  } else {
    bookTitleInput.setAttribute('readonly', 'true');
    bookContent.contentEditable = 'false';
    formatBar.classList.add('hidden');
    hideSaveStatus();
  }

  metaBox.classList.remove('hidden');
  metaContent.innerHTML = `
    Created ${formatDate(book.createdAt)}<br>
    Updated ${formatDate(book.updatedAt)}
  `;
}

// ---------- Auto-save ----------
function showSaveStatus(text, cls = '') {
  saveStatus.textContent = text;
  saveStatus.className = 'save-status ' + cls;
  saveStatus.classList.remove('hidden');
}
function hideSaveStatus() {
  saveStatus.classList.add('hidden');
}

function scheduleAutoSave() {
  if (!isEditing || !isLoggedIn || !currentBookId) return;
  clearTimeout(autoSaveTimer);
  showSaveStatus('Saving…', 'saving');
  autoSaveTimer = setTimeout(performAutoSave, AUTO_SAVE_DELAY);
}

function performAutoSave() {
  if (!isEditing || !currentBookId || !isLoggedIn) return;
  const book = getBook(currentBookId);
  if (!book) return;

  const title = bookTitleInput.value.trim() || 'Untitled';
  const content = bookContent.innerHTML;
  const snap = JSON.stringify({ title, content });
  if (snap === lastSavedSnapshot) {
    showSaveStatus('Saved', 'saved');
    setTimeout(hideSaveStatus, 2000);
    return;
  }

  book.title = title;
  book.content = content;
  book.updatedAt = Date.now();
  saveData();
  lastSavedSnapshot = snap;
  showSaveStatus('Saved', 'saved');
  setTimeout(hideSaveStatus, 2500);
  const cur = bookBreadcrumb.querySelector('.current');
  if (cur) cur.textContent = title;
}

function forceSave() {
  clearTimeout(autoSaveTimer);
  performAutoSave();
}

// ---------- Formatting ----------
function execFormat(cmd, value = null) {
  bookContent.focus();
  try { document.execCommand(cmd, false, value); } catch (e) {}
  scheduleAutoSave();
}

// ---------- Image insert ----------
async function insertImage(file) {
  if (!file || !isEditing) return;
  try {
    const b64 = await fileToBase64(file);
    bookContent.focus();
    document.execCommand('insertHTML', false, `<img src="${b64}" alt="Image">`);
    scheduleAutoSave();
  } catch (e) {
    alert('Could not insert image.');
  }
}

// ---------- Department CRUD ----------
function openDeptModal(id = null) {
  editingDeptId = id;
  tempDeptImage = null;
  deptImagePreview.classList.add('hidden');
  deptImagePreview.innerHTML = '';
  deptImageInput.value = '';

  if (id) {
    const d = getDept(id);
    deptModalTitle.textContent = 'Edit Department';
    deptNameInput.value = d.name;
    deptDescInput.value = d.description || '';
    if (d.image) {
      tempDeptImage = d.image;
      deptImagePreview.innerHTML = `<img src="${d.image}">`;
      deptImagePreview.classList.remove('hidden');
    }
  } else {
    deptModalTitle.textContent = 'New Department';
    deptNameInput.value = '';
    deptDescInput.value = '';
  }
  deptModal.classList.remove('hidden');
  setTimeout(() => deptNameInput.focus(), 50);
}

function saveDepartment() {
  const name = deptNameInput.value.trim();
  if (!name) { deptNameInput.focus(); return; }

  if (editingDeptId) {
    const d = getDept(editingDeptId);
    d.name = name;
    d.description = deptDescInput.value.trim();
    if (tempDeptImage !== null) d.image = tempDeptImage;
    d.updatedAt = Date.now();
  } else {
    data.departments.push({
      id: uid(),
      name,
      description: deptDescInput.value.trim(),
      image: tempDeptImage || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  saveData();
  deptModal.classList.add('hidden');
  if (currentDeptId && editingDeptId === currentDeptId) renderDeptDetail();
  else showView('departments');
}

// ---------- Book CRUD ----------
function openBookModal(id = null) {
  editingBookId = id;
  tempBookCover = null;
  bookCoverPreview.classList.add('hidden');
  bookCoverPreview.innerHTML = '';
  bookCoverInput.value = '';

  if (id) {
    const b = getBook(id);
    bookModalTitle.textContent = 'Edit Book';
    bookNameInput.value = b.title;
    bookDescInput.value = b.description || '';
    if (b.cover) {
      tempBookCover = b.cover;
      bookCoverPreview.innerHTML = `<img src="${b.cover}">`;
      bookCoverPreview.classList.remove('hidden');
    }
  } else {
    bookModalTitle.textContent = 'New Book';
    bookNameInput.value = '';
    bookDescInput.value = '';
  }
  bookModal.classList.remove('hidden');
  setTimeout(() => bookNameInput.focus(), 50);
}

function saveBookMeta() {
  const title = bookNameInput.value.trim();
  if (!title) { bookNameInput.focus(); return; }

  if (editingBookId) {
    const b = getBook(editingBookId);
    b.title = title;
    b.description = bookDescInput.value.trim();
    if (tempBookCover !== null) b.cover = tempBookCover;
    b.updatedAt = Date.now();
    saveData();
    bookModal.classList.add('hidden');
    if (currentBookId === editingBookId) {
      bookTitleInput.value = b.title;
      bookDescDisplay.textContent = b.description || '';
      renderBookView();
    } else {
      renderDeptDetail();
    }
  } else {
    const newBook = {
      id: uid(),
      departmentId: currentDeptId,
      title,
      description: bookDescInput.value.trim(),
      cover: tempBookCover || null,
      content: '<p></p>',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    data.books.push(newBook);
    saveData();
    bookModal.classList.add('hidden');
    currentBookId = newBook.id;
    isEditing = true;
    lastSavedSnapshot = JSON.stringify({ title: newBook.title, content: newBook.content });
    showView('book');
  }
}

function startEditBook() {
  if (!isLoggedIn || !currentBookId) return;
  isEditing = true;
  const book = getBook(currentBookId);
  lastSavedSnapshot = JSON.stringify({ title: book.title, content: book.content });
  renderBookView();
  bookTitleInput.focus();
}

// ---------- Delete ----------
function requestDelete(type, id) {
  pendingDelete = { type, id };
  if (type === 'book') {
    const b = getBook(id);
    deleteMessage.textContent = `Delete book "${b?.title}"? This cannot be undone.`;
  } else {
    const d = getDept(id);
    deleteMessage.textContent = `Delete "${d?.name}" and all its books? This cannot be undone.`;
  }
  deleteModal.classList.remove('hidden');
}

function confirmDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  if (type === 'book') {
    data.books = data.books.filter(b => b.id !== id);
    saveData();
    currentBookId = null;
    isEditing = false;
    showView('dept');
  } else if (type === 'dept') {
    data.books = data.books.filter(b => b.departmentId !== id);
    data.departments = data.departments.filter(d => d.id !== id);
    saveData();
    currentDeptId = null;
    showView('departments');
  }
  pendingDelete = null;
  deleteModal.classList.add('hidden');
}

// ---------- Search ----------
function runSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) {
    searchResults.classList.add('hidden');
    return;
  }
  const results = [];
  data.departments.forEach(d => {
    if (d.name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)) {
      results.push({ type: 'dept', id: d.id, title: d.name, meta: 'Department' });
    }
  });
  data.books.forEach(b => {
    const dept = getDept(b.departmentId);
    if (
      b.title.toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q) ||
      (b.content || '').toLowerCase().includes(q)
    ) {
      results.push({
        type: 'book',
        id: b.id,
        deptId: b.departmentId,
        title: b.title,
        meta: dept ? dept.name : 'Book'
      });
    }
  });

  if (results.length === 0) {
    searchResults.innerHTML = `<div class="search-item"><div class="si-title">No results</div></div>`;
  } else {
    searchResults.innerHTML = results.slice(0, 12).map(r => `
      <div class="search-item" data-type="${r.type}" data-id="${r.id}" data-deptid="${r.deptId || ''}">
        <div class="si-title">${escapeHtml(r.title)}</div>
        <div class="si-meta">${escapeHtml(r.meta)}</div>
      </div>
    `).join('');
    searchResults.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => {
        searchResults.classList.add('hidden');
        globalSearch.value = '';
        if (el.dataset.type === 'dept') {
          currentDeptId = el.dataset.id;
          showView('dept');
        } else {
          currentDeptId = el.dataset.deptid;
          currentBookId = el.dataset.id;
          showView('book');
        }
      });
    });
  }
  searchResults.classList.remove('hidden');
}

// ---------- Events ----------
loginBtn.addEventListener('click', () => {
  loginError.classList.add('hidden');
  codeInput.value = '';
  loginModal.classList.remove('hidden');
  setTimeout(() => codeInput.focus(), 50);
});
logoutBtn.addEventListener('click', () => {
  if (isEditing) forceSave();
  setAuth(false);
  isEditing = false;
  renderAuth();
  if (currentBookId) renderBookView();
});
$('#submitLoginBtn').addEventListener('click', () => {
  if (codeInput.value.trim() === ACCESS_CODE) {
    setAuth(true);
    loginModal.classList.add('hidden');
    renderAuth();
  } else {
    loginError.classList.remove('hidden');
  }
});
$('#cancelLoginBtn').addEventListener('click', () => loginModal.classList.add('hidden'));
codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') $('#submitLoginBtn').click(); });

logoBtn.addEventListener('click', () => showView('departments'));
backToDepts.addEventListener('click', () => showView('departments'));
backToDept.addEventListener('click', () => {
  if (isEditing) forceSave();
  isEditing = false;
  showView('dept');
});

newDeptBtn.addEventListener('click', () => openDeptModal());
editDeptBtn.addEventListener('click', () => {
  if (currentDeptId) openDeptModal(currentDeptId);
});
deleteDeptBtn.addEventListener('click', () => {
  if (currentDeptId) requestDelete('dept', currentDeptId);
});
$('#saveDeptBtn').addEventListener('click', saveDepartment);
$('#cancelDeptBtn').addEventListener('click', () => deptModal.classList.add('hidden'));

deptImageInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  tempDeptImage = await fileToBase64(file);
  deptImagePreview.innerHTML = `<img src="${tempDeptImage}">`;
  deptImagePreview.classList.remove('hidden');
});

newBookBtn.addEventListener('click', () => {
  if (currentDeptId) openBookModal();
});
editBookBtn.addEventListener('click', () => {
  if (currentBookId) {
    if (isEditing) {
      openBookModal(currentBookId);
    } else {
      startEditBook();
    }
  }
});
deleteBookBtn.addEventListener('click', () => {
  if (currentBookId) requestDelete('book', currentBookId);
});
$('#saveBookMetaBtn').addEventListener('click', saveBookMeta);
$('#cancelBookBtn').addEventListener('click', () => bookModal.classList.add('hidden'));

bookCoverInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  tempBookCover = await fileToBase64(file);
  bookCoverPreview.innerHTML = `<img src="${tempBookCover}">`;
  bookCoverPreview.classList.remove('hidden');
});

$('#confirmDeleteBtn').addEventListener('click', confirmDelete);
$('#cancelDeleteBtn').addEventListener('click', () => {
  pendingDelete = null;
  deleteModal.classList.add('hidden');
});

formatBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.format-btn');
  if (!btn || !isEditing) return;
  if (btn.id === 'insertImageBtn') {
    imageInput.click();
    return;
  }
  const cmd = btn.dataset.cmd;
  const val = btn.dataset.value || null;
  if (cmd === 'formatBlock') execFormat('formatBlock', val);
  else execFormat(cmd);
});

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) insertImage(file);
  imageInput.value = '';
});

bookContent.addEventListener('input', () => { if (isEditing) scheduleAutoSave(); });
bookTitleInput.addEventListener('input', () => { if (isEditing) scheduleAutoSave(); });

document.addEventListener('keydown', (e) => {
  if (!isEditing) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 's') { e.preventDefault(); forceSave(); }
  if (mod && e.key === 'b') { e.preventDefault(); execFormat('bold'); }
  if (mod && e.key === 'i') { e.preventDefault(); execFormat('italic'); }
  if (mod && e.key === 'u') { e.preventDefault(); execFormat('underline'); }
});

globalSearch.addEventListener('input', () => runSearch(globalSearch.value));
globalSearch.addEventListener('focus', () => {
  if (globalSearch.value.trim()) runSearch(globalSearch.value);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) searchResults.classList.add('hidden');
});

$$('.modal-backdrop').forEach(el => {
  el.addEventListener('click', () => {
    loginModal.classList.add('hidden');
    deptModal.classList.add('hidden');
    bookModal.classList.add('hidden');
    deleteModal.classList.add('hidden');
  });
});

// ---------- Init ----------
async function init() {
  await refreshDiscordAuth();
  if (!isLoggedIn) { loginBtn?.classList.remove('hidden'); }
  await loadData();
  renderAuth();
  showView('departments');
}

init();
