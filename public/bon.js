/* ============================================
   BON.JS — Sistem Hutang Pelanggan (Admin)
   Terhubung ke Worker API /api/bon/...
   ============================================ */

/* ---------------------------
   Konfigurasi endpoint
--------------------------- */
const API_LIST   = "/api/bon/list-customers";
const API_GET    = "/api/bon/get";
const API_CREATE = "/api/bon/create-customer";
const API_TRX    = "/api/bon/add-trx";

/* ---------------------------
   State
--------------------------- */
let allCustomers = [];
let filteredCustomers = [];
let activePhone = null;
let activeDetail = null;

/* ---------------------------
   Helper UI
--------------------------- */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((e) => (e.hidden = true));
  const target = document.getElementById(id);
  if (target) target.hidden = false;
}

function formatRupiah(num) {
  const n = Number(num) || 0;
  return "Rp" + n.toLocaleString("id-ID");
}

/* ---------------------------
   Cek sesi admin
--------------------------- */
function checkAdminSession() {
  const logged = localStorage.getItem("admin_logged_in");
  if (logged !== "1") {
    // kalau belum login admin, balik ke admin.html
    window.location.href = "/admin.html";
  }
}

/* ---------------------------
   LOAD SEMUA PELANGGAN
--------------------------- */
async function loadAllCustomers() {
  try {
    const res = await fetch(API_LIST);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok || !Array.isArray(data.customers)) {
      throw new Error("Gagal load pelanggan");
    }

    allCustomers = data.customers;
    applyFilter();
  } catch (err) {
    console.error(err);
    alert("Gagal memuat daftar pelanggan");
  }
}

/* ---------------------------
   FILTER & RENDER LIST
--------------------------- */
function applyFilter() {
  const q = (document.getElementById("searchCustomer")?.value || "")
    .trim()
    .toLowerCase();

  if (!q) {
    filteredCustomers = [...allCustomers];
  } else {
    filteredCustomers = allCustomers.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }

  renderCustomerList();
}

function renderCustomerList() {
  const listDiv = document.getElementById("customerList");
  if (!listDiv) return;

  listDiv.innerHTML = "";

  if (!filteredCustomers.length) {
    listDiv.innerHTML = "<div>Belum ada pelanggan / tidak cocok dengan pencarian.</div>";
    return;
  }

  filteredCustomers.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "cust-row";
    row.innerHTML = `
      <div class="cust-left">
        <div class="cust-name">${i + 1}. ${c.name || "(Tanpa nama)"}</div>
        <div class="cust-phone">WA: ${c.phone || "-"}</div>
      </div>
      <button class="btn-open" data-phone="${c.phone || ""}">
        BUKA
      </button>
    `;
    listDiv.appendChild(row);
  });

  listDiv.querySelectorAll(".btn-open").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phone = btn.dataset.phone;
      if (phone) openCustomer(phone);
    });
  });
}

/* ---------------------------
   BUKA DETAIL PELANGGAN
--------------------------- */
async function openCustomer(phone) {
  try {
    activePhone = phone;

    const res = await fetch(
      API_GET + "?phone=" + encodeURIComponent(phone)
    );
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Gagal ambil data bon");
    }

    activeDetail = data;
    showCustomerDetail();
  } catch (err) {
    console.error(err);
    alert("Gagal membuka detail pelanggan");
  }
}

