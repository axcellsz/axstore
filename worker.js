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

      // =================== API LOGIN JSON ===================
      if (path === "/api/auth/login" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");
        const passwordInput = form.get("password") || "";

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return json({ status: false, message: "Masukan No WhatsApp dengan benar" });
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);
        if (!userJSON) {
          return json({ status: false, message: "No WhatsApp belum terdaftar" });
        }

        const user = JSON.parse(userJSON);
        const pwdHash = await hashPassword(passwordInput);

        if (pwdHash !== user.passwordHash) {
          return json({ status: false, message: "Kata sandi salah" });
        }

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
      if (path === "/admin/users" && request.method === "GET") {
        const { keys } = await env.axstore_data.list({ prefix: "user:" });
        const users = [];

        for (const k of keys) {
          const raw = await env.axstore_data.get(k.name);
          if (raw) {
            try { users.push(JSON.parse(raw)); } catch {}
          }
        }

        return json({ ok: true, users });
      }

      if (path === "/admin/delete-user" && request.method === "POST") {
        const body = await request.json();
        const phoneRaw = body.phone;

        if (!phoneRaw) return json({ ok: false, message: "phone required" });

        await env.axstore_data.delete("user:" + phoneRaw);
        await env.axstore_data.delete("reset:" + phoneRaw);

        return json({ ok: true, message: "User deleted" });
      }

      if (path === "/admin/generate-reset-code" && request.method === "POST") {
        const body = await request.json();
        const phoneRaw = body.phone;

        if (!phoneRaw) return json({ ok: false, message: "phone required" });

        const code = Math.floor(100000 + Math.random() * 900000).toString();

        await env.axstore_data.put(
          "reset:" + phoneRaw,
          JSON.stringify({ phone: phoneRaw, code, createdAt: Date.now(), valid: true })
        );

        return json({ ok: true, code });
      }

      // =================== REGISTER ===================
      if (path === "/do-register" && request.method === "POST") {
        const form = await request.formData();
        const name = form.get("name") || "";
        const phoneInput = form.get("phone");
        const pwd = form.get("password") || "";
        const pwd2 = form.get("confirm_password") || "";

        const phone = normalizePhone(phoneInput);

        if (!phone) return redirect(`${url.origin}/login?screen=register&error=invalid_phone`);
        if (await env.axstore_data.get("user:" + phone))
          return redirect(`${url.origin}/login?screen=register&error=exists`);
        if (pwd !== pwd2)
          return redirect(`${url.origin}/login?screen=register&error=pass_mismatch`);

        const pwdHash = await hashPassword(pwd);

        await env.axstore_data.put(
          "user:" + phone,
          JSON.stringify({ name, phone, passwordHash: pwdHash })
        );

        return redirect(`${url.origin}/login?screen=login&status=registered`);
      }

      // =================== RESET PASSWORD ===================

      if (path === "/do-reset-start" && request.method === "POST") {
        const form = await request.formData();
        const phone = normalizePhone(form.get("phone"));

        if (!phone) return redirect(`${url.origin}/login?screen=reset&error=invalid_phone`);
        if (!await env.axstore_data.get("user:" + phone))
          return redirect(`${url.origin}/login?screen=reset&error=not_registered`);

        return redirect(`${url.origin}/login?screen=reset&step=code&phone=${phone}`);
      }

      if (path === "/do-reset-verify" && request.method === "POST") {
        const form = await request.formData();
        const phone = normalizePhone(form.get("phone"));
        const code = form.get("reset_code");

        const reset = await env.axstore_data.get("reset:" + phone);
        if (!reset) return redirect(`${url.origin}/login?screen=reset&step=code&error=code_invalid&phone=${phone}`);

        const obj = JSON.parse(reset);

        if (obj.code !== code)
          return redirect(`${url.origin}/login?screen=reset&step=code&error=code_invalid&phone=${phone}`);

        return redirect(`${url.origin}/login?screen=reset&step=newpass&phone=${phone}`);
      }

      if (path === "/do-reset-final" && request.method === "POST") {
        const form = await request.formData();
        const phone = normalizePhone(form.get("phone"));
        const pwd = form.get("new_password");
        const pwd2 = form.get("confirm_new_password");

        if (pwd !== pwd2)
          return redirect(`${url.origin}/login?screen=reset&step=newpass&error=pass_mismatch&phone=${phone}`);

        const userJSON = await env.axstore_data.get("user:" + phone);
        if (!userJSON) return redirect(`${url.origin}/login?screen=reset&error=not_registered`);

        const user = JSON.parse(userJSON);
        user.passwordHash = await hashPassword(pwd);

        await env.axstore_data.put("user:" + phone, JSON.stringify(user));
        await env.axstore_data.delete("reset:" + phone);

        return redirect(`${url.origin}/login?screen=login&status=reset_ok`);
      }

      if (path === "/logout") {
        return redirect(`${url.origin}/login`);
      }

      // =================== STATIC FILES ===================
      return env.ASSETS.fetch(request);

    } catch (err) {
      return new Response("Worker error: " + err, { status: 500 });
    }
  },
};
