// ---------------------
// HELPERS
// ---------------------

// Normalisasi nomor WhatsApp / XL ke 628xxxxxxxxxx
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;

  let phone = phoneRaw.replace(/[\s\-.()]/g, "").trim();

  if (!/^\+?\d+$/.test(phone)) return null;

  if (phone.startsWith("+628")) {
    phone = "628" + phone.slice(4);
  } else if (phone.startsWith("628")) {
    // sudah benar
  } else if (phone.startsWith("08")) {
    // BUANG 0 JADI 62 + sisa
    phone = "62" + phone.slice(1);
  } else {
    return null;
  }

  if (phone.length < 10 || phone.length > 15) return null;

  return phone;
}

// Hash password SHA-256
async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Helper redirect
function redirect(url, extraHeaders = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      ...extraHeaders,
    },
  });
}

// Helper JSON dengan CORS
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/* ==========================
   HELPER KHUSUS KUOTA KMSP
========================== */

/**
 * Ubah string "14.32 GB" / "791 MB" / "0" dll jadi angka GB (number)
 */
function parseRemainingToGB(str) {
  if (!str) return 0;

  const raw = String(str).trim().toUpperCase();
  if (!raw || raw === "0" || raw === "0 GB" || raw === "0 MB") return 0;

  const num = parseFloat(raw);
  if (Number.isNaN(num)) return 0;

  if (raw.includes("MB")) {
    return num / 1024; // MB -> GB
  }
  return num; // anggap GB
}

/**
 * Ambil daftar paket dari respon KMSP (data.data_sp.quotas.value)
 * @param {any} dataObj - body.data dari KMSP
 * @returns {Array<{packages:any, benefits:any[]}>}
 */
function buildQuotaPackages(dataObj) {
  const quotas =
    dataObj &&
    dataObj.data_sp &&
    dataObj.data_sp.quotas &&
    dataObj.data_sp.quotas.value;

  const list = [];
  if (!Array.isArray(quotas)) return list;

  for (const group of quotas) {
    if (!Array.isArray(group)) continue;
    for (const entry of group) {
      if (entry && entry.packages && Array.isArray(entry.benefits)) {
        list.push(entry);
      }
    }
  }
  return list;
}

/**
 * Hitung kuota untuk jenis = vpn
 * Ambil satu paket (pertama) dan satu benefit DATA pertama.
 */
function computeQuotaVPN(packages) {
  if (!packages.length) return { totalGB: 0, expDate: null };

  const pkg = packages[0];
  let totalGB = 0;

  for (const b of pkg.benefits || []) {
    if (String(b.type).toUpperCase() === "DATA") {
      totalGB = parseRemainingToGB(b.remaining);
      break;
    }
  }

  const expDate = pkg.packages && pkg.packages.expDate;
  return { totalGB, expDate: expDate || null };
}

/**
 * Hitung kuota untuk jenis = akrab
 * - Cari paket name mengandung "Paket Akrab" dan TIDAK mengandung "Bonus"
 * - Kalau ketemu, pakai paket2 itu.
 * - Kalau tidak ketemu, fallback ke semua paket.
 * - Jumlahkan semua benefit type DATA.
 * - expDate = tanggal terbesar dari paket yang dipakai.
 */
function computeQuotaAkrab(packages) {
  if (!packages.length) return { totalGB: 0, expDate: null };

  const akrabPkgs = packages.filter((p) => {
    const name = (p.packages && p.packages.name) || "";
    const lower = name.toLowerCase();
    return lower.includes("paket akrab") && !lower.includes("bonus");
  });

  const targetPkgs = akrabPkgs.length ? akrabPkgs : packages;

  let totalGB = 0;
  let expDate = null;

  for (const pkg of targetPkgs) {
    const pExp = pkg.packages && pkg.packages.expDate;
    if (pExp && (!expDate || pExp > expDate)) {
      expDate = pExp;
    }

    for (const b of pkg.benefits || []) {
      if (String(b.type).toUpperCase() === "DATA") {
        totalGB += parseRemainingToGB(b.remaining);
      }
    }
  }

  return { totalGB, expDate };
}

