// =======================
// KONSTAN & HELPER UMUM
// =======================

// URL login default
const LOGIN_URL = "/login?screen=login";

/* Escape HTML biar aman */
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ALERT sederhana pakai #alert */
let alertTimeout = null;

function showAlert(message, type = "info") {
  const box = document.getElementById("alert");
  if (!box) return;

  box.textContent = message || "";

  box.style.display = "block";
  box.style.position = "fixed";
  box.style.top = "12px";
  box.style.right = "12px";
  box.style.padding = "8px 10px";
  box.style.fontSize = "13px";
  box.style.borderRadius = "8px";
  box.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)";

  box.style.backgroundColor =
    type === "error" ? "#fee2e2" : type === "success" ? "#dcfce7" : "#e5e7eb";
  box.style.color =
    type === "error" ? "#991b1b" : type === "success" ? "#166534" : "#111827";

  if (alertTimeout) clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => {
    box.style.display = "none";
  }, 4000);
}

// ====================================
// INIT SESI & RENDER UI DARI SESSION
// ====================================

function renderSessionUI() {
  const session = window.__AX_USER;
  if (!session) return;

  // Teks welcome singkat di dashboard utama
  const welcome = document.getElementById("welcome");
  if (welcome) {
    const uname = session.username || session.name || "(tanpa nama)";
    const phone = session.phone || "-";
    welcome.textContent = `Anda login sebagai ${uname} (${phone}).`;
  }

  // Isi panel profil di samping kanan
  const info = document.getElementById("profile-info");
  if (info) {
    const uname = escapeHTML(session.username || session.name || "-");
    const phone = escapeHTML(session.phone || "-");
    const statusText = session.profileCompleted ? "Sudah lengkap" : "Belum lengkap";

    info.innerHTML = `
      <p>Username <strong>${uname}</strong></p>
      <p>No. WhatsApp <strong>${phone}</strong></p>
      <p>Status profil <strong>${statusText}</strong></p>
    `;
  }

  // Inisial di tombol bulat (pojok kanan atas)
  const avatarInitial = document.getElementById("profile-avatar-initial");
  if (avatarInitial) {
    const src = session.username || session.phone || "";
    avatarInitial.textContent = src ? src.charAt(0).toUpperCase() : "P";
  }
}

/* Cek sesi di localStorage */
(function initSession() {
  const raw = localStorage.getItem("axstore_user");
  if (!raw) {
    window.location.href = LOGIN_URL;
    return;
  }

  let session;
  try {
    session = JSON.parse(raw);
  } catch (e) {
    localStorage.removeItem("axstore_user");
    window.location.href = LOGIN_URL;
    return;
  }

  // simpan global
  window.__AX_USER = session;

  // render UI berdasarkan session
  renderSessionUI();
})();

// ======================
// LOGOUT GLOBAL
// ======================
window.doLogout = function () {
  localStorage.removeItem("axstore_user");
  window.location.href = LOGIN_URL;
};

// ======================
// PANEL PROFIL (SLIDE)
// ======================

function openProfilePanel() {
  const panel = document.getElementById("profile-panel");
  const backdrop = document.getElementById("profile-panel-backdrop");
  if (!panel || !backdrop) return;

  panel.classList.add("open");
  backdrop.classList.add("show");
}

function closeProfilePanel() {
  const panel = document.getElementById("profile-panel");
  const backdrop = document.getElementById("profile-panel-backdrop");
  if (!panel || !backdrop) return;

  panel.classList.remove("open");
  backdrop.classList.remove("show");
}

// ==============================
// CARD LENGKAPI PROFIL (SCREEN)
// ==============================

function openCompleteProfile() {
  const cardDash = document.getElementById("card-dashboard");
  const cardProfile = document.getElementById("card-complete-profile");
  if (!cardDash || !cardProfile) return;

  cardDash.style.display = "none";
  cardProfile.style.display = "block";

  // kalau dibuka dari panel profil, panel ditutup
  closeProfilePanel();
}

function backToDashboard() {
  const cardDash = document.getElementById("card-dashboard");
  const cardProfile = document.getElementById("card-complete-profile");
  if (!cardDash || !cardProfile) return;

  cardProfile.style.display = "none";
  cardDash.style.display = "block";
}

// supaya bisa dipanggil dari HTML (onclick pada tombol Batal)
window.backToDashboard = backToDashboard;

// ===============================
// EVENT LISTENER ELEMENT2 UI
// ===============================
document.addEventListener("DOMContentLoaded", function () {
  const btnProfile = document.getElementById("btn-profile");
  const btnCloseProfile = document.getElementById("btn-close-profile");
  const backdrop = document.getElementById("profile-panel-backdrop");
  const btnOpenComplete = document.getElementById("btn-open-complete-profile");

  if (btnProfile) {
    btnProfile.addEventListener("click", openProfilePanel);
  }
  if (btnCloseProfile) {
    btnCloseProfile.addEventListener("click", closeProfilePanel);
  }
  if (backdrop) {
    backdrop.addEventListener("click", closeProfilePanel);
  }
  if (btnOpenComplete) {
    btnOpenComplete.addEventListener("click", openCompleteProfile);
  }
});

// ===============================
// SUBMIT FORM LENGKAPI PROFIL
// ===============================

const formProfile = document.getElementById("form-complete-profile");
if (formProfile) {
  formProfile.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(formProfile);
    // Saat ini belum kirim ke server, hanya contoh.
    // Nanti tinggal tambahkan fetch("/api/profile/save", { method:"POST", body: formData })

    try {
      const raw = localStorage.getItem("axstore_user");
      if (raw) {
        const sess = JSON.parse(raw);

        // tandai profil sudah lengkap (dummy)
        sess.profileCompleted = true;

        // (opsional) simpan sebagian data ke session lokal
        sess.fullName = formData.get("fullName") || sess.fullName;
        sess.email = formData.get("email") || sess.email;

        localStorage.setItem("axstore_user", JSON.stringify(sess));
        window.__AX_USER = sess;
      }
    } catch (err) {
      console.error(err);
    }

    // update tampilan panel profil
    renderSessionUI();

    showAlert("Profil tersimpan (belum dikirim ke server)", "success");

    // kembali ke dashboard
    backToDashboard();
  });
}
