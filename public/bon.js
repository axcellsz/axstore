/* ============================================
   BON.JS — Sistem Hutang Pelanggan
   Terhubung ke Worker API /api/bon/...
   ============================================ */

/* ---------------------------
   State
--------------------------- */
let customers = [];     // daftar pelanggan (name + phone)
let activePhone = null; // nomor pelanggan yang sedang dibuka
let activeData = null;  // data hutang pelanggan ini (transactions)

/* ---------------------------
   Helper UI
--------------------------- */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(e => e.hidden = true);
  document.getElementById(id).hidden = false;
}

function formatRupiah(num) {
  return "Rp" + Number(num).toLocaleString("id-ID");
}

/* ---------------------------
   LOAD SEMUA PELANGGAN
--------------------------- */
async function loadAllCustomers() {
  const res = await fetch("/api/bon/list-customers");
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    alert("Gagal memuat data pelanggan");
    return;
  }

  customers = data.customers;
  renderCustomerList();
}

/* ---------------------------
   RENDER LIST PELANGGAN
--------------------------- */
function renderCustomerList() {
  const listDiv = document.getElementById("customerList");
  listDiv.innerHTML = "";

  if (!customers.length) {
    listDiv.innerHTML = "<div>Belum ada pelanggan.</div>";
    return;
  }

  customers.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "cust-row";
    row.innerHTML = `
      <div class="cust-left">
        <div class="cust-name">${i + 1}. ${c.name}</div>
        <div class="cust-phone">WA: ${c.phone}</div>
      </div>

      <button class="btn-open" data-phone="${c.phone}">
        BUKA
      </button>
    `;
    listDiv.appendChild(row);
  });

  document.querySelectorAll(".btn-open").forEach(btn => {
    btn.addEventListener("click", () => {
      const phone = btn.dataset.phone;
      openCustomer(phone);
    });
  });
}

/* ---------------------------
   BUKA DETAIL PELANGGAN
--------------------------- */
async function openCustomer(phone) {
  activePhone = phone;

  const res = await fetch("/api/bon/get?phone=" + encodeURIComponent(phone));
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    alert("Gagal membuka data bon");
    return;
  }

  activeData = data;
  showCustomerDetail();
}

/* ---------------------------
   RENDER DETAIL
--------------------------- */
function showCustomerDetail() {
  showScreen("screenDetail");

  const nameDiv = document.getElementById("detailName");
  const totalDiv = document.getElementById("detailTotal");
  const listDiv = document.getElementById("detailHistory");

  nameDiv.textContent = activeData.name;
  totalDiv.textContent = formatRupiah(activeData.total);

  listDiv.innerHTML = "";

  if (!activeData.history.length) {
    listDiv.innerHTML = "<div>Belum ada catatan hutang.</div>";
    return;
  }

  activeData.history.forEach(h => {
    const row = document.createElement("div");
    row.className = "hist-row";

    const warna = h.type === "give" ? "red" : "green";

    row.innerHTML = `
      <div class="hist-left">
        <div>${h.date}</div>
        <div class="hist-note">${h.note || ""}</div>
      </div>

      <div class="hist-right" style="color:${warna}">
        ${formatRupiah(h.amount)}
      </div>
    `;

    listDiv.appendChild(row);
  });
}

/* ---------------------------
   TAMBAH PELANGGAN BARU
--------------------------- */
document.getElementById("btnAddCustomer").addEventListener("click", () => {
  showScreen("screenAdd");
});

document.getElementById("btnSaveCustomer").addEventListener("click", async () => {
  const name = document.getElementById("addName").value.trim();
  const phone = document.getElementById("addPhone").value.trim();

  if (!name || !phone) {
    alert("Nama dan nomor WA wajib diisi");
    return;
  }

  const res = await fetch("/api/bon/create-customer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    alert("Gagal menyimpan pelanggan");
    return;
  }

  loadAllCustomers();
  showScreen("screenList");
});

/* ---------------------------
   INPUT HUTANG / TERIMA
--------------------------- */
function openForm(type) {
  document.getElementById("trxType").value = type;
  document.getElementById("trxAmount").value = "";
  document.getElementById("trxNote").value = "";
  showScreen("screenInput");
}

document.getElementById("btnGive").addEventListener("click", () => openForm("give"));
document.getElementById("btnReceive").addEventListener("click", () => openForm("receive"));

/* ---------------------------
   SIMPAN TRANSAKSI
--------------------------- */
document.getElementById("btnSaveTrx").addEventListener("click", async () => {
  const type = document.getElementById("trxType").value;
  const amount = Number(document.getElementById("trxAmount").value);
  const note = document.getElementById("trxNote").value.trim();

  if (!amount || amount < 1) {
    alert("Jumlah tidak valid");
    return;
  }

  const res = await fetch("/api/bon/add-trx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: activePhone,
      type,
      amount,
      note
    })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    alert("Gagal menyimpan transaksi");
    return;
  }

  openCustomer(activePhone); // reload
});

/* ---------------------------
   BACK BUTTON
--------------------------- */
document.querySelectorAll(".btnBack").forEach(btn => {
  btn.addEventListener("click", () => {
    showScreen("screenList");
  });
});

/* ---------------------------
   Init
--------------------------- */
document.addEventListener("DOMContentLoaded", loadAllCustomers);
