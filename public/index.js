// ======================
// KONSTANTA
// ======================
const LOGIN_URL = "/login?screen=login";

// ======================
// CEK SESSION & LOGOUT
// ======================
(function () {
  // Ambil sesi dari localStorage
  const sessionRaw = localStorage.getItem("axstore_user");

  if (!sessionRaw) {
    // Tidak ada sesi, paksa ke login
    window.location.href = LOGIN_URL;
    return;
  }

  let user = null;
  try {
    user = JSON.parse(sessionRaw);
  } catch (err) {
    // Data rusak → hapus dan paksa login ulang
    localStorage.removeItem("axstore_user");
    window.location.href = LOGIN_URL;
    return;
  }

  // Simpan user ke global agar bisa dipakai di bawah
  // Bentuk data:
  // { username, phone, profileCompleted }
  window.__AX_USER = user;

  // Fungsi logout global (dipakai di atribut onclick)
  window.doLogout = function () {
    localStorage.removeItem("axstore_user");
    window.location.href = LOGIN_URL;
  };
})();

// ======================
// HELPER ALERT SEDERHANA
// ======================
let alertTimeout = null;

function showAlert(message, type = "error") {
  const box = document.getElementById("alert");
  if (!box) return;

  box.textContent = message;

  // warna via class (biar bisa diatur di CSS)
  box.classList.remove("alert-error", "alert-success");
  if (type === "success") {
    box.classList.add("alert-success");
  } else {
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

// ======================
// HELPER VIEW
// ======================
function showDashboard() {
  const cardDash = document.getElementById("card-dashboard");
  const cardProfile = document.getElementById("card-complete-profile");

  if (cardDash) cardDash.style.display = "block";
  if (cardProfile) cardProfile.style.display = "none";
}

function showProfileForm() {
  const cardDash = document.getElementById("card-dashboard");
  const cardProfile = document.getElementById("card-complete-profile");

  if (cardDash) cardDash.style.display = "none";
  if (cardProfile) cardProfile.style.display = "block";
}

// ======================
// TAMPILKAN INFO DASAR USER
// ======================
document.addEventListener("DOMContentLoaded", () => {
  const user = window.__AX_USER;
  if (!user) return;

  const welcomeEl = document.getElementById("welcome");
  if (welcomeEl) {
    const uname = user.username || user.name || "(tanpa username)";
    const phone = user.phone || "-";
    welcomeEl.textContent = `Anda login sebagai ${uname} (${phone}).`;
  }

  // Cek profil ke server (KV)
  checkProfileStatus();
  // Pasang handler submit untuk form profil
  attachProfileFormHandler();
});

// ======================
// CEK PROFIL KE WORKER (KV)
// ======================
async function checkProfileStatus() {
  const user = window.__AX_USER;
  if (!user || !user.phone) {
    showAlert("Sesi tidak valid, silakan login ulang", "error");
    window.location.href = LOGIN_URL;
    return;
  }

  try {
    const res = await fetch(
      `/api/profile?phone=${encodeURIComponent(user.phone)}`,
      { method: "GET" }
    );

    if (!res.ok) {
      console.warn("Gagal ambil profil:", res.status);
      // kalau 404, paksa logout saja
      if (res.status === 404) {
        showAlert("User tidak ditemukan. Silakan login ulang.", "error");
        setTimeout(() => {
          localStorage.removeItem("axstore_user");
          window.location.href = LOGIN_URL;
        }, 1500);
      }
      return;
    }

    const json = await res.json();
    if (!json.status) {
      console.warn("Profil error:", json.message);
      return;
    }

    const profile = json.data || {};

    // Update flag profileCompleted di localStorage & global
    const updatedUser = {
      ...user,
      profileCompleted: !!profile.profileCompleted,
    };
    localStorage.setItem("axstore_user", JSON.stringify(updatedUser));
    window.__AX_USER = updatedUser;

    // Tampilkan ringkasan kecil di dashboard (opsional)
    const summaryEl = document.getElementById("profile-summary");
    if (summaryEl && profile.fullName) {
      summaryEl.textContent = `Nama: ${profile.fullName}` +
        (profile.jenisKuota ? ` • Kuota: ${profile.jenisKuota}` : "");
    }

    // Kalau profil belum lengkap → tampilkan form
    if (!profile.profileCompleted) {
      // Prefill form dengan data yang ada (kalau ada)
      prefillProfileForm(profile);
      showProfileForm();
      showAlert("Profil belum lengkap, silakan lengkapi dulu.", "error");
    } else {
      // Profil lengkap → tampilkan dashboard biasa
      showDashboard();
    }
  } catch (err) {
    console.error("Error cek profil:", err);
  }
}

// ======================
// PREFILL FORM PROFIL
// ======================
function prefillProfileForm(profile) {
  const map = {
    fullName: "fullName",
    email: "email",
    nomorXL: "nomorXL",
    jenisKuota: "jenisKuota",
    alamat: "alamat",
    rt: "rt",
    rw: "rw",
    desa: "desa",
    kecamatan: "kecamatan",
    kabupaten: "kabupaten",
    provinsi: "provinsi",
    photoUrl: "photoUrl",
  };

  Object.keys(map).forEach((key) => {
    const id = map[key];
    const el = document.getElementById(id);
    if (!el) return;

    if (typeof profile[key] !== "undefined" && profile[key] !== null) {
      el.value = profile[key];
    }
  });
}

// ======================
// HANDLER FORM LENGKAPI PROFIL
// ======================
function attachProfileFormHandler() {
  const form = document.getElementById("form-complete-profile");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = window.__AX_USER;
    if (!user || !user.phone) {
      showAlert("Sesi tidak valid. Silakan login ulang.", "error");
      window.location.href = LOGIN_URL;
      return;
    }

    // Ambil semua nilai input
    const payload = {
      phone: user.phone,
      fullName: document.getElementById("fullName")?.value || "",
      email: document.getElementById("email")?.value || "",
      nomorXL: document.getElementById("nomorXL")?.value || "",
      jenisKuota: document.getElementById("jenisKuota")?.value || "",
      alamat: document.getElementById("alamat")?.value || "",
      rt: document.getElementById("rt")?.value || "",
      rw: document.getElementById("rw")?.value || "",
      desa: document.getElementById("desa")?.value || "",
      kecamatan: document.getElementById("kecamatan")?.value || "",
      kabupaten: document.getElementById("kabupaten")?.value || "",
      provinsi: document.getElementById("provinsi")?.value || "",
      photoUrl: document.getElementById("photoUrl")?.value || "",
    };

    // Validasi minimal: nama lengkap & jenis kuota
    if (!payload.fullName.trim()) {
      showAlert("Nama lengkap wajib diisi", "error");
      return;
    }
    if (!payload.jenisKuota) {
      showAlert("Jenis kuota wajib dipilih", "error");
      return;
    }

    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        showAlert("Gagal menyimpan profil", "error");
        return;
      }

      const json = await res.json();
      if (!json.status) {
        showAlert(json.message || "Gagal menyimpan profil", "error");
        return;
      }

      // Profil sukses diupdate
      const profile = json.data || {};
      showAlert("Profil berhasil diperbarui", "success");

      // Update session localStorage
      const newUser = {
        ...user,
        profileCompleted: !!profile.profileCompleted,
      };
      localStorage.setItem("axstore_user", JSON.stringify(newUser));
      window.__AX_USER = newUser;

      // Update summary di dashboard
      const summaryEl = document.getElementById("profile-summary");
      if (summaryEl && profile.fullName) {
        summaryEl.textContent = `Nama: ${profile.fullName}` +
          (profile.jenisKuota ? ` • Kuota: ${profile.jenisKuota}` : "");
      }

      // Tampilkan dashboard
      showDashboard();
    } catch (err) {
      console.error(err);
      showAlert("Terjadi kesalahan saat menyimpan profil", "error");
    }
  });
}
