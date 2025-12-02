// ---------------------
// HELPERS
// ---------------------

// Bersihkan & normalisasi nomor WhatsApp ke format 628xxxxxxxxxx
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;

  // hapus spasi, tanda "-", ".", dan "()"
  let phone = phoneRaw.replace(/[\s\-.()]/g, "").trim();

  // hanya boleh angka dan optional "+" di awal
  if (!/^\+?\d+$/.test(phone)) return null;

  // normalisasi ke 628...
  if (phone.startsWith("+628")) {
    phone = "628" + phone.slice(4);
  } else if (phone.startsWith("628")) {
    // sudah benar
  } else if (phone.startsWith("08")) {
    phone = "628" + phone.slice(1);
  } else {
    // format dasar salah
    return null;
  }

  // panjang 10–15 digit
  if (phone.length < 10 || phone.length > 15) return null;

  return phone;
}

// Hash password dengan SHA-256
async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

const SESSION_COOKIE = "session_user";

function getCookie(cookies, name) {
  return cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="))
    ?.split("=")[1] ?? null;
}

export default {
  async fetch(request, env) {
    try {
      const base = new URL(request.url);
      const path = base.pathname;
      const cookies = request.headers.get("Cookie") || "";

      // baca cookie sesi dengan aman
      const sessionUser = getCookie(cookies, SESSION_COOKIE);
      const loggedIn = !!sessionUser;

      // --------------------------
      // GLOBAL PROTECT (SEMUA PATH)
      // --------------------------
      const isPublicPath =
        path === "/login.html" ||
        path === "/login" ||
        path === "/do-login" ||
        path === "/do-register" ||
        path === "/do-reset-start" ||
        path === "/do-reset-verify" ||
        path === "/do-reset-final" ||
        path === "/favicon.ico";

      // kalau belum login dan bukan path publik -> paksa ke login
      if (!loggedIn && !isPublicPath) {
        return Response.redirect(
          `${base.origin}/login.html?screen=login`,
          302
        );
      }

      // --------------------------
      // PROTECT INDEX.HTML & ROOT
      // --------------------------
      const isIndexRequest =
        path === "/" ||
        path === "/index.html" ||
        path.endsWith("/index.html");

      if (isIndexRequest && !loggedIn) {
        return Response.redirect(
          `${base.origin}/login.html?screen=login`,
          302
        );
      }
//---------------------------
      // LOGIN
// --------------------------
      if (path === "/do-login" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");
        const passwordInput = form.get("password") || "";

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return Response.redirect(
            `${base.origin}/login.html?screen=login&error=invalid_phone`,
            302
          );
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);
        if (!userJSON) {
          return Response.redirect(
            `${base.origin}/login.html?screen=login&error=not_registered`,
            302
          );
        }

        const user = JSON.parse(userJSON);
        const pwdHash = await hashPassword(passwordInput);

        if (pwdHash !== user.passwordHash) {
          return Response.redirect(
            `${base.origin}/login.html?screen=login&error=wrong_password`,
            302
          );
        }

        return new Response(null, {
          status: 302,
          headers: {
            "Set-Cookie": `${SESSION_COOKIE}=${phone}; Path=/; HttpOnly; Secure; SameSite=Lax`,
            "Location": `${base.origin}/index.html`
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
          return Response.redirect(
            `${base.origin}/login.html?screen=register&error=invalid_phone`,
            302
          );
        }

        const userKey = "user:" + phone;
        const exist = await env.axstore_data.get(userKey);
        if (exist) {
          return Response.redirect(
            `${base.origin}/login.html?screen=register&error=exists`,
            302
          );
        }

        if (!pwd || !pwd2 || pwd !== pwd2) {
          return Response.redirect(
            `${base.origin}/login.html?screen=register&error=pass_mismatch`,
            302
          );
        }

        const pwdHash = await hashPassword(pwd);

        const data = {
          name,
          phone,
          passwordHash: pwdHash,
          createdAt: new Date().toISOString()
        };

        await env.axstore_data.put(userKey, JSON.stringify(data));

        return Response.redirect(
          `${base.origin}/login.html?screen=login&status=registered`,
          302
        );
      }

      // --------------------------
      // RESET STEP 1 - INPUT PHONE
      // --------------------------
      if (path === "/do-reset-start" && request.method === "POST") {
        const form = await request.formData();
        const phoneInput = form.get("phone");

        const phone = normalizePhone(phoneInput);
        if (!phone) {
          return Response.redirect(
    `${base.origin}/login.html?screen=reset&step=code&phone=${phone}&wa=1`,
    302
  );
}

        const userKey = "user:" + phone;
        const exist = await env.axstore_data.get(userKey);

        if (!exist) {
          return Response.redirect(
            `${base.origin}/login.html?screen=reset&error=not_registered`,
            302
          );
        }

        // lanjut ke step 2 (input reset code)
        return Response.redirect(
          `${base.origin}/login.html?screen=reset&step=code&phone=${phone}`,
          302
        );
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
          return Response.redirect(
            `${base.origin}/login.html?screen=reset&error=invalid_phone`,
            302
          );
        }

        const codeKey = "reset:" + phone;
        const codeJSON = await env.axstore_data.get(codeKey);

        if (!codeJSON) {
          return Response.redirect(
            `${base.origin}/login.html?screen=reset&step=code&phone=${phone}&error=code_invalid`,
            302
          );
        }

        const obj = JSON.parse(codeJSON);
        if (!obj.code || obj.code !== codeInput) {
          return Response.redirect(
            `${base.origin}/login.html?screen=reset&step=code&phone=${phone}&error=code_invalid`,
            302
          );
        }

        return Response.redirect(
          `${base.origin}/login.html?screen=reset&step=newpass&phone=${phone}`,
          302
        );
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
          return Response.redirect(
            `${base.origin}/login.html?screen=reset&error=invalid_phone`,
            302
          );
        }

        if (!pwd || !pwd2 || pwd !== pwd2) {
          return Response.redirect(
            `${base.origin}/login.html?screen=reset&step=newpass&phone=${phone}&error=pass_mismatch`,
            302
          );
        }

        const userKey = "user:" + phone;
        const userJSON = await env.axstore_data.get(userKey);

        if (!userJSON) {
          return Response.redirect(
            `${base.origin}/login.html?screen=reset&error=not_registered`,
            302
          );
        }

        const user = JSON.parse(userJSON);
        user.passwordHash = await hashPassword(pwd);
        await env.axstore_data.put(userKey, JSON.stringify(user));

        // optional: hapus kode reset
        const codeKey = "reset:" + phone;
        await env.axstore_data.delete(codeKey);

        return Response.redirect(
          `${base.origin}/login.html?screen=login&status=reset_ok`,
          302
        );
      }

      // --------------------------
      // LOGOUT
      // --------------------------
      if (path === "/logout") {
        return new Response(null, {
          status: 302,
          headers: {
            "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0`,
            "Location": `${base.origin}/login.html?screen=login`
          }
        });
      }

      // --------------------------
      // STATIC FILES
      // --------------------------
// Setelah semua proteksi dan routing dijalankan → baru fallback ke asset
if (env.ASSETS) {
  return env.ASSETS.fetch(request);
}

// fallback
return new Response("Not found", { status: 404 });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      return new Response("Worker error: " + msg, {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
  }
};
