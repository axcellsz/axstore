// =======================
// KONFIGURASI API
// =======================
const API_LIST = "/api/bon/list-customers";
const API_GET = "/api/bon/get";
const API_CREATE = "/api/bon/create-customer";
const API_ADD_TRX = "/api/bon/add-trx";

// state
let customers = [];
let filteredCustomers = [];
let currentCustomer = null; // { phone, name }
let currentHistory = [];

// =======================
// HELPER
// =======================
function formatRupiah(n) {
  const num = Number(n) || 0;
  return "Rp " + num.toLocaleString("id-ID");
}

function formatDateTimeID(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const tgl = d.toLocaleDateString("id-ID");
  const jam = d.toLocaleTimeString("id-ID", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return `${tgl}, ${jam}`;
}

// dari total net -> hutang pelanggan & hutang saya
function splitBalanceFromTotal(totalNet) {
  const net = Number(totalNet) || 0;
  const customerDebt = net > 0 ? net : 0;   // pelanggan masih ngutang ke kita
  const myDebt = net < 0 ? -net : 0;        // kita yang ngutang ke pelanggan
  return { customerDebt, myDebt };
}

// hitung net dari history
function computeNetFromHistory(history) {
  let net = 0;
  for (const trx of history || []) {
    const amount = Number(trx.amount) || 0;
    if (trx.type === "give") net += amount;       // kita berikan -> pelanggan ngutang
    else if (trx.type === "receive") net -= amount; // pelanggan bayar -> hutang berkurang
  }
  return net;
}

// cek sesi admin
function ensureAdminSession() {
  const logged = localStorage.getItem("admin_logged_in");
  if (logged !== "1") {
    window.location.href = "/admin.html";
  }
}

// ganti screen
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.hidden = s.id !== id;
  });
}

// =======================
// RENDER LIST PELANGGAN
// =======================
function updateGlobalTotals() {
  const elMy = document.getElementById("globalMyTotal");
  const elCust = document.getElementById("globalCustomerTotal");
  if (!elMy || !elCust) return;

  let totalMy = 0;
  let totalCust = 0;

  for (const c of customers) {
    const net = Number(c.total) || 0;
    const { customerDebt, myDebt } = splitBalanceFromTotal(net);
    totalMy += myDebt;
    totalCust += customerDebt;
  }

  elMy.textContent = formatRupiah(totalMy);
  elCust.textContent = formatRupiah(totalCust);
}

function renderCustomerList() {
  const list = document.getElementById("customerList");
  if (!list) return;

  list.innerHTML = "";

  if (!filteredCustomers.length) {
    const empty = document.createElement("div");
    empty.className = "bon-history-list-empty";
    empty.textContent = "Belum ada pelanggan atau tidak cocok dengan pencarian.";
    list.appendChild(empty);
    updateGlobalTotals();
    return;
  }

  filteredCustomers.forEach((c, idx) => {
    const net = Number(c.total) || 0;
    const { customerDebt, myDebt } = splitBalanceFromTotal(net);

    const card = document.createElement("div");
    card.className = "bon-customer-card";

    const top = document.createElement("div");
    top.className = "bon-cust-main";

    const nameEl = document.createElement("div");
    nameEl.className = "bon-cust-name";
    nameEl.textContent = `${idx + 1}. ${c.name || "(Tanpa nama)"}`;

    const btnOpen = document.createElement("button");
    btnOpen.type = "button";
    btnOpen.className = "bon-btn-open";
    btnOpen.textContent = "BUKA";
    btnOpen.addEventListener("click", () => openDetail(c.phone));

    top.appendChild(nameEl);
    top.appendChild(btnOpen);

    const wa = document.createElement("div");
    wa.className = "bon-cust-wa";
    wa.textContent = `WA: ${c.phone || "-"}`;

    const bal = document.createElement("div");
    bal.className = "bon-cust-balance";

    const rowMy = document.createElement("div");
    rowMy.innerHTML = `Hutang saya <span class="bon-total-me">${formatRupiah(
      myDebt
    )}</span>`;

    const rowCust = document.createElement("div");
    rowCust.innerHTML = `Hutang pelanggan <span class="bon-total-customer">${formatRupiah(
      customerDebt
    )}</span>`;

    bal.appendChild(rowMy);
    bal.appendChild(rowCust);

    card.appendChild(top);
    card.appendChild(wa);
    card.appendChild(bal);

    list.appendChild(card);
  });

  updateGlobalTotals();
}