function showCustomerDetail() {
  if (!activeDetail) return;

  showScreen("screenDetail");

  const nameDiv = document.getElementById("detailName");
  const totalDiv = document.getElementById("detailTotal");
  const listDiv = document.getElementById("detailHistory");

  if (nameDiv) nameDiv.textContent = activeDetail.name || "(Tanpa nama)";
  if (totalDiv) totalDiv.textContent = formatRupiah(activeDetail.total || 0);

  if (!listDiv) return;
  listDiv.innerHTML = "";

  const history = Array.isArray(activeDetail.history)
    ? activeDetail.history
    : [];

  if (!history.length) {
    listDiv.innerHTML = "<div>Belum ada catatan hutang.</div>";
    return;
  }

  history.forEach((h) => {
    const row = document.createElement("div");
    row.className = "hist-row";

    const color = h.type === "give" ? "#dc2626" : "#16a34a";

    row.innerHTML = `
      <div class="hist-left">
        <div class="hist-date">${h.date || ""}</div>
        <div class="hist-note">${h.note || ""}</div>
      </div>
      <div class="hist-right" style="color:${color}">
        ${formatRupiah(h.amount || 0)}
      </div>
    `;

    listDiv.appendChild(row);
  });
}

/* ---------------------------
   TAMBAH PELANGGAN BARU
--------------------------- */
function initAddCustomer() {
  const btnAdd = document.getElementById("btnAddCustomer");
  const btnSave = document.getElementById("btnSaveCustomer");

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      document.getElementById("addName").value = "";
      document.getElementById("addPhone").value = "";
      showScreen("screenAdd");
    });
  }

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      const name = document.getElementById("addName").value.trim();
      const phone = document.getElementById("addPhone").value.trim();

      if (!name || !phone) {
        alert("Nama dan nomor WA wajib diisi");
        return;
      }

      try {
        const res = await fetch(API_CREATE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, phone }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.message || "Gagal menyimpan pelanggan");
        }

        await loadAllCustomers();
        showScreen("screenList");
      } catch (err) {
        console.error(err);
        alert("Gagal menyimpan pelanggan");
      }
    });
  }
}

/* ---------------------------
   FORM HUTANG / PEMBAYARAN
--------------------------- */
function openForm(type) {
  const title = document.getElementById("inputTitle");
  const typeInput = document.getElementById("trxType");
  const amountInput = document.getElementById("trxAmount");
  const noteInput = document.getElementById("trxNote");

  if (!typeInput || !amountInput || !noteInput || !title) return;

  typeInput.value = type;
  amountInput.value = "";
  noteInput.value = "";

  title.textContent = type === "give" ? "Berikan hutang" : "Terima pembayaran";

  showScreen("screenInput");
}

function initTrxButtons() {
  const btnGive = document.getElementById("btnGive");
  const btnReceive = document.getElementById("btnReceive");
  const btnSaveTrx = document.getElementById("btnSaveTrx");

  if (btnGive) {
    btnGive.addEventListener("click", () => openForm("give"));
  }
  if (btnReceive) {
    btnReceive.addEventListener("click", () => openForm("receive"));
  }

  if (btnSaveTrx) {
    btnSaveTrx.addEventListener("click", async () => {
      const type = document.getElementById("trxType").value;
      const amount = Number(document.getElementById("trxAmount").value);
      const note = document.getElementById("trxNote").value.trim();

      if (!amount || amount <= 0) {
        alert("Jumlah tidak valid");
        return;
      }

      try {
        const res = await fetch(API_TRX, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: activePhone,
            type,
            amount,
            note,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.message || "Gagal menyimpan transaksi");
        }

        await openCustomer(activePhone); // reload detail
      } catch (err) {
        console.error(err);
        alert("Gagal menyimpan transaksi");
      }
    });
  }
}

/* ---------------------------
   BACK BUTTONS
--------------------------- */
function initBackButtons() {
  document.querySelectorAll(".btn-back-list").forEach((btn) => {
    btn.addEventListener("click", () => {
      showScreen("screenList");
    });
  });

  document.querySelectorAll(".btn-back-detail").forEach((btn) => {
    btn.addEventListener("click", () => {
      showScreen("screenDetail");
    });
  });
}

/* ---------------------------
   INIT
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  checkAdminSession();

  const searchInput = document.getElementById("searchCustomer");
  if (searchInput) {
    searchInput.addEventListener("input", applyFilter);
  }

  initAddCustomer();
  initTrxButtons();
  initBackButtons();

  showScreen("screenList");
  loadAllCustomers();
});
