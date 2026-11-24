// Supabase Edge Function "order-email": sends an e-mail when a new order comes in.
//
// It is called by a Database Webhook on the orders table (INSERT). See LÆS-MIG.txt, "E-mail on new orders",
// for how to set it up. It needs these secrets (Supabase: Edge Functions, Secrets):
//   RESEND_API_KEY   the API key from resend.com
//   NOTIFY_EMAIL     who gets the "new order" e-mail. Several: separate with commas.
//                    Before japperstudio.dk is verified in Resend, this must be the e-mail of the Resend account.
//   WEBHOOK_SECRET   any long random text; the same text is set as a header on the webhook
// Optional, once japperstudio.dk is verified in Resend:
//   FROM_EMAIL       e.g.  Japper studio <ordre@japperstudio.dk>
//   SEND_TO_BUYER    yes  = also send the buyer a confirmation with the MobilePay details
//
// "Verify JWT" must be turned OFF for this function: the webhook secret protects it instead.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY = (Deno.env.get("NOTIFY_EMAIL") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const FROM = Deno.env.get("FROM_EMAIL") || "Japper studio <onboarding@resend.dev>";
const SEND_TO_BUYER = (Deno.env.get("SEND_TO_BUYER") ?? "").toLowerCase() === "yes";
const SITE = "https://japperstudio.dk";
const MOBILEPAY = "+45 93 96 30 60";

