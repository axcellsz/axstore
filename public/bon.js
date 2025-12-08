// =====================
// KONFIGURASI API
// =====================
const API_BON_LIST = "/api/bon/list-customers";
const API_BON_GET = "/api/bon/get";
const API_BON_CREATE = "/api/bon/create-customer";
const API_BON_ADD_TRX = "/api/bon/add-trx";

// STATE
let allCustomers = [];      // semua pelanggan dari server (plus total)
let filteredCustomers = []; // setelah filter search
let currentCustomer = null; // pelanggan yang sedang dibuka di detail
let currentTrxType = "give"; // "give" = Berikan, "receive" = Terima

// =====================
// HELPER UMUM
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

// Popup error sederhana
function showError(msg) {
  alert(msg || "Terjadi kesalahan");
}

// =====================
// HITUNG HUTANG DARI HISTORY
// =====================
// Aturan:
//  - type "give"   => pelanggan berhutang ( + )
//  - type "receive"=> pelanggan bayar ( - )
//  Jika hasil akhir (net) > 0  => Hutang pelanggan = net, Hutang saya = 0
//  Jika net < 0                => Hutang saya = -net, Hutang pelanggan = 0
function computeDebtsFromHistory(historyRaw) {
  const history = Array.isArray(historyRaw) ? historyRaw : [];
  let net = 0;

  for (const trx of history) {
    const amount = Number(trx.amount || 0);
    if (!amount) continue;

    if (trx.type === "give") {
      net += amount;
    } else if (trx.type === "receive") {
      net -= amount;
    }
  }

  let customerDebt = 0;
  let ownerDebt = 0;

  if (net > 0) {
    customerDebt = net;
  } else if (net < 0) {
    ownerDebt = -net;
  }

  return { customerDebt, ownerDebt };
}

// =====================
// SUMMARY GLOBAL (atas list)
// =====================

function updateGlobalSummary() {
  let totalOwner = 0;
  let totalCustomer = 0;

  for (const c of allCustomers) {
    totalOwner += Number(c.ownerDebt || 0);
    totalCustomer += Number(c.customerDebt || 0);
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
    empty.textContent =
      "Belum ada pelanggan / tidak ada yang cocok dengan pencarian.";
    listEl.appendChild(empty);
    return;
  }

  filteredCustomers.forEach((cust, idx) => {
    const customerDebt = Number(cust.customerDebt || 0);
    const ownerDebt = Number(cust.ownerDebt || 0);

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
      `Hutang pelanggan <span class="debt-customer">${formatRupiah(
        customerDebt
      )}</span>`;

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

    // data.customers biasanya cuma {phone,name} atau ada field lain,
    // tapi belum ada total. Kita ambil detail masing2, hitung total dari history.
    const baseList = data.customers;

    const detailedList = await Promise.all(
      baseList.map(async (c) => {
        try {
          const url = API_BON_GET + "?phone=" + encodeURIComponent(c.phone);
          const r = await fetch(url);
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.ok) {
            return { ...c, history: [], customerDebt: 0, ownerDebt: 0 };
          }
          const { customerDebt, ownerDebt } = computeDebtsFromHistory(
            d.history || []
          );
          return {
            ...c,
            history: d.history || [],
            customerDebt,
            ownerDebt,
          };
        } catch {
          return { ...c, history: [], customerDebt: 0, ownerDebt: 0 };
        }
      })
    );

    allCustomers = detailedList;
    applyCustomerFilter();

    // kalau dipanggil dari admin "BON" (bon.html?phone=...)
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
  updateGlobalSummary();
}

// =====================
// DETAIL PELANGGAN
// =====================

function renderDetailHeader(detailObj) {
  const nameEl = document.getElementById("detailName");
  if (nameEl) {
    nameEl.textContent = detailObj.name || "(Tanpa nama)";
  }

  const ownerEl = document.getElementById("detailTotalOwner");
  const customerEl = document.getElementById("detailTotalCustomer");
  const singleEl = document.getElementById("detailTotal"); // kalau masih ada yang lama

  const { customerDebt, ownerDebt } = computeDebtsFromHistory(
    detailObj.history || []
  );

  if (ownerEl && customerEl) {
    ownerEl.textContent = formatRupiah(ownerDebt);
    customerEl.textContent = formatRupiah(customerDebt);
    if (singleEl) singleEl.textContent = "";
  } else if (singleEl) {
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
      noteEl.textContent =
        trx.note || (trx.type === "give" ? "Hutang baru" : "Pembayaran");

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
      history: data.history || [],
    };

    renderDetailHeader(currentCustomer);
    renderDetailHistory(currentCustomer);

    showScreen("screenDetail");
  } catch (err) {
    console.error(err);
    showError("Gagal membuka detail pelanggan");
  }
}

// =====================
// TAMBAH PELANGGAN
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

    await loadCustomers(phone); // reload + buka pelanggan ini
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

  // 2. Screen awal
  showScreen("screenList");

  // 3. Ambil query phone (bon.html?phone=62xxx)
  const url = new URL(window.location.href);
  const phoneFromQuery = url.searchParams.get("phone") || "";

  // 4. Event tombol +
  const btnAddCustomer = document.getElementById("btnAddCustomer");
  if (btnAddCustomer) {
    btnAddCustomer.addEventListener("click", () => {
      showScreen("screenAdd");
    });
  }

  // 5. Simpan pelanggan baru
  const btnSaveCustomer = document.getElementById("btnSaveCustomer");
  if (btnSaveCustomer) {
    btnSaveCustomer.addEventListener("click", saveCustomer);
  }

  // 6. Back dari tambah -> list
  document.querySelectorAll(".btn-back-list").forEach((btn) => {
    btn.addEventListener("click", () => {
      showScreen("screenList");
    });
  });

  // 7. Back dari input transaksi -> detail
  document.querySelectorAll(".btn-back-detail").forEach((btn) => {
    btn.addEventListener("click", () => {
      showScreen("screenDetail");
    });
  });

  // 8. Tombol Berikan / Terima di detail
  const btnGive = document.getElementById("btnGive");
  if (btnGive) {
    btnGive.addEventListener("click", () => openTrxInput("give"));
  }
  const btnReceive = document.getElementById("btnReceive");
  if (btnReceive) {
    btnReceive.addEventListener("click", () => openTrxInput("receive"));
  }

  // 9. Simpan transaksi
  const btnSaveTrx = document.getElementById("btnSaveTrx");
  if (btnSaveTrx) {
    btnSaveTrx.addEventListener("click", saveTrx);
  }

  // 10. Search pelanggan
  const searchInput = document.getElementById("searchCustomer");
  if (searchInput) {
    searchInput.addEventListener("input", applyCustomerFilter);
  }

  // 11. Load pelanggan
  loadCustomers(phoneFromQuery);
});
