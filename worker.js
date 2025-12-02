export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Nama cookie session
    const SESSION_COOKIE = "session_token";

    // Cek apakah user sudah login (punya cookie)
    const cookies = request.headers.get("Cookie") || "";
    const loggedIn = cookies.includes(`${SESSION_COOKIE}=true`);

    // Jika user mengakses halaman root "/" atau "/index.html"
    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (!loggedIn) {
        // Redirect ke login.html
        return Response.redirect(url.origin + "/login.html", 302);
      }
    }

    // Handle login submission
    if (url.pathname === "/do-login" && request.method === "POST") {
      // Contoh login sangat sederhana — bebas langsung sukses
      // (Nanti bisa dibuat validasi username/password)

      // Redirect ke index.html + set cookie session
      return new Response(null, {
        status: 302,
        headers: {
          "Set-Cookie": `${SESSION_COOKIE}=true; Path=/; HttpOnly; Secure; SameSite=Lax`,
          "Location": "/index.html"
        }
      });
    }

    // Logout
    if (url.pathname === "/logout") {
      return new Response("Logged out", {
        status: 302,
        headers: {
          "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0`,
          "Location": "/login.html"
        }
      });
    }

    // Default → serve file dari /public
    return env.ASSETS.fetch(request);
  }
};
