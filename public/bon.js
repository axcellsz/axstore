// =====================
// KONFIGURASI API
// =====================
const API_BON_LIST = "/api/bon/list-customers";
const API_BON_GET = "/api/bon/get";
const API_BON_CREATE = "/api/bon/create-customer";
const API_BON_ADD_TRX = "/api/bon/add-trx";

// STATE
let allCustomers = [];      // semua pelanggan dari server
let filteredCustomers = []; // setelah filter search
let currentCustomer = null; // pelanggan yang sedang dibuka di detail
let currentTrxType = "give"; // "give" = Berikan, "receive" = Terima

// =====================
// HELPER UI
// =====================

// Cek session admin, kalau belum login -> lempar ke /admin.html
function checkAdminSession() {
  const logged = localStorage.getItem("admin_logged_in");
  if (logged !== "1") {
    window.location.href = "/admin.html";
  }
}

// Format angka ke Rupiah sederhana
function formatRupiah(amount) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return sign + "Rp " + abs.toLocaleString("id-ID");
}

// Tampilkan satu screen, sembunyikan yang lain
function showScreen(screenId) {
  const screens = document.querySelectorAll(".screen");
  screens.forEach((s) => {
    if (s.id === screenId) {
      s.classList.add("active");
    } else {
      s.classList.remove("active");
    }
  });
}

// Tampilkan pesan error/alert sederhana
function showError(msg) {
  alert(msg || "Terjadi kesalahan");
}

// =====================
// HITUNG HUTANG
// =====================

// Backend idealnya sudah kirim customerDebt & ownerDebt.
// Tapi untuk jaga-jaga, kalau cuma ada "total", kita hitung sendiri.
function splitDebtsFromItem(item) {
  const totalCustomer =
    typeof item.totalCustomerDebt === "number"
      ? item.totalCustomerDebt
      : undefined;
  const totalOwner =
    typeof item.totalOwnerDebt === "number"
      ? item.totalOwnerDebt
      : undefined;

  if (totalCustomer !== undefined || totalOwner !== undefined) {
    return {
      customerDebt: totalCustomer || 0,
      ownerDebt: totalOwner || 0,
    };
  }

  // fallback: pakai field "total" (bisa + / -)
  const total = Number(item.total || 0);
  const customerDebt = total > 0 ? total : 0;
  const ownerDebt = total < 0 ? -total : 0;

  return { customerDebt, ownerDebt };
}

// Hitung total hutang saya & hutang pelanggan dari semua pelanggan
function updateGlobalSummary() {
  let totalOwner = 0;
  let totalCustomer = 0;

  for (const c of allCustomers) {
    const { customerDebt, ownerDebt } = splitDebtsFromItem(c);
    totalOwner += ownerDebt;
    totalCustomer += customerDebt;
  }

  const elOwner = document.getElementById("sumOwnerTop");
  const elCustomer = document.getElementById("sumCustomerTop");

  if (elOwner) elOwner.textContent = formatRupiah(totalOwner);
  if (elCustomer) elCustomer.textContent = formatRupiah(totalCustomer);
}

// =====================
// RENDER LIST PELANGGAN
// =====================

function renderCustomerList() {
  const listEl = document.getElementById("customerList");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!filteredCustomers.length) {
    const empty = document.createElement("div");
    empty.className = "bon-empty";
    empty.textContent = "Belum ada pelanggan / tidak ada yang cocok dengan pencarian.";
    listEl.appendChild(empty);
    return;
  }

  filteredCustomers.forEach((cust, idx) => {
    const { customerDebt, ownerDebt } = splitDebtsFromItem(cust);

    const item = document.createElement("div");
    item.className = "customer-item";

    const topRow = document.createElement("div");
    topRow.className = "customer-top-row";

    const nameEl = document.createElement("div");
    nameEl.className = "customer-name";
    nameEl.textContent = `${idx + 1}. ${cust.name || "(Tanpa nama)"}`;

    const btnOpen = document.createElement("button");
    btnOpen.className = "customer-open-btn";
    btnOpen.textContent = "BUKA";
    btnOpen.addEventListener("click", () => {
      openCustomerDetail(cust.phone);
    });

    topRow.appendChild(nameEl);
    topRow.appendChild(btnOpen);

    const phoneEl = document.createElement("div");
    phoneEl.className = "customer-phone";
    phoneEl.textContent = `WA: ${cust.phone || "-"}`;

    const debtsEl = document.createElement("div");
    debtsEl.className = "customer-debts";

    const ownerLine = document.createElement("div");
    ownerLine.className = "customer-debt-line";
    ownerLine.innerHTML =
      `Hutang saya <span class="debt-owner">${formatRupiah(ownerDebt)}</span>`;

    const custLine = document.createElement("div");
    custLine.className = "customer-debt-line";
    custLine.innerHTML =
      `Hutang pelanggan <span class="debt-customer">${formatRupiah(customerDebt)}</span>`;

    debtsEl.appendChild(ownerLine);
    debtsEl.appendChild(custLine);

    item.appendChild(topRow);
    item.appendChild(phoneEl);
    item.appendChild(debtsEl);

    listEl.appendChild(item);
  });
}

