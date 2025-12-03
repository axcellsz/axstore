// ---------------------
// HELPERS
// ---------------------

// Normalisasi nomor WhatsApp ke 628xxxxxxxxxx
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

// ---------------------
// MAIN WORKER
// ---------------------
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // =================== API LOGIN JSON (dipakai login.html via fetch) ===================
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
            name: user.name,
            phone: user.phone,
          },
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

        // di KV kita pakai format sudah normal, jadi langsung pakai apa yang dikirim admin
        await env.axstore_data.delete("user:" + phoneRaw);
        await env.axstore_data.delete("reset:" + phoneRaw);

        return json({ ok: true, message: "User deleted" });
      }

      // GENERATE RESET CODE
      if (
        path === "/admin/generate-reset-code" &&
        request.method === "POST"
      ) {
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
        const name = (form.get("name") || "").trim();
        const phoneInput = form.get("phone");
        const pwd = form.get("password") || "";
        const pwd2 = form.get("confirm_password") || "";

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
          name,
          phone,
          passwordHash: pwdHash,
          createdAt: new Date().toISOString(),
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

        // Di sini kamu bisa kirim WA manual, dll.
        // Lanjut ke step kode
        return redirect(
          `${url.origin}/login?screen=reset&step=code&phone=${encodeURIComponent(
            phone
          )}`
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

      // =================== STATIC ASSETS (HTML, CSS, JS, dll) ===================
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
