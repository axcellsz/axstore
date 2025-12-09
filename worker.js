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
        const email = (body.email || "").toString().trim();
        const nomorXL = (body.nomorXL || "").toString().trim();
        const jenisKuotaRaw = (body.jenisKuota || "")
          .toString()
          .trim()
          .toLowerCase();
        const alamatRaw = (body.alamat || "").toString().trim();

        const rt = (body.rt || "").toString().trim();
        const rw = (body.rw || "").toString().trim();
        const desa = (body.desa || "").toString().trim();
        const kecamatan = (body.kecamatan || "").toString().trim();
        const kabupaten = (body.kabupaten || "").toString().trim();
        const provinsi = (body.provinsi || "").toString().trim();

        const photoUrl = (body.photoUrl || "").toString().trim();

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

        if (desa) parts.push(`Desa ${desa}`);
        if (kecamatan) parts.push(`Kec. ${kecamatan}`);
        if (kabupaten) parts.push(`Kab. ${kabupaten}`);
        if (provinsi) parts.push(provinsi);

        const alamatGabungan = parts.join(", ");

        // Set ke objek user
        if (fullName) user.fullName = fullName;
        if (email) user.email = email;
        if (nomorXL) user.nomorXL = nomorXL;
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

        await env.axstore_data.put(
          "reset:" + phoneRaw,
          JSON.stringify(payload)
        );

        return json({ ok: true, code });
      }

      // =================== BON API (KV BON_DATA) ===================

      // LIST SEMUA PELANGGAN BON
      if (path === "/api/bon/list-customers" && request.method === "GET") {
        const { keys } = await env.BON_DATA.list({ prefix: "cust:" });
        const customers = [];

        for (const k of keys) {
          const raw = await env.BON_DATA.get(k.name);
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            customers.push({
              phone: obj.phone,
              name: obj.name,
              total: obj.total || 0,
            });
          } catch (e) {
            // skip rusak
          }
        }

        return json({ ok: true, customers });
      }

      // BUAT PELANGGAN BARU
      if (path === "/api/bon/create-customer" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body) return json({ ok: false, message: "Invalid JSON" }, 400);

        let { name, phone } = body;
        if (!name || !phone) {
          return json(
            { ok: false, message: "Nama & nomor WA wajib diisi" },
            400
          );
        }

        phone = phone.replace(/\D/g, "");
        if (!phone.startsWith("62")) {
          if (phone.startsWith("0")) phone = "62" + phone.slice(1);
        }

        const key = "cust:" + phone;
        const exist = await env.BON_DATA.get(key);
        if (exist) {
          return json({ ok: false, message: "Pelanggan sudah ada" }, 400);
        }

        const data = {
          phone,
          name,
          total: 0,
          history: [],
          createdAt: Date.now(),
        };

        await env.BON_DATA.put(key, JSON.stringify(data));
        return json({ ok: true, message: "Pelanggan tersimpan" });
      }

      // UPDATE DATA PELANGGAN (nama / nomor WA)
      if (path === "/api/bon/update-customer" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body)
          return json({ ok: false, message: "Invalid JSON" }, 400);

        let { oldPhone, name, phone } = body;
        if (!oldPhone) {
          return json(
            { ok: false, message: "oldPhone wajib diisi" },
            400
          );
        }

        // normalisasi nomor lama
        oldPhone = oldPhone.replace(/\D/g, "");
        if (!oldPhone.startsWith("62")) {
          if (oldPhone.startsWith("0")) oldPhone = "62" + oldPhone.slice(1);
        }
        const oldKey = "cust:" + oldPhone;

        const raw = await env.BON_DATA.get(oldKey);
        if (!raw) {
          return json({ ok: false, message: "Pelanggan tidak ditemukan" }, 404);
        }

        const obj = JSON.parse(raw);

        // update nama kalau diisi
        if (typeof name === "string" && name.trim()) {
          obj.name = name.trim();
        }

        // kalau phone baru diisi dan beda, pindahkan key
        if (phone && typeof phone === "string") {
          let newPhone = phone.replace(/\D/g, "");
          if (!newPhone.startsWith("62")) {
            if (newPhone.startsWith("0")) {
              newPhone = "62" + newPhone.slice(1);
            }
          }

          if (!newPhone) {
            return json(
              { ok: false, message: "Format nomor baru tidak valid" },
              400
            );
          }

          const newKey = "cust:" + newPhone;

          if (newKey !== oldKey) {
            const existNew = await env.BON_DATA.get(newKey);
            if (existNew) {
              return json(
                {
                  ok: false,
                  message:
                    "Nomor WhatsApp baru sudah terdaftar untuk pelanggan lain",
                },
                400
              );
            }

            obj.phone = newPhone;
            await env.BON_DATA.put(newKey, JSON.stringify(obj));
            await env.BON_DATA.delete(oldKey);

            return json({ ok: true, message: "Pelanggan diperbarui" });
          } else {
            // nomor sama, hanya nama berubah
            obj.phone = newPhone;
            await env.BON_DATA.put(oldKey, JSON.stringify(obj));
            return json({ ok: true, message: "Pelanggan diperbarui" });
          }
        } else {
          // tidak ada perubahan nomor, simpan nama saja
          await env.BON_DATA.put(oldKey, JSON.stringify(obj));
          return json({ ok: true, message: "Pelanggan diperbarui" });
        }
      }

      // HAPUS PELANGGAN
      if (path === "/api/bon/delete-customer" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body)
          return json({ ok: false, message: "Invalid JSON" }, 400);

        let { phone } = body;
        if (!phone) {
          return json({ ok: false, message: "phone wajib diisi" }, 400);
        }

        phone = phone.replace(/\D/g, "");
        if (!phone.startsWith("62")) {
          if (phone.startsWith("0")) phone = "62" + phone.slice(1);
        }
        const key = "cust:" + phone;

        const exist = await env.BON_DATA.get(key);
        if (!exist) {
          return json({ ok: false, message: "Pelanggan tidak ditemukan" }, 404);
        }

        await env.BON_DATA.delete(key);
        return json({ ok: true, message: "Pelanggan dihapus" });
      }

      // DETAIL PELANGGAN
      if (path === "/api/bon/get" && request.method === "GET") {
        let phone = url.searchParams.get("phone");
        if (!phone)
          return json({ ok: false, message: "phone diperlukan" }, 400);

        phone = phone.replace(/\D/g, "");
        const key = "cust:" + phone;

        const raw = await env.BON_DATA.get(key);
        if (!raw)
          return json({ ok: false, message: "Pelanggan tidak ditemukan" });

        const obj = JSON.parse(raw);
        return json({ ok: true, ...obj });
      }

      // TAMBAH TRANSAKSI (BERIKAN / TERIMA)
      if (path === "/api/bon/add-trx" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body) return json({ ok: false, message: "Invalid JSON" }, 400);

        let { phone, type, amount, note } = body;
        if (!phone || !type || typeof amount !== "number") {
          return json({ ok: false, message: "Data tidak lengkap" }, 400);
        }

        phone = phone.replace(/\D/g, "");
        const key = "cust:" + phone;

        const raw = await env.BON_DATA.get(key);
        if (!raw)
          return json({ ok: false, message: "Pelanggan tidak ditemukan" });

        const obj = JSON.parse(raw);

        if (type === "give") obj.total += amount;
        else if (type === "receive") obj.total -= amount;
        else
          return json({ ok: false, message: "type harus give/receive" }, 400);

        obj.history = obj.history || [];
        obj.history.push({
          type,
          amount,
          note: note || "",
          date: new Date().toISOString(),
        });

        await env.BON_DATA.put(key, JSON.stringify(obj));
        return json({ ok: true, message: "Transaksi tersimpan" });
      }
      
