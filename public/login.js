/* -----------------------------------------
   L O G I N  (fetch API relative URL)
--------------------------------------------*/
document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = new FormData(e.target);

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      body: form,
    });

    let data;
    try {
      data = await res.json();
    } catch (e) {
      showAlert("Respon server tidak valid", "error");
      return;
    }

    if (data.status !== true) {
      showAlert(data.message || "Gagal login", "error");
      return;
    }

    const userData = data.data || {};

    // di sini kita pakai username, bukan name lagi
    const sessionPayload = {
      username: userData.username || userData.name || "",
      phone: userData.phone || "",
      profileCompleted: !!userData.profileCompleted,
    };

    // Simpan sesi ke localStorage
    localStorage.setItem("axstore_user", JSON.stringify(sessionPayload));

    // Ke dashboard
    window.location.href = "/index.html";
  } catch (err) {
    console.error(err);
    showAlert("Terjadi kesalahan saat login", "error");
  }
});

/* -----------------------------------------
   FUNCTION UMUM
--------------------------------------------*/

function hideAllScreens() {
  document
    .querySelectorAll(".screen")
    .forEach((s) => (s.style.display = "none"));
}

function switchScreen(screen) {
  hideAllScreens();
  const el = document.getElementById("screen-" + screen);
  if (el) el.style.display = "block";
}

/* ALERT dengan auto-hide & warna success/error */
let alertTimeout = null;

function showAlert(message, type = "error") {
  const alertBox = document.getElementById("alert");
  if (!alertBox) return;

  // bersihkan class lama
  alertBox.classList.remove("alert-success", "alert-error");

  // pilih warna
  if (type === "success") {
    alertBox.classList.add("alert-success");
  } else {
    alertBox.classList.add("alert-error");
  }

  alertBox.textContent = message;
  alertBox.style.display = "block";
  alertBox.style.opacity = "1";

  // reset timer sebelumnya
  if (alertTimeout) {
    clearTimeout(alertTimeout);
  }

  // auto hilang setelah 5 detik
  alertTimeout = setTimeout(() => {
    alertBox.style.opacity = "0";
    setTimeout(() => {
      alertBox.style.display = "none";
    }, 300); // waktu fade-out
  }, 5000);
}

// INIT dari URL
(function init() {
  const params = new URLSearchParams(window.location.search);
  const screenParam = params.get("screen") || "login";
  const step = params.get("step") || "phone";
  const error = params.get("error");
  const status = params.get("status");
  const phone = params.get("phone") || "";
  const waFlag = params.get("wa") || ""; // <--- flag dari worker

  let screen = "login";

  if (screenParam === "register") screen = "register";
  else if (screenParam === "reset") {
    if (step === "code") screen = "reset-step2";
    else if (step === "newpass") screen = "reset-step3";
    else screen = "reset-step1";
  }

  if (screen === "reset-step2") {
    const hidden = document.getElementById("reset-code-phone-hidden");
    const display = document.getElementById("reset-code-phone-display");
    if (hidden) hidden.value = phone;
    if (display) display.value = phone;
  }

  if (screen === "reset-step3") {
    const hidden2 = document.getElementById("reset-newpass-phone-hidden");
    const display2 = document.getElementById("reset-newpass-phone-display");
    if (hidden2) hidden2.value = phone;
    if (display2) display2.value = phone;
  }

  switchScreen(screen);

  // Kalau masuk ke step2 & ada wa=1 & TIDAK ada error -> buka WA sekali
  if (!error && screen === "reset-step2" && waFlag === "1") {
    try {
      window.open(
        "https://wa.me/6281646805770?text=buatkan%20kode%20reset%20password!",
        "_blank"
      );
    } catch (e) {
      // kalau popup diblok, abaikan saja
    }
  }

  // alert error/status
  if (error) {
    let msg = "";
    if (error === "invalid_phone") {
      msg = "Masukan No WhatsApp dengan benar";
    } else if (error === "not_registered") {
      msg = "No WhatsApp belum terdaftar";
    } else if (error === "wrong_password") {
      msg = "Kata sandi salah";
    } else if (error === "exists") {
      msg = "Nomor sudah terdaftar";
    } else if (error === "pass_mismatch") {
      msg = "Buat ulang kata sandi dengan benar";
    } else if (error === "code_invalid") {
      msg = "Kode tidak sesuai";
    } else if (error === "invalid_username") {
      // dari /do-register kalau username tidak valid
      msg = "Username tidak valid (minimal 4 karakter, tanpa spasi)";
    } else {
      msg = "Terjadi kesalahan";
    }

    showAlert(msg, "error");
  }

  if (status && !error) {
    let msg = "";
    if (status === "registered") msg = "Pendaftaran sukses";
    else if (status === "reset_ok") msg = "Kata sandi berhasil diperbarui";
    if (msg) showAlert(msg, "success");
  }
})();

/* -----------------------------------------
   SIDE MENU (kalau dipakai)
--------------------------------------------*/
function toggleMenu() {
  const menu = document.getElementById("side-menu");
  const backdrop = document.getElementById("menu-backdrop");

  if (!menu || !backdrop) return;

  const isOpen = menu.classList.contains("open");

  if (isOpen) {
    menu.classList.remove("open");
    backdrop.classList.remove("show");
  } else {
    menu.classList.add("open");
    backdrop.classList.add("show");
  }
}

// Biar bisa dipanggil dari HTML onclick
window.toggleMenu = toggleMenu;
