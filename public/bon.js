// ================== KONFIG API ==================
const API_LIST_CUSTOMERS = "/api/bon/list-customers";
const API_CREATE_CUSTOMER = "/api/bon/create-customer";
const API_GET_CUSTOMER = "/api/bon/get";
const API_ADD_TRX = "/api/bon/add-trx";

let customers = [];
let filteredCustomers = [];
let currentCustomer = null; // {phone,name,total,history}

// ================== HELPER ==================

function formatRupiah(num) {
  const n = Number(num || 0);
  return "Rp " + n.toLocaleString("id-ID");
}

// pecah total menjadi: hutang saya & hutang pelanggan
function splitDebt(total) {
  const t = Number(total || 0);
  return {
    myDebt: t < 0 ? -t : 0,       // kalau total negatif → saya berhutang
    customerDebt: t > 0 ? t : 0,  // kalau total positif → pelanggan berhutang
  };
}

function showScreen(name) {
  const screenList = document.getElementById("screenList");
  const screenAdd = document.getElementById("screenAdd");
  const screenDetail = document.getElementById("screenDetail");
  const screenInput = document.getElementById("screenInput");

  if (screenList) screenList.hidden = name !== "list";
  if (screenAdd) screenAdd.hidden = name !== "add";
  if (screenDetail) screenDetail.hidden = name !== "detail";
  if (screenInput) screenInput.hidden = name !== "input";
}

// ================== RENDER LIST PELANGGAN ==================

function renderCustomers() {
  const listEl = document.getElementById("customerList");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!filteredCustomers.length) {
    const empty = document.createElement("div");
    empty.textContent = "Belum ada pelanggan.";
    listEl.appendChild(empty);
    return;
  }

  filteredCustomers.forEach((c, idx) => {
    const card = document.createElement("div");
    card.className = "customer-card";

    // baris atas: nomor + nama + tombol buka
    const topRow = document.createElement("div");
    topRow.className = "customer-top-row";

    const nameDiv = document.createElement("div");
    nameDiv.className = "customer-name";
    nameDiv.textContent = `${idx + 1}. ${c.name || "(tanpa nama)"}`;

    const btn = document.createElement("button");
    btn.className = "customer-open-btn";
    btn.textContent = "BUKA";
    btn.addEventListener("click", () => openCustomer(c));

    topRow.appendChild(nameDiv);
    topRow.appendChild(btn);

    // baris info WA
    const meta = document.createElement("div");
    meta.className = "customer-meta";
    meta.textContent = `WA: ${c.phone}`;

    // hitung hutang saya & hutang pelanggan
    const { myDebt, customerDebt } = splitDebt(c.total);

    // baris hutang saya
    const debtRowMy = document.createElement("div");
    debtRowMy.className = "customer-debt-row";
    debtRowMy.innerHTML =
      `Hutang saya <span class="debt-green">${formatRupiah(myDebt)}</span>`;

    // baris hutang pelanggan
    const debtRowCust = document.createElement("div");
    debtRowCust.className = "customer-debt-row";
    debtRowCust.innerHTML =
      `Hutang pelanggan <span class="debt-red">${formatRupiah(customerDebt)}</span>`;

    card.appendChild(topRow);
    card.appendChild(meta);
    card.appendChild(debtRowMy);
    card.appendChild(debtRowCust);

    listEl.appendChild(card);
  });
}

// filter by nama
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
  renderCustomers();
}

// ================== LOAD LIST PELANGGAN ==================

async function loadCustomers() {
  try {
    const res = await fetch(API_LIST_CUSTOMERS);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false || !Array.isArray(data.customers)) {
      throw new Error(data.message || "Gagal memuat pelanggan");
    }
    customers = data.customers;
    filteredCustomers = [...customers];
    applyFilter();
  } catch (err) {
    console.error(err);
    alert("Gagal memuat daftar pelanggan");
  }
}

// ================== DETAIL PELANGGAN ==================

async function openCustomer(cust) {
  currentCustomer = null;
  try {
    const url = API_GET_CUSTOMER + "?phone=" + encodeURIComponent(cust.phone);
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || "Gagal memuat detail pelanggan");
    }
    currentCustomer = data;
    renderDetail();
    showScreen("detail");
  } catch (err) {
    console.error(err);
    alert("Gagal membuka detail pelanggan");
  }
}

