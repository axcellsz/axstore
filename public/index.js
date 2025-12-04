
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
  window.__AX_USER = user;

  // Fungsi logout global (dipakai di atribut onclick)
  window.doLogout = function () {
    localStorage.removeItem("axstore_user");
    window.location.href = LOGIN_URL;
  };
})();

// Tampilkan data user di dashboard
(function () {
  const user = window.__AX_USER;
  if (!user) return;

  const el = document.getElementById("welcome");
  if (!el) return;

  el.textContent = `Anda login sebagai ${user.name} (${user.phone}).`;
})();
