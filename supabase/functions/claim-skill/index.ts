// Supabase Edge Function: claim-skill
// - Bắt buộc đăng nhập (kiểm tra token của người dùng).
// - Lần đầu nhận skill: kiểm tra mật khẩu (secret SKILL_PASSWORD), chặn đoán mò sau 8 lần sai / 15 phút.
// - Đã nhận rồi: tải lại không cần mật khẩu.
// - Trả về link tải tạm thời (5 phút) tới file <skill>.zip trong bucket riêng tư "skills".
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "skills";
const LINK_SECONDS = 300;
const MAX_FAILS = 8;
const FAIL_WINDOW_MIN = 15;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Bạn cần đăng nhập để nhận skill." }, 401);

    const body = await req.json().catch(() => ({}));
    const skill = typeof body.skill === "string" ? body.skill : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(skill)) return json({ error: "Skill không hợp lệ." }, 400);

    const { data: existing } = await admin
      .from("claims").select("id").eq("user_id", user.id).eq("skill", skill).maybeSingle();

    if (!existing) {
      const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000).toISOString();
      const { count } = await admin
        .from("claim_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("success", false).gte("created_at", since);
      if ((count ?? 0) >= MAX_FAILS) {
        return json({ error: `Bạn nhập sai quá nhiều lần. Thử lại sau ${FAIL_WINDOW_MIN} phút.` }, 429);
      }

      const expected = Deno.env.get("SKILL_PASSWORD") ?? "";
      const ok = expected.length > 0 && safeEqual(password, expected);
      await admin.from("claim_attempts").insert({ user_id: user.id, skill, success: ok });
      if (!ok) return json({ error: "Sai mật khẩu nhận skill." }, 403);
    }

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(`${skill}.zip`, LINK_SECONDS, { download: `${skill}.zip` });
    if (signErr || !signed?.signedUrl) {
      return json({ error: "Chưa có file cho skill này. Vui lòng báo admin." }, 404);
    }

    if (!existing) {
      await admin.from("claims").upsert({ user_id: user.id, skill }, { onConflict: "user_id,skill" });
    }
    return json({ url: signed.signedUrl, skill });
  } catch (e) {
    console.error(e);
    return json({ error: "Lỗi máy chủ. Vui lòng thử lại." }, 500);
  }
});
