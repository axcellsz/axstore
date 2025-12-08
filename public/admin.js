// ========== KONFIGURASI ==========

// Ubah password admin di sini
const ADMIN_PASSWORD = "admin123";

const API_USERS = "/admin/users";
const API_DELETE = "/admin/delete-user";
const API_RESET = "/admin/generate-reset-code";

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

    // HEADER: nomor + nama
    const header = document.createElement("div");
    header.className = "user-header";

    const title = document.createElement("div");
    title.className = "user-title";
    title.textContent = `${idx + 1}. ${fullName}`;

    header.appendChild(title);

    // DETAIL DENGAN GARIS-GARIS
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

    // buat 3 baris
    const rowUsername = makeRow("Username", username);
    const rowWa = makeRow("No WA", phone);
    const rowXl = makeRow("No XL", nomorXL);

    fields.appendChild(rowUsername);
    fields.appendChild(rowWa);
    fields.appendChild(rowXl);

    // --- styling & link untuk No WA ---
    const waValueEl = rowWa.querySelector(".user-field-value");
    if (phone && phone !== "-") {
      const phoneDigits = phone.replace(/[^\d]/g, ""); // buang selain angka
      const waLink = document.createElement("a");
      waLink.href = "https://wa.me/" + phoneDigits;
      waLink.target = "_blank";
      waLink.rel = "noopener noreferrer";
      waLink.textContent = phone;
      waLink.className = "user-phone-strong";
      waValueEl.innerHTML = "";
      waValueEl.appendChild(waLink);
    } else {
      waValueEl.classList.add("user-phone-strong");
    }

    // --- styling untuk No XL (hijau & bold juga) ---
    const xlValueEl = rowXl.querySelector(".user-field-value");
    xlValueEl.classList.add("user-phone-strong");

    // BARIS TOMBOL DI BAWAH DETAIL
    const actionsRow = document.createElement("div");
    actionsRow.className = "user-actions-row";

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

    actionsRow.appendChild(btnDelete);
    actionsRow.appendChild(btnCode);
    actionsRow.appendChild(btnBon);

    // susun ke dalam card
    item.appendChild(header);
    item.appendChild(fields);
    item.appendChild(actionsRow);

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

  const url = "/bon.html?phone=" + encodeURIComponent(phone);
  window.location.href = url;
}

// ========== LOGIN & SESSION ==========

function setLoggedInUI(isLoggedIn) {
  const loginCard = document.getElementById("admin-login");
  const adminMain = document.getElementById("admin-main");
  const searchBar = document.getElementById("search-bar");
  const logoutBtn = document.getElementById("btn-logout");

  if (loginCard) loginCard.hidden = isLoggedIn;
  if (adminMain) adminMain.hidden = !isLoggedIn;
  if (searchBar) searchBar.hidden = !isLoggedIn;
  if (logoutBtn) logoutBtn.hidden = !isLoggedIn;
}

function checkSession() {
  const logged = localStorage.getItem("admin_logged_in");
  if (logged === "1") {
    setLoggedInUI(true);
    loadUsers();
  } else {
    setLoggedInUI(false);
  }
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
      localStorage.setItem("admin_logged_in", "1");
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

function initLogout() {
  const logoutBtn = document.getElementById("btn-logout");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("admin_logged_in");
    allUsers = [];
    filteredUsers = [];
    setLoggedInUI(false);
  });
}

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  initLogout();

  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", loadUsers);
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", applyFilter);
  }

  checkSession();
});
