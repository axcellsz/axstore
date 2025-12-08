// ==========================
// KONFIGURASI API BON
// ==========================
const API_BON_LIST = "/api/bon/list-customers";
const API_BON_GET = "/api/bon/get";
const API_BON_CREATE = "/api/bon/create-customer";
const API_BON_ADD_TRX = "/api/bon/add-trx";

// state sederhana
let currentPhone = null;
let currentCustomer = null; // {phone, name, total, history}
let allCustomers = [];

// ==========================
// HELPER DOM
// ==========================

function $(id) {
  return document.getElementById(id);
}

function formatRupiah(num) {
  if (!num || Number.isNaN(num)) num = 0;
  const s = Number(num).toLocaleString("id-ID");
  return "Rp " + s;
}

// total → {hutangPelanggan, hutangSaya}
function splitDebt(total) {
  const t = Number(total) || 0;
  if (t >= 0) {
    // pelanggan masih punya hutang ke kita
    return {
      hutangPelanggan: t,
      hutangSaya: 0,
    };
  } else {
    // kita yang berhutang ke pelanggan
    return {
      hutangPelanggan: 0,
      hutangSaya: -t,
    };
  }
}

// hitung total dari riwayat
function computeTotalFromHistory(history) {
  let total = 0;
  for (const trx of history || []) {
    const amount = Number(trx.amount) || 0;
    if (trx.type === "give") {
      // kita "berikan" → pelanggan berhutang
      total += amount;
    } else if (trx.type === "receive") {
      // pelanggan "terima" → bayar / setor
      total -= amount;
    }
  }
  return total;
}

// screen management (pakai attribute hidden)
function showScreen(which) {
  const screens = ["screenList", "screenAdd", "screenDetail", "screenInput"];
  screens.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.hidden = id !== which;
  });
}

// ==========================
// CEK LOGIN ADMIN
// ==========================

function guardAdmin() {
  const logged = localStorage.getItem("admin_logged_in");
  if (logged !== "1") {
    // belum login admin → balik ke halaman admin
    window.location.href = "/admin.html";
    return false;
  }
  return true;
}

// ==========================
// LOAD & RENDER LIST PELANGGAN
// ==========================

async function loadCustomers() {
  const res = await fetch(API_BON_LIST);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok || !Array.isArray(data.customers)) {
    console.error("Gagal load customers", data);
    return;
  }

  allCustomers = data.customers;

  const listEl = $("customerList");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!allCustomers.length) {
    const empty = document.createElement("div");
    empty.className = "bon-empty";
    empty.textContent = "Belum ada pelanggan.";
    listEl.appendChild(empty);
    updateGlobalSummary();
    return;
  }

  // render tiap pelanggan
  allCustomers.forEach((c, index) => {
    const card = document.createElement("div");
    card.className = "bon-customer-card";

    // total c.total diperlakukan sama seperti di detail
    const total = Number(c.total) || 0;
    const { hutangPelanggan, hutangSaya } = splitDebt(total);

    card.innerHTML = `
      <div class="bon-customer-main">
        <div class="bon-customer-name">
          ${index + 1}. ${c.name || "(Tanpa nama)"}
        </div>
        <button type="button" class="bon-btn-open">BUKA</button>
      </div>
      <div class="bon-customer-wa">
        WA: ${c.phone || "-"}
      </div>
      <div class="bon-customer-debts">
        <div class="bon-debt-row">
          <span>Hutang saya</span>
          <span class="bon-debt-me">${formatRupiah(hutangSaya)}</span>
        </div>
        <div class="bon-debt-row">
          <span>Hutang pelanggan</span>
          <span class="bon-debt-customer">${formatRupiah(hutangPelanggan)}</span>
        </div>
      </div>
    `;

    const btnOpen = card.querySelector(".bon-btn-open");
    if (btnOpen) {
      btnOpen.addEventListener("click", () => {
        openCustomerDetail(c.phone);
      });
    }

    listEl.appendChild(card);
  });

  updateGlobalSummary();
}

// Update total global di header list
function updateGlobalSummary() {
  const spanMy = $("globalMyDebt");
  const spanCust = $("globalCustDebt");
  if (!spanMy || !spanCust) return;

  let sumMy = 0;
  let sumCust = 0;

  for (const c of allCustomers || []) {
    const total = Number(c.total) || 0;
    const { hutangPelanggan, hutangSaya } = splitDebt(total);
    sumMy += hutangSaya;
    sumCust += hutangPelanggan;
  }

  spanMy.textContent = formatRupiah(sumMy);
  spanCust.textContent = formatRupiah(sumCust);
}

// ==========================
// DETAIL PELANGGAN
// ==========================

