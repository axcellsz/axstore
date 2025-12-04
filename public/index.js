// Cek sesi & siapkan fungsi logout
(function () {
  const LOGIN_URL = "/login?screen=login";

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
  // Bentuk data yang diharapkan:
  // { username, phone, profileCompleted }
  window.__AX_USER = user;

  // Fungsi logout global (dipakai di atribut onclick)
  window.doLogout = function () {
    localStorage.removeItem("axstore_user");
    window.location.href = LOGIN_URL;
  };
})();

// Setelah DOM siap → tampilkan info user & cek status profil
document.addEventListener("DOMContentLoaded", () => {
  const user = window.__AX_USER;
  if (!user) return;

  const el = document.getElementById("welcome");
  if (el) {
    // Pakai username, fallback ke name (untuk user lama)
    const uname = user.username || user.name || "(tanpa username)";
    const phone = user.phone || "-";
    el.textContent = `Anda login sebagai ${uname} (${phone}).`;
  }

  // Cek status profil ke server / KV
  checkProfileStatus();
});

// Cek profil user ke Worker (KV)
async function checkProfileStatus() {
  const user = window.__AX_USER;
  if (!user || !user.phone) return;

  try {
    const res = await fetch(
      `/api/profile?phone=${encodeURIComponent(user.phone)}`,
      {
        method: "GET",
      }
    );

    if (!res.ok) {
      console.warn("Gagal ambil profil:", res.status);
      return;
    }

    const json = await res.json();
    if (!json.status) {
      console.warn("Profil error:", json.message);
      return;
    }

    const profile = json.data || {};

    // Update flag profileCompleted di localStorage
    const updatedUser = {
      ...user,
      profileCompleted: !!profile.profileCompleted,
    };
    localStorage.setItem("axstore_user", JSON.stringify(updatedUser));
    window.__AX_USER = updatedUser;

    if (!profile.profileCompleted) {
      // Di sini user BELUM lengkapi profil
      // NANTI: kamu bisa ganti ini jadi ganti screen / redirect
      // contoh:
      // window.location.href = "/lengkapi.html";
      console.log("Profil belum lengkap — tampilkan form 'Lengkapi profil' di sini.");
    } else {
      console.log("Profil sudah lengkap.");
    }
  } catch (err) {
    console.error("Error cek profil:", err);
  }
}
