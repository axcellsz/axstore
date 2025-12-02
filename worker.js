// ---------------------
// HELPERS
// ---------------------

// Clean and normalize phone number
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;

  // remove spaces, hyphens, dots, parentheses
  let phone = phoneRaw.replace(/[\s\-.()]/g, "").trim();

  // Accept only numbers and optional + at start
  if (!/^\+?\d+$/.test(phone)) return null;

  // Normalize to 628xxxxxxxx
  if (phone.startsWith("+628")) {
    phone = "628" + phone.slice(4);
  } else if (phone.startsWith("628")) {
    // already OK
  } else if (phone.startsWith("08")) {
    phone = "628" + phone.slice(1);
  } else {
    // invalid base format
    return null;
  }

  // Validate length 10–15 digits
  if (phone.length < 10 || phone.length > 15) return null;

  return phone;
}

// Hash password SHA-256
async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

const SESSION_COOKIE = "session_user";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const cookies = request.headers.get("Cookie") || "";
      const loggedIn = cookies.includes(`${SESSION_COOKIE}=`);

      // --------------------------
      // PROTECT INDEX.HTML
      // --------------------------
      if (path === "/" || path === "/index.html") {
        if (!loggedIn) {
          return Response.redirect("/login.html?screen=login", 302);
        }
      }

      // --------------------------
      // LOGIN
      // --------------------------
      if (path === "/do-login" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");
        const passwordInput = form.get("password") || "";

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return Response.redirect("/login.html?screen=login&error=invalid_phone", 302);
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);
        if (!userJSON) {
          return Response.redirect("/login.html?screen=login&error=not_registered", 302);
        }

        const user = JSON.parse(userJSON);
        const pwdHash = await hashPassword(passwordInput);

        if (pwdHash !== user.passwordHash) {
          return Response.redirect("/login.html?screen=login&error=wrong_password", 302);
        }

        return new Response(null, {
          status: 302,
          headers: {
            "Set-Cookie": `${SESSION_COOKIE}=${phone}; Path=/; HttpOnly; Secure; SameSite=Lax`,
            "Location": "/index.html"
          }
        });
      }

      // --------------------------
      // REGISTER
      // --------------------------
      if (path === "/do-register" && request.method === "POST") {
        const form = await request.formData();
        const name = (form.get("name") || "").trim();
        const phoneInput = form.get("phone");
        const pwd = form.get("password") || "";
        const pwd2 = form.get("confirm_password") || "";

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return Response.redirect("/login.html?screen=register&error=invalid_phone", 302);
        }

        const userKey = "user:" + phone;
        const exist = await env.axstore_data.get(userKey);
        if (exist) {
          return Response.redirect("/login.html?screen=register&error=exists", 302);
        }

        if (!pwd || !pwd2 || pwd !== pwd2) {
          return Response.redirect("/login.html?screen=register&error=pass_mismatch", 302);
        }

        const pwdHash = await hashPassword(pwd);

        const data = {
          name,
          phone,
          passwordHash: pwdHash,
          createdAt: new Date().toISOString()
        };

        await env.axstore_data.put(userKey, JSON.stringify(data));

        return Response.redirect("/login.html?screen=login&status=registered", 302);
      }

      // --------------------------
      // RESET STEP 1 - INPUT PHONE
      // --------------------------
      if (path === "/do-reset-start" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return Response.redirect("/login.html?screen=reset&error=invalid_phone", 302);
        }

        const userKey = "user:" + phone;
        const exist = await env.axstore_data.get(userKey);

        if (!exist) {
          return Response.redirect("/login.html?screen=reset&error=not_registered", 302);
        }

        // Lanjut ke step 2 (input reset code)
        return Response.redirect(`/login.html?screen=reset&step=code&phone=${phone}`, 302);
      }

      // --------------------------
      // RESET STEP 2 - VERIFY RESET CODE
      // --------------------------
      if (path === "/do-reset-verify" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");
        const codeInput = (form.get("reset_code") || "").trim();

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return Response.redirect("/login.html?screen=reset&error=invalid_phone", 302);
        }

        const codeKey = "reset:" + phone;
        const codeJSON = await env.axstore_data.get(codeKey);

        if (!codeJSON) {
          return Response.redirect(`/login.html?screen=reset&step=code&phone=${phone}&error=code_invalid`, 302);
        }

        const obj = JSON.parse(codeJSON);
        if (!obj.code || obj.code !== codeInput) {
          return Response.redirect(`/login.html?screen=reset&step=code&phone=${phone}&error=code_invalid`, 302);
        }

        return Response.redirect(`/login.html?screen=reset&step=newpass&phone=${phone}`, 302);
      }

      // --------------------------
      // RESET STEP 3 - NEW PASSWORD
      // --------------------------
      if (path === "/do-reset-final" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");
        const pwd = form.get("new_password") || "";
        const pwd2 = form.get("confirm_new_password") || "";

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return Response.redirect("/login.html?screen=reset&error=invalid_phone", 302);
        }

        if (!pwd || !pwd2 || pwd !== pwd2) {
          return Response.redirect(`/login.html?screen=reset&step=newpass&phone=${phone}&error=pass_mismatch`, 302);
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);

        if (!userJSON) {
          return Response.redirect("/login.html?screen=reset&error=not_registered", 302);
        }

        const user = JSON.parse(userJSON);
        user.passwordHash = await hashPassword(pwd);
        await env.axstore_data.put(userKey, JSON.stringify(user));

        // optional: hapus kode reset
        const codeKey = "reset:" + phone;
        await env.axstore_data.delete(codeKey);

        return Response.redirect("/login.html?screen=login&status=reset_ok", 302);
      }

      // --------------------------
      // LOGOUT
      // --------------------------
      if (path === "/logout") {
        return new Response(null, {
          status: 302,
          headers: {
            "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0`,
            "Location": "/login.html?screen=login"
          }
        });
      }

      // --------------------------
      // STATIC FILES
      // --------------------------
      if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(request);
      }

      // Kalau ASSETS tidak ada, kasih pesan jelas
      return new Response("Assets binding (ASSETS) tidak ditemukan. Cek wrangler.toml [assets].", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });

    } catch (err) {
      // Fallback umum supaya tidak 1101 polos
      const msg = err && err.message ? err.message : String(err);
      return new Response("Worker error: " + msg, {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
  }
};