type Line = { qty: number; title: string; unit_price?: number };
type Order = {
  order_code: string; name: string; email: string; phone?: string | null; address?: string | null;
  delivery: "ship" | "pickup"; items: Line[]; total: number; pay_now?: number | null; pay_later?: number | null;
  payment_plan?: string; mobilepay_message?: string; created_at?: string;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const kr = (n: number) => new Intl.NumberFormat("da-DK").format(n) + " kr.";

async function send(to: string[], subject: string, html: string, replyTo?: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const wrap = (inner: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2a2520;max-width:560px">${inner}
  <p style="color:#8a8076;font-size:12px;margin-top:28px">Japper studio · ${SITE.replace("https://", "")}</p></div>`;

const itemsHtml = (o: Order) =>
  `<ul style="padding-left:18px;margin:6px 0">${o.items.map((l) => `<li>${l.qty} × ${esc(l.title)}, 50 × 70 cm</li>`).join("")}</ul>`;

function toLaura(o: Order) {
  const now = o.pay_now ?? o.total, later = o.pay_later ?? 0;
  const summary = o.items.map((l) => `${l.qty}× ${l.title}`).join(", ");
  const subject = `Ny ordre ${o.order_code.replace(/[\r\n]/g, "")}: ${summary}, ${kr(now)}`;
  const html = wrap(`
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 6px">Ny ordre ${esc(o.order_code)}</h2>
    <p style="margin:0 0 14px;color:#6b6157">Venter på betaling. Når pengene er kommet på MobilePay, markér den som betalt på ordresiden.</p>
    <p><b>${esc(o.name)}</b><br><a href="mailto:${esc(o.email)}">${esc(o.email)}</a>${o.phone ? `<br>${esc(o.phone)}` : ""}</p>
    ${itemsHtml(o)}
    <p><b>Skal betale ${later ? "nu (depositum)" : ""}: ${kr(now)}</b>${later ? `<br>Resten ved afhentning: ${kr(later)} (i alt ${kr(o.total)})` : ""}</p>
    <p>MobilePay-besked at kigge efter:<br><code style="background:#f4efe4;padding:3px 6px">${esc(o.mobilepay_message)}</code></p>
    <p>${o.delivery === "ship" ? `Sendes til:<br>${esc(o.address).replace(/\n/g, "<br>")}` : "Henter selv i Odense (aftal et tidspunkt)."}</p>
    <p style="margin-top:22px"><a href="${SITE}/ordrer.html" style="background:#2d3d2e;color:#f7f4ee;padding:11px 18px;text-decoration:none;display:inline-block">Åbn ordresiden</a></p>`);
  return { subject, html };
}

function toBuyer(o: Order) {
  const now = o.pay_now ?? o.total, later = o.pay_later ?? 0;
  const subject = `Tak for din ordre ${o.order_code} – sådan betaler du`;
  const html = wrap(`
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 6px">Tak for din ordre, ${esc(o.name.split(" ")[0])}</h2>
    <p>Din ordre <b>${esc(o.order_code)}</b> er reserveret i 48 timer. Den er først godkendt, når betalingen er modtaget.</p>
    ${itemsHtml(o)}
    <p><b>Betal ${kr(now)} med MobilePay til ${MOBILEPAY}</b> og skriv præcis denne besked:<br>
      <code style="background:#f4efe4;padding:3px 6px">${esc(o.mobilepay_message)}</code></p>
    ${later ? `<p>Resten, ${kr(later)}, betaler du ved afhentning.</p>` : ""}
    <p>Du kan annullere ordren selv inden for 24 timer, så længe den ikke er betalt: gå ind på ${SITE.replace("https://", "")}, tryk på Kurv og vælg ordren.</p>
    <p>Laura skriver til dig, når betalingen er kommet. Har du spørgsmål, så svar bare på denne mail.</p>`);
  return { subject, html };
}

function toBuyerPaymentConfirmed(o: Order) {
  const subject = `Betaling modtaget: ordre ${o.order_code}`;
  const html = wrap(`
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 6px">Betalingen er modtaget 🎉</h2>
    <p>Hej ${esc(o.name.split(" ")[0])},</p>
    <p>Tak! Vi har modtaget din betaling på ${kr(o.pay_now ?? o.total)} for ordre <b>${esc(o.order_code)}</b>.</p>
    ${itemsHtml(o)}
    <p><b>Dine prints bliver gjort klar til forsendelse og skal være hos dig inden for 3-5 arbejdsdage.</b></p>
    <p>Du får besked på denne e-mail, når dine prints er sendt.</p>
    <p>Spørgsmål? Svar bare på denne mail.</p>`);
  return { subject, html };
}

function toBuyerCancelled(o: Order) {
  const subject = `Ordre annulleret: ${o.order_code}`;
  const html = wrap(`
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 6px">Ordre annulleret</h2>
    <p>Hej ${esc(o.name.split(" ")[0])},</p>
    <p>Din ordre <b>${esc(o.order_code)}</b> er blevet annulleret.</p>
    ${itemsHtml(o)}
    <p>Din betaling på ${kr(o.pay_now ?? o.total)} vil blive refunderet inden for 3-5 arbejdsdage.</p>
    <p>Spørgsmål? Svar bare på denne mail.</p>`);
  return { subject, html };
}

function toBuyerShipped(o: Order) {
  const subject = `Dine prints er på vej! Ordre ${o.order_code}`;
  const html = wrap(`
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 6px">Dine prints er på vej! 📦</h2>
    <p>Hej ${esc(o.name.split(" ")[0])},</p>
    <p>Godt nyt! Dine prints fra ordre <b>${esc(o.order_code)}</b> er blevet sendt.</p>
    ${itemsHtml(o)}
    <p><b>Forsendelse:</b> De skulle være hos dig inden for 3-5 arbejdsdage. Du modtager snart et trackingnummer på denne e-mail-adresse.</p>
    <p>Spørgsmål? Svar bare på denne mail.</p>`);
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  let payload: { type?: string; table?: string; record?: Order };
  try { payload = await req.json(); } catch { return new Response("bad request", { status: 400 }); }
  if (payload.table !== "orders" || !payload.record) return new Response("ignored");
  if (payload.type === "UPDATE" && !["paid", "cancelled", "shipped"].includes(payload.record.status)) return new Response("ignored");
  if (payload.type !== "INSERT" && payload.type !== "UPDATE") return new Response("ignored");

  const o = payload.record;
  const isUpdate = payload.type === "UPDATE";
  const errors: string[] = [];
  
  if (NOTIFY.length && payload.type === "INSERT") {
    const m = toLaura(o);
    try { await send(NOTIFY, m.subject, m.html, o.email); } catch (e) { errors.push(String(e)); }
  }
  
  if (SEND_TO_BUYER) {
    let m;
    if (isUpdate) {
      if (o.status === "paid") m = toBuyerPaymentConfirmed(o);
      else if (o.status === "cancelled") m = toBuyerCancelled(o);
      else if (o.status === "shipped") m = toBuyerShipped(o);
    } else {
      m = toBuyer(o);
    }
    if (m) try { await send([o.email], m.subject, m.html, NOTIFY[0]); } catch (e) { errors.push(String(e)); }
  }
  
  if (errors.length) { console.error(errors.join("\n")); return new Response(errors.join("\n"), { status: 500 }); }
  return new Response("ok");
});