// =================== EDIT / DELETE TRANSAKSI ===================

// EDIT TRANSAKSI
// body: { phone, index, amount, note?, date? }
if (path === "/api/bon/edit-trx" && request.method === "POST") {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, message: "Invalid JSON" }, 400);

  let { phone, index, amount, note, date } = body;
  if (!phone || typeof index !== "number" || typeof amount !== "number") {
    return json({ ok: false, message: "Data tidak lengkap" }, 400);
  }

  phone = phone.replace(/\D/g, "");
  const key = "cust:" + phone;

  const raw = await env.BON_DATA.get(key);
  if (!raw)
    return json({ ok: false, message: "Pelanggan tidak ditemukan" }, 404);

  const obj = JSON.parse(raw);
  if (!Array.isArray(obj.history) || !obj.history[index]) {
    return json({ ok: false, message: "Transaksi tidak ditemukan" }, 404);
  }

  // update transaksi
  obj.history[index].amount = amount;
  if (typeof note === "string") obj.history[index].note = note;
  if (date) obj.history[index].date = date;

  // HITUNG ULANG TOTAL DARI SEMUA TRANSAKSI
  let total = 0;
  for (const h of obj.history) {
    if (h.type === "give") total += h.amount;
    else if (h.type === "receive") total -= h.amount;
  }
  obj.total = total;

  await env.BON_DATA.put(key, JSON.stringify(obj));
  return json({ ok: true, message: "Transaksi berhasil diperbarui" });
}

// HAPUS TRANSAKSI
// body: { phone, index }
if (path === "/api/bon/delete-trx" && request.method === "POST") {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, message: "Invalid JSON" }, 400);

  let { phone, index } = body;
  if (!phone || typeof index !== "number") {
    return json({ ok: false, message: "Data tidak lengkap" }, 400);
  }

  phone = phone.replace(/\D/g, "");
  const key = "cust:" + phone;

  const raw = await env.BON_DATA.get(key);
  if (!raw)
    return json({ ok: false, message: "Pelanggan tidak ditemukan" }, 404);

  const obj = JSON.parse(raw);
  if (!Array.isArray(obj.history) || !obj.history[index]) {
    return json({ ok: false, message: "Transaksi tidak ditemukan" }, 404);
  }

  // hapus transaksi
  obj.history.splice(index, 1);

  // HITUNG ULANG TOTAL
  let total = 0;
  for (const h of obj.history) {
    if (h.type === "give") total += h.amount;
    else if (h.type === "receive") total -= h.amount;
  }
  obj.total = total;

  await env.BON_DATA.put(key, JSON.stringify(obj));
  return json({ ok: true, message: "Transaksi berhasil dihapus" });
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