// =====================
// LOAD & FILTER PELANGGAN
// =====================

async function loadCustomers(initialPhoneToOpen) {
  try {
    const res = await fetch(API_BON_LIST);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok || !Array.isArray(data.customers)) {
      throw new Error(data.message || "Gagal memuat daftar hutang");
    }

    allCustomers = data.customers;
    applyCustomerFilter();

    // kalau ada query ?phone=... dibuka langsung
    if (initialPhoneToOpen) {
      const found = allCustomers.find((c) => c.phone === initialPhoneToOpen);
      if (found) {
        openCustomerDetail(initialPhoneToOpen);
      }
    }
  } catch (err) {
    console.error(err);
    showError("Gagal memuat daftar hutang");
  }
}

function applyCustomerFilter() {
  const input = document.getElementById("searchCustomer");
  const keyword = (input?.value || "").trim().toLowerCase();

  if (!keyword) {
    filteredCustomers = [...allCustomers];
  } else {
    filteredCustomers = allCustomers.filter((c) =>
      (c.name || "").toLowerCase().includes(keyword)
    );
  }

  renderCustomerList();
  updateGlobalSummary(); // total semua pelanggan
}

// =====================
// DETAIL PELANGGAN
// =====================

function renderDetailHeaderAndSummary(detailObj) {
  const nameEl = document.getElementById("detailName");
  if (nameEl) {
    nameEl.textContent = detailObj.name || "(Tanpa nama)";
  }

  // Kita coba pakai elemen baru (detailTotalOwner & detailTotalCustomer).
  const ownerEl = document.getElementById("detailTotalOwner");
  const customerEl = document.getElementById("detailTotalCustomer");
  const singleEl = document.getElementById("detailTotal"); // fallback lama

  const { customerDebt, ownerDebt } = splitDebtsFromItem(detailObj);

  if (ownerEl && customerEl) {
    ownerEl.textContent = formatRupiah(ownerDebt);
    customerEl.textContent = formatRupiah(customerDebt);
    if (singleEl) singleEl.textContent = ""; // kalau masih ada, kosongkan saja
  } else if (singleEl) {
    // Fallback: hanya satu angka, pakai hutang pelanggan (positif), tanpa minus
    singleEl.textContent = formatRupiah(customerDebt);
  }
}

function renderDetailHistory(detailObj) {
  const historyEl = document.getElementById("detailHistory");
  if (!historyEl) return;
  historyEl.innerHTML = "";

  const history = Array.isArray(detailObj.history) ? detailObj.history : [];

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "bon-empty";
    empty.textContent = "Belum ada catatan hutang.";
    historyEl.appendChild(empty);
    return;
  }

  history
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .forEach((trx) => {
      const row = document.createElement("div");
      row.className = "history-item";

      const left = document.createElement("div");
      left.className = "history-left";

      const tDate = new Date(trx.createdAt || Date.now());
      const waktu =
        tDate.toLocaleDateString("id-ID") +
        ", " +
        tDate.toLocaleTimeString("id-ID");

      const dateEl = document.createElement("div");
      dateEl.className = "history-date";
      dateEl.textContent = waktu;

      const noteEl = document.createElement("div");
      noteEl.className = "history-note";
      noteEl.textContent = trx.note || (trx.type === "give" ? "Hutang baru" : "Pembayaran");

      left.appendChild(dateEl);
      left.appendChild(noteEl);

      const right = document.createElement("div");
      right.className =
        "history-amount " + (trx.type === "give" ? "history-give" : "history-receive");
      right.textContent = formatRupiah(trx.amount || 0);

      row.appendChild(left);
      row.appendChild(right);

      historyEl.appendChild(row);
    });
}

async function openCustomerDetail(phone) {
  if (!phone) return;

  try {
    const url = API_BON_GET + "?phone=" + encodeURIComponent(phone);
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Gagal mengambil data hutang");
    }

    currentCustomer = {
      phone: data.phone,
      name: data.name,
      total: data.total,
      totalCustomerDebt: data.totalCustomerDebt,
      totalOwnerDebt: data.totalOwnerDebt,
      history: data.history || [],
    };

    renderDetailHeaderAndSummary(currentCustomer);
    renderDetailHistory(currentCustomer);

    showScreen("screenDetail");
  } catch (err) {
    console.error(err);
    showError("Gagal membuka detail pelanggan");
  }
}

