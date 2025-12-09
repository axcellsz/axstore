function formatRupiah(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

function formatDateID(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
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
  if (!phone) {
    document.getElementById("history-list").innerHTML =
      '<div class="empty">Nomor WhatsApp tidak ditemukan.</div>';
    return;
  }

  const phoneEl = document.getElementById("debt-phone");
  if (phoneEl) phoneEl.textContent = "No WA " + phone;

  try {
    const res = await fetch("/api/bon/get?phone=" + encodeURIComponent(phone));
    const data = await res.json().catch(() => ({}));

    // cek error sesuai bon.js
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || "Gagal memuat detail pelanggan");
    }

    // di bon.js: currentCustomer = data;
    // jadi data ini adalah objek customer langsung
    const customer = data.customer || data || {};

    // set judul dengan nama
    const title = document.getElementById("debt-title");
    if (title && customer.name) {
      title.textContent = "Catatan hutang " + customer.name;
    }

    const total = Number(customer.total || 0);
    const totalHutang = total > 0 ? total : 0;
    const kelebihanBayar = total < 0 ? -total : 0;

    const totalEl = document.getElementById("total-hutang");
    const lebihEl = document.getElementById("kelebihan-bayar");
    if (totalEl) totalEl.textContent = formatRupiah(totalHutang);
    if (lebihEl) lebihEl.textContent = formatRupiah(kelebihanBayar);

    renderHistory(customer.history || []);
  } catch (err) {
    console.error(err);
    document.getElementById("history-list").innerHTML =
      '<div class="empty">Gagal memuat data hutang</div>';
  }
}

function renderHistory(history) {
  const box = document.getElementById("history-list");
  if (!box) return;

  box.innerHTML = "";

  if (!history.length) {
    box.innerHTML = '<div class="empty">Belum ada catatan hutang</div>';
    return;
  }

  // transaksi terbaru di atas
  const sorted = history.slice().reverse();

  for (const h of sorted) {
    const item = document.createElement("div");
    const isReceive = h.type === "receive";
    item.className = "history-item " + (isReceive ? "receive" : "give");

    const noteText =
      h.note || (isReceive ? "Pembayaran hutang" : "Hutang baru");

    item.innerHTML = `
      <div class="history-date">${formatDateID(h.date || h.time)}</div>
      <div class="history-note">${noteText}</div>
      <div class="history-amount ${isReceive ? "receive" : "give"}">
        ${formatRupiah(h.amount || 0)}
      </div>
    `;

    box.appendChild(item);
  }
}

// jalankan saat halaman load
loadDebt();