/**
 * Hitung kuota untuk jenis = reguler (default)
 * - Pakai semua paket
 * - Jumlahkan semua benefit type DATA
 * - expDate = tanggal terbesar dari semua paket
 */
function computeQuotaReguler(packages) {
  if (!packages.length) return { totalGB: 0, expDate: null };

  let totalGB = 0;
  let expDate = null;

  for (const pkg of packages) {
    const pExp = pkg.packages && pkg.packages.expDate;
    if (pExp && (!expDate || pExp > expDate)) {
      expDate = pExp;
    }

    for (const b of pkg.benefits || []) {
      if (String(b.type).toUpperCase() === "DATA") {
        totalGB += parseRemainingToGB(b.remaining);
      }
    }
  }

  return { totalGB, expDate };
}

/**
 * Hitung kuota berdasarkan jenisKuota user
 */
function computeQuotaByJenis(jenisKuota, packages) {
  const jenis = (jenisKuota || "").toLowerCase();
  if (jenis === "vpn") return computeQuotaVPN(packages);
  if (jenis === "akrab") return computeQuotaAkrab(packages);
  // default reguler
  return computeQuotaReguler(packages);
}

/**
 * Panggil API KMSP untuk cek kuota dan hitung total sisa kuota + masa berlaku.
 * @param {string} msisdn - nomor XL sudah dalam format 62...
 * @param {string} jenisKuota - "vpn" | "akrab" | "reguler" (atau lainnya -> reguler)
 */
async function fetchQuotaFromKMSP(msisdn, jenisKuota) {
  const url =
    "https://apigw.kmsp-store.com/sidompul/v4/cek_kuota" +
    `?msisdn=${encodeURIComponent(msisdn)}&isJSON=true`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Basic c2lkb21wdWxhcGk6YXBpZ3drbXNw",
      "X-API-Key": "60ef29aa-a648-4668-90ae-20951ef90c55",
      "X-App-Version": "4.0.0",
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!res.ok) {
    throw new Error("KMSP HTTP " + res.status);
  }

  const body = await res.json();
  if (!body || body.status !== true || !body.data) {
    throw new Error("KMSP response invalid");
  }

  const dataObj = body.data;
  const packages = buildQuotaPackages(dataObj);
  if (!packages.length) {
    throw new Error("Tidak ada data kuota pada response");
  }

  return computeQuotaByJenis(jenisKuota, packages);
}

/* ==========================
   HELPER BON (HUTANG)
   KV: env.BON_DATA
========================== */

function bonKey(msisdn) {
  return "bon:" + msisdn;
}

/**
 * Load satu record bon dari KV BON_DATA
 * Jika belum ada, balikan skeleton default.
 */
