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
  if (type === "success") {
    box.classList.add("alert-success");
  } else if (type === "error") {
    box.classList.add("alert-error");
  }

  box.style.display = "block";
  box.style.opacity = "1";

  if (alertTimeout) clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => {
    box.style.opacity = "0";
    setTimeout(() => {
      box.style.display = "none";
    }, 300);
  }, 4000);
}

/* ========= INIT SESSION ========= */
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

  window.__AX_USER = session;

  const welcome = document.getElementById("welcome");
  if (welcome) {
    const uname = session.username || session.name || "(tanpa nama)";
    const phone = session.phone || "-";
    welcome.textContent = `Anda login sebagai ${uname} (${phone}).`;
  }

  // isi panel profil (teks)
  const uname = escapeHTML(session.username || session.name || "-");
  const phone = escapeHTML(session.phone || "-");
  const statusText = session.profileCompleted ? "Sudah lengkap" : "Belum lengkap";

  const infoUsername = document.getElementById("info-username");
  const infoPhone = document.getElementById("info-phone");
  const infoStatus = document.getElementById("info-status");

  if (infoUsername) infoUsername.textContent = uname;
  if (infoPhone) infoPhone.textContent = phone;
  if (infoStatus) infoStatus.textContent = statusText;

  // set inisial avatar
  const initial =
    (session.username || session.name || "?").trim().charAt(0).toUpperCase() || "?";

  const avatarInitial = document.getElementById("profile-avatar-initial");
  if (avatarInitial) avatarInitial.textContent = initial;

  // pasang handler ubah foto
  const fileInput = document.getElementById("profile-photo-input");
  const btnChange = document.getElementById("btn-change-photo");

  if (fileInput) {
    fileInput.addEventListener("change", handlePhotoChange);
  }
  if (btnChange && fileInput) {
    btnChange.addEventListener("click", () => fileInput.click());
  }

  // load foto profil dari server
  loadProfilePhoto();
})();

/* ========= LOGOUT ========= */
window.doLogout = function () {
  localStorage.removeItem("axstore_user");
  window.location.href = LOGIN_URL;
};

/* ========= PANEL PROFIL (SLIDE) ========= */
window.openProfilePanel = function () {
  const panel = document.getElementById("profile-panel");
  const backdrop = document.getElementById("profile-panel-backdrop");
  if (!panel || !backdrop) return;

  panel.classList.add("open");
  backdrop.classList.add("show");
};

window.closeProfilePanel = function () {
  const panel = document.getElementById("profile-panel");
  const backdrop = document.getElementById("profile-panel-backdrop");
  if (!panel || !backdrop) return;

  panel.classList.remove("open");
  backdrop.classList.remove("show");
};

/* ========= LENGKAPI PROFIL: buka/tutup card ========= */

window.openCompleteProfile = function () {
  const cardDash = document.getElementById("card-dashboard");
  const cardProfile = document.getElementById("card-complete-profile");
  if (!cardDash || !cardProfile) return;

  cardDash.style.display = "none";
  cardProfile.style.display = "block";

  // panel profil ditutup supaya fokus ke form
  window.closeProfilePanel();
};

window.backToDashboard = function () {
  const cardDash = document.getElementById("card-dashboard");
  const cardProfile = document.getElementById("card-complete-profile");
  if (!cardDash || !cardProfile) return;

  cardProfile.style.display = "none";
  cardDash.style.display = "block";
};

/* ========= SUBMIT FORM LENGKAPI PROFIL (MASIH DUMMY) ========= */

const formProfile = document.getElementById("form-complete-profile");
if (formProfile) {
  formProfile.addEventListener("submit", async (e) => {
    e.preventDefault();

    // sementara: hanya set flag profileCompleted di localStorage
    try {
      const raw = localStorage.getItem("axstore_user");
      if (raw) {
        const sess = JSON.parse(raw);
        sess.profileCompleted = true;
        localStorage.setItem("axstore_user", JSON.stringify(sess));
      }
    } catch (err) {
      // abaikan
    }

    showAlert("Profil tersimpan (belum dikirim ke server)", "success");
    backToDashboard();
  });
}

/* ========= FOTO PROFIL ========= */

// load foto dari KV lewat worker
async function loadProfilePhoto() {
  const user = window.__AX_USER;
  if (!user || !user.phone) return;

  const img = document.getElementById("profile-avatar-img");
  const avatar = document.getElementById("profile-avatar");
  if (!img || !avatar) return;

  avatar.classList.remove("has-photo");

  img.onload = () => {
    avatar.classList.add("has-photo");
  };
  img.onerror = () => {
    avatar.classList.remove("has-photo");
  };

  img.src =
    "/api/profile/photo?phone=" +
    encodeURIComponent(user.phone) +
    "&t=" +
    Date.now();
}

/**
 * Kompres + resize gambar di browser
 * @param {File} file - file asli dari input
 * @param {number} maxSize - lebar/tinggi maksimal (px)
 * @returns {Promise<Blob>} - blob JPEG terkompres
 */
function compressImage(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error("Gagal membaca file"));

    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      // hitung rasio supaya max width/height = maxSize
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // export ke JPEG kualitas 0.8 (biasanya 50–200KB untuk ukuran segini)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Gagal mengompres gambar"));
          } else {
            resolve(blob);
          }
        },
        "image/jpeg",
        0.8
      );
    };

    img.onerror = () => reject(new Error("Gambar tidak valid"));

    reader.readAsDataURL(file);
  });
}

// event saat user pilih file foto
async function handlePhotoChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showAlert("File harus gambar (jpg/png)", "error");
    e.target.value = "";
    return;
  }

  const user = window.__AX_USER;
  if (!user || !user.phone) {
    showAlert("Sesi tidak valid", "error");
    e.target.value = "";
    return;
  }

  try {
    // resize + kompres dulu
    const compressedBlob = await compressImage(file, 256);

    if (compressedBlob.size > 300 * 1024) {
      showAlert("Setelah kompres masih >300KB, coba gambar lain", "error");
      e.target.value = "";
      return;
    }

    const fd = new FormData();
    fd.append("phone", user.phone);
    fd.append("photo", compressedBlob, "avatar.jpg");

    const res = await fetch("/api/profile/photo", {
      method: "POST",
      body: fd,
    });

    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      // abaikan parsing error
    }

    if (!res.ok || data.ok === false) {
      throw new Error(data.message || "Gagal upload foto");
    }

    showAlert("Foto profil diperbarui", "success");
    loadProfilePhoto();
  } catch (err) {
    console.error(err);
    showAlert("Gagal mengompres / upload foto", "error");
  } finally {
    e.target.value = "";
  }
}
