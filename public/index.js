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

/* ========= ALERT ========= */
let alertTimeout = null;

function showAlert(message, type = "info") {
  const box = document.getElementById("alert");
  if (!box) return;

  box.textContent = message || "";

  box.classList.remove("alert-success", "alert-error");

  if (type === "success") box.classList.add("alert-success");
  if (type === "error") box.classList.add("alert-error");

  box.style.display = "block";
  box.style.opacity = "1";

  if (alertTimeout) clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => {
    box.style.opacity = "0";
    setTimeout(() => { box.style.display = "none"; }, 300);
  }, 4000);
}

/* ========= INIT SESSION ========= */
(function initSession() {
  const raw = localStorage.getItem("axstore_user");
  if (!raw) return (window.location.href = LOGIN_URL);

  let session;
  try {
    session = JSON.parse(raw);
  } catch (err) {
    localStorage.removeItem("axstore_user");
    return (window.location.href = LOGIN_URL);
  }

  window.__AX_USER = session;

  // welcome text
  const welcome = document.getElementById("welcome");
  if (welcome) {
    welcome.textContent = `Anda login sebagai ${session.username} (${session.phone}).`;
  }

  // isi panel profil
  document.getElementById("info-username").textContent = escapeHTML(session.username);
  document.getElementById("info-phone").textContent    = escapeHTML(session.phone);
  document.getElementById("info-status").textContent   =
    session.profileCompleted ? "Sudah lengkap" : "Belum lengkap";

  // set inisial avatar
  const initial = session.username?.trim()?.charAt(0)?.toUpperCase() || "?";
  document.getElementById("profile-avatar-initial").textContent = initial;

  // tombol & input foto profil
  const fileInput = document.getElementById("profile-photo-input");
  const btnChange = document.getElementById("btn-change-photo");

  if (btnChange) btnChange.onclick = () => fileInput.click();
  if (fileInput) fileInput.onchange = handlePhotoChange;

  // load foto dari KV
  loadProfilePhoto();
})();

/* ========= LOGOUT ========= */
window.doLogout = function () {
  localStorage.removeItem("axstore_user");
  window.location.href = LOGIN_URL;
};

/* ========= PANEL PROFIL SLIDE ========= */
window.openProfilePanel = function () {
  document.getElementById("profile-panel").classList.add("open");
  document.getElementById("profile-panel-backdrop").classList.add("show");
};

window.closeProfilePanel = function () {
  document.getElementById("profile-panel").classList.remove("open");
  document.getElementById("profile-panel-backdrop").classList.remove("show");
};

/* ========= FORM LENGKAPI PROFIL ========= */
window.openCompleteProfile = function () {
  closeProfilePanel();
  document.getElementById("card-dashboard").style.display = "none";
  document.getElementById("card-complete-profile").style.display = "block";
};

window.backToDashboard = function () {
  document.getElementById("card-complete-profile").style.display = "none";
  document.getElementById("card-dashboard").style.display = "block";
};

document.getElementById("btn-close-profile").onclick = closeProfilePanel;

/* ========= SUBMIT PROFIL → /api/profile/update ========= */
const formProfile = document.getElementById("form-complete-profile");
if (formProfile) {
  formProfile.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = window.__AX_USER;
    if (!user) return showAlert("Sesi tidak valid", "error");

    const body = {
      phone: user.phone,
      fullName: fullName.value.trim(),
      email: email.value.trim(),
      nomorXL: nomorXL.value.trim(),
      jenisKuota: jenisKuota.value.trim(),
      alamat: alamat.value.trim(),
      rt: rt.value.trim(),
      rw: rw.value.trim(),
      desa: desa.value.trim(),
      kecamatan: kecamatan.value.trim(),
      kabupaten: kabupaten.value.trim(),
      provinsi: provinsi.value.trim(),
    };

    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!data.status) {
        return showAlert(data.message || "Gagal memperbarui profil", "error");
      }

      showAlert("Profil berhasil disimpan", "success");

      // update local session
      user.profileCompleted = true;
      localStorage.setItem("axstore_user", JSON.stringify(user));

      backToDashboard();
    } catch (err) {
      console.error(err);
      showAlert("Gagal terhubung ke server", "error");
    }
  });
}

/* ========= FOTO PROFIL ========= */

// load foto dari KV
async function loadProfilePhoto() {
  const user = window.__AX_USER;
  if (!user) return;

  const img = document.getElementById("profile-avatar-img");
  const avatar = document.getElementById("profile-avatar");

  avatar.classList.remove("has-photo");

  img.onload = () => avatar.classList.add("has-photo");
  img.onerror = () => avatar.classList.remove("has-photo");

  img.src = "/api/profile/photo?phone=" + encodeURIComponent(user.phone) + "&t=" + Date.now();
}

/* ========= Kompres Gambar ========= */
function compressImage(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const img = new Image();

    reader.onload = (e) => (img.src = e.target.result);
    reader.onerror = () => reject(new Error("Gagal membaca file"));

    img.onload = () => {
      let { width, height } = img;

      if (width > height && width > maxSize) {
        height = (height * maxSize) / width;
        width = maxSize;
      } else if (height > width && height > maxSize) {
        width = (width * maxSize) / height;
        height = maxSize;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Gagal kompres gambar"))),
        "image/jpeg",
        0.8
      );
    };

    img.onerror = () => reject(new Error("File gambar tidak valid"));
    reader.readAsDataURL(file);
  });
}

/* ========= Upload Foto Profil ========= */
async function handlePhotoChange(e) {
  const file = e.target.files?.[0];
  e.target.value = "";

  if (!file) return;
  if (!file.type.startsWith("image/")) {
    return showAlert("File harus berupa gambar", "error");
  }

  const user = window.__AX_USER;
  if (!user) return showAlert("Sesi tidak valid", "error");

  try {
    const compressed = await compressImage(file, 256);

    if (compressed.size > 300 * 1024) {
      return showAlert("Setelah kompres masih >300KB, pilih foto lain", "error");
    }

    const fd = new FormData();
    fd.append("phone", user.phone);
    fd.append("photo", compressed, "avatar.jpg");

    const res = await fetch("/api/profile/photo", {
      method: "POST",
      body: fd,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || "Upload error");
    }

    showAlert("Foto profil diperbarui", "success");
    loadProfilePhoto();
  } catch (err) {
    console.error(err);
    showAlert("Gagal mengupload foto profil", "error");
  }
}