async function loadBonRecord(env, msisdn) {
  if (!env.BON_DATA) {
    throw new Error("BON_DATA KV belum dikonfigurasi");
  }

  const key = bonKey(msisdn);
  const raw = await env.BON_DATA.get(key);
  const nowIso = new Date().toISOString();

  if (!raw) {
    return {
      phone: msisdn,
      name: "",
      total: 0,
      history: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  try {
    const obj = JSON.parse(raw);
    if (!Array.isArray(obj.history)) obj.history = [];
    if (typeof obj.total !== "number") obj.total = 0;
    if (!obj.phone) obj.phone = msisdn;
    if (!obj.createdAt) obj.createdAt = nowIso;
    if (!obj.updatedAt) obj.updatedAt = nowIso;
    return obj;
  } catch (e) {
    // kalau JSON rusak, mulai baru
    return {
      phone: msisdn,
      name: "",
      total: 0,
      history: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }
}

/**
 * Simpan record bon ke KV
 */
async function saveBonRecord(env, record) {
  if (!env.BON_DATA) {
    throw new Error("BON_DATA KV belum dikonfigurasi");
  }
  if (!record || !record.phone) return;
  record.updatedAt = new Date().toISOString();
  const key = bonKey(record.phone);
  await env.BON_DATA.put(key, JSON.stringify(record));
}

/**
 * Tambah transaksi ke record bon
 * type: "beri" (hutang baru) atau "terima" (pembayaran)
 */
function addBonTransaction(record, { type, amount, note, date }) {
  const nowIso = new Date().toISOString();

  const trx = {
    id: "trx_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
    type: type === "terima" ? "terima" : "beri",
    amount: Number(amount) || 0,
    note: (note || "").toString().trim(),
    date: date || nowIso,
    createdAt: nowIso,
  };

  if (!Array.isArray(record.history)) record.history = [];
  record.history.push(trx);

  if (trx.type === "beri") {
    record.total = (record.total || 0) + trx.amount;
  } else {
    record.total = (record.total || 0) - trx.amount;
    if (record.total < 0) record.total = 0;
  }

  return record;
}

// ---------------------
// MAIN WORKER
// ---------------------
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // =================== API LOGIN JSON ===================
      if (path === "/api/auth/login" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");
        const passwordInput = form.get("password") || "";

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return json(
            { status: false, message: "Masukan No WhatsApp dengan benar" },
            400
          );
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);
        if (!userJSON) {
          return json(
            { status: false, message: "No WhatsApp belum terdaftar" },
            404
          );
        }

        const user = JSON.parse(userJSON);
        const pwdHash = await hashPassword(passwordInput);

        if (pwdHash !== user.passwordHash) {
          return json(
            { status: false, message: "Kata sandi salah" },
            401
          );
        }

        // Sukses login – kirim data user (tanpa hash)
        return json({
          status: true,
          message: "Login berhasil",
          data: {
            username: user.username || user.name || "",
            phone: user.phone,
            profileCompleted: !!user.profileCompleted,
          },
        });
      }

      // =================== API PROFIL (DATA TEXT) ===================

      // GET /api/profile?phone=...
      if (path === "/api/profile" && request.method === "GET") {
        const phoneInput = url.searchParams.get("phone");
        if (!phoneInput) {
          return json(
            { status: false, message: "phone query param required" },
            400
          );
        }

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return json(
            { status: false, message: "Format No WhatsApp tidak valid" },
            400
          );
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);
        if (!userJSON) {
          return json(
            { status: false, message: "User tidak ditemukan" },
            404
          );
        }

        const user = JSON.parse(userJSON);
        delete user.passwordHash;

        return json({ status: true, data: user });
      }

      // POST /api/profile/update
      if (path === "/api/profile/update" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body) {
          return json(
            { status: false, message: "Invalid JSON body" },
            400
          );
        }

        const phoneInput = body.phone;
        if (!phoneInput) {
          return json(
            { status: false, message: "phone required" },
            400
          );
        }

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return json(
            { status: false, message: "Format No WhatsApp tidak valid" },
            400
          );
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);
        if (!userJSON) {
          return json(
            { status: false, message: "User tidak ditemukan" },
            404
          );
        }

        const user = JSON.parse(userJSON);

        // Ambil field profil dari body
        const fullName = (body.fullName || "").toString().trim();
        const email    = (body.email || "").toString().trim();
        const nomorXL  = (body.nomorXL || "").toString().trim();
        const jenisKuotaRaw = (body.jenisKuota || "").toString().trim().toLowerCase();
        const alamatRaw     = (body.alamat || "").toString().trim();

        const rt        = (body.rt || "").toString().trim();
        const rw        = (body.rw || "").toString().trim();
        const desa      = (body.desa || "").toString().trim();
        const kecamatan = (body.kecamatan || "").toString().trim();
        const kabupaten = (body.kabupaten || "").toString().trim();
        const provinsi  = (body.provinsi || "").toString().trim();

        const photoUrl  = (body.photoUrl || "").toString().trim();

        // Validasi jenisKuota
        const allowedJenis = ["vpn", "akrab", "reguler"];
        let jenisKuota = "";
        if (allowedJenis.includes(jenisKuotaRaw)) {
          jenisKuota = jenisKuotaRaw;
        }

        // Gabungkan alamat
        const parts = [];
        if (alamatRaw) parts.push(alamatRaw);

        const rtRw = [];
        if (rt) rtRw.push(`RT ${rt}`);
        if (rw) rtRw.push(`RW ${rw}`);
        if (rtRw.length) parts.push(rtRw.join(" / "));

        if (desa)      parts.push(`Desa ${desa}`);
        if (kecamatan) parts.push(`Kec. ${kecamatan}`);
        if (kabupaten) parts.push(`Kab. ${kabupaten}`);
        if (provinsi)  parts.push(provinsi);

        const alamatGabungan = parts.join(", ");

        // Set ke objek user
        if (fullName) user.fullName = fullName;
        if (email)    user.email    = email;
        if (nomorXL)  user.nomorXL  = nomorXL;
        if (jenisKuota) user.jenisKuota = jenisKuota;
        if (alamatGabungan) user.alamat = alamatGabungan;
        if (photoUrl) user.photoUrl = photoUrl; // opsional

        user.profileCompleted = true;
        user.updatedAt = new Date().toISOString();

        await env.axstore_data.put(userKey, JSON.stringify(user));

        delete user.passwordHash;
        return json({
          status: true,
          message: "Profil berhasil diperbarui",
          data: user,
        });
      }

      // =================== API FOTO PROFIL ===================

      // GET /api/profile/photo?phone=...
      if (path === "/api/profile/photo" && request.method === "GET") {
        const phoneInput = url.searchParams.get("phone");
        if (!phoneInput) {
          return new Response("phone query param required", { status: 400 });
        }

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return new Response("Format No WhatsApp tidak valid", { status: 400 });
        }

        const photoKey = "photo:" + phone;
        const arrayBuffer = await env.axstore_data.get(photoKey, "arrayBuffer");

        if (!arrayBuffer) {
          return new Response("Not found", { status: 404 });
        }

        return new Response(arrayBuffer, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
          },
        });
      }

      // POST /api/profile/photo  (upload foto terkompres)
      if (path === "/api/profile/photo" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");
        const file = form.get("photo");

        if (!phoneInput || !file) {
          return json(
            { ok: false, message: "phone dan photo wajib diisi" },
            400
          );
        }

        const phone = normalizePhone(phoneInput.toString());
        if (!phone) {
          return json(
            { ok: false, message: "Format No WhatsApp tidak valid" },
            400
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        if (arrayBuffer.byteLength > 500 * 1024) {
          return json(
            { ok: false, message: "Ukuran foto terlalu besar (>500KB)" },
            400
          );
        }

        const photoKey = "photo:" + phone;
        await env.axstore_data.put(photoKey, arrayBuffer);

        // opsional: set flag hasPhoto di user
        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);
        if (userJSON) {
          try {
            const user = JSON.parse(userJSON);
            user.hasPhoto = true;
            await env.axstore_data.put(userKey, JSON.stringify(user));
          } catch (e) {
            // abaikan kalau error parsing
          }
        }

        return json({ ok: true, message: "Foto profil tersimpan" });
      }

      // =================== API KUOTA (DENGAN CACHE KV) ===================

      // GET /api/kuota?phone=...
      if (path === "/api/kuota" && request.method === "GET") {
        const phoneInput = url.searchParams.get("phone");
        if (!phoneInput) {
          return json(
            { status: false, message: "phone query param required" },
            400
          );
        }

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return json(
            { status: false, message: "Format No WhatsApp tidak valid" },
            400
          );
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);
        if (!userJSON) {
          return json(
            { status: false, message: "User tidak ditemukan" },
            404
          );
        }

        const user = JSON.parse(userJSON);
        const nomorXLRaw = user.nomorXL;
        if (!nomorXLRaw) {
          return json(
            { status: false, message: "Nomor XL belum diisi di profil" },
            400
          );
        }

        const msisdn = normalizePhone(nomorXLRaw);
        if (!msisdn) {
          return json(
            { status: false, message: "Format nomor XL tidak valid" },
            400
          );
        }

        const jenisKuota = (user.jenisKuota || "").toLowerCase();

        const quotaKey = "quota:" + msisdn;

        // cek cache di KV
        let fromCache = false;
        let cached = null;
        const cacheJSON = await env.axstore_data.get(quotaKey);
        if (cacheJSON) {
          try {
            cached = JSON.parse(cacheJSON);
            const age = Date.now() - (cached.updatedAt || 0);
            const oneHour = 60 * 60 * 1000;
            if (age < oneHour) {
              fromCache = true;
            }
          } catch (e) {
            // abaikan error
          }
        }

        if (fromCache && cached) {
          return json({
            status: true,
            data: {
              msisdn,
              jenis: cached.jenis || jenisKuota,
              totalRemaining: cached.totalRemaining || 0,
              unit: cached.unit || "GB",
              expDate: cached.expDate || null,
              updatedAt: cached.updatedAt || 0,
              fromCache: true,
            },
          });
        }

        // tidak ada cache / cache expired -> panggil KMSP
        try {
          const { totalGB, expDate } = await fetchQuotaFromKMSP(
            msisdn,
            jenisKuota
          );

          const payload = {
            msisdn,
            jenis: jenisKuota || "reguler",
            totalRemaining: Number(totalGB.toFixed(2)),
            unit: "GB",
            expDate: expDate || null,
            updatedAt: Date.now(),
          };

          await env.axstore_data.put(quotaKey, JSON.stringify(payload));

          return json({
            status: true,
            data: {
              ...payload,
              fromCache: false,
            },
          });
        } catch (err) {
          return json(
            {
              status: false,
              message: "Gagal mengambil kuota: " + err.message,
            },
            500
          );
        }
      }

      /* ==========================
         API BON (HUTANG) - ADMIN
      =========================== */

      // LIST PELANGGAN BON
      // GET /api/bon/customers
      if (path === "/api/bon/customers" && request.method === "GET") {
        if (!env.BON_DATA) {
          return json(
            { ok: false, message: "BON_DATA KV belum dikonfigurasi" },
            500
          );
        }

        const { keys } = await env.BON_DATA.list({ prefix: "bon:" });
        const customers = [];

        for (const k of keys) {
          const raw = await env.BON_DATA.get(k.name);
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            customers.push({
              phone: obj.phone || k.name.replace(/^bon:/, ""),
              name: obj.name || "",
              total: typeof obj.total === "number" ? obj.total : 0,
              updatedAt: obj.updatedAt || null,
            });
          } catch (e) {
            // skip json rusak
          }
        }

        // urutkan: nama lalu phone
        customers.sort((a, b) => {
          const na = (a.name || "").toLowerCase();
          const nb = (b.name || "").toLowerCase();
          if (na && nb && na !== nb) return na.localeCompare(nb);
          return (a.phone || "").localeCompare(b.phone || "");
        });

        return json({ ok: true, customers });
      }

      // SIMPAN / UPDATE PELANGGAN BON
      // POST /api/bon/customer
      // body: { name, phone }
      if (path === "/api/bon/customer" && request.method === "POST") {
        if (!env.BON_DATA) {
          return json(
            { ok: false, message: "BON_DATA KV belum dikonfigurasi" },
            500
          );
        }

        const body = await request.json().catch(() => null);
        if (!body) {
          return json({ ok: false, message: "Invalid JSON body" }, 400);
        }

        const name = (body.name || "").toString().trim();
        const phoneInput = (body.phone || "").toString().trim();
        if (!name || !phoneInput) {
          return json(
            { ok: false, message: "Nama dan nomor WA wajib diisi" },
            400
          );
        }

        const msisdn = normalizePhone(phoneInput);
        if (!msisdn) {
          return json(
            { ok: false, message: "Format nomor WA tidak valid" },
            400
          );
        }

        const record = await loadBonRecord(env, msisdn);
        record.name = name;
        record.phone = msisdn;
        if (!record.createdAt) {
          record.createdAt = new Date().toISOString();
        }

        await saveBonRecord(env, record);

        return json({
          ok: true,
          message: "Pelanggan bon tersimpan",
          data: {
            phone: record.phone,
            name: record.name,
            total: record.total || 0,
          },
        });
      }

      // DETAIL BON SATU PELANGGAN
      // GET /api/bon?phone=...
      if (path === "/api/bon" && request.method === "GET") {
        if (!env.BON_DATA) {
          return json(
            { ok: false, message: "BON_DATA KV belum dikonfigurasi" },
            500
          );
        }

        const phoneInput = url.searchParams.get("phone");
        if (!phoneInput) {
          return json(
            { ok: false, message: "phone query param required" },
            400
          );
        }

        const msisdn = normalizePhone(phoneInput);
        if (!msisdn) {
          return json(
            { ok: false, message: "Format nomor WA tidak valid" },
            400
          );
        }

        const record = await loadBonRecord(env, msisdn);

        return json({
          ok: true,
          data: record,
        });
      }

      // TAMBAH TRANSAKSI BON
      // POST /api/bon/transaction
      // body: { phone, type: "beri"|"terima", amount, note, date(optional) }
      if (path === "/api/bon/transaction" && request.method === "POST") {
        if (!env.BON_DATA) {
          return json(
            { ok: false, message: "BON_DATA KV belum dikonfigurasi" },
            500
          );
        }

        const body = await request.json().catch(() => null);
        if (!body) {
          return json({ ok: false, message: "Invalid JSON body" }, 400);
        }

        const phoneInput = (body.phone || "").toString().trim();
        const typeRaw = (body.type || "").toString().trim().toLowerCase();
        const amountNum = Number(body.amount || 0);
        const note = (body.note || "").toString();
        const dateInput = (body.date || "").toString().trim();

        if (!phoneInput) {
          return json(
            { ok: false, message: "Nomor WA wajib diisi" },
            400
          );
        }
        if (!(typeRaw === "beri" || typeRaw === "terima")) {
          return json(
            { ok: false, message: "type harus 'beri' atau 'terima'" },
            400
          );
        }
        if (!amountNum || amountNum <= 0) {
          return json(
            { ok: false, message: "Nominal harus lebih dari 0" },
            400
          );
        }

        const msisdn = normalizePhone(phoneInput);
        if (!msisdn) {
          return json(
            { ok: false, message: "Format nomor WA tidak valid" },
            400
          );
        }

        const record = await loadBonRecord(env, msisdn);

        const trxDate =
          dateInput && !Number.isNaN(Date.parse(dateInput))
            ? new Date(dateInput).toISOString()
            : null;

        addBonTransaction(record, {
          type: typeRaw,
          amount: amountNum,
          note,
          date: trxDate,
        });

        await saveBonRecord(env, record);

        return json({
          ok: true,
          message: "Transaksi bon tersimpan",
          data: {
            phone: record.phone,
            name: record.name,
            total: record.total,
            lastTrx:
              record.history[record.history.length - 1] || null,
          },
        });
      }

      // PINDAH NOMOR WA BON
      // POST /admin/bon/update-phone
      // body: { oldPhone, newPhone }
      if (path === "/admin/bon/update-phone" && request.method === "POST") {
        if (!env.BON_DATA) {
          return json(
            { ok: false, message: "BON_DATA KV belum dikonfigurasi" },
            500
          );
        }

        const body = await request.json().catch(() => null);
        if (!body) {
          return json({ ok: false, message: "Invalid JSON body" }, 400);
        }

        const oldPhoneInput = (body.oldPhone || "").toString().trim();
        const newPhoneInput = (body.newPhone || "").toString().trim();

        if (!oldPhoneInput || !newPhoneInput) {
          return json(
            { ok: false, message: "oldPhone dan newPhone wajib diisi" },
            400
          );
        }

        const oldMsisdn = normalizePhone(oldPhoneInput);
        const newMsisdn = normalizePhone(newPhoneInput);

        if (!oldMsisdn || !newMsisdn) {
          return json(
            { ok: false, message: "Format nomor WA tidak valid" },
            400
          );
        }

        if (oldMsisdn === newMsisdn) {
          return json(
            { ok: false, message: "Nomor lama dan baru sama" },
            400
          );
        }

        const oldKey = bonKey(oldMsisdn);
        const newKey = bonKey(newMsisdn);

        const oldRaw = await env.BON_DATA.get(oldKey);
        if (!oldRaw) {
          return json(
            { ok: false, message: "Tidak ada bon pada nomor lama" },
            404
          );
        }

        let oldRec;
        try {
          oldRec = JSON.parse(oldRaw);
        } catch (e) {
          oldRec = null;
        }

        if (!oldRec) {
          return json(
            { ok: false, message: "Data bon lama rusak / tidak valid" },
            500
          );
        }

        const newRaw = await env.BON_DATA.get(newKey);
        let newRec = null;
        if (newRaw) {
          try {
            newRec = JSON.parse(newRaw);
          } catch (e) {
            newRec = null;
          }
        }

        const nowIso = new Date().toISOString();

        if (!newRec) {
          // langsung pindahkan
          oldRec.phone = newMsisdn;
          oldRec.updatedAt = nowIso;
          await env.BON_DATA.put(newKey, JSON.stringify(oldRec));
        } else {
          // merge
          const mergedHistory = []
            .concat(Array.isArray(newRec.history) ? newRec.history : [])
            .concat(Array.isArray(oldRec.history) ? oldRec.history : []);

          const total =
            (Number(newRec.total) || 0) + (Number(oldRec.total) || 0);

          const merged = {
            phone: newMsisdn,
            name: newRec.name || oldRec.name || "",
            total,
            history: mergedHistory,
            createdAt: newRec.createdAt || oldRec.createdAt || nowIso,
            updatedAt: nowIso,
          };

          await env.BON_DATA.put(newKey, JSON.stringify(merged));
        }

        // hapus key lama
        await env.BON_DATA.delete(oldKey);

        return json({
          ok: true,
          message: "Bon dipindahkan ke nomor baru",
        });
      }

      // =================== ADMIN API ===================

      // LIST USER
      if (path === "/admin/users" && request.method === "GET") {
        const { keys } = await env.axstore_data.list({ prefix: "user:" });
        const users = [];

        for (const k of keys) {
          const raw = await env.axstore_data.get(k.name);
          if (raw) {
            try {
              users.push(JSON.parse(raw));
            } catch (e) {
              // skip kalau JSON rusak
            }
          }
        }

        return json({ ok: true, users });
      }

      // DELETE USER
      if (path === "/admin/delete-user" && request.method === "POST") {
        const body = await request.json();
        const phoneRaw = body.phone;
        if (!phoneRaw) {
          return json({ ok: false, message: "phone required" }, 400);
        }

        await env.axstore_data.delete("user:" + phoneRaw);
        await env.axstore_data.delete("reset:" + phoneRaw);
        await env.axstore_data.delete("photo:" + phoneRaw);
        await env.axstore_data.delete("quota:" + phoneRaw); // kalau pernah pakai phone sbg key

        return json({ ok: true, message: "User deleted" });
      }

      // GENERATE RESET CODE
      if (path === "/admin/generate-reset-code" && request.method === "POST") {
        const body = await request.json();
        const phoneRaw = body.phone;

        if (!phoneRaw) {
          return json({ ok: false, message: "phone required" }, 400);
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();

        const payload = {
          phone: phoneRaw,
          code,
          createdAt: Date.now(),
          valid: true,
        };

        await env.axstore_data.put("reset:" + phoneRaw, JSON.stringify(payload));

        return json({ ok: true, code });
      }

      // =================== FORM HANDLERS (REGISTER & RESET) ===================

      // REGISTER
      if (path === "/do-register" && request.method === "POST") {
        const form = await request.formData();

        // field "name" di form sekarang = username
        const usernameRaw = (form.get("name") || "").trim();
        const phoneInput = form.get("phone");
        const pwd = form.get("password") || "";
        const pwd2 = form.get("confirm_password") || "";

        // VALIDASI USERNAME (tanpa spasi, minimal 4 char)
        if (!usernameRaw) {
          return redirect(
            `${url.origin}/login?screen=register&error=invalid_username`
          );
        }
        if (!/^[a-zA-Z0-9_.-]{4,}$/.test(usernameRaw)) {
          return redirect(
            `${url.origin}/login?screen=register&error=invalid_username`
          );
        }

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return redirect(
            `${url.origin}/login?screen=register&error=invalid_phone`
          );
        }

        const userKey = "user:" + phone;
        const exist = await env.axstore_data.get(userKey);
        if (exist) {
          return redirect(
            `${url.origin}/login?screen=register&error=exists`
          );
        }

        if (!pwd || !pwd2 || pwd !== pwd2) {
          return redirect(
            `${url.origin}/login?screen=register&error=pass_mismatch`
          );
        }

        const pwdHash = await hashPassword(pwd);

        const data = {
          username: usernameRaw,
          name: usernameRaw, // kompatibel lama
          phone,
          passwordHash: pwdHash,
          createdAt: new Date().toISOString(),

          profileCompleted: false,
          fullName: "",
          email: "",
          nomorXL: "",
          jenisKuota: "",
          alamat: "",
          photoUrl: "",
          hasPhoto: false,
        };

        await env.axstore_data.put(userKey, JSON.stringify(data));

        return redirect(
          `${url.origin}/login?screen=login&status=registered`
        );
      }

      // RESET STEP 1 - INPUT PHONE
      if (path === "/do-reset-start" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return redirect(
            `${url.origin}/login?screen=reset&error=invalid_phone`
          );
        }

        const userKey = "user:" + phone;
        const exist = await env.axstore_data.get(userKey);

        if (!exist) {
          return redirect(
            `${url.origin}/login?screen=reset&error=not_registered`
          );
        }

        return redirect(
          `${url.origin}/login?screen=reset&step=code&phone=${encodeURIComponent(
            phone
          )}&wa=1`
        );
      }

      // RESET STEP 2 - VERIFY RESET CODE
      if (path === "/do-reset-verify" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");
        const codeInput = (form.get("reset_code") || "").trim();

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return redirect(
            `${url.origin}/login?screen=reset&error=invalid_phone`
          );
        }

        const codeKey = "reset:" + phone;
        const codeJSON = await env.axstore_data.get(codeKey);

        if (!codeJSON) {
          return redirect(
            `${url.origin}/login?screen=reset&step=code&phone=${encodeURIComponent(
              phone
            )}&error=code_invalid`
          );
        }

        const obj = JSON.parse(codeJSON);
        if (!obj.code || obj.code !== codeInput) {
          return redirect(
            `${url.origin}/login?screen=reset&step=code&phone=${encodeURIComponent(
              phone
            )}&error=code_invalid`
          );
        }

        return redirect(
          `${url.origin}/login?screen=reset&step=newpass&phone=${encodeURIComponent(
            phone
          )}`
        );
      }

      // RESET STEP 3 - NEW PASSWORD
      if (path === "/do-reset-final" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");
        const pwd = form.get("new_password") || "";
        const pwd2 = form.get("confirm_new_password") || "";

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return redirect(
            `${url.origin}/login?screen=reset&error=invalid_phone`
          );
        }

        if (!pwd || !pwd2 || pwd !== pwd2) {
          return redirect(
            `${url.origin}/login?screen=reset&step=newpass&phone=${encodeURIComponent(
              phone
            )}&error=pass_mismatch`
          );
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);

        if (!userJSON) {
          return redirect(
            `${url.origin}/login?screen=reset&error=not_registered`
          );
        }

        const user = JSON.parse(userJSON);
        user.passwordHash = await hashPassword(pwd);
        await env.axstore_data.put(userKey, JSON.stringify(user));

        const codeKey = "reset:" + phone;
        await env.axstore_data.delete(codeKey);

        return redirect(
          `${url.origin}/login?screen=login&status=reset_ok`
        );
      }

      // LOGOUT – hanya redirect, sesi ada di localStorage
      if (path === "/logout") {
        return redirect(`${url.origin}/login?screen=login`);
      }

      // =================== STATIC ASSETS ===================
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      return new Response(
        "Worker error: " + (err && err.message ? err.message : String(err)),
        {
          status: 500,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }
      );
    }
  },
};
