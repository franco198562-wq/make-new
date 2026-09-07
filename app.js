// ==============================
// Staff Documentation Portal
// ==============================

const API_BASE = "/api";

let data = {
  departments: [],
  books: []
};

let currentDeptId = null;
let currentBookId = null;
let isEditing = false;
let isLoggedIn = false;
let currentUser = null;
let currentPermissions = [];
let pendingDelete = null;
let editingDeptId = null;
let editingBookId = null;
let tempDeptImage = null;
let tempBookCover = null;
let autoSaveTimer = null;

// ==============================
// Helpers
// ==============================

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date) {
  if (!date) return "Unknown";

  return new Date(date).toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

function getDept(id) {
  return data.departments.find(dept => dept.id === id);
}

function getBook(id) {
  return data.books.find(book => book.id === id);
}

function booksInDept(departmentId) {
  return data.books.filter(book => book.departmentId === departmentId);
}

function canEdit() {
  return isLoggedIn;
}

// ==============================
// Authentication
// ==============================

async function refreshDiscordAuth() {
  try {
    const response = await fetch("/api/me", {
      credentials: "include",
      cache: "no-store"
    });

    const result = await response.json();

    isLoggedIn = Boolean(result.loggedIn);
    currentUser = result.user || null;
    currentPermissions = result.permissions || [];

    return result;
  } catch (error) {
    console.error("Authentication check failed:", error);

    isLoggedIn = false;
    currentUser = null;
    currentPermissions = [];

    return {
      loggedIn: false,
      permissions: []
    };
  }
}

function renderAuth() {
  if (isLoggedIn) {
    $("#loginBtn")?.classList.add("hidden");
    $("#logoutBtn")?.classList.remove("hidden");

    $("#newDeptBtn")?.classList.remove("hidden");
    $("#newBookBtn")?.classList.remove("hidden");

    $("#editDeptBtn")?.classList.remove("hidden");
    $("#deleteDeptBtn")?.classList.remove("hidden");

    $("#editBookBtn")?.classList.remove("hidden");
    $("#deleteBookBtn")?.classList.remove("hidden");
  } else {
    $("#loginBtn")?.classList.remove("hidden");
    $("#logoutBtn")?.classList.add("hidden");

    $("#newDeptBtn")?.classList.add("hidden");
    $("#newBookBtn")?.classList.add("hidden");

    $("#editDeptBtn")?.classList.add("hidden");
    $("#deleteDeptBtn")?.classList.add("hidden");

    $("#editBookBtn")?.classList.add("hidden");
    $("#deleteBookBtn")?.classList.add("hidden");
  }
}

// ==============================
// API Data
// ==============================

async function loadData() {
  try {
    const response = await fetch(`${API_BASE}/data`, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });

    if (response.status === 401) {
      data = {
        departments: [],
        books: []
      };

      return false;
    }

    if (response.status === 403) {
      data = {
        departments: [],
        books: []
      };

      alert("Your Discord account does not have permission to view the documentation.");
      return false;
    }

    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.status}`);
    }

    const result = await response.json();

    data = {
      departments: Array.isArray(result.departments)
        ? result.departments
        : [],

      books: Array.isArray(result.books)
        ? result.books
        : []
    };

    return true;
  } catch (error) {
    console.error("Load error:", error);

    data = {
      departments: [],
      books: []
    };

    alert("Unable to load shared data. Check your Cloudflare Worker.");
    return false;
  }
}

async function saveData() {
  if (!isLoggedIn) {
    alert("You must sign in with Discord before saving.");
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/data`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (response.status === 401) {
      alert("Your Discord session has expired. Please sign in again.");
      isLoggedIn = false;
      renderAuth();
      return false;
    }

    if (response.status === 403) {
      alert("You do not have permission to save changes.");
      return false;
    }

    if (!response.ok) {
      throw new Error(`Failed to save data: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error("Save error:", error);
    alert("Unable to save changes. Check your Cloudflare Worker.");
    return false;
  }
}

// ==============================
// Views
// ==============================

function showView(view) {
  $("#viewDepartments")?.classList.add("hidden");
  $("#viewDeptDetail")?.classList.add("hidden");
  $("#viewBook")?.classList.add("hidden");

  $("#sidebarHome")?.classList.add("hidden");
  $("#sidebarDept")?.classList.add("hidden");
  $("#sidebarBook")?.classList.add("hidden");

  $("#metaBox")?.classList.add("hidden");

  if (view === "departments") {
    currentDeptId = null;
    currentBookId = null;
    isEditing = false;

    $("#viewDepartments")?.classList.remove("hidden");
    $("#sidebarHome")?.classList.remove("hidden");

    renderDepartments();
  }

  if (view === "dept") {
    currentBookId = null;
    isEditing = false;

    $("#viewDeptDetail")?.classList.remove("hidden");
    $("#sidebarDept")?.classList.remove("hidden");

    renderDeptDetail();
  }

  if (view === "book") {
    $("#viewBook")?.classList.remove("hidden");
    $("#sidebarBook")?.classList.remove("hidden");

    renderBookView();
  }

  renderAuth();
}

function renderDepartments() {
  const grid = $("#deptGrid");
  const empty = $("#deptEmpty");

  if (!grid) return;

  grid.innerHTML = "";

  if (data.departments.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }

  empty?.classList.add("hidden");

  const departments = [...data.departments].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  departments.forEach(department => {
    const card = document.createElement("div");

    card.className = "card";

    card.innerHTML = `
      <div class="card-cover">
        ${
          department.image
            ? `<img src="${department.image}" alt="">`
            : `<span class="placeholder">📁</span>`
        }
      </div>

      <div class="card-body">
        <div class="card-title">
          ${escapeHtml(department.name)}
        </div>

        <div class="card-desc">
          ${escapeHtml(department.description || "")}
        </div>

        <div class="card-meta">
          ${booksInDept(department.id).length}
          ${
            booksInDept(department.id).length === 1
              ? "book"
              : "books"
          }
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      currentDeptId = department.id;
      showView("dept");
    });

    grid.appendChild(card);
  });
}

