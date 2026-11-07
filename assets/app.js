/* global supabase, CONFIG, SKILLS */
(function () {
  "use strict";

  const configured =
    CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes("YOUR-PROJECT") &&
    CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY.includes("YOUR-");

  const sb = configured
    ? supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);

  function safeNext(raw, fallback = "index.html") {
    if (!raw) return fallback;
    // chỉ cho phép đường dẫn tương đối trong site (chặn chuyển hướng ra ngoài)
    if (/^[a-z][a-z0-9+.-]*:|^\/\/|\\/i.test(raw)) return fallback;
    return raw.replace(/^\/+/, "");
  }

  function loginUrl(next) {
    return "login.html?next=" + encodeURIComponent(next || location.pathname.split("/").pop() + location.search);
  }

  function toast(msg, ms = 3200) {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), ms);
  }

  // Lỗi tiếng Việt cho các lỗi Supabase thường gặp
  function viError(err) {
    const m = String(err?.message || err || "");
    if (/Invalid login credentials/i.test(m)) return "Email hoặc mật khẩu không đúng.";
    if (/Email not confirmed/i.test(m)) return "Email chưa được xác nhận. Hãy mở hộp thư và bấm link kích hoạt.";
    if (/already registered|already been registered|User already exists/i.test(m)) return "Email này đã có tài khoản. Hãy đăng nhập.";
    if (/Password should be at least/i.test(m)) return "Mật khẩu cần ít nhất 8 ký tự.";
    if (/rate limit|too many/i.test(m)) return "Thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.";
    if (/valid email|invalid format/i.test(m)) return "Email không hợp lệ.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Không kết nối được máy chủ. Kiểm tra mạng và thử lại.";
    return m || "Đã có lỗi xảy ra.";
  }

  async function getUser() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user ?? null;
  }

  function displayName(user) {
    return user?.user_metadata?.full_name || (user?.email || "").split("@")[0] || "Bạn";
  }

  async function getClaims() {
    if (!sb) return new Set();
    const user = await getUser();
    if (!user) return new Set();
    const { data, error } = await sb.from("claims").select("skill");
    if (error) return new Set();
    return new Set((data || []).map((r) => r.skill));
  }

  // ---------- header / footer ----------
  async function renderChrome() {
    if (!configured) {
      const b = document.createElement("div");
      b.className = "banner";
      b.textContent = "Chưa cấu hình Supabase: hãy điền SUPABASE_URL và SUPABASE_ANON_KEY trong assets/config.js.";
      document.body.prepend(b);
    }
    const header = $("#site-header");
    if (header) {
      header.className = "site-header";
      header.innerHTML = `
        <div class="wrap">
          <a class="logo" href="index.html"><span class="logo-mark">B</span>${esc(CONFIG.SITE_NAME)}</a>
          <nav class="nav" id="nav"></nav>
        </div>`;
      const user = await getUser();
      const nav = $("#nav");
      if (user) {
        const name = displayName(user);
        nav.innerHTML = `
          <span class="user-chip"><span class="avatar">${esc(name.charAt(0).toUpperCase())}</span>
          <span class="user-name">${esc(name)}</span></span>
          <button class="btn btn-ghost btn-sm" id="logout">Đăng xuất</button>`;
        $("#logout").onclick = async () => {
          await sb.auth.signOut();
          location.href = "index.html";
        };
      } else {
        nav.innerHTML = `
          <a class="btn btn-ghost btn-sm" href="${loginUrl()}">Đăng nhập</a>
          <a class="btn btn-primary btn-sm" href="signup.html?next=${encodeURIComponent(
            safeNext(params.get("next"), location.pathname.split("/").pop() + location.search)
          )}">Tạo tài khoản</a>`;
      }
    }
    const footer = $("#site-footer");
    if (footer) {
      footer.className = "site-footer";
      footer.innerHTML = `<div class="wrap">© ${new Date().getFullYear()} ${esc(CONFIG.SITE_NAME)} · Skill dành cho Claude</div>`;
    }
  }

  // ---------- claim modal ----------
  function ensureModal() {
    let back = $("#claim-modal");
    if (back) return back;
    back = document.createElement("div");
    back.id = "claim-modal";
    back.className = "modal-back";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button class="modal-close" aria-label="Đóng">×</button><div class="modal-content"></div></div>`;
    document.body.appendChild(back);
    const close = () => back.classList.remove("open");
    $(".modal-close", back).onclick = close;
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    return back;
  }

  function installStepsHtml(skill) {
    if (skill.type === "plugin") {
      const cmds = (skill.commands || [skill.command]).map((c) => `<code>${esc(c)}</code>`).join(" và ");
      return `
      <ol class="steps">
        <li><b>Giữ nguyên file .zip</b> vừa tải (${esc(skill.id)}.zip), không giải nén. Đây là <b>plugin</b> gồm cả 2 skill.</li>
        <li>Mở <b>ứng dụng Claude trên máy tính</b> (Claude Desktop) → vào <b>Cowork</b>.</li>
        <li>Mở <b>Customize</b> (hoặc bấm <b>+</b> → <b>Add plugins</b>), bấm <b>+</b> → <b>Upload plugin</b> và chọn file .zip.</li>
        <li>Claude Code: giải nén ra một thư mục rồi chạy <code>claude --plugin-dir &lt;thư mục đó&gt;</code>.</li>
        <li>Dùng: gõ ${cmds} hoặc mô tả việc bạn muốn làm trong chat.</li>
      </ol>`;
    }
    return `
      <ol class="steps">
        <li><b>Giữ nguyên file .zip</b> vừa tải (${esc(skill.id)}.zip), không cần giải nén nếu dùng Claude.ai / Claude Desktop.</li>
        <li>Mở Claude → <b>Settings → Capabilities</b>, bật <b>Code execution and file creation</b>.</li>
        <li>Vào <b>Customize → Skills</b>, bấm <b>+</b> → <b>Upload a skill</b> và chọn file .zip.
            <br>Giao diện cũ: <b>Settings → Capabilities → Skills → Upload skill</b>.</li>
        <li>Claude Code: giải nén vào <code>~/.claude/skills/</code> sao cho có <code>~/.claude/skills/${esc(skill.id)}/SKILL.md</code>.</li>
        <li>Dùng: gõ <code>${esc(skill.command || "/" + skill.id)}</code> hoặc mô tả việc bạn muốn làm trong chat.</li>
      </ol>`;
  }

  function showSuccess(skill, url) {
    const back = ensureModal();
    $(".modal-content", back).innerHTML = `
      <h2>Đang tải skill…</h2>
      <p class="sub">Nếu trình duyệt không tự tải, <a href="${esc(url)}" rel="noopener">bấm vào đây</a>. Link có hiệu lực 5 phút.</p>
      <h3 style="margin:8px 0 0;font-size:16px">Cài vào Claude</h3>
      ${installStepsHtml(skill)}
      <button class="btn btn-primary btn-block" style="margin-top:8px" id="done-btn">Xong</button>`;
    $("#done-btn", back).onclick = () => back.classList.remove("open");
    back.classList.add("open");
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function requestDownload(skill, password) {
    const { data, error } = await sb.functions.invoke("claim-skill", {
      body: { skill: skill.id, password: password || "" },
    });
    if (error) {
      let msg = error.message;
      try {
        const body = await error.context.json();
        if (body?.error) msg = body.error;
      } catch (_) { /* ignore */ }
      throw new Error(msg);
    }
    if (!data?.url) throw new Error(data?.error || "Không nhận được link tải.");
    return data.url;
  }

  function openPasswordModal(skill, onClaimed) {
    const back = ensureModal();
    $(".modal-content", back).innerHTML = `
      <h2>Nhận skill</h2>
      <p class="sub">${esc(skill.title)}<br>Nhập mật khẩu nhận skill để tải về.</p>
      <form id="claim-form" autocomplete="off">
        <div class="field">
          <label for="claim-pass">Mật khẩu nhận skill</label>
          <input class="input" id="claim-pass" type="password" required placeholder="Nhập mật khẩu" />
        </div>
        <div class="form-msg" id="claim-msg"></div>
        <button class="btn btn-primary btn-block" type="submit" id="claim-submit">Nhận skill</button>
      </form>`;
    back.classList.add("open");
    const input = $("#claim-pass", back);
    setTimeout(() => input.focus(), 50);
    $("#claim-form", back).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#claim-submit", back);
      const msg = $("#claim-msg", back);
      msg.className = "form-msg";
      msg.textContent = "";
      btn.disabled = true;
      btn.textContent = "Đang kiểm tra…";
      try {
        const url = await requestDownload(skill, input.value);
        onClaimed && onClaimed(skill.id);
        showSuccess(skill, url);
      } catch (err) {
        msg.className = "form-msg err";
        msg.textContent = viError(err);
        btn.disabled = false;
        btn.textContent = "Nhận skill";
        input.select();
      }
    };
  }

  // Nút "Nhận skill": chưa đăng nhập -> trang đăng nhập; đã nhận -> tải lại; chưa nhận -> hỏi mật khẩu
  async function claim(skillId, { returnTo, claims, onClaimed } = {}) {
    const skill = SKILLS.find((s) => s.id === skillId);
    if (!skill) return;
    if (!sb) return toast("Web chưa cấu hình Supabase.");
    const user = await getUser();
    if (!user) {
      const back = returnTo || "index.html";
      const sep = back.includes("?") ? "&" : "?";
      location.href = loginUrl(`${back}${sep}claim=${encodeURIComponent(skillId)}`);
      return;
    }
    const owned = claims || (await getClaims());
    if (owned.has(skillId)) {
      toast("Đang tạo link tải…");
      try {
        showSuccess(skill, await requestDownload(skill, ""));
      } catch (err) {
        toast(viError(err));
      }
      return;
    }
    openPasswordModal(skill, onClaimed);
  }

  // Sau khi đăng nhập quay lại với ?claim=<id> -> tự mở bước nhận skill
  async function handleClaimParam(opts) {
    const id = params.get("claim");
    if (!id) return;
    params.delete("claim");
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    if (await getUser()) claim(id, opts);
  }

  window.App = {
    sb, configured, $, esc, params, safeNext, loginUrl, toast, viError,
    getUser, displayName, getClaims, renderChrome, claim, handleClaimParam, installStepsHtml,
  };
})();