function applyFilter() {
  const input = document.getElementById("searchCustomer");
  const keyword = (input?.value || "").trim().toLowerCase();

  if (!keyword) {
    filteredCustomers = [...customers];
  } else {
    filteredCustomers = customers.filter((c) =>
      (c.name || "").toLowerCase().includes(keyword)
    );
  }

  renderCustomerList();
}

async function loadCustomers() {
  try {
    const res = await fetch(API_LIST);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok !== true || !Array.isArray(data.customers)) {
      throw new Error("Gagal memuat pelanggan");
    }

    customers = data.customers;
    filteredCustomers = [...customers];
    applyFilter();
  } catch (err) {
    console.error(err);
    alert("Gagal memuat daftar pelanggan");
  }
}

// =======================
// PELANGGAN BARU
// =======================
function openAddCustomerScreen() {
  document.getElementById("addName").value = "";
  document.getElementById("addPhone").value = "";
  showScreen("screenAdd");
}

async function saveCustomer() {
  const name = document.getElementById("addName").value.trim();
  const phone = document.getElementById("addPhone").value.trim();

  if (!name || !phone) {
    alert("Nama dan nomor WhatsApp wajib diisi");
    return;
  }

  try {
    const res = await fetch(API_CREATE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      throw new Error(data.message || "Gagal menyimpan pelanggan");
    }

    await loadCustomers();
    showScreen("screenList");
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan pelanggan");
  }
}

// =======================
// DETAIL PELANGGAN
// =======================
function renderDetailHeader(netTotal) {
  const elCust = document.getElementById("detailCustomerTotal");
  const elMy = document.getElementById("detailMyTotal");
  const { customerDebt, myDebt } = splitBalanceFromTotal(netTotal);

  if (elCust) elCust.textContent = formatRupiah(customerDebt);
  if (elMy) elMy.textContent = formatRupiah(myDebt);
}

function renderHistory(history) {
  const container = document.getElementById("detailHistory");
  if (!container) return;
  container.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "bon-history-list-empty";
    empty.textContent = "Belum ada catatan hutang.";
    container.appendChild(empty);
    return;
  }

  history
    .slice()
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    .forEach((trx) => {
      const item = document.createElement("div");
      item.className = "trx-item";

      const main = document.createElement("div");
      main.className = "trx-main";

      const dateEl = document.createElement("div");
      dateEl.className = "trx-date";
      dateEl.textContent = formatDateTimeID(trx.createdAt);

      const noteEl = document.createElement("div");
      noteEl.className = "trx-note";
      noteEl.textContent =
        trx.note || (trx.type === "give" ? "Berikan" : "Terima");

      main.appendChild(dateEl);
      main.appendChild(noteEl);

      const amountEl = document.createElement("div");
      amountEl.className = "trx-amount";
      const amount = Number(trx.amount) || 0;

      if (trx.type === "give") amountEl.classList.add("give");
      else amountEl.classList.add("receive");

      amountEl.textContent = formatRupiah(amount);

      item.appendChild(main);
      item.appendChild(amountEl);

      container.appendChild(item);
    });
}