function renderDeptDetail() {
  const department = getDept(currentDeptId);

  if (!department) {
    showView("departments");
    return;
  }

  $("#deptTitle").textContent = department.name;
  $("#deptDesc").textContent = department.description || "";

  const breadcrumb = $("#deptBreadcrumb");

  if (breadcrumb) {
    breadcrumb.innerHTML = `
      <span data-go="departments">Departments</span>
      <span class="sep">›</span>
      <span class="current">${escapeHtml(department.name)}</span>
    `;

    breadcrumb
      .querySelector('[data-go="departments"]')
      ?.addEventListener("click", () => {
        showView("departments");
      });
  }

  $("#metaBox")?.classList.remove("hidden");

  if ($("#metaContent")) {
    $("#metaContent").innerHTML = `
      Created ${formatDate(department.createdAt)}<br>
      Updated ${formatDate(department.updatedAt)}
    `;
  }

  const grid = $("#bookGrid");
  const empty = $("#bookEmpty");

  if (!grid) return;

  grid.innerHTML = "";

  const books = booksInDept(currentDeptId);

  if (books.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }

  empty?.classList.add("hidden");

  books.forEach(book => {
    const card = document.createElement("div");

    card.className = "card";

    card.innerHTML = `
      <div class="card-cover">
        ${
          book.cover
            ? `<img src="${book.cover}" alt="">`
            : `<span class="placeholder">📄</span>`
        }
      </div>

      <div class="card-body">
        <div class="card-title">
          ${escapeHtml(book.title)}
        </div>

        <div class="card-desc">
          ${escapeHtml(book.description || "")}
        </div>

        <div class="card-meta">
          Updated ${formatDate(book.updatedAt)}
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      currentBookId = book.id;
      showView("book");
    });

    grid.appendChild(card);
  });
}

function renderBookView() {
  const book = getBook(currentBookId);

  if (!book) {
    showView("departments");
    return;
  }

  const department = getDept(book.departmentId);

  if (!department) {
    showView("departments");
    return;
  }

  const breadcrumb = $("#bookBreadcrumb");

  if (breadcrumb) {
    breadcrumb.innerHTML = `
      <span data-go="departments">Departments</span>
      <span class="sep">›</span>
      <span data-go="dept">${escapeHtml(department.name)}</span>
      <span class="sep">›</span>
      <span class="current">${escapeHtml(book.title)}</span>
    `;

    breadcrumb.querySelectorAll("[data-go]").forEach(element => {
      element.addEventListener("click", () => {
        if (element.dataset.go === "departments") {
          showView("departments");
        }

        if (element.dataset.go === "dept") {
          currentDeptId = department.id;
          showView("dept");
        }
      });
    });
  }

  if ($("#bookTitleInput")) {
    $("#bookTitleInput").value = book.title;
  }

  if ($("#bookDescDisplay")) {
    $("#bookDescDisplay").textContent = book.description || "";
  }

  if ($("#bookContent")) {
    $("#bookContent").innerHTML = book.content || "";
  }

  if (isEditing && isLoggedIn) {
    $("#bookTitleInput")?.removeAttribute("readonly");

    if ($("#bookContent")) {
      $("#bookContent").contentEditable = "true";
    }

    $("#formatBar")?.classList.remove("hidden");
  } else {
    $("#bookTitleInput")?.setAttribute("readonly", "true");

    if ($("#bookContent")) {
      $("#bookContent").contentEditable = "false";
    }

    $("#formatBar")?.classList.add("hidden");
  }

  $("#metaBox")?.classList.remove("hidden");

  if ($("#metaContent")) {
    $("#metaContent").innerHTML = `
      Created ${formatDate(book.createdAt)}<br>
      Updated ${formatDate(book.updatedAt)}
    `;
  }
}

// ==============================
// Book Editing
// ==============================

function startEditBook() {
  if (!isLoggedIn || !currentBookId) return;

  isEditing = true;
  renderBookView();

  $("#bookTitleInput")?.focus();
}

function stopEditing() {
  isEditing = false;
  renderBookView();
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);

  $("#saveStatus")?.classList.remove("hidden");
  $("#saveStatus").textContent = "Saving...";

  autoSaveTimer = setTimeout(() => {
    forceSave();
  }, 1500);
}

async function forceSave() {
  if (!isEditing || !currentBookId) return;

  const book = getBook(currentBookId);

  if (!book) return;

  book.title = $("#bookTitleInput")?.value.trim() || book.title;
  book.content = $("#bookContent")?.innerHTML || "";
  book.updatedAt = Date.now();

  const saved = await saveData();

  if (saved) {
    $("#saveStatus").textContent = "Saved";
  } else {
    $("#saveStatus").textContent = "Save failed";
  }

  renderBookView();
}

function execFormat(command, value = null) {
  if (!isEditing) return;

  document.execCommand(command, false, value);

  $("#bookContent")?.focus();
  scheduleAutoSave();
}

async function insertImage(file) {
  if (!isEditing) return;

  const image = await fileToBase64(file);

  document.execCommand(
    "insertHTML",
    false,
    `<img src="${image}" alt="" style="max-width:100%;">`
  );

  scheduleAutoSave();
}

// ==============================
// Department Modal
// ==============================

function openDeptModal(id = null) {
  editingDeptId = id;
  tempDeptImage = null;

  $("#deptImagePreview")?.classList.add("hidden");

  if ($("#deptImageInput")) {
    $("#deptImageInput").value = "";
  }

  if (id) {
    const department = getDept(id);

    $("#deptModalTitle").textContent = "Edit Department";
    $("#deptNameInput").value = department.name;
    $("#deptDescInput").value = department.description || "";

    if (department.image) {
      tempDeptImage = department.image;

      $("#deptImagePreview").innerHTML = `
        <img src="${department.image}" alt="">
      `;

      $("#deptImagePreview").classList.remove("hidden");
    }
  } else {
    $("#deptModalTitle").textContent = "New Department";
    $("#deptNameInput").value = "";
    $("#deptDescInput").value = "";
  }

  $("#deptModal")?.classList.remove("hidden");
  $("#deptNameInput")?.focus();
}

async function saveDepartment() {
  if (!isLoggedIn) return;

  const name = $("#deptNameInput")?.value.trim();

  if (!name) {
    $("#deptNameInput")?.focus();
    return;
  }

  if (editingDeptId) {
    const department = getDept(editingDeptId);

    department.name = name;
    department.description = $("#deptDescInput")?.value.trim() || "";
    department.updatedAt = Date.now();

    if (tempDeptImage !== null) {
      department.image = tempDeptImage;
    }
  } else {
    data.departments.push({
      id: uid(),
      name,
      description: $("#deptDescInput")?.value.trim() || "",
      image: tempDeptImage || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  await saveData();

  $("#deptModal")?.classList.add("hidden");

  if (currentDeptId && editingDeptId === currentDeptId) {
    renderDeptDetail();
  } else {
    showView("departments");
  }
}

// ==============================
// Book Modal
// ==============================

function openBookModal(id = null) {
  editingBookId = id;
  tempBookCover = null;

  $("#bookCoverPreview")?.classList.add("hidden");

  if ($("#bookCoverInput")) {
    $("#bookCoverInput").value = "";
  }

  if (id) {
    const book = getBook(id);

    $("#bookModalTitle").textContent = "Edit Book";
    $("#bookNameInput").value = book.title;
    $("#bookDescInput").value = book.description || "";

    if (book.cover) {
      tempBookCover = book.cover;

      $("#bookCoverPreview").innerHTML = `
        <img src="${book.cover}" alt="">
      `;

      $("#bookCoverPreview").classList.remove("hidden");
    }
  } else {
    $("#bookModalTitle").textContent = "New Book";
    $("#bookNameInput").value = "";
    $("#bookDescInput").value = "";
  }

  $("#bookModal")?.classList.remove("hidden");
  $("#bookNameInput")?.focus();
}

async function saveBookMeta() {
  if (!isLoggedIn) return;

  const title = $("#bookNameInput")?.value.trim();

  if (!title) {
    $("#bookNameInput")?.focus();
    return;
  }

  if (editingBookId) {
    const book = getBook(editingBookId);

    book.title = title;
    book.description = $("#bookDescInput")?.value.trim() || "";
    book.updatedAt = Date.now();

    if (tempBookCover !== null) {
      book.cover = tempBookCover;
    }

    await saveData();

    $("#bookModal")?.classList.add("hidden");

    renderBookView();
  } else {
    const book = {
      id: uid(),
      departmentId: currentDeptId,
      title,
      description: $("#bookDescInput")?.value.trim() || "",
      cover: tempBookCover || null,
      content: "<p>Start writing your documentation here...</p>",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    data.books.push(book);

    await saveData();

    $("#bookModal")?.classList.add("hidden");

    currentBookId = book.id;
    isEditing = true;

    showView("book");
  }
}

// ==============================
// Delete
// ==============================

function requestDelete(type, id) {
  pendingDelete = {
    type,
    id
  };

  if (type === "book") {
    const book = getBook(id);

    $("#deleteMessage").textContent =
      `Delete book "${book?.title}"? This cannot be undone.`;
  } else {
    const department = getDept(id);

    $("#deleteMessage").textContent =
      `Delete "${department?.name}" and all its books? This cannot be undone.`;
  }

  $("#deleteModal")?.classList.remove("hidden");
}

async function confirmDelete() {
  if (!pendingDelete || !isLoggedIn) return;

  const { type, id } = pendingDelete;

  if (type === "book") {
    data.books = data.books.filter(book => book.id !== id);

    await saveData();

    currentBookId = null;
    isEditing = false;

    $("#deleteModal")?.classList.add("hidden");

    showView("dept");
  }

  if (type === "dept") {
    data.books = data.books.filter(book => book.departmentId !== id);
    data.departments = data.departments.filter(dept => dept.id !== id);

    await saveData();

    currentDeptId = null;

    $("#deleteModal")?.classList.add("hidden");

    showView("departments");
  }

  pendingDelete = null;
}

// ==============================
// Search
// ==============================

function runSearch(query) {
  const search = query.trim().toLowerCase();

  if (!search) {
    $("#searchResults")?.classList.add("hidden");
    return;
  }

  const results = [];

  data.departments.forEach(department => {
    if (
      department.name.toLowerCase().includes(search) ||
      (department.description || "").toLowerCase().includes(search)
    ) {
      results.push({
        type: "dept",
        id: department.id,
        title: department.name,
        meta: "Department"
      });
    }
  });

  data.books.forEach(book => {
    const department = getDept(book.departmentId);

    if (
      book.title.toLowerCase().includes(search) ||
      (book.description || "").toLowerCase().includes(search) ||
      (book.content || "").toLowerCase().includes(search)
    ) {
      results.push({
        type: "book",
        id: book.id,
        deptId: book.departmentId,
        title: book.title,
        meta: department?.name || "Book"
      });
    }
  });

  if (results.length === 0) {
    $("#searchResults").innerHTML = `
      <div class="search-item">
        <div class="si-title">No results found</div>
      </div>
    `;
  } else {
    $("#searchResults").innerHTML = results
      .slice(0, 12)
      .map(result => `
        <div
          class="search-item"
          data-type="${result.type}"
          data-id="${result.id}"
          data-deptid="${result.deptId || ""}"
        >
          <div class="si-title">
            ${escapeHtml(result.title)}
          </div>

          <div class="si-meta">
            ${escapeHtml(result.meta)}
          </div>
        </div>
      `)
      .join("");

    $("#searchResults")
      .querySelectorAll(".search-item")
      .forEach(element => {
        element.addEventListener("click", () => {
          $("#searchResults").classList.add("hidden");
          $("#globalSearch").value = "";

          if (element.dataset.type === "dept") {
            currentDeptId = element.dataset.id;
            showView("dept");
          } else {
            currentDeptId = element.dataset.deptid;
            currentBookId = element.dataset.id;
            showView("book");
          }
        });
      });
  }

  $("#searchResults")?.classList.remove("hidden");
}

// ==============================
// Events
// ==============================

$("#loginBtn")?.addEventListener("click", event => {
  event.preventDefault();
  window.location.href = "/api/auth/login";
});

$("#logoutBtn")?.addEventListener("click", event => {
  event.preventDefault();

  if (isEditing) {
    forceSave();
  }

  window.location.href = "/api/auth/logout";
});

$("#logoBtn")?.addEventListener("click", () => {
  showView("departments");
});

$("#backToDepts")?.addEventListener("click", () => {
  showView("departments");
});

$("#backToDept")?.addEventListener("click", () => {
  if (isEditing) {
    forceSave();
  }

  isEditing = false;
  showView("dept");
});

$("#newDeptBtn")?.addEventListener("click", () => {
  openDeptModal();
});

$("#editDeptBtn")?.addEventListener("click", () => {
  if (currentDeptId) {
    openDeptModal(currentDeptId);
  }
});

$("#deleteDeptBtn")?.addEventListener("click", () => {
  if (currentDeptId) {
    requestDelete("dept", currentDeptId);
  }
});

$("#saveDeptBtn")?.addEventListener("click", saveDepartment);

$("#cancelDeptBtn")?.addEventListener("click", () => {
  $("#deptModal")?.classList.add("hidden");
});

$("#deptImageInput")?.addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  tempDeptImage = await fileToBase64(file);

  $("#deptImagePreview").innerHTML = `
    <img src="${tempDeptImage}" alt="">
  `;

  $("#deptImagePreview").classList.remove("hidden");
});

$("#newBookBtn")?.addEventListener("click", () => {
  if (currentDeptId) {
    openBookModal();
  }
});

$("#editBookBtn")?.addEventListener("click", () => {
  if (!currentBookId) return;

  if (isEditing) {
    openBookModal(currentBookId);
  } else {
    startEditBook();
  }
});

$("#deleteBookBtn")?.addEventListener("click", () => {
  if (currentBookId) {
    requestDelete("book", currentBookId);
  }
});

$("#saveBookMetaBtn")?.addEventListener("click", saveBookMeta);

$("#cancelBookBtn")?.addEventListener("click", () => {
  $("#bookModal")?.classList.add("hidden");
});

$("#bookCoverInput")?.addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  tempBookCover = await fileToBase64(file);

  $("#bookCoverPreview").innerHTML = `
    <img src="${tempBookCover}" alt="">
  `;

  $("#bookCoverPreview").classList.remove("hidden");
});

$("#confirmDeleteBtn")?.addEventListener("click", confirmDelete);

$("#cancelDeleteBtn")?.addEventListener("click", () => {
  pendingDelete = null;
  $("#deleteModal")?.classList.add("hidden");
});

$("#formatBar")?.addEventListener("click", event => {
  const button = event.target.closest(".format-btn");

  if (!button || !isEditing) return;

  if (button.id === "insertImageBtn") {
    $("#imageInput")?.click();
    return;
  }

  const command = button.dataset.cmd;
  const value = button.dataset.value || null;

  execFormat(command, value);
});

$("#imageInput")?.addEventListener("change", event => {
  const file = event.target.files[0];

  if (file) {
    insertImage(file);
  }

  event.target.value = "";
});

$("#bookContent")?.addEventListener("input", () => {
  if (isEditing) {
    scheduleAutoSave();
  }
});

$("#bookTitleInput")?.addEventListener("input", () => {
  if (isEditing) {
    scheduleAutoSave();
  }
});

$("#globalSearch")?.addEventListener("input", event => {
  runSearch(event.target.value);
});

$("#globalSearch")?.addEventListener("focus", event => {
  if (event.target.value.trim()) {
    runSearch(event.target.value);
  }
});

document.addEventListener("click", event => {
  if (!event.target.closest(".search-wrap")) {
    $("#searchResults")?.classList.add("hidden");
  }
});

document.addEventListener("keydown", event => {
  if (!isEditing) return;

  const modifier = event.ctrlKey || event.metaKey;

  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    forceSave();
  }

  if (modifier && event.key.toLowerCase() === "b") {
    event.preventDefault();
    execFormat("bold");
  }

  if (modifier && event.key.toLowerCase() === "i") {
    event.preventDefault();
    execFormat("italic");
  }

  if (modifier && event.key.toLowerCase() === "u") {
    event.preventDefault();
    execFormat("underline");
  }
});

$$(".modal-backdrop").forEach(backdrop => {
  backdrop.addEventListener("click", () => {
    $("#loginModal")?.classList.add("hidden");
    $("#deptModal")?.classList.add("hidden");
    $("#bookModal")?.classList.add("hidden");
    $("#deleteModal")?.classList.add("hidden");
  });
});

// ==============================
// Init
// ==============================

async function init() {
  const auth = await refreshDiscordAuth();

  renderAuth();

  if (!auth.loggedIn) {
    showView("departments");
    return;
  }

  await loadData();

  renderAuth();
  showView("departments");
}

init();