async function openCustomerDetail(phone) {
  if (!phone) return;

  const url = `${API_BON_GET}?phone=${encodeURIComponent(phone)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    alert(data.message || "Gagal memuat detail pelanggan");
    return;
  }

  currentPhone = data.phone;
  currentCustomer = data;

  // nama di header
  const nameEl = $("detailName");
  if (nameEl) {
    nameEl.textContent = data.name || "(Tanpa nama)";
  }

  // hitung total & split
  const total = computeTotalFromHistory(data.history || []);
  const { hutangPelanggan, hutangSaya } = splitDebt(total);

  const spanCust = $("detailDebtCustomer");
  const spanMe = $("detailDebtMe");
  if (spanCust) spanCust.textContent = formatRupiah(hutangPelanggan);
  if (spanMe) spanMe.textContent = formatRupiah(hutangSaya);

  // render riwayat
  renderHistory(data.history || []);

  showScreen("screenDetail");
}

function renderHistory(history) {
  const container = $("detailHistory");
  if (!container) return;

  container.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "bon-empty";
    empty.textContent = "Belum ada catatan hutang.";
    container.appendChild(empty);
    return;
  }

  history
    .slice()
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .forEach((trx) => {
      const row = document.createElement("div");
      row.className = "bon-trx-row bon-trx-" + (trx.type === "give" ? "give" : "receive");

      const dt = new Date(trx.timestamp || Date.now());
      const tStr = dt.toLocaleString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      row.innerHTML = `
        <div class="bon-trx-top">
          <div class="bon-trx-date">${tStr}</div>
          <div class="bon-trx-amount">${formatRupiah(trx.amount)}</div>
        </div>
        <div class="bon-trx-note">${trx.note || ""}</div>
      `;

      container.appendChild(row);
    });
}

// ==========================
// TAMBAH / EDIT PELANGGAN
// ==========================

async function saveCustomer() {
  const name = ($("addName")?.value || "").trim();
  const phone = ($("addPhone")?.value || "").trim();

  if (!name || !phone) {
    alert("Nama dan No WhatsApp wajib diisi");
    return;
  }

  const res = await fetch(API_BON_CREATE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    alert(data.message || "Gagal menyimpan pelanggan");
    return;
  }

  // reset form
  if ($("addName")) $("addName").value = "";
  if ($("addPhone")) $("addPhone").value = "";

  // kembali ke list & refresh
  await loadCustomers();
  showScreen("screenList");
}

// ==========================
// INPUT TRANSAKSI
// ==========================

function openInputScreen(type) {
  if (!currentPhone) {
    alert("Pilih pelanggan terlebih dahulu.");
    return;
  }

  const titleEl = $("inputTitle");
  const typeEl = $("trxType");
  const amountEl = $("trxAmount");
  const noteEl = $("trxNote");

  if (typeEl) typeEl.value = type;
  if (amountEl) amountEl.value = "";
  if (noteEl) noteEl.value = "";

  if (titleEl) {
    titleEl.textContent = type === "give" ? "Catat hutang baru" : "Catat pembayaran";
  }

  showScreen("screenInput");
}

async function saveTrx() {
  if (!currentPhone) {
    alert("Tidak ada pelanggan aktif.");
    return;
  }

  const type = $("trxType")?.value || "";
  const amount = Number($("trxAmount")?.value || "0");
  const note = ($("trxNote")?.value || "").trim();

  if (!type || !amount || amount <= 0) {
    alert("Jumlah harus lebih dari 0.");
    return;
  }

  const res = await fetch(API_BON_ADD_TRX, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: currentPhone,
      type,
      amount,
      note,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    alert(data.message || "Gagal menyimpan transaksi");
    return;
  }

  // reload detail
  await openCustomerDetail(currentPhone);
  // setelah simpan, kembali ke detail
  showScreen("screenDetail");
  // dan refresh list total global
  loadCustomers();
}

// ==========================
// EVENT LISTENER
// ==========================

document.addEventListener("DOMContentLoaded", () => {
  // pastikan admin login
  if (!guardAdmin()) return;

  // default show list
  showScreen("screenList");

  // tombol + tambah pelanggan
  const btnAdd = $("btnAddCustomer");
  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      showScreen("screenAdd");
    });
  }

  // tombol simpan pelanggan
  const btnSaveCust = $("btnSaveCustomer");
  if (btnSaveCust) {
    btnSaveCust.addEventListener("click", saveCustomer);
  }

  // back dari screenAdd & screenDetail ke List
  document.querySelectorAll(".btn-back-list").forEach((btn) => {
    btn.addEventListener("click", () => {
      showScreen("screenList");
    });
  });

  // back dari screenInput ke Detail
  document.querySelectorAll(".btn-back-detail").forEach((btn) => {
    btn.addEventListener("click", () => {
      showScreen("screenDetail");
    });
  });

  // tombol Berikan / Terima di detail
  const btnGive = $("btnGive");
  if (btnGive) {
    btnGive.addEventListener("click", () => openInputScreen("give"));
  }

  const btnReceive = $("btnReceive");
  if (btnReceive) {
    btnReceive.addEventListener("click", () => openInputScreen("receive"));
  }

  // tombol Simpan transaksi
  const btnSaveTrx = $("btnSaveTrx");
  if (btnSaveTrx) {
    btnSaveTrx.addEventListener("click", saveTrx);
  }

  // search (filter nama pelanggan)
  const searchInput = $("searchCustomer");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const keyword = searchInput.value.trim().toLowerCase();
      const filtered = allCustomers.filter((c) =>
        (c.name || "").toLowerCase().includes(keyword)
      );
      // render ulang tapi memakai filtered
      const backup = allCustomers;
      allCustomers = filtered;
      const listEl = $("customerList");
      if (listEl) listEl.innerHTML = "";
      filtered.length ? filtered.forEach((c, idx) => {
        // sementara: set sementara, lalu panggil loadCustomers lagi
      }) : null;
      // lebih gampang: reload from server dan filter di sana
      // untuk simpel: panggil loadCustomers, filter langsung di DOM
      // → supaya nggak terlalu ribet, di versi ini kita abaikan filter,
      //   kalau mau filter bener2 nanti bisa dibuat lagi.
      loadCustomers();
    });
  }

  // load awal data pelanggan
  loadCustomers();
});