async function openDetail(phone) {
  if (!phone) return;

  try {
    const res = await fetch(`${API_GET}?phone=${encodeURIComponent(phone)}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok !== true) {
      throw new Error(data.message || "Gagal mengambil data pelanggan");
    }

    const name = data.name || (data.customer && data.customer.name) || "";
    const history = data.history || (data.customer && data.customer.history) || [];
    const totalFromServer =
      typeof data.total === "number"
        ? data.total
        : data.customer && typeof data.customer.total === "number"
        ? data.customer.total
        : null;

    currentCustomer = { phone, name };
    currentHistory = history || [];

    document.getElementById("detailName").textContent =
      name || "(Tanpa nama)";

    const net =
      totalFromServer != null
        ? Number(totalFromServer) || 0
        : computeNetFromHistory(currentHistory);

    renderDetailHeader(net);
    renderHistory(currentHistory);

    // refresh list supaya angka list & ringkasan global ikut update
    await loadCustomers();

    showScreen("screenDetail");
  } catch (err) {
    console.error(err);
    alert("Gagal membuka detail pelanggan");
  }
}

// =======================
// TRANSAKSI
// =======================
function openInputScreen(type) {
  if (!currentCustomer) return;

  const title = document.getElementById("inputTitle");
  const typeInput = document.getElementById("trxType");
  const amountInput = document.getElementById("trxAmount");
  const noteInput = document.getElementById("trxNote");

  typeInput.value = type;
  amountInput.value = "";
  noteInput.value = "";

  if (type === "give") {
    title.textContent = `Berikan hutang untuk ${currentCustomer.name || ""}`;
  } else {
    title.textContent = `Terima pembayaran dari ${currentCustomer.name || ""}`;
  }

  showScreen("screenInput");
}

async function saveTrx() {
  if (!currentCustomer) return;

  const type = document.getElementById("trxType").value;
  const amountRaw = document.getElementById("trxAmount").value;
  const note = document.getElementById("trxNote").value.trim();

  const amount = Number(amountRaw);
  if (!type || !amount || amount <= 0) {
    alert("Jenis transaksi dan jumlah harus diisi dengan benar");
    return;
  }

  try {
    const res = await fetch(API_ADD_TRX, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: currentCustomer.phone,
        type,
        amount,
        note,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      throw new Error(data.message || "Gagal menyimpan transaksi");
    }

    // reload detail (juga akan reload list & ringkasan)
    await openDetail(currentCustomer.phone);
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan transaksi");
  }
}

// =======================
// INIT
// =======================
document.addEventListener("DOMContentLoaded", () => {
  // wajib admin login
  ensureAdminSession();

  // default tampilan
  showScreen("screenList");

  // tombol di list
  const btnAdd = document.getElementById("btnAddCustomer");
  if (btnAdd) btnAdd.addEventListener("click", openAddCustomerScreen);

  const search = document.getElementById("searchCustomer");
  if (search) search.addEventListener("input", applyFilter);

  // tombol back
  document.querySelectorAll(".btn-back-list").forEach((btn) => {
    btn.addEventListener("click", () => showScreen("screenList"));
  });

  const btnBackDetail = document.querySelector(".btn-back-detail");
  if (btnBackDetail) {
    btnBackDetail.addEventListener("click", () => showScreen("screenDetail"));
  }

  // simpan pelanggan baru
  const btnSaveCustomer = document.getElementById("btnSaveCustomer");
  if (btnSaveCustomer) btnSaveCustomer.addEventListener("click", saveCustomer);

  // tombol Berikan / Terima di detail
  const btnGive = document.getElementById("btnGive");
  if (btnGive) btnGive.addEventListener("click", () => openInputScreen("give"));

  const btnReceive = document.getElementById("btnReceive");
  if (btnReceive)
    btnReceive.addEventListener("click", () => openInputScreen("receive"));

  // simpan transaksi
  const btnSaveTrx = document.getElementById("btnSaveTrx");
  if (btnSaveTrx) btnSaveTrx.addEventListener("click", saveTrx);

  // load awal
  loadCustomers();
});
