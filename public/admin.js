async function loadUsers() {
  const res = await fetch("/admin/users");
  const data = await res.json();

  if (!data.ok) return;

  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "";

  data.users.forEach((u) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${u.name}</td>
      <td>${u.phone}</td>
      <td>
        <button class="code-btn" onclick="genCode('${u.phone}')">Kode</button>
        <button class="del-btn" onclick="deleteUser('${u.phone}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function deleteUser(phone) {
  if (!confirm("Hapus user " + phone + "?")) return;

  await fetch("/admin/delete-user", {
    method: "POST",
    body: JSON.stringify({ phone }),
    headers: { "Content-Type": "application/json" },
  });

  show("User dihapus");
  loadUsers();
}

async function genCode(phone) {
  const res = await fetch("/admin/generate-reset-code", {
    method: "POST",
    body: JSON.stringify({ phone }),
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  show("Kode reset untuk " + phone + ": " + data.code);
}

function show(msg) {
  const el = document.getElementById("result");
  el.textContent = msg;
  el.style.display = "block";
}

// auto-load saat halaman admin dibuka
loadUsers();
