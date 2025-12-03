// ---------------------
// HELPERS
// ---------------------
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;
  let phone = phoneRaw.replace(/[\s\-.()]/g, "").trim();
  if (!/^\+?\d+$/.test(phone)) return null;

  if (phone.startsWith("+628")) {
    phone = "628" + phone.slice(4);
  } else if (phone.startsWith("628")) {
  } else if (phone.startsWith("08")) {
    phone = "628" + phone.slice(1);
  } else {
    return null;
  }
  if (phone.length < 10 || phone.length > 15) return null;
  return phone;
}

async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const SESSION_COOKIE = "session_user";

function parseCookie(req) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(/session_user=([^;]+)/);
  return match ? match[1] : null;
}

// ---------------------
// MAIN WORKER
// ---------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ===== PROTECT INDEX PAGE =====
    if (path === "/" || path === "/index" || path === "/index.html") {
      const session = parseCookie(request);

      if (!session) {
        return Response.redirect(`${url.origin}/login?screen=login`, 302);
      }

      // Serve HTML Index from R2 correctly
      return env.ASSETS.fetch(
        new Request(`${url.origin}/index.html`, request)
      );
    }

    // ===== SERVE LOGIN HTML (UNPROTECTED) =====
    if (path === "/login" || path === "/login.html") {
      return env.ASSETS.fetch(
        new Request(`${url.origin}/login.html`, request)
      );
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
        return Response.redirect(`${url.origin}/login?screen=login&error=invalid_phone`, 302);
      }

      const userKey = "user:" + phone;
      const userData = await env.axstore_data.get(userKey);

      if (!userData) {
        return Response.redirect(`${url.origin}/login?screen=login&error=not_registered`, 302);
      }

      const user = JSON.parse(userData);
      const pwdHash = await hashPassword(passwordInput);

      if (pwdHash !== user.passwordHash) {
        return Response.redirect(`${url.origin}/login?screen=login&error=wrong_password`, 302);
      }

      // SUCCESS LOGIN
      return new Response("", {
        status: 302,
        headers: {
          "Set-Cookie": `${SESSION_COOKIE}=${phone}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          Location: `${url.origin}/index.html`,
        },
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
        return Response.redirect(`${url.origin}/login?screen=register&error=invalid_phone`, 302);
      }

      const userKey = "user:" + phone;
      const exist = await env.axstore_data.get(userKey);

      if (exist) {
        return Response.redirect(`${url.origin}/login?screen=register&error=exists`, 302);
      }

      if (!pwd || !pwd2 || pwd !== pwd2) {
        return Response.redirect(`${url.origin}/login?screen=register&error=pass_mismatch`, 302);
      }

      const pwdHash = await hashPassword(pwd);

      const data = {
        name,
        phone,
        passwordHash: pwdHash,
        createdAt: new Date().toISOString(),
      };

      await env.axstore_data.put(userKey, JSON.stringify(data));

      return Response.redirect(`${url.origin}/login?screen=login&status=registered`, 302);
    }

    // --------------------------
    // LOGOUT
    // --------------------------
    if (path === "/logout") {
      return new Response("", {
        status: 302,
        headers: {
          "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`,
          Location: `${url.origin}/login?screen=login`,
        },
      });
    }

    // --------------------------
    // STATIC FILES (CSS, JS, dll)
    // --------------------------
    return env.ASSETS.fetch(request);
  },
};
