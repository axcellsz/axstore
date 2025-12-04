// URL login default
const LOGIN_URL = "/login?screen=login";

/* ========= Helper kecil buat escape HTML (biar aman) ========= */
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ========= Alert sederhana (pakai #alert yang sudah ada) ========= */
let alertTimeout = null;

function showAlert(message, type = "info") {
  const box = document.getElementById("alert");
  if (!box) return;

  box.textContent = message || "";

  // styling simple, kalau mau bisa disamakan dengan login.css nanti
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

/* ========= Cek sesi & siapkan data global ========= */
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

  // isi teks welcome
  const welcome = document.getElementById("welcome");
  if (welcome) {
    const uname = session.username || session.name || "(tanpa nama)";
    const phone = session.phone || "-";
    welcome.textContent = `Anda login sebagai ${uname} (${phone}).`;
  }

  // isi ringkasan simple di dashboard
  const summary = document.getElementById("profile-summary");
  if (summary) {
    const uname = escapeHTML(session.username || session.name || "-");
    const phone = escapeHTML(session.phone || "-");
    const statusText = session.profileCompleted ? "Sudah lengkap" : "Belum lengkap";

    summary.innerHTML = `
      <div class="profile-row">
        <span>Username</span>
        <strong>${uname}</strong>
      </div>
      <div class="profile-row">
        <span>No. WhatsApp</span>
        <strong>${phone}</strong>
      </div>
      <div class="profile-row">
        <span>Status profil</span>
        <strong>${statusText}</strong>
      </div>
    `;
  }

  // pasang event untuk tombol "Lengkapi / edit profil"
  const btnOpen = document.getElementById("btn-open-complete-profile");
  if (btnOpen) {
    btnOpen.addEventListener("click", openCompleteProfile);
  }

  // (opsional) nanti di sini bisa kita panggil API untuk prefill form profil
})();

/* ========= Fungsi untuk logout (dipakai di onclick) ========= */
window.doLogout = function () {
  localStorage.removeItem("axstore_user");
  window.location.href = LOGIN_URL;
};

/* ========= Buka / tutup screen Lengkapi Profil ========= */

function openCompleteProfile() {
  const cardDash = document.getElementById("card-dashboard");
  const cardProfile = document.getElementById("card-complete-profile");
  if (!cardDash || !cardProfile) return;

  cardDash.style.display = "none";
  cardProfile.style.display = "block";

  // (opsional) nanti di sini kita bisa isi form dari server
}

function backToDashboard() {
  const cardDash = document.getElementById("card-dashboard");
  const cardProfile = document.getElementById("card-complete-profile");
  if (!cardDash || !cardProfile) return;

  cardProfile.style.display = "none";
  cardDash.style.display = "block";
}

// supaya bisa dipanggil dari HTML (onclick)
window.backToDashboard = backToDashboard;

/* ========= Submit form Lengkapi Profil ========= */

/* 
  Untuk sementara, contoh ini hanya:
  - mencegah submit default
  - menampilkan alert "berhasil"
  - (opsional) mengupdate flag profileCompleted di localStorage,
    tapi TIDAK kirim ke server dulu.

  Nanti kalau kamu sudah siap buat endpoint di worker (misal /api/profile/save)
  kita tinggal ganti bagian fetch-nya.
*/
const formProfile = document.getElementById("form-complete-profile");
if (formProfile) {
  formProfile.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(formProfile);

    // TODO: kirim ke server pakai fetch kalau endpoint sudah ada
    // sementara: hanya simpan flag profileCompleted di localStorage

    try {
      const raw = localStorage.getItem("axstore_user");
      if (raw) {
        const sess = JSON.parse(raw);
        sess.profileCompleted = true;
        localStorage.setItem("axstore_user", JSON.stringify(sess));
      }
    } catch (err) {
      // kalau gagal parse, abaikan saja
    }

    showAlert("Profil tersimpan (dummy, belum kirim ke server)", "success");

    // kembali ke dashboard
    backToDashboard();
  });
}
