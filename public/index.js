const LOGIN_URL = "/login?screen=login";

/* ========= Helper escape HTML ========= */
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ========= Helper format tanggal ========= */
function formatDateID(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;

  const namaBulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  return `${d.getDate()} ${namaBulan[d.getMonth()]} ${d.getFullYear()}`;
}

/* ========= ALERT ========= */
let alertTimeout = null;

function showAlert(msg, type = "info") {
  const box = document.getElementById("alert");
  if (!box) return;

  box.textContent = msg;
  box.classList.remove("alert-success", "alert-error");

  if (type === "success") box.classList.add("alert-success");
  if (type === "error") box.classList.add("alert-error");

  box.style.display = "block";
  box.style.opacity = "1";

  if (alertTimeout) clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => {
    box.style.opacity = "0";
    setTimeout(() => (box.style.display = "none"), 300);
  }, 4000);
}

/* ========= LOGOUT ========= */
window.doLogout = function () {
  localStorage.removeItem("axstore_user");
  window.location.href = LOGIN_URL;
};

/* ========= PANEL PROFIL SLIDER ========= */
window.openProfilePanel = function () {
  document.getElementById("profile-panel").classList.add("open");
  document.getElementById("profile-panel-backdrop").classList.add("show");
  loadQuota();
};

window.closeProfilePanel = function () {
  document.getElementById("profile-panel").classList.remove("open");
  document.getElementById("profile-panel-backdrop").classList.remove("show");
};

/* ========= CARD SWITCH ========= */
window.openCompleteProfile = function () {
  document.getElementById("card-dashboard").style.display = "none";
  document.getElementById("card-complete-profile").style.display = "block";
  window.closeProfilePanel();
};

window.backToDashboard = function () {
  document.getElementById("card-complete-profile").style.display = "none";
  document.getElementById("card-dashboard").style.display = "block";
};

/* ========= INIT SESSION ========= */
(function initSession() {
  const raw = localStorage.getItem("axstore_user");
  if (!raw) return (window.location.href = LOGIN_URL);

  let session = null;
  try {
    session = JSON.parse(raw);
  } catch (_) {
    localStorage.removeItem("axstore_user");
    return (window.location.href = LOGIN_URL);
  }

  window.__AX_USER = session;

  /*** WELCOME MESSAGE DINONAKTIFKAN ***/
  // const welcome = document.getElementById("welcome");
  // if (welcome) welcome.textContent = "";

  // Header profil
  const uname = escapeHTML(session.username || session.name || "-");
  const phone = escapeHTML(session.phone || "-");

  const headerU = document.getElementById("profile-username-top");
  const headerW = document.getElementById("profile-whatsapp-top");

  if (headerU) headerU.textContent = uname;
  if (headerW) headerW.textContent = phone ? "WhatsApp " + phone : "";

  const initial = (session.username || session.name || "?").charAt(0).toUpperCase();
  const avatarInitial = document.getElementById("profile-avatar-initial");
  if (avatarInitial) avatarInitial.textContent = initial;

  // Event tombol foto
  const fileInput = document.getElementById("profile-photo-input");
  if (fileInput) fileInput.addEventListener("change", handlePhotoChange);

  const btnChange = document.getElementById("btn-change-photo");
  if (btnChange) btnChange.addEventListener("click", () => fileInput.click());

  // Tombol profil
  const closeBtn = document.getElementById("btn-close-profile");
  if (closeBtn) closeBtn.addEventListener("click", () => window.closeProfilePanel());

  const backdrop = document.getElementById("profile-panel-backdrop");
  if (backdrop) backdrop.addEventListener("click", () => window.closeProfilePanel());

  // Detail toggle
  const detailText = document.getElementById("detail-profil-text");
  if (detailText) {
    detailText.addEventListener("click", () => {
      const box = document.getElementById("profile-detail-box");
      const showing = box.style.display === "block";
      box.style.display = showing ? "none" : "block";
      detailText.textContent = showing ? "Lihat detail lengkap" : "Sembunyikan detail";
    });
  }

  // Load data profil & foto
  loadProfileDetail();
  loadProfilePhoto();
})();

