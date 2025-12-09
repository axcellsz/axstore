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

/* ========= Helper format tanggal Indonesia ========= */
function formatDateID(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;

  const bulan = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const day = d.getDate();
  const monthName = bulan[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${monthName} ${year}`;
}

/* ========= Helper format rupiah ========= */
function formatRupiah(num) {
  const n = Number(num || 0);
  return "Rp " + n.toLocaleString("id-ID");
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

  // setiap kali panel dibuka, refresh kuota & hutang (pakai cache di worker)
  loadQuota();
  loadDebt();
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

/* ========= Helper pecah alamat gabungan ========= */
/**
 * Input contoh:
 * "Kp sungapan, RT 26 / RW 06, Desa Padabeungh, Kec. Cimaung, Kab. Bandung, Jawa Barat"
 *
 * Output:
 * {
 *   alamatUtama: "Kp sungapan",
 *   rt: "26",
 *   rw: "06",
 *   desa: "Padabeungh",
 *   kecamatan: "Cimaung",
 *   kabupaten: "Bandung",
 *   provinsi: "Jawa Barat"
 * }
 */
function parseAlamatGabungan(alamatGabungan) {
  const result = {
    alamatUtama: "",
    rt: "",
    rw: "",
    desa: "",
    kecamatan: "",
    kabupaten: "",
    provinsi: "",
  };

  if (!alamatGabungan) return result;

  const parts = String(alamatGabungan)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const keywordRegex = /^(RT\s|RW\s|Desa\s|Kec\.\s|Kab\.\s)/i;

  for (const p of parts) {
    let m;

    // alamat utama = non-keyword pertama
    if (!keywordRegex.test(p) && !result.alamatUtama) {
      result.alamatUtama = p;
      continue;
    }

    m = /RT\s+(\S+)/i.exec(p);
    if (m && !result.rt) result.rt = m[1];

    m = /RW\s+(\S+)/i.exec(p);
    if (m && !result.rw) result.rw = m[1];

    m = /^Desa\s+(.+)/i.exec(p);
    if (m && !result.desa) result.desa = m[1];

    m = /^Kec\.\s+(.+)/i.exec(p);
    if (m && !result.kecamatan) result.kecamatan = m[1];

    m = /^Kab\.\s+(.+)/i.exec(p);
    if (m && !result.kabupaten) result.kabupaten = m[1];

    // provinsi = non-keyword lain setelah alamatUtama
    if (
      !keywordRegex.test(p) &&
      result.alamatUtama &&
      p !== result.alamatUtama &&
      !result.provinsi
    ) {
      result.provinsi = p;
    }
  }

  return result;
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

  // Simpan sesi global
  window.__AX_USER = session;

  // isi teks dasar (username & WA)
  const unameSafe = escapeHTML(session.username || session.name || "-");
  const phoneSafe = escapeHTML(session.phone || "-");

  const headerUsername = document.getElementById("profile-username-top");
  const headerWa = document.getElementById("profile-whatsapp-top");
  if (headerUsername) headerUsername.textContent = unameSafe;
  if (headerWa) {
    headerWa.textContent =
      phoneSafe && phoneSafe !== "-" ? `WhatsApp ${phoneSafe}` : "";
  }

  // set inisial avatar
  const initial =
    (session.username || session.name || "?").trim().charAt(0).toUpperCase() ||
    "?";
  const avatarInitial = document.getElementById("profile-avatar-initial");
  if (avatarInitial) avatarInitial.textContent = initial;

  // Pasang event ubah foto
  const fileInput = document.getElementById("profile-photo-input");
  const btnChange = document.getElementById("btn-change-photo");
  if (fileInput) {
    fileInput.addEventListener("change", handlePhotoChange);
  }
  if (btnChange && fileInput) {
    btnChange.addEventListener("click", () => fileInput.click());
  }

  // Tombol buka form lengkapi profil
  const btnOpenComplete = document.getElementById("btn-open-complete-profile");
  if (btnOpenComplete) {
    btnOpenComplete.addEventListener("click", () => {
      if (window.openCompleteProfile) window.openCompleteProfile();
    });
  }

  // Link "Lihat catatan hutang"
  const debtLink = document.getElementById("debt-link");
  if (debtLink) {
    debtLink.addEventListener("click", () => {
      const u = window.__AX_USER;
      if (!u || !u.phone) return;
      window.location.href =
        "/bon.html?phone=" + encodeURIComponent(u.phone);
    });
  }

  // Tombol tutup panel profil + backdrop
  const closeBtn = document.getElementById("btn-close-profile");
  const backdrop = document.getElementById("profile-panel-backdrop");
  if (closeBtn)
    closeBtn.addEventListener("click", () => window.closeProfilePanel());
  if (backdrop)
    backdrop.addEventListener("click", () => window.closeProfilePanel());

  // Toggle "Lihat detail lengkap"
  const detailProfilText = document.getElementById("detail-profil-text");
  if (detailProfilText) {
    detailProfilText.style.cursor = "pointer";
    detailProfilText.addEventListener("click", () => {
      const box = document.getElementById("profile-detail-box");
      if (!box) return;

      const isShown = box.style.display === "block";
      box.style.display = isShown ? "none" : "block";
      detailProfilText.textContent = isShown
        ? "Lihat detail lengkap"
        : "Sembunyikan detail";
    });
  }

  // Load foto profil & detail
  loadProfilePhoto();
  loadProfileDetail();
})();

/* ========= LOAD DETAIL PROFIL DARI KV ========= */

async function loadProfileDetail() {
  const user = window.__AX_USER;
  if (!user || !user.phone) return;

  try {
    const res = await fetch(
      "/api/profile?phone=" + encodeURIComponent(user.phone)
    );

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const data = await res.json();
    if (!data.status || !data.data) {
      throw new Error(data.message || "Gagal mengambil profil");
    }

    const u = data.data || {};

    // update flag profileCompleted di sesi + localStorage
    if (typeof u.profileCompleted === "boolean") {
      user.profileCompleted = u.profileCompleted;
      window.__AX_USER = user;
      localStorage.setItem("axstore_user", JSON.stringify(user));
    }

    // isi detail read-only
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value || "-";
    };

    setText("detail-fullName", u.fullName);
    setText("detail-email", u.email);
    setText("detail-nomorXL", u.nomorXL);
    setText("detail-jenisKuota", u.jenisKuota);
    setText("detail-alamat", u.alamat);
    setText(
      "info-status",
      u.profileCompleted ? "Sudah lengkap" : "Belum lengkap"
    );

    // ===== Prefill form lengkapi profil =====
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || "";
    };

    setValue("fullName", u.fullName);
    setValue("email", u.email);
    setValue("nomorXL", u.nomorXL);
    setValue("jenisKuota", u.jenisKuota);

    // Pecah alamat gabungan ke field alamat + RT/RW/Desa/Kec/Kab/Provinsi
    const parsedAlamat = parseAlamatGabungan(u.alamat || "");
    setValue("alamat", parsedAlamat.alamatUtama);
    setValue("rt", parsedAlamat.rt);
    setValue("rw", parsedAlamat.rw);
    setValue("desa", parsedAlamat.desa);
    setValue("kecamatan", parsedAlamat.kecamatan);
    setValue("kabupaten", parsedAlamat.kabupaten);
    setValue("provinsi", parsedAlamat.provinsi);

    // tampilkan / sembunyikan kuota & baris toggle
    const quotaCard = document.getElementById("profile-quota-card");
    const detailToggle = document.getElementById("profile-detail-toggle");
    const detailBox = document.getElementById("profile-detail-box");

    if (u.profileCompleted) {
      if (quotaCard) quotaCard.style.display = "block";
      if (detailToggle) detailToggle.style.display = "block";
      // detailBox dibiarkan mengikuti toggle user
    } else {
      if (quotaCard) quotaCard.style.display = "none";
      if (detailToggle) detailToggle.style.display = "none";
      if (detailBox) detailBox.style.display = "none";
    }
  } catch (err) {
    console.error("loadProfileDetail error:", err);
  }
}

/* ========= LOAD KUOTA DARI BACKEND (/api/kuota) ========= */

async function loadQuota() {
  const user = window.__AX_USER;
  if (!user || !user.phone) return;

  // kalau profil belum lengkap, nggak usah call API kuota
  if (!user.profileCompleted) return;

  const quotaCard = document.getElementById("profile-quota-card");
  const amountEl = document.getElementById("quota-amount");
  const expEl = document.getElementById("quota-exp");
  if (!quotaCard || !amountEl) return;

  try {
    // tampilan loading
    amountEl.textContent = "...";
    if (expEl) expEl.textContent = "";

    const res = await fetch(
      "/api/kuota?phone=" + encodeURIComponent(user.phone)
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.status !== true || !data.data) {
      throw new Error(data.message || "Gagal mengambil kuota");
    }

    const q = data.data;
    const total = typeof q.totalRemaining === "number" ? q.totalRemaining : 0;
    const unit = q.unit || "GB";

    // format angka: 14.32 GB, kalau .00 dibuang
    let numStr = total.toFixed(2);
    if (numStr.endsWith(".00")) {
      numStr = numStr.slice(0, -3);
    }
    const remainingStr = `${numStr} ${unit}`;
    amountEl.textContent = remainingStr;

    if (expEl) {
      if (q.expDate) {
        const tgl = formatDateID(q.expDate);
        expEl.textContent = `Berlaku hingga: ${tgl}`;
      } else {
        expEl.textContent = "";
      }
    }

    quotaCard.style.display = "block";
  } catch (err) {
    console.error("loadQuota error:", err);
    amountEl.textContent = "-";
    if (expEl) expEl.textContent = "";
  }
}

/* ========= LOAD HUTANG DARI BACKEND (/api/bon/get) ========= */

async function loadDebt() {
  const user = window.__AX_USER;
  if (!user || !user.phone) return;

  const card = document.getElementById("profile-debt-card");
  const amountEl = document.getElementById("debt-amount");
  if (!card || !amountEl) return;

  try {
    // tampilan loading
    amountEl.textContent = "...";
    card.style.display = "block";

    const res = await fetch(
      "/api/bon/get?phone=" + encodeURIComponent(user.phone)
    );
    const data = await res.json().catch(() => ({}));

    // kalau belum ada pelanggan di BON_DATA → sembunyikan card
    if (!res.ok || data.ok === false) {
      card.style.display = "none";
      return;
    }

    const total = Number(data.total || 0);

    // total > 0 = pelanggan berhutang ke user
    // total <= 0 = tidak ada hutang pelanggan
    if (!(total > 0)) {
      card.style.display = "none";
      return;
    }

    amountEl.textContent = formatRupiah(total);
  } catch (err) {
    console.error("loadDebt error:", err);
    card.style.display = "none";
  }
}

/* ========= SUBMIT FORM LENGKAPI PROFIL ========= */

const formProfile = document.getElementById("form-complete-profile");
if (formProfile) {
  formProfile.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = window.__AX_USER;
    if (!user || !user.phone) {
      showAlert("Sesi tidak valid, silakan login ulang", "error");
      return;
    }

    const fd = new FormData(formProfile);

    const payload = {
      phone: user.phone,
      fullName: fd.get("fullName") || "",
      email: fd.get("email") || "",
      nomorXL: fd.get("nomorXL") || "",
      jenisKuota: fd.get("jenisKuota") || "",
      alamat: fd.get("alamat") || "",
      rt: fd.get("rt") || "",
      rw: fd.get("rw") || "",
      desa: fd.get("desa") || "",
      kecamatan: fd.get("kecamatan") || "",
      kabupaten: fd.get("kabupaten") || "",
      provinsi: fd.get("provinsi") || "",
    };

    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.status !== true) {
        throw new Error(data.message || "Gagal menyimpan profil");
      }

      // update flag profileCompleted di localStorage
      const updated = data.data || {};
      if (typeof updated.profileCompleted === "boolean") {
        user.profileCompleted = updated.profileCompleted;
        window.__AX_USER = user;
        localStorage.setItem("axstore_user", JSON.stringify(user));
      }

      showAlert("Profil berhasil disimpan", "success");

      await loadProfileDetail();
      backToDashboard();
    } catch (err) {
      console.error(err);
      showAlert("Terjadi kesalahan saat menyimpan profil", "error");
    }
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
    } catch (err) {}

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