function renderDetail() {
  if (!currentCustomer) return;

  const nameEl = document.getElementById("detailName");
  const totalEl = document.getElementById("detailTotal");
  const historyEl = document.getElementById("detailHistory");

  if (nameEl) nameEl.textContent = currentCustomer.name || "(tanpa nama)";

  // kalau detailTotal ada, tampilkan net total (masih merah seperti sebelumnya)
  if (totalEl) {
    totalEl.textContent = formatRupiah(currentCustomer.total || 0);
  }

  if (!historyEl) return;
  historyEl.innerHTML = "";

  const history = currentCustomer.history || [];
  if (!history.length) {
    const empty = document.createElement("div");
    empty.textContent = "Belum ada catatan hutang.";
    historyEl.appendChild(empty);
    return;
  }

  history.forEach((h) => {
    const item = document.createElement("div");
    item.className =
      "history-item " + (h.type === "give" ? "history-give" : "history-receive");

    const header = document.createElement("div");
    header.className = "history-header";

    const dateDiv = document.createElement("div");
    dateDiv.className = "history-date";
    const d = new Date(h.date || h.time || Date.now());
    dateDiv.textContent = d.toLocaleString("id-ID");

    const amountDiv = document.createElement("div");
    amountDiv.className = "history-amount";
    amountDiv.textContent = formatRupiah(h.amount || 0);

    header.appendChild(dateDiv);
    header.appendChild(amountDiv);

    const noteDiv = document.createElement("div");
    noteDiv.className = "history-note";
    noteDiv.textContent =
      h.note || (h.type === "give" ? "Berikan (hutang baru)" : "Terima (pembayaran)");

    item.appendChild(header);
    item.appendChild(noteDiv);

    historyEl.appendChild(item);
  });
}

// ================== TAMBAH PELANGGAN ==================

async function saveCustomer() {
  const nameInput = document.getElementById("addName");
  const phoneInput = document.getElementById("addPhone");

  const name = (nameInput.value || "").trim();
  const phone = (phoneInput.value || "").trim();

  if (!name || !phone) {
    alert("Nama dan nomor WhatsApp wajib diisi");
    return;
  }

  try {
    const res = await fetch(API_CREATE_CUSTOMER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || "Gagal menyimpan pelanggan");
    }
    // reset form
    nameInput.value = "";
    phoneInput.value = "";

    await loadCustomers();
    showScreen("list");
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan pelanggan");
  }
}

// ================== INPUT TRANSAKSI ==================

function openInputScreen(type) {
  if (!currentCustomer) return;
  const titleEl = document.getElementById("inputTitle");
  const typeEl = document.getElementById("trxType");
  const amountEl = document.getElementById("trxAmount");
  const noteEl = document.getElementById("trxNote");

  if (type === "give") {
    titleEl.textContent = "Berikan (hutang baru)";
  } else {
    titleEl.textContent = "Terima (pembayaran)";
  }

  typeEl.value = type;
  amountEl.value = "";
  noteEl.value = "";

  showScreen("input");
}

async function saveTrx() {
  if (!currentCustomer) return;

  const type = document.getElementById("trxType").value;
  const amountRaw = document.getElementById("trxAmount").value;
  const note = document.getElementById("trxNote").value || "";

  const amount = Number(amountRaw);
  if (!amount || amount <= 0) {
    alert("Jumlah harus lebih besar dari 0");
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
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || "Gagal menyimpan transaksi");
    }

    // reload detail dan kembali ke screen detail
    await openCustomer({ phone: currentCustomer.phone });
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan transaksi");
  }
}

// ================== INIT ==================

document.addEventListener("DOMContentLoaded", () => {
  // proteksi: hanya bisa diakses kalau admin sudah login
  const logged = localStorage.getItem("admin_logged_in");
  if (logged !== "1") {
    window.location.href = "/admin.html";
    return;
  }

  // tombol + pelanggan baru
  document
    .getElementById("btnAddCustomer")
    ?.addEventListener("click", () => showScreen("add"));

  // back dari screenAdd ke list
  document
    .querySelector("#screenAdd .btn-back-list")
    ?.addEventListener("click", () => showScreen("list"));

  // back dari screenDetail ke list
  document
    .querySelector("#screenDetail .btn-back-list")
    ?.addEventListener("click", () => showScreen("list"));

  // back dari screenInput ke detail
  document
    .querySelector("#screenInput .btn-back-detail")
    ?.addEventListener("click", () => showScreen("detail"));

  // simpan pelanggan baru
  document
    .getElementById("btnSaveCustomer")
    ?.addEventListener("click", saveCustomer);

  // search
  document
    .getElementById("searchCustomer")
    ?.addEventListener("input", applyFilter);

  // tombol Berikan / Terima
  document.getElementById("btnGive")?.addEventListener("click", () =>
    openInputScreen("give")
  );
  document.getElementById("btnReceive")?.addEventListener("click", () =>
    openInputScreen("receive")
  );

  // simpan transaksi
  document
    .getElementById("btnSaveTrx")
    ?.addEventListener("click", saveTrx);

  // pertama kali: tampilkan list
  showScreen("list");
  loadCustomers();
});
