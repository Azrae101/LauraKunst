// Supabase Edge Function "place-order": checks the captcha (Cloudflare Turnstile), then places the order.
//
// The browser cannot call place_order() in the database directly any more (see "Captcha at checkout"
// in LÆS-MIG.txt), so a bot has to get past the captcha before an order can reserve anything.
// It needs this secret (Supabase: Edge Functions, Secrets):
//   TURNSTILE_SECRET   the "Secret Key" from Cloudflare Turnstile
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are always there; you do not add them.
//
// "Verify JWT" must be turned OFF for this function: the captcha protects it instead.

const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Only these sites may call the function from a browser
const ALLOWED = ["https://japperstudio.dk", "https://www.japperstudio.dk"];
const isLocal = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) || isLocal(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
    "Vary": "Origin",
  };
}

// Errors go back as {message: "CODE"}, the same shape as the database's own errors, so the site shows them as usual
const reply = (origin: string, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

async function captchaOk(token: string, ip: string | null) {
  if (!TURNSTILE_SECRET || !token) return false;
  const form = new FormData();
  form.append("secret", TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).catch(() => null);
  if (!res || !res.ok) return false;
  const j = await res.json().catch(() => null);
  return !!(j && j.success);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { message: "GENERIC" });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return reply(origin, 400, { message: "GENERIC" }); }

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  if (!(await captchaOk(String(b.captcha ?? ""), ip))) return reply(origin, 400, { message: "CAPTCHA" });

  // The database checks everything else (prices, address, limits) exactly as before
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/place_order", {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_name: b.name, p_email: b.email, p_phone: b.phone, p_address: b.address,
      p_delivery: b.delivery, p_items: b.items, p_plan: b.plan ?? "full",
    }),
  }).catch(() => null);
  if (!res) return reply(origin, 502, { message: "GENERIC" });
  const body = await res.json().catch(() => null);
  if (!res.ok) return reply(origin, 400, { message: (body && body.message) || "GENERIC" });
  return reply(origin, 200, body);
});
