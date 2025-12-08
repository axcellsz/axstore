// ========== KONFIGURASI ==========

// Ganti ini sesuai keinginan kamu
const ADMIN_PASSWORD = "admin123";  // <<=== ubah di sini kalau mau

const API_USERS = "/admin/users";
const API_DELETE = "/admin/delete-user";
const API_RESET = "/admin/generate-reset-code";

// Data user global
let allUsers = [];
let filteredUsers = [];

// ========== UTIL ==========
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message || "";
  toast.hidden = false;

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

function showInfo(message) {
  const info = document.getElementById("admin-info");
  if (!info) return;

  if (!message) {
    info.hidden = true;
    info.textContent = "";
    return;
  }
  info.textContent = message;
  info.hidden = false;
}

function updateSummary() {
  const summaryEl = document.getElementById("admin-summary");
  if (!summaryEl) return;

  const total = allUsers.length;
  const shown = filteredUsers.length;
  if (!total) {
    summaryEl.textContent = "Belum ada user terdaftar.";
    return;
  }
  if (shown === total) {
    summaryEl.textContent = `Total user: ${total}`;
  } else {
    summaryEl.textContent = `Menampilkan ${shown} dari ${total} user`;
  }
}

// ========== RENDER USER LIST ==========
function renderUsers() {
  const list = document.getElementById("userList");
  if (!list) return;

  list.innerHTML = "";

  if (!filteredUsers.length) {
    const empty = document.createElement("div");
    empty.className = "user-field-value";
    empty.textContent = "Tidak ada user yang cocok dengan pencarian.";
    list.appendChild(empty);
    updateSummary();
    return;
  }

  filteredUsers.forEach((u, idx) => {
    const item = document.createElement("div");
    item.className = "user-item";

    const fullName = u.fullName || u.name || u.username || "(Tanpa nama)";
    const username = u.username || u.name || "-";
    const phone = u.phone || "-";
    const nomorXL = u.nomorXL || "-";

    // header: nomor + nama + tombol
    const header = document.createElement("div");
    header.className = "user-header";

    const title = document.createElement("div");
    title.className = "user-title";
    title.textContent = `${idx + 1}. ${fullName}`;

    const actions = document.createElement("div");
    actions.className = "user-actions";

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn btn-danger";
    btnDelete.textContent = "DELETE";
    btnDelete.addEventListener("click", () => handleDelete(u));

    const btnCode = document.createElement("button");
    btnCode.className = "btn btn-dark";
    btnCode.textContent = "KODE";
    btnCode.addEventListener("click", () => handleCode(u));

    const btnBon = document.createElement("button");
    btnBon.className = "btn btn-outline btn-small";
    btnBon.textContent = "BON";
    btnBon.addEventListener("click", () => handleBon(u));

    actions.appendChild(btnDelete);
    actions.appendChild(btnCode);
    actions.appendChild(btnBon);

    header.appendChild(title);
    header.appendChild(actions);

    // bagian bawah dengan garis-garis
    const fields = document.createElement("div");
    fields.className = "user-fields";

    const makeRow = (label, value) => {
      const row = document.createElement("div");
      row.className = "user-field-row";

      const l = document.createElement("div");
      l.className = "user-field-label";
      l.textContent = label;

      const v = document.createElement("div");
      v.className = "user-field-value";
      v.textContent = value || "-";

      row.appendChild(l);
      row.appendChild(v);
      return row;
    };

    fields.appendChild(makeRow("Username", username));
    fields.appendChild(makeRow("No WA", phone));
    fields.appendChild(makeRow("No XL", nomorXL));

    item.appendChild(header);
    item.appendChild(fields);

    list.appendChild(item);
  });

  updateSummary();
}

    // Kanan (aksi)
    const actions = document.createElement("div");
    actions.className = "user-actions";

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn btn-danger";
    btnDelete.textContent = "DELETE";
    btnDelete.addEventListener("click", () => handleDelete(u));

    const btnCode = document.createElement("button");
    btnCode.className = "btn btn-dark";
    btnCode.textContent = "KODE";
    btnCode.addEventListener("click", () => handleCode(u));

    const btnBon = document.createElement("button");
    btnBon.className = "btn btn-outline btn-small";
    btnBon.textContent = "BON";
    btnBon.addEventListener("click", () => handleBon(u));

    actions.appendChild(btnDelete);
    actions.appendChild(btnCode);
    actions.appendChild(btnBon);

    item.appendChild(left);
    item.appendChild(actions);

    list.appendChild(item);
  });

  updateSummary();
}

