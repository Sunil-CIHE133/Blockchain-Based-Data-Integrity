// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const $all = (s) => [...document.querySelectorAll(s)];
const setStatus = (el, kind, text) =>
  (el.innerHTML = text ? `<span class="badge ${kind}">${text}</span>` : "");
const humanFileMeta = (f) =>
  `${f.name} • ${(f.size / 1024).toFixed(1)} KB • ${f.type || "binary"}`;
const mono = (x) => `<span class="mono">${x}</span>`;

// ---------- theme toggle (with localStorage) ----------
(() => {
  const btn = $("#themeToggle");
  const root = document.documentElement;

  const currentTheme = localStorage.getItem("theme") || "light";
  root.setAttribute("data-theme", currentTheme);

  btn?.addEventListener("click", () => {
    const isLight = root.getAttribute("data-theme") === "light";
    const newTheme = isLight ? "dark" : "light";
    root.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  });
})();

// ---------- state ----------
const state = {
  file: null,
  fileVerify: null,
  qr: { raw: "", canonical: "", hash: "", type: "text" },
  videoActive: false,
};

// ---------- dropzone setup ----------
function setupDropzone(zoneEl, inputEl, onFile) {
  const assocLabel = zoneEl.querySelector(`label[for="${inputEl.id}"]`);
  if (assocLabel) {
    assocLabel.addEventListener("click", (e) => e.stopPropagation());
  }

  zoneEl.addEventListener("click", (e) => {
    const t = e.target;
    const isLabel = t instanceof HTMLLabelElement && t.htmlFor === inputEl.id;
    if (t === inputEl || isLabel) return;
    inputEl.click();
  });

  ["dragenter", "dragover"].forEach((ev) =>
    zoneEl.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    zoneEl.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.remove("dragover");
    })
  );

  zoneEl.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file && onFile) onFile(file);
  });

  inputEl.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file && onFile) onFile(file);
  });
}

// ---------- Upload Dropzone ----------
setupDropzone($("#dropzone"), $("#file"), (file) => {
  state.file = file;
  $("#fileMeta").textContent = humanFileMeta(file);
});

$("#btnClear")?.addEventListener("click", () => {
  state.file = null;
  $("#file").value = "";
  $("#fileMeta").textContent = "";
  setStatus($("#uploadStatus"));
  $("#uploadResult").innerHTML = "";
});

// ---------- Upload handler ----------
$("#btnUpload")?.addEventListener("click", async () => {
  const status = $("#uploadStatus"),
    resBox = $("#uploadResult"),
    addr = $("#address").value.trim();

  if (!state.file) return setStatus(status, "warn", "Please choose a file.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr))
    return setStatus(status, "warn", "Enter a valid 0x… address.");

  setStatus(status, "ok", "Uploading & sending transaction…");
  resBox.innerHTML = "";

  try {
    const fd = new FormData();
    fd.append("file", state.file);
    fd.append("from", addr);
    fd.append("address", addr);

    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(status, "err", `Upload failed (${res.status})`);
      resBox.innerHTML = `<pre class="mono">${JSON.stringify(data, null, 2)}</pre>`;
      return;
    }

    setStatus(status, "ok", "Recorded on-chain ✔");
    resBox.innerHTML = `
      <div class="kv"><div class="muted">Tx Hash</div><div class="mono">${data.txHash || data.transactionHash}</div></div>
      <div class="kv"><div class="muted">File Hash</div><div class="mono">${data.fileHash || data.hash}</div></div>
    `;
  } catch (e) {
    setStatus(status, "err", "Network error");
    resBox.innerHTML = `<pre class="mono">${String(e)}</pre>`;
  }
});

// ---------- Verify File ----------
setupDropzone($("#dropzoneVerify"), $("#fileVerify"), (file) => {
  state.fileVerify = file;
  $("#fileVerifyMeta").textContent = humanFileMeta(file);
});

$("#btnVerifyFile")?.addEventListener("click", async () => {
  const status = $("#verifyStatus"),
    resBox = $("#verifyResult");

  if (!state.fileVerify) return setStatus(status, "warn", "Choose a file to verify.");
  setStatus(status, "ok", "Verifying file…");
  resBox.innerHTML = "";

  try {
    const fd = new FormData();
    fd.append("file", state.fileVerify);
    const res = await fetch("/api/verify", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(status, "err", `Verification failed (${res.status})`);
      resBox.innerHTML = `<pre class="mono">${JSON.stringify(data, null, 2)}</pre>`;
      return;
    }

    const match = data.match ?? data.verified ?? data.exists ?? false;
    setStatus(status, match ? "ok" : "err", match ? "Match ✔" : "No match ✖");
    resBox.innerHTML = `<pre class="mono">${JSON.stringify(data, null, 2)}</pre>`;
  } catch (e) {
    setStatus(status, "err", "Network error");
    resBox.innerHTML = `<pre class="mono">${String(e)}</pre>`;
  }
});

// ---------- Verify Hash ----------
$("#btnVerifyHash")?.addEventListener("click", async () => {
  const status = $("#verifyStatus"),
    resBox = $("#verifyResult"),
    hash = $("#hashInput").value.trim();

  if (!/^0x[a-fA-F0-9]{64}$/.test(hash))
    return setStatus(status, "warn", "Enter a valid 32-byte (0x…) hash.");

  setStatus(status, "ok", "Looking up hash…");
  resBox.innerHTML = "";

  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(status, "err", `Verification failed (${res.status})`);
      resBox.innerHTML = `<pre class="mono">${JSON.stringify(data, null, 2)}</pre>`;
      return;
    }

    const match = data.match ?? data.verified ?? data.exists ?? false;
    setStatus(status, match ? "ok" : "err", match ? "Match ✔" : "Not found ✖");
    resBox.innerHTML = `<pre class="mono">${JSON.stringify(data, null, 2)}</pre>`;
  } catch (e) {
    setStatus(status, "err", "Network error");
    resBox.innerHTML = `<pre class="mono">${String(e)}</pre>`;
  }
});
