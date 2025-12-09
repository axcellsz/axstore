// ========= HELPER =========
function formatRupiah(num) {
  const n = Number(num || 0);
  return "Rp " + n.toLocaleString("id-ID");
}

function showAlert(msg) {
  const box = document.getElementById("alert");
  if (!box) return;
  box.textContent = msg || "";
  box.hidden = !msg;
}

// format "10 Desember 2025 pukul 01.37"
function formatDateTimeID(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";

  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const tgl = d.getDate();
  const bln = bulan[d.getMonth()];
  const thn = d.getFullYear();
  const jam = String(d.getHours()).padStart(2, "0");
  const menit = String(d.getMinutes()).padStart(2, "0");

  return `${tgl} ${bln} ${thn} pukul ${jam}.${menit}`;
}

// ========= AMBIL PHONE DARI QUERY =========
function getPhoneFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const phone = params.get("phone");
  if (!phone) return "";
  return String(phone).trim();
}

// ========= RENDER DATA =========
function renderDebt(data, phone) {
  const titleEl = document.getElementById("debt-title");
  const phoneEl = document.getElementById("debt-phone");
  const totalEl = document.getElementById("summary-total");
  const overEl = document.getElementById("summary-overpay");
  const listEl = document.getElementById("history-list");

  if (!listEl) return;

  const name = data.name || "";
  if (titleEl) {
    titleEl.textContent = name
      ? `Catatan hutang ${name}`
      : "Catatan hutang";
  }
  if (phoneEl) phoneEl.textContent = phone || "-";

  const totalRaw = Number(data.total || 0);
  const totalHutang = totalRaw > 0 ? totalRaw : 0;
  const overpay = totalRaw < 0 ? -totalRaw : 0;

  if (totalEl) totalEl.textContent = formatRupiah(totalHutang);
  if (overEl) overEl.textContent = formatRupiah(overpay);

  const history = Array.isArray(data.history) ? data.history.slice() : [];

  listEl.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Belum ada catatan hutang.";
    listEl.appendChild(empty);
    return;
  }

  // urutkan terbaru di atas
  history.sort((a, b) => {
    const da = new Date(a.date || a.time || 0).getTime();
    const db = new Date(b.date || b.time || 0).getTime();
    return db - da;
  });

  history.forEach((h) => {
    const item = document.createElement("div");
    item.className = "history-item " + (h.type === "receive" ? "receive" : "give");

    const topRow = document.createElement("div");
    topRow.className = "history-top-row";

    const dateDiv = document.createElement("div");
    dateDiv.className = "history-date";
    const dt = formatDateTimeID(h.date || h.time || Date.now());
    dateDiv.textContent = dt;

    const amountDiv = document.createElement("div");
    amountDiv.className = "history-amount";
    amountDiv.textContent = formatRupiah(h.amount || 0);

    topRow.appendChild(dateDiv);
    topRow.appendChild(amountDiv);

    const noteDiv = document.createElement("div");
    noteDiv.className = "history-note";
    noteDiv.textContent =
      h.note ||
      (h.type === "receive" ? "Pembayaran" : "Hutang baru");

    const typeDiv = document.createElement("div");
    typeDiv.className = "history-type";
    typeDiv.textContent = h.type === "receive" ? "Pembayaran" : "Hutang baru";

    item.appendChild(topRow);
    item.appendChild(noteDiv);
    item.appendChild(typeDiv);

    listEl.appendChild(item);
  });
}

// ========= LOAD DATA DARI API =========
async function loadDebt() {
  const phone = getPhoneFromQuery();
  if (!phone) {
    showAlert("Nomor WhatsApp tidak ditemukan di URL.");
    return;
  }

  try {
    const res = await fetch(
      "/api/bon/get?phone=" + encodeURIComponent(phone)
    );
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false) {
      throw new Error(data.message || "Gagal memuat data hutang");
    }

    renderDebt(data, phone);
  } catch (err) {
    console.error(err);
    showAlert("Gagal memuat data hutang.");
    const listEl = document.getElementById("history-list");
    if (listEl) {
      listEl.innerHTML = "";
      const div = document.createElement("div");
      div.className = "history-empty";
      div.textContent = "Gagal memuat data hutang";
      listEl.appendChild(div);
    }
  }
}

// ========= INIT =========
document.addEventListener("DOMContentLoaded", () => {
  const backBtn = document.getElementById("btn-back");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // kalau datang dari index, biasanya history.back() cukup
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "/index.html";
      }
    });
  }

  loadDebt();
});