// ========== LOAD USERS ==========
async function loadUsers() {
  showInfo("");
  try {
    const res = await fetch(API_USERS);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok || !Array.isArray(data.users)) {
      throw new Error("Gagal memuat user");
    }

    allUsers = data.users;
    applyFilter(); // gunakan filter saat ini
  } catch (err) {
    console.error(err);
    showInfo("Gagal memuat daftar user");
  }
}

// ========== FILTER ==========
function applyFilter() {
  const searchInput = document.getElementById("searchInput");
  const keyword = (searchInput?.value || "").trim().toLowerCase();

  if (!keyword) {
    filteredUsers = [...allUsers];
  } else {
    filteredUsers = allUsers.filter((u) => {
      const name = (u.fullName || u.name || u.username || "").toLowerCase();
      return name.includes(keyword);
    });
  }

  renderUsers();
}

// ========== ACTIONS ==========
async function handleDelete(user) {
  const phone = user.phone;
  const name = user.fullName || user.name || user.username || "(Tanpa nama)";
  if (!phone) {
    showToast("User tidak memiliki nomor WhatsApp yang valid.");
    return;
  }

  const ok = confirm(`Hapus user ${name} (${phone}) ?`);
  if (!ok) return;

  try {
    const res = await fetch(API_DELETE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || "Gagal menghapus user");
    }

    showToast("User dihapus");
    await loadUsers();
  } catch (err) {
    console.error(err);
    showToast("Terjadi kesalahan saat menghapus user");
  }
}

async function handleCode(user) {
  const phone = user.phone;
  const name = user.fullName || user.name || user.username || "(Tanpa nama)";
  if (!phone) {
    showToast("User tidak memiliki nomor WhatsApp yang valid.");
    return;
  }

  try {
    const res = await fetch(API_RESET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false || !data.code) {
      throw new Error(data.message || "Gagal membuat kode reset");
    }

    const msg = `Kode reset untuk ${name} (${phone}): ${data.code}`;
    // Tampilkan via alert (jelas & tidak hilang otomatis)
    alert(msg);
  } catch (err) {
    console.error(err);
    showToast("Terjadi kesalahan saat membuat kode reset");
  }
}

function handleBon(user) {
  const phone = user.phone;
  if (!phone) {
    showToast("User tidak memiliki nomor WhatsApp yang valid.");
    return;
  }

  // arahkan ke halaman bon dengan query phone
  const url = "/bon.html?phone=" + encodeURIComponent(phone);
  window.location.href = url;
}

// ========== LOGIN ADMIN ==========
function setLoggedInUI(isLoggedIn) {
  const loginCard = document.getElementById("admin-login");
  const adminMain = document.getElementById("admin-main");
  const searchBar = document.getElementById("search-bar");

  if (loginCard) loginCard.hidden = isLoggedIn;
  if (adminMain) adminMain.hidden = !isLoggedIn;
  if (searchBar) searchBar.hidden = !isLoggedIn;
}

function initLogin() {
  const form = document.getElementById("admin-login-form");
  const inputPwd = document.getElementById("admin-password");
  const errBox = document.getElementById("login-error");

  if (!form || !inputPwd) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pwd = inputPwd.value || "";

    if (pwd === ADMIN_PASSWORD) {
      // sukses
      if (errBox) {
        errBox.hidden = true;
        errBox.textContent = "";
      }
      setLoggedInUI(true);
      inputPwd.value = "";
      loadUsers();
    } else {
      if (errBox) {
        errBox.textContent = "Password salah.";
        errBox.hidden = false;
      }
      inputPwd.select();
    }
  });
}

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", () => {
  // login
  initLogin();

  // tombol refresh
  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", loadUsers);
  }

  // search
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", applyFilter);
  }
});