// =====================
// TAMBAH / EDIT PELANGGAN
// =====================

async function saveCustomer() {
  const nameInput = document.getElementById("addName");
  const phoneInput = document.getElementById("addPhone");
  const name = (nameInput?.value || "").trim();
  const phone = (phoneInput?.value || "").trim();

  if (!name) {
    showError("Nama pelanggan wajib diisi");
    return;
  }
  if (!phone) {
    showError("No WhatsApp wajib diisi");
    return;
  }

  try {
    const res = await fetch(API_BON_CREATE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Gagal menyimpan pelanggan");
    }

    if (nameInput) nameInput.value = "";
    if (phoneInput) phoneInput.value = "";

    // reload daftar pelanggan
    await loadCustomers(phone);

    // kembali ke list / langsung ke detail (sudah di-handle di loadCustomers)
    showScreen("screenList");
  } catch (err) {
    console.error(err);
    showError("Gagal menyimpan pelanggan");
  }
}

// =====================
// INPUT TRANSAKSI
// =====================

function openTrxInput(type) {
  if (!currentCustomer || !currentCustomer.phone) {
    showError("Pelanggan belum dipilih");
    return;
  }

  currentTrxType = type === "receive" ? "receive" : "give";

  const titleEl = document.getElementById("inputTitle");
  if (titleEl) {
    titleEl.textContent =
      currentTrxType === "give" ? "Catatan hutang baru" : "Catatan pembayaran";
  }

  const amountEl = document.getElementById("trxAmount");
  const noteEl = document.getElementById("trxNote");

  if (amountEl) amountEl.value = "";
  if (noteEl) noteEl.value = "";

  showScreen("screenInput");
}

async function saveTrx() {
  if (!currentCustomer || !currentCustomer.phone) {
    showError("Pelanggan belum dipilih");
    return;
  }

  const amountEl = document.getElementById("trxAmount");
  const noteEl = document.getElementById("trxNote");

  const amount = Number(amountEl?.value || 0);
  const note = (noteEl?.value || "").trim();

  if (!amount || amount <= 0) {
    showError("Jumlah harus lebih dari 0");
    return;
  }

  try {
    const res = await fetch(API_BON_ADD_TRX, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: currentCustomer.phone,
        type: currentTrxType,
        amount,
        note,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Gagal menyimpan transaksi");
    }

    // reload detail
    await openCustomerDetail(currentCustomer.phone);
    // setelah openCustomerDetail berhasil, screenDetail sudah aktif
  } catch (err) {
    console.error(err);
    showError("Gagal menyimpan transaksi");
  }
}

// =====================
// INIT
// =====================

document.addEventListener("DOMContentLoaded", () => {
  // 1. Cek dulu sesi admin
  checkAdminSession();

  // 2. Inisialisasi screen awal
  showScreen("screenList");

  // 3. Ambil query phone (kalau bon.html?phone=62xxx)
  const url = new URL(window.location.href);
  const phoneFromQuery = url.searchParams.get("phone") || "";

  // 4. Event tombol + (tambah pelanggan)
  const btnAddCustomer = document.getElementById("btnAddCustomer");
  if (btnAddCustomer) {
    btnAddCustomer.addEventListener("click", () => {
      showScreen("screenAdd");
    });
  }

  // 5. Tombol Simpan pelanggan baru
  const btnSaveCustomer = document.getElementById("btnSaveCustomer");
  if (btnSaveCustomer) {
    btnSaveCustomer.addEventListener("click", saveCustomer);
  }

  // 6. Tombol back dari tambah -> list
  document.querySelectorAll(".btn-back-list").forEach((btn) => {
    btn.addEventListener("click", () => {
      showScreen("screenList");
    });
  });

  // 7. Tombol back dari input trx -> detail
  document.querySelectorAll(".btn-back-detail").forEach((btn) => {
    btn.addEventListener("click", () => {
      showScreen("screenDetail");
    });
  });

  // 8. Tombol Berikan / Terima (di detail)
  const btnGive = document.getElementById("btnGive");
  if (btnGive) {
    btnGive.addEventListener("click", () => openTrxInput("give"));
  }

  const btnReceive = document.getElementById("btnReceive");
  if (btnReceive) {
    btnReceive.addEventListener("click", () => openTrxInput("receive"));
  }

  // 9. Tombol simpan transaksi
  const btnSaveTrx = document.getElementById("btnSaveTrx");
  if (btnSaveTrx) {
    btnSaveTrx.addEventListener("click", saveTrx);
  }

  // 10. Input search pelanggan
  const searchInput = document.getElementById("searchCustomer");
  if (searchInput) {
    searchInput.addEventListener("input", applyCustomerFilter);
  }

  // 11. Load daftar pelanggan dari server
  loadCustomers(phoneFromQuery);
});