/* ========= LOAD DETAIL PROFIL ========= */
async function loadProfileDetail() {
  const user = window.__AX_USER;
  if (!user) return;

  try {
    const res = await fetch("/api/profile?phone=" + encodeURIComponent(user.phone));
    const data = await res.json();

    if (!data.status) return;

    const u = data.data;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || "-";
    };

    setText("detail-fullName", u.fullName);
    setText("detail-email", u.email);
    setText("detail-nomorXL", u.nomorXL);
    setText("detail-jenisKuota", u.jenisKuota);
    setText("detail-alamat", u.alamat);
    setText("info-status", u.profileCompleted ? "Sudah lengkap" : "Belum lengkap");

    // FORM TIDAK DI-PREFILL SESUAI PERMINTAAN
    // (Biarkan kosong)

    const quotaCard = document.getElementById("profile-quota-card");
    const toggle = document.getElementById("profile-detail-toggle");

    if (u.profileCompleted) {
      quotaCard.style.display = "block";
      toggle.style.display = "block";
    } else {
      quotaCard.style.display = "none";
      toggle.style.display = "none";
      document.getElementById("profile-detail-box").style.display = "none";
    }
  } catch (_) {}
}

/* ========= LOAD KUOTA ========= */
async function loadQuota() {
  const user = window.__AX_USER;
  if (!user || !user.profileCompleted) return;

  const amountEl = document.getElementById("quota-amount");
  const expEl = document.getElementById("quota-exp");

  try {
    amountEl.textContent = "...";

    const res = await fetch("/api/kuota?phone=" + encodeURIComponent(user.phone));
    const data = await res.json();

    if (!data.status) throw 0;

    const q = data.data;
    let num = q.totalRemaining.toFixed(2);
    if (num.endsWith(".00")) num = num.slice(0, -3);

    amountEl.textContent = num + " " + q.unit;

    if (q.expDate) expEl.textContent = "Berlaku hingga: " + formatDateID(q.expDate);
  } catch (err) {
    amountEl.textContent = "-";
    expEl.textContent = "";
  }
}

/* ========= FOTO PROFIL ========= */

async function loadProfilePhoto() {
  const user = window.__AX_USER;
  const img = document.getElementById("profile-avatar-img");
  const avatar = document.getElementById("profile-avatar");
  if (!user || !img || !avatar) return;

  avatar.classList.remove("has-photo");
  img.onload = () => avatar.classList.add("has-photo");
  img.onerror = () => avatar.classList.remove("has-photo");

  img.src = "/api/profile/photo?phone=" + encodeURIComponent(user.phone) + "&t=" + Date.now();
}

/* ========= KOMPRES & UPLOAD FOTO ========= */

function compressImage(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => (img.src = e.target.result);
    reader.onerror = reject;

    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxSize) height = (height * maxSize) / width, (width = maxSize);
      } else {
        if (height > maxSize) width = (width * maxSize) / height, (height = maxSize);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        b => (b ? resolve(b) : reject()),
        "image/jpeg",
        0.8
      );
    };

    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handlePhotoChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showAlert("File harus berupa gambar", "error");
    return (e.target.value = "");
  }

  const user = window.__AX_USER;
  if (!user) return;

  try {
    const comp = await compressImage(file);
    if (comp.size > 300 * 1024) {
      showAlert("Foto setelah kompres masih terlalu besar (>300KB)", "error");
      return (e.target.value = "");
    }

    const fd = new FormData();
    fd.append("phone", user.phone);
    fd.append("photo", comp, "avatar.jpg");

    const r = await fetch("/api/profile/photo", { method: "POST", body: fd });
    const d = await r.json();

    if (!r.ok || !d.ok) throw 0;

    showAlert("Foto profil diperbarui", "success");
    loadProfilePhoto();
  } catch {
    showAlert("Gagal upload foto", "error");
  } finally {
    e.target.value = "";
  }
}
