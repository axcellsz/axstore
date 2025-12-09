// debt.js
// Halaman catatan hutang user (READ ONLY)

/*
  HTML yang diharapkan minimal punya elemen dengan id:
    - debt-name            : judul nama user di header
    - debt-phone           : teks nomor WA di header
    - debt-total-text      : kalimat "Hutang anda sebesar" / dsb
    - debt-total-amount    : jumlah hutang
    - debt-status-text     : teks kecil status (misal "Anda tidak punya hutang")
    - debt-history         : container daftar riwayat
    - btn-back             : tombol kembali (optional)

  Kalau id di HTML-mu beda, samakan saja dengan yang ada di atas
  atau ubah querySelector di bawah sesuai kebutuhan.
*/

const LOGIN_URL = "/login?screen=login";

/* ===== Helper ===== */

function formatRupiah(num) {
  const n = Number(num || 0);
  return "Rp " + n.toLocaleString("id-ID");
}

function formatDateTimeID(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const tgl = d.getDate();
  const bln = bulan[d.getMonth()];
  const thn = d.getFullYear();
  const jam = String(d.getHours()).padStart(2, "0");
  const menit = String(d.getMinutes()).padStart(2, "0");

  return `${tgl} ${bln} ${thn} ${jam}:${menit}`;
}

function normalizePhone(phone) {
  if (!phone) return "";
  let p = String(phone).replace(/\D/g, "");
  if (!p) return "";
  if (p.startsWith("0")) {
    p = "62" + p.slice(1);
  }
  // kalau sudah mulai 62 biarin, kalau tidak ya pakai apa adanya
  return p;
}

/* ===== Main init ===== */

async function initDebtPage() {
  // --- cek sesi login ---
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

  const userName =
    session.fullName || session.name || session.username || "Pengguna";
  const phoneOriginal = session.phone || "";

  const phoneNorm = normalizePhone(phoneOriginal);

  // isi header
  const nameEl = document.getElementById("debt-name");
  const phoneEl = document.getElementById("debt-phone");
  if (nameEl) nameEl.textContent = userName;
  if (phoneEl) phoneEl.textContent = phoneOriginal || phoneNorm || "-";

  const totalTextEl = document.getElementById("debt-total-text");
  const totalAmountEl = document.getElementById("debt-total-amount");
  const statusTextEl = document.getElementById("debt-status-text");
  const historyEl = document.getElementById("debt-history");

  if (totalAmountEl) totalAmountEl.textContent = "Rp 0";
  if (statusTextEl) statusTextEl.textContent = "Memuat data hutang...";
  if (historyEl) {
    historyEl.innerHTML = "";
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "debt-history-empty";
    loadingDiv.textContent = "Memuat riwayat transaksi...";
    historyEl.appendChild(loadingDiv);
  }

  // --- fetch dari API bon ---
  try {
    const res = await fetch(
      "/api/bon/get?phone=" + encodeURIComponent(phoneNorm)
    );
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false || !data.phone) {
      // dianggap tidak ada catatan hutang
      if (totalTextEl) totalTextEl.textContent = "Hutang anda sebesar";
      if (totalAmountEl) totalAmountEl.textContent = "Rp 0";
      if (statusTextEl)
        statusTextEl.textContent = "Anda belum memiliki catatan hutang.";
      if (historyEl) {
        historyEl.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "debt-history-empty";
        empty.textContent = "Belum ada transaksi hutang.";
        historyEl.appendChild(empty);
      }
      return;
    }

    const cust = data; // {phone,name,total,history}

    const total = Number(cust.total || 0);
    const hutangSaya = total > 0 ? total : 0;   // user berhutang ke toko
    const hutangToko = total < 0 ? -total : 0;  // toko berhutang ke user

    if (totalTextEl) {
      if (hutangSaya > 0) {
        totalTextEl.textContent = "Hutang anda sebesar";
      } else if (hutangToko > 0) {
        totalTextEl.textContent = "Toko berhutang kepada anda";
      } else {
        totalTextEl.textContent = "Tidak ada hutang berjalan";
      }
    }

    if (totalAmountEl) {
      const showAmount = hutangSaya > 0 ? hutangSaya : hutangToko;
      totalAmountEl.textContent = formatRupiah(showAmount);
    }

    if (statusTextEl) {
      if (hutangSaya > 0) {
        statusTextEl.textContent =
          "Silakan hubungi admin / penjual untuk konfirmasi pembayaran.";
      } else if (hutangToko > 0) {
        statusTextEl.textContent =
          "Toko memiliki tanggungan kepada anda. Silakan konfirmasi ke admin.";
      } else {
        statusTextEl.textContent = "Saldo hutang anda saat ini nol.";
      }
    }

    // --- render riwayat ---
    if (historyEl) {
      historyEl.innerHTML = "";
      const history = Array.isArray(cust.history) ? cust.history : [];

      if (!history.length) {
        const empty = document.createElement("div");
        empty.className = "debt-history-empty";
        empty.textContent = "Belum ada transaksi hutang.";
        historyEl.appendChild(empty);
      } else {
        history.forEach((h) => {
          const item = document.createElement("div");
          item.className =
            "debt-history-item " +
            (h.type === "give" ? "debt-history-give" : "debt-history-receive");

          const top = document.createElement("div");
          top.className = "debt-history-top";

          const dateDiv = document.createElement("div");
          dateDiv.className = "debt-history-date";
          dateDiv.textContent = formatDateTimeID(h.date || h.time);

          const amountDiv = document.createElement("div");
          amountDiv.className = "debt-history-amount";
          amountDiv.textContent = formatRupiah(h.amount || 0);

          top.appendChild(dateDiv);
          top.appendChild(amountDiv);

          const noteDiv = document.createElement("div");
          noteDiv.className = "debt-history-note";
          noteDiv.textContent =
            h.note ||
            (h.type === "give"
              ? "Hutang baru dicatat."
              : "Pembayaran / pelunasan.");

          item.appendChild(top);
          item.appendChild(noteDiv);

          historyEl.appendChild(item);
        });
      }
    }
  } catch (err) {
    console.error("initDebtPage error:", err);
    if (statusTextEl) {
      statusTextEl.textContent =
        "Terjadi kesalahan saat memuat data hutang. Coba lagi beberapa saat.";
    }
  }
}

/* ===== Back button (opsional) ===== */
document.addEventListener("DOMContentLoaded", () => {
  const backBtn = document.getElementById("btn-back");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // balik ke dashboard utama
      window.location.href = "/index.html";
    });
  }

  initDebtPage();
});
