function formatRupiah(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

function formatDateID(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPhoneParam() {
  const p = new URLSearchParams(window.location.search);
  return p.get("phone");
}

async function loadDebt() {
  const phone = getPhoneParam();
  if (!phone) return;

  document.getElementById("debt-phone").textContent = "No WA " + phone;

  try {
    // ambil data bon
    const res = await fetch("/api/bon/get?phone=" + encodeURIComponent(phone));
    const json = await res.json();

    if (!json.status || !json.data) throw new Error("Data tidak ditemukan");

    const data = json.data;

    // title pakai nama lengkap kalau ada
    const title = document.getElementById("debt-title");
    if (data.name) {
      title.textContent = "Catatan hutang " + data.name;
    }

    const total = Number(data.total || 0);
    const totalHutang = total > 0 ? total : 0;
    const kelebihanBayar = total < 0 ? -total : 0;

    document.getElementById("total-hutang").textContent =
      formatRupiah(totalHutang);

    document.getElementById("kelebihan-bayar").textContent =
      formatRupiah(kelebihanBayar);

    renderHistory(data.history || []);
  } catch (err) {
    console.error(err);
    document.getElementById("history-list").innerHTML =
      `<div class="empty">Gagal memuat data hutang</div>`;
  }
}

function renderHistory(history) {
  const box = document.getElementById("history-list");
  box.innerHTML = "";

  if (!history.length) {
    box.innerHTML = `<div class="empty">Belum ada catatan hutang</div>`;
    return;
  }

  // terbaru di atas
  const sorted = history.slice().reverse();

  for (const h of sorted) {
    const div = document.createElement("div");
    div.className =
      "history-item " + (h.type === "receive" ? "receive" : "give");

    const note =
      h.note ||
      (h.type === "receive" ? "Pembayaran hutang" : "Hutang baru");

    div.innerHTML = `
      <div class="history-date">${formatDateID(h.date)}</div>
      <div class="history-note">${note}</div>
      <div class="history-amount ${
        h.type === "receive" ? "receive" : "give"
      }">
        ${formatRupiah(h.amount)}
      </div>
    `;

    box.appendChild(div);
  }
}

loadDebt();
