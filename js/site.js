/* Shared code for every page: database calls, basket and checkout,
   the phone menu, countdowns and small helpers. */

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- Language: Danish by default, English as an option ---------- */
let LANG = (() => { try { return localStorage.getItem("lk-lang") || CONFIG.defaultLanguage || "da"; } catch { return "da"; } })();
const locale = () => LANG === "en" ? "en-GB" : "da-DK";
/* Auction switch (CONFIG.showAuction). While it is off, anything marked data-auction is hidden,
   the auction page sends visitors to the front page, and texts that have a "<key>.noAuction"
   version in i18n.js use that version instead. */
const AUCTION = CONFIG.showAuction !== false;
if (!AUCTION && /auction\.html$/i.test(location.pathname)) location.replace("index.html");
// site.js loads at the end of <body>, so the page is already there to hide parts of
if (!AUCTION) $$("[data-auction]").forEach(el => { el.hidden = true; });

/* t("key", {n: 3}) returns the text for the current language */
function t(key, vars = {}) {
  if (!AUCTION && I18N[key + ".noAuction"]) key += ".noAuction";
  const entry = I18N[key];
  const text = entry ? (entry[LANG] ?? entry.da) : key;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}
/* L({da, en}) picks the right version of a bilingual setting */
const L = (v) => (v && typeof v === "object") ? (v[LANG] ?? v.da) : v;

const FLAGS = {
  en: `<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="uk-a"><path d="M0 0v30h60V0z"/></clipPath><clipPath id="uk-b"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#uk-a)"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#uk-b)" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></g></svg>`,
  da: `<svg viewBox="0 0 37 28" aria-hidden="true"><rect width="37" height="28" fill="#C8102E"/><rect x="12" width="4" height="28" fill="#fff"/><rect y="12" width="37" height="4" fill="#fff"/></svg>`
};

function applyLang() {
  document.documentElement.lang = LANG;
  $$("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  $$("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  if (document.body.dataset.title) document.title = t(document.body.dataset.title);
  renderBasketBtn();
  // The button shows the flag of the language you can switch TO
  const other = LANG === "da" ? "en" : "da";
  $$(".lang-btn").forEach(b => {
    b.innerHTML = `<span class="flag">${FLAGS[other]}</span><span class="lang-long">${t("lang.other")}</span><span class="lang-short">${t("lang.otherShort")}</span>`;
    b.setAttribute("aria-label", t("lang.switch"));
    b.setAttribute("lang", other);
  });
  const bar = $(".demo-bar");
  if (bar) { bar.querySelector("span").textContent = t("demo.text"); bar.querySelector("button").textContent = t("demo.reset"); }
  if (drawer && drawer.open && !drawer.dataset.paid) renderBasket();
  document.dispatchEvent(new CustomEvent("lang:change"));
}
function setLang(l) { LANG = l; try { localStorage.setItem("lk-lang", l); } catch {} applyLang(); }

const fmt = (n) => new Intl.NumberFormat(locale()).format(n);
const kr = (n) => fmt(n) + " DKK";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const artById = (id) => ARTWORKS.find(a => a.id === id);
const sizeYear = (a) => [a.size, a.year].filter(Boolean).join(", ");
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || "");
/* Most prints of one painting a person may buy (also checked on the server) */
const MAX_PER_PERSON = CONFIG.maxPerPerson || 10;
/* The last 8 digits of a phone number, so "+45 12 34 56 78" and "12345678" are the same person */
const phoneKey = (p) => { const d = String(p || "").replace(/\D/g, "").slice(-8); return d.length === 8 ? d : ""; };
/* Deposit at pickup: pay DEPOSIT_PCT % now (rounded up to whole kroner), the rest at pickup.
   Same rule as place_order() in supabase-setup.sql. 0 turns the option off. */
const DEPOSIT_PCT = Math.max(0, Math.min(100, CONFIG.depositPercent || 0));
function splitPayment(total, plan) {
  if (plan !== "deposit") return { pay_now: total, pay_later: 0 };
  const pay_now = Math.ceil(total * DEPOSIT_PCT / 100);
  return { pay_now, pay_later: total - pay_now };
}
/* The text to write in MobilePay: order number and what was bought, e.g. "LK-12345 2x VESTIGE, 1x FLORERE".
   Same format as place_order() in supabase-setup.sql. MobilePay allows 60 characters. */
function payMessage(code, lines) {
  const msg = code + " " + lines.map(l => `${l.qty}x ${l.title}`).join(", ");
  return msg.length > 60 ? msg.slice(0, 57) + "..." : msg;
}
const fmtDate = (d) => new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }).format(new Date(d));

/* Errors arrive as codes like "BID_TOO_LOW:5250" and are shown in the visitor's language */
function errText(err) {
  const raw = String((err && err.message) || "");
  const [code, a, b] = raw.split(":");
  if (!I18N["err." + code]) return t("err.generic");
  return t("err." + code, { n: code === "BID_TOO_LOW" ? kr(+a) : a, t: b });
}
const local = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

function toast(text, action) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.innerHTML = "";
  const msg = document.createElement("span"); msg.textContent = text; el.appendChild(msg);
  if (action) {
    const b = document.createElement("button"); b.type = "button"; b.className = "toast-action"; b.textContent = action.label;
    b.addEventListener("click", () => { el.classList.remove("show"); action.onClick(); });
    el.appendChild(b);
  }
  el.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), action ? 5000 : 2600);
}

/* Artwork image with a soft placeholder if the file is missing.
   The box takes the picture's own shape (w and h in config.js), so nothing is cropped. */
function artHTML(a, extra = "") {
  const title = L(a.title);
  const shape = a.w && a.h ? ` style="aspect-ratio:${a.w}/${a.h}"` : "";
  const size = a.w && a.h ? ` width="${a.w}" height="${a.h}"` : "";
  return `<div class="art ${extra}"${shape}><img src="${esc(a.image)}"${size} alt="${esc(title)}, Laura Kruuse" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('noimg')"><div class="ph">${esc(title)}</div></div>`;
}

/* A print shown on paper inside the wooden frame (images/general/frame.png) */
function printMockupHTML(a) {
  const title = L(a.title);
  return `<div class="mock">
    <div class="mock-paper"><img src="${esc(a.image)}" alt="${esc(title)}, print 50 × 70 cm" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('noimg')"><span class="ph">${esc(title)}</span></div>
    <img class="mock-frame" src="images/general/frame.png" alt="" aria-hidden="true" width="574" height="788" loading="lazy" decoding="async">
  </div>`;
}

/* Countdown: fills <b data-u="d|h|m|s"> inside el */
function setClock(el, targetMs) {
  let ms = Math.max(0, targetMs - Date.now());
  const d = Math.floor(ms / 864e5); ms -= d * 864e5;
  const h = Math.floor(ms / 36e5); ms -= h * 36e5;
  const m = Math.floor(ms / 6e4); ms -= m * 6e4;
  const s = Math.floor(ms / 1e3);
  const put = (u, v) => { const b = el.querySelector(`[data-u="${u}"]`); const t = u === "d" ? String(v) : String(v).padStart(2, "0"); if (b && b.textContent !== t) b.textContent = t; };
  put("d", d); put("h", h); put("m", m); put("s", s);
}
const clockHTML = () => `<div><b data-u="d">0</b><small>${t("clock.days")}</small></div><div><b data-u="h">00</b><small>${t("clock.hours")}</small></div><div><b data-u="m">00</b><small>${t("clock.min")}</small></div><div><b data-u="s">00</b><small>${t("clock.sec")}</small></div>`;

function auctionPhase(a) {
  const now = Date.now();
  if (now < Date.parse(a.starts_at)) return "soon";
  if (now > Date.parse(a.ends_at)) return "ended";
  return "live";
}
const minBid = (a) => a.top_bid ? a.top_bid + a.min_increment : a.start_price;
function statusText(a) {
  const ph = auctionPhase(a);
  return ph === "live" ? t("status.live") : ph === "soon" ? t("status.soon", { d: fmtDate(a.starts_at) }) : t("status.ended");
}
function amountLabel(a) {
  if (auctionPhase(a) === "ended") return t(a.top_bid ? "amount.winning" : "amount.noBids");
  return t(a.top_bid ? "amount.current" : "amount.start");
}
const bidCount = (a) => a.bid_count ? (a.bid_count === 1 ? t("bids.one") : t("bids.many", { n: a.bid_count })) : t("bids.none");
/* Pick the auction to feature: the live one ending first, else the next to open */
function featuredAuction(list) {
  const by = (ph, key) => list.filter(a => auctionPhase(a) === ph).sort((x, y) => Date.parse(x[key]) - Date.parse(y[key]));
  return by("live", "ends_at")[0] || by("soon", "starts_at")[0] || list[0];
}

/* ---------- Social icons ---------- */
const ICONS = {
  instagram: `<svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
  tiktok: `<svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.73a4.85 4.85 0 01-1.01-.04z"/></svg>`,
  messenger: `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3C6.9 3 3 6.7 3 11.4c0 2.6 1.2 4.9 3.2 6.4V21l3-1.6c.9.2 1.8.4 2.8.4 5.1 0 9-3.7 9-8.4S17.1 3 12 3z"/><path d="m7.5 13.5 3-3.2 2.2 2.2 3.8-2.2-3 3.2-2.2-2.2z" fill="currentColor"/></svg>`,
  email: `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3.5 6 8.5 7 8.5-7"/></svg>`
};
function fillSocialRows() {
  const c = CONFIG.contact;
  $$(".social-row[data-auto]").forEach(row => {
    row.innerHTML = `<a class="social-pill social-instagram" href="${esc(c.instagram.url)}" target="_blank" rel="noopener">${ICONS.instagram}<span>${esc(c.instagram.handle)}</span></a>
      <a class="social-pill social-tiktok" href="${esc(c.tiktok.url)}" target="_blank" rel="noopener">${ICONS.tiktok}<span>${esc(c.tiktok.handle)}</span></a>`;
  });
}

/* ---------- Data: Supabase when set up, otherwise a demo in this browser ---------- */
const LIVE = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

function remoteApi() {
  const base = CONFIG.supabaseUrl.replace(/\/$/, "");
  const headers = { apikey: CONFIG.supabaseAnonKey, Authorization: "Bearer " + CONFIG.supabaseAnonKey, "Content-Type": "application/json" };
  async function call(path, opts) {
    const res = await fetch(base + path, { headers, ...opts });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && body.message) || "GENERIC");
    return body;
  }
  const rpc = (fn, args) => call("/rest/v1/rpc/" + fn, { method: "POST", body: JSON.stringify(args || {}) });
  return {
    auctions: () => rpc("auction_state"),
    prints: () => call("/rest/v1/prints?select=artwork_id,stock,edition_size,sold,price_unsigned,price_signed&active=eq.true"),
    bid: (b) => rpc("place_bid", { p_artwork: b.artwork, p_name: b.name, p_email: b.email, p_phone: b.phone, p_amount: b.amount }),
    order: (o) => rpc("place_order", { p_name: o.name, p_email: o.email, p_phone: o.phone, p_address: o.address, p_delivery: o.delivery, p_items: o.items, p_plan: o.plan || "full" }),
    status: (code, email) => rpc("order_status", { p_code: code, p_email: email }),
    notify: (email, topic) => rpc("join_waitlist", { p_email: email, p_topic: topic })
  };
}

function demoApi() {
  const KEY = "lk-demo-v4";
  const SCHEDULE_VERSION = 2;
  const AUCTION_SCHEDULE = {
    vestige: { starts_at: "2026-11-01T18:00:00+01:00", ends_at: "2027-01-01T20:00:00+01:00" },
    florere: { starts_at: "2026-11-01T18:00:00+01:00", ends_at: "2027-01-01T20:00:00+01:00" }
  };
  let db = local.get(KEY, null);
  function seed() {
    return {
      scheduleVersion: SCHEDULE_VERSION,
      auctions: Object.entries(AUCTION_SCHEDULE).map(([artwork_id, dates]) => ({
        artwork_id, ...dates, start_price: 5000, min_increment: 250, extend_minutes: 5
      })),
      bids: [],
      prints: ARTWORKS.filter(forSale).map(a => ({ artwork_id: a.id, stock: 10, edition_size: 50, sold: 0, price_unsigned: 450, price_signed: 750 })),
      orders: [], waitlist: []
    };
  }
  if (!db) { db = seed(); local.set(KEY, db); }
  else if (db.scheduleVersion !== SCHEDULE_VERSION) {
    db.auctions.forEach(a => { if (AUCTION_SCHEDULE[a.artwork_id]) Object.assign(a, AUCTION_SCHEDULE[a.artwork_id]); });
    db.scheduleVersion = SCHEDULE_VERSION;
    local.set(KEY, db);
  }
  // Paintings added to ARTWORKS after the demo was first opened still get a print row
  const missing = ARTWORKS.filter(a => forSale(a) && !db.prints.some(p => p.artwork_id === a.id));
  if (missing.length) {
    missing.forEach(a => db.prints.push({ artwork_id: a.id, stock: 10, edition_size: 50, sold: 0, price_unsigned: 450, price_signed: 750 }));
    local.set(KEY, db);
  }
  const save = () => local.set(KEY, db);
  const ok = (v) => new Promise(r => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 200));
  const fail = (m) => new Promise((_, rej) => setTimeout(() => rej(new Error(m)), 200));
  const shortName = (n) => { const p = n.trim().split(/\s+/); return p[0] + (p[1] ? " " + p[1][0] + "." : ""); };
  return {
    reset() { db = seed(); save(); },
    auctions() {
      return ok(db.auctions.map(a => {
        const bs = db.bids.filter(b => b.artwork_id === a.artwork_id).sort((x, y) => y.amount - x.amount);
        return { ...a, top_bid: bs[0]?.amount ?? null, bid_count: bs.length,
          recent: bs.slice(0, 8).map(b => ({ id: b.id, amount: b.amount, created_at: b.created_at, name: shortName(b.bidder_name) })) };
      }));
    },
    prints() { return ok(db.prints); },
    bid({ artwork, name, email, phone, amount }) {
      const a = db.auctions.find(x => x.artwork_id === artwork), now = Date.now();
      if (!a) return fail("NOT_AUCTION");
      if (now < Date.parse(a.starts_at)) return fail("NOT_OPEN");
      if (now > Date.parse(a.ends_at)) return fail("ENDED");
      if ((name || "").trim().length < 2) return fail("NAME");
      if (!validEmail(email)) return fail("EMAIL");
      const top = Math.max(0, ...db.bids.filter(b => b.artwork_id === artwork).map(b => b.amount));
      const min = top ? top + a.min_increment : a.start_price;
      if (amount < min) return fail("BID_TOO_LOW:" + min);
      const id = Date.now();
      db.bids.push({ id, artwork_id: artwork, bidder_name: name.trim(), email: email.trim().toLowerCase(), phone, amount, created_at: new Date().toISOString() });
      if (Date.parse(a.ends_at) - now < a.extend_minutes * 6e4) a.ends_at = new Date(now + a.extend_minutes * 6e4).toISOString();
      save(); return ok({ id, amount });
    },
    order({ name, email, phone, address, delivery, items, plan = "full" }) {
      if ((name || "").trim().length < 2) return fail("NAME");
      if (!["full", "deposit"].includes(plan) || (plan === "deposit" && (delivery !== "pickup" || !DEPOSIT_PCT))) return fail("PLAN");
      if (!validEmail(email)) return fail("EMAIL");
      if (delivery === "ship" && (address || "").trim().length < 8) return fail("ADDRESS");
      if (!items.length) return fail("EMPTY");
      // Same rules as place_order() in supabase-setup.sql
      const wanted = {};
      for (const it of items) {
        if (!(it.qty >= 1 && it.qty <= MAX_PER_PERSON)) return fail("QTY");
        wanted[it.artwork_id] = (wanted[it.artwork_id] || 0) + it.qty;
      }
      const em = email.trim().toLowerCase(), ph = phoneKey(phone);
      const counts = (o) => o.status === "paid" || o.status === "shipped" ||
        (o.status === "awaiting_payment" && Date.now() - Date.parse(o.created_at) < CONFIG.reserveHours * 36e5);
      const mine = db.orders.filter(o => counts(o) && (o.email === em || (ph && phoneKey(o.phone) === ph)));
      let total = 0; const lines = [];
      for (const [id, qty] of Object.entries(wanted)) {
        const p = db.prints.find(x => x.artwork_id === id);
        if (!p) return fail("UNAVAILABLE");
        const already = mine.reduce((s, o) => s + o.items.filter(l => l.artwork_id === id).reduce((n, l) => n + l.qty, 0), 0);
        if (already + qty > MAX_PER_PERSON) return fail(`LIMIT:${Math.max(0, MAX_PER_PERSON - already)}:${artById(id).title}`);
        total += qty * p.price_signed;
        lines.push({ artwork_id: id, title: artById(id).title, signed: true, qty, unit_price: p.price_signed });
      }
      if (delivery === "ship") total += CONFIG.shipping.ship;
      const order_code = "LK-" + (10000 + Math.floor(Math.random() * 90000));
      const message = payMessage(order_code, lines);
      const { pay_now, pay_later } = splitPayment(total, plan);
      db.orders.push({ order_code, name, email: em, phone, address, delivery, items: lines, total, message, payment_plan: plan, pay_now, pay_later, status: "awaiting_payment", created_at: new Date().toISOString() });
      save(); return ok({ order_code, total, message, items: lines, payment_plan: plan, pay_now, pay_later });
    },
    status(code, email) {
      const o = db.orders.find(x => x.order_code === code && x.email === email.trim().toLowerCase());
      if (!o) return ok(null);
      const expired = o.status === "awaiting_payment" && Date.now() - Date.parse(o.created_at) > CONFIG.reserveHours * 36e5;
      return ok({ order_code: o.order_code, total: o.total, message: o.message, items: o.items, payment_plan: o.payment_plan || "full",
                  pay_now: o.pay_now ?? o.total, pay_later: o.pay_later || 0, status: expired ? "expired" : (o.status || "awaiting_payment") });
    },
    // Demo only: try the approval in the browser console with  api.markPaid("LK-12345")
    markPaid(code) {
      const o = db.orders.find(x => x.order_code === code); if (!o) return "no such order";
      o.status = "paid"; o.items.forEach(l => { const p = db.prints.find(x => x.artwork_id === l.artwork_id); if (p) p.sold += l.qty; });
      save(); return "paid";
    },
    notify(email, topic) {
      if (!validEmail(email)) return fail("EMAIL");
      db.waitlist.push({ email, topic }); save(); return ok({ ok: true });
    }
  };
}

const api = LIVE ? remoteApi() : demoApi();

/* ---------- Basket ---------- */
let printsCache = [];
let basket = local.get("lk-basket", []);           // [{ artwork_id, signed, qty }]
// Prints are only sold signed and numbered now. Turn any older unsigned basket lines into signed ones.
basket = basket.reduce((list, i) => {
  const ex = list.find(x => x.artwork_id === i.artwork_id);
  if (ex) ex.qty = Math.min(MAX_PER_PERSON, ex.qty + i.qty); else list.push({ artwork_id: i.artwork_id, signed: true, qty: Math.min(MAX_PER_PERSON, i.qty) });
  return list;
}, []);
const basketQty = () => basket.reduce((s, i) => s + i.qty, 0);
const inBasket = (id) => basket.filter(i => i.artwork_id === id).reduce((s, i) => s + i.qty, 0);
const printFor = (id) => printsCache.find(p => p.artwork_id === id);
const BAG_ICON = `<svg class="bag" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>`;
function renderBasketBtn() {
  const n = basketQty();
  $$(".basket-btn").forEach(b => {
    b.innerHTML = `${BAG_ICON}<span class="label">${t("nav.basket")}</span>${n ? `<span class="count">${n}</span>` : ""}`;
    b.classList.toggle("has-items", n > 0);
    b.setAttribute("aria-label", n ? t("basket.aria", { n }) : t("nav.basket"));
  });
}
function bumpBasket() {
  $$(".basket-btn").forEach(b => { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); });
}
function saveBasket() {
  local.set("lk-basket", basket);
  renderBasketBtn();
  document.dispatchEvent(new CustomEvent("basket:change"));
}
async function loadPrints() { printsCache = await api.prints(); return printsCache; }

function addToBasket(artwork_id, signed, qty) {
  signed = true; // only signed and numbered prints are sold
  if (!printFor(artwork_id)) { toast(t("err.UNAVAILABLE")); return false; }   // no stock limit, only that the print exists
  // At most MAX_PER_PERSON of each print per person (the server also counts earlier orders)
  const room = MAX_PER_PERSON - inBasket(artwork_id);
  if (room <= 0) { toast(t("err.LIMIT_BASKET", { n: MAX_PER_PERSON, t: artById(artwork_id).title })); return false; }
  const capped = qty > room;
  if (capped) qty = room;
  const ex = basket.find(i => i.artwork_id === artwork_id && i.signed === signed);
  if (ex) ex.qty += qty; else basket.push({ artwork_id, signed, qty });
  saveBasket(); bumpBasket();
  toast(capped ? t("err.LIMIT_BASKET", { n: MAX_PER_PERSON, t: artById(artwork_id).title }) : t("toast.added", { t: artById(artwork_id).title }),
        { label: t("toast.view"), onClick: openBasket });
  return true;
}

/* Basket drawer, built once and shared by every page */
let drawer, delivery = "ship", payPlan = "full";   // payPlan: "full" or "deposit" (deposit only with pickup)
function buildDrawer() {
  drawer = document.createElement("dialog");
  drawer.className = "drawer";
  drawer.setAttribute("aria-labelledby", "drawer-title");
  drawer.innerHTML = `<div class="drawer-inner">
    <div class="drawer-head"><h2 id="drawer-title"></h2><button class="close-x" type="button" data-i18n-aria="close">×</button></div>
    <div class="drawer-body" id="drawer-body"></div></div>`;
  document.body.appendChild(drawer);
  drawer.querySelector(".close-x").addEventListener("click", () => drawer.close());
  drawer.addEventListener("click", e => { if (e.target === drawer) drawer.close(); });
  drawer.addEventListener("close", () => { delete drawer.dataset.paid; document.body.classList.remove("menu-locked"); });
}
async function openBasket() {
  if (!drawer) buildDrawer();
  try { if (!printsCache.length) await loadPrints(); } catch {}
  renderBasket(); drawer.querySelector(".close-x").setAttribute("aria-label", t("close")); drawer.showModal(); document.body.classList.add("menu-locked");
}
const subtotal = () => basket.reduce((s, i) => { const p = printFor(i.artwork_id); return s + (p ? i.qty * (i.signed ? p.price_signed : p.price_unsigned) : 0); }, 0);

function renderBasket() {
  $("#drawer-title").textContent = t("nav.basket");
  const body = $("#drawer-body");
  if (!basket.length) {
    // Orders placed from this browser, so the buyer can find the payment details and the status again
    const mine = myOrders();
    body.innerHTML = `<p class="lede">${t("basket.empty")}</p><a class="btn line" href="index.html#prints" onclick="this.closest('dialog').close()">${t("basket.see")}</a>
      ${mine.length ? `<div class="my-orders"><h3>${t("orders.head")}</h3>${mine.map(o => `
        <div class="line-item order-item"><div><b>${esc(o.order_code)}</b><small>${esc(o.items.map(l => `${l.qty}× ${l.title}`).join(", "))}</small><small>${kr(o.total)}</small></div>
          <span class="order-status ${esc(o.status)}">${orderStatusText(o)}</span>
          <button class="link-btn" type="button" data-order="${esc(o.order_code)}">${t("orders.show")}</button></div>`).join("")}</div>` : ""}`;
    $$("[data-order]", body).forEach(b => b.addEventListener("click", () => showPayment(mine.find(o => o.order_code === b.dataset.order))));
    return;
  }
  const ship = delivery === "ship" ? CONFIG.shipping.ship : CONFIG.shipping.pickup;
  const canDeposit = delivery === "pickup" && DEPOSIT_PCT > 0 && DEPOSIT_PCT < 100;
  if (!canDeposit) payPlan = "full";
  const split = splitPayment(subtotal() + ship, payPlan);
  const me = local.get("lk-me", {});
  const keep = $("#checkout") ? Object.fromEntries(new FormData($("#checkout"))) : {};
  body.innerHTML = `
    <div>${basket.map((i, n) => { const a = artById(i.artwork_id), p = printFor(i.artwork_id); const unit = p ? (i.signed ? p.price_signed : p.price_unsigned) : 0; return `
      <div class="line-item">${artHTML(a)}
        <div><b>${esc(a.title)}</b><small>50 × 70 cm, ${t(i.signed ? "basket.signed" : "basket.unsigned")}</small><small>${i.qty} × ${kr(unit)}</small></div>
        <button class="link-btn" type="button" data-rm="${n}">${t("basket.remove")}</button>
      </div>`; }).join("")}</div>
    <form id="checkout" novalidate style="display:grid;gap:1.1rem">
      <fieldset><legend>${t("basket.delivery")}</legend>
        <label class="radio"><input type="radio" name="delivery" value="ship" ${delivery === "ship" ? "checked" : ""}>${t("basket.ship")}<span class="price">${kr(CONFIG.shipping.ship)}</span></label>
        <label class="radio"><input type="radio" name="delivery" value="pickup" ${delivery === "pickup" ? "checked" : ""}>${esc(L(CONFIG.pickupText))}<span class="price">${t("basket.free")}</span></label>
      </fieldset>
      ${canDeposit ? `<fieldset><legend>${t("basket.payment")}</legend>
        <label class="radio"><input type="radio" name="plan" value="full" ${payPlan === "full" ? "checked" : ""}>${t("basket.planFull")}</label>
        <label class="radio"><input type="radio" name="plan" value="deposit" ${payPlan === "deposit" ? "checked" : ""}>${t("basket.planDeposit", { p: DEPOSIT_PCT })}</label>
      </fieldset>` : ""}
      <div class="row-2">
        <label class="field"><span>${t("basket.name")}</span><input name="name" autocomplete="name" value="${esc(keep.name ?? me.name ?? "")}" required></label>
        <label class="field"><span>${t("email.label")}</span><input name="email" type="email" inputmode="email" autocomplete="email" value="${esc(keep.email ?? me.email ?? "")}" required></label>
      </div>
      <label class="field"><span>${t("basket.phone")}</span><input name="phone" type="tel" autocomplete="tel" value="${esc(keep.phone ?? me.phone ?? "")}"></label>
      <label class="field" ${delivery === "ship" ? "" : "hidden"}><span>${t("basket.address")}</span><textarea name="address" rows="3" autocomplete="street-address" placeholder="${t("basket.addressPh")}">${esc(keep.address ?? "")}</textarea></label>
      <div class="totals">
        <div><span>${t("basket.prints")}</span><span>${kr(subtotal())}</span></div>
        <div><span>${t(delivery === "ship" ? "basket.shipping" : "basket.pickup")}</span><span>${kr(ship)}</span></div>
        <div class="grand"><span>${t("basket.total")}</span><span>${kr(subtotal() + ship)}</span></div>
        ${payPlan === "deposit" ? `<div class="split"><span>${t("basket.payNow")}</span><span>${kr(split.pay_now)}</span></div>
        <div class="split"><span>${t("basket.payLater")}</span><span>${kr(split.pay_later)}</span></div>` : ""}
      </div>
      <button class="btn block" type="submit">${t("basket.submit")}</button>
      <p class="msg" id="co-msg" role="status"></p>
      <p class="fineprint">${t("basket.held", { h: CONFIG.reserveHours })}</p>
    </form>`;
  $$("[data-rm]", body).forEach(b => b.addEventListener("click", () => { basket.splice(+b.dataset.rm, 1); saveBasket(); renderBasket(); }));
  const form = $("#checkout");
  $$("input[name=delivery]", form).forEach(r => r.addEventListener("change", () => { delivery = r.value; renderBasket(); }));
  $$("input[name=plan]", form).forEach(r => r.addEventListener("change", () => { payPlan = r.value; renderBasket(); }));
  form.addEventListener("submit", submitOrder);
}

async function submitOrder(e) {
  e.preventDefault();
  const form = e.target, f = Object.fromEntries(new FormData(form)), msg = $("#co-msg"), btn = form.querySelector("button[type=submit]");
  msg.className = "msg err";
  if ((f.name || "").trim().length < 2) { msg.textContent = t("err.NAME"); return; }
  if (!validEmail(f.email)) { msg.textContent = t("err.EMAIL"); return; }
  if (f.delivery === "ship" && (f.address || "").trim().length < 8) { msg.textContent = t("err.ADDRESS"); return; }
  btn.disabled = true; msg.className = "msg"; msg.textContent = t("basket.reserving");
  try {
    const items = basket.map(i => ({ artwork_id: i.artwork_id, signed: i.signed, qty: i.qty }));
    const plan = f.delivery === "pickup" && f.plan === "deposit" ? "deposit" : "full";
    const r = await api.order({ name: f.name.trim(), email: f.email.trim(), phone: (f.phone || "").trim(), address: f.address || "", delivery: f.delivery, items, plan });
    local.set("lk-me", { ...local.get("lk-me", {}), name: f.name.trim(), email: f.email.trim(), phone: (f.phone || "").trim() });
    const order = { order_code: r.order_code, total: r.total, items: r.items || [], email: f.email.trim().toLowerCase(),
                    message: r.message || payMessage(r.order_code, r.items || []), status: "awaiting_payment", created_at: new Date().toISOString(),
                    payment_plan: r.payment_plan || plan, pay_now: r.pay_now ?? r.total, pay_later: r.pay_later || 0 };
    saveMyOrder(order);
    basket = []; saveBasket();
    try { await loadPrints(); } catch {}
    document.dispatchEvent(new CustomEvent("prints:change"));
    showPayment(order);
  } catch (err) {
    msg.className = "msg err"; msg.textContent = errText(err); btn.disabled = false;
    try { await loadPrints(); document.dispatchEvent(new CustomEvent("prints:change")); } catch {}
  }
}

/* "Paid" on a deposit order means the deposit is paid and the rest is owed at pickup */
const orderStatusText = (o) => t(o.status === "paid" && o.pay_later ? "order.depositPaid" : "order." + o.status);
/* Orders placed from this browser (newest first, at most 5) */
const myOrders = () => local.get("lk-orders", []);
function saveMyOrder(o) {
  local.set("lk-orders", [o, ...myOrders().filter(x => x.order_code !== o.order_code)].slice(0, 5));
}

/* After ordering: how to pay with MobilePay, and whether Laura has approved the payment yet.
   The order is only approved (status "paid") once Laura has seen the payment arrive. */
function showPayment(order) {
  if (!drawer) buildDrawer();
  if (!drawer.open) { drawer.querySelector(".close-x").setAttribute("aria-label", t("close")); drawer.showModal(); document.body.classList.add("menu-locked"); }
  drawer.dataset.paid = "1";
  const mp = CONFIG.mobilepay;
  const number = mp.number.replace(/^\+45/, "").replace(/\D/g, "");   // MobilePay wants the 8 digits
  const paid = order.status === "paid" || order.status === "shipped";
  const now = order.pay_now ?? order.total, later = order.pay_later || 0;
  $("#drawer-title").textContent = t(paid ? "pay.headPaid" : "pay.head");
  $("#drawer-body").innerHTML = `
    <div class="pay-box">
      <p class="order-status big ${esc(order.status)}">${orderStatusText(order)}</p>
      <h3>${t(paid ? "pay.titlePaid" : order.status === "expired" || order.status === "cancelled" ? "pay.titleExpired" : later ? "pay.titleDeposit" : "pay.title")}</h3>
      <p>${t(paid ? "pay.textPaid" : "pay.text", { h: CONFIG.reserveHours })}</p>
      ${later && order.status !== "shipped" ? `<p class="pay-rest">${t("pay.rest", { n: kr(later), t: kr(order.total) })}</p>` : ""}
      <ul class="pay-items">${order.items.map(l => `<li>${l.qty} × ${esc(l.title)}, 50 × 70 cm</li>`).join("")}</ul>
      ${paid ? "" : `<ol class="pay-steps">
        <li>${t("pay.step1")}</li><li>${t("pay.step2")}</li><li>${t("pay.step3")}</li></ol>
      <dl>
        <div class="pay-row"><dt>${t("pay.to")}</dt><dd>${esc(mp.number)}</dd><button class="copy" type="button" data-copy="${esc(number)}">${t("pay.copy")}</button></div>
        <div class="pay-row"><dt>${t("pay.name")}</dt><dd>${esc(mp.name)}</dd></div>
        <div class="pay-row"><dt>${t(later ? "pay.amountNow" : "pay.amount")}</dt><dd>${kr(now)}</dd><button class="copy" type="button" data-copy="${now}">${t("pay.copy")}</button></div>
        <div class="pay-row"><dt>${t("pay.msg")}</dt><dd class="pay-msg">${esc(order.message)}</dd><button class="copy" type="button" data-copy="${esc(order.message)}">${t("pay.copy")}</button></div>
      </dl>
      <p class="fineprint">${t("pay.msgWhy")}</p>`}
      <p class="fineprint">${t(paid ? "pay.afterPaid" : "pay.after", { e: esc(order.email) })}</p>
    </div>
    ${paid ? "" : `<button class="btn block" type="button" id="pay-check">${t("pay.check")}</button><p class="msg" id="pay-msg" role="status"></p>`}
    <button class="btn line block" type="button" id="pay-done">${t("close")}</button>`;
  $$("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast(t("toast.copied")); } catch { toast(t("toast.copyFail")); }
  }));
  $("#pay-done").addEventListener("click", () => drawer.close());
  const check = $("#pay-check");
  if (check) check.addEventListener("click", async () => {
    check.disabled = true;
    const msg = $("#pay-msg"); msg.className = "msg"; msg.textContent = t("pay.checking");
    try {
      const s = await api.status(order.order_code, order.email);
      if (!s) throw new Error("GENERIC");
      const next = { ...order, status: s.status, pay_now: s.pay_now ?? order.pay_now, pay_later: s.pay_later ?? order.pay_later };
      saveMyOrder(next);
      if (s.status !== order.status) { showPayment(next); return; }
      msg.textContent = t("pay.stillWaiting");
    } catch (err) { msg.className = "msg err"; msg.textContent = errText(err); }
    check.disabled = false;
  });
}

/* ---------- Waitlist forms: any <form data-notify="topic"> ---------- */
document.addEventListener("submit", async e => {
  const f = e.target.closest("form[data-notify]"); if (!f) return;
  e.preventDefault();
  const msg = f.parentNode.querySelector(".msg"), input = f.querySelector("input[type=email]");
  try { await api.notify(input.value.trim(), f.dataset.notify); msg.className = "msg ok"; msg.textContent = t("notify.ok"); f.reset(); }
  catch (err) { msg.className = "msg err"; msg.textContent = errText(err); }
});

/* ---------- Page chrome: menu, language, basket button, reveal, demo bar ---------- */
/* ---------- Protect the pictures ----------
   No right-click "Save image", no dragging pictures to the desktop, and no long-press save on phones.
   This stops casual copying; a determined person can still take a screenshot. */
document.addEventListener("contextmenu", e => { if (e.target.closest("img, .art, .mock, .frame, .sketch-mat, .np-img, .mv-frame, .note")) e.preventDefault(); });
document.addEventListener("dragstart", e => { if (e.target.closest && e.target.closest("img")) e.preventDefault(); });

document.addEventListener("DOMContentLoaded", () => {
  const nav = $(".site-nav"), toggle = $(".nav-toggle");
  if (toggle) toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("menu-open");
    toggle.setAttribute("aria-expanded", open);
    document.body.classList.toggle("menu-locked", open);
  });
  $$(".nav-links a").forEach(a => a.addEventListener("click", () => { nav.classList.remove("menu-open"); document.body.classList.remove("menu-locked"); }));
  const onScroll = () => nav && nav.classList.toggle("scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  $$(".basket-btn").forEach(b => b.addEventListener("click", openBasket));
  saveBasket();

  const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add("visible"); io.unobserve(x.target); } }), { threshold: 0.1 });
  $$(".reveal").forEach(el => io.observe(el));

  /* Hand-drawn vine under the section headings, different for every heading and every page load
     (see makeVine). It is a sibling (not inside the heading), because the language switch
     rewrites the heading's HTML. Painted in by a little brush when scrolled into view (see paintVine). */
  const heads = $$("main .h-section, main .h-display");
  if (heads.length && !document.getElementById("vine-paint")) {
    // Shared filter that gives the vines rough, painted edges
    document.body.insertAdjacentHTML("beforeend",
      `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="vine-paint" x="-20%" y="-60%" width="140%" height="220%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
  }
  const vio = new IntersectionObserver(es => es.forEach(x => {
    if (x.isIntersecting) { vio.unobserve(x.target); paintVine(x.target); }
  }), { threshold: 0.6 });
  heads.forEach(h => {
    const v = document.createElement("span");
    v.className = "vine" + (h.classList.contains("center") ? " center" : "");
    v.setAttribute("aria-hidden", "true");
    v.style.setProperty("--tilt", (Math.random() * 3 - 1.5).toFixed(2) + "deg");
    const { html, plan } = makeVine();
    v.innerHTML = html;
    v._plan = plan;
    h.after(v);
    vio.observe(v);
  });

  $$(".year").forEach(y => y.textContent = new Date().getFullYear());


  fillSocialRows();
  $$(".lang-btn").forEach(b => b.addEventListener("click", () => setLang(LANG === "da" ? "en" : "da")));
  applyLang();
});

/* ---------- Random hand-drawn vine (SVG) for the section headings ----------
   Everything stays inside the 240 × 44 drawing, so it never reaches the heading above or the text below.
   Leaves sit in their own slots along the stem (alternating sides, always pointing forward),
   so they never touch each other, the tendril or the flower. */
function makeVine() {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const f = (n) => n.toFixed(1);
  const W = 240, H = 44, MID = 22, END = 202;

  // Stem: a gentle wave with a random height, length and starting point
  const amp = rnd(2.5, 4.2), waves = rnd(0.9, 1.6), phase = rnd(0, Math.PI * 2);
  const k = (Math.PI * 2 * waves) / (END - 4);
  const y = (x) => MID + amp * Math.sin(k * x + phase);
  const slope = (x) => amp * k * Math.cos(k * x + phase);
  let d = `M4 ${f(y(4))}`;
  for (let x = 8; x <= END; x += 4) d += `L${x} ${f(y(x))}`;

  // Leaves: 3 to 5, one per slot, alternating above and below the stem
  const LEAF = "M0 0c4-6 12-7 17-4c-4 5-12 7-17 4z";
  const greens = ["#7a9e6e", "#4a6741", "#93b386", "#5f7f52", "#6d8f5f"];
  const n = 3 + Math.floor(Math.random() * 3);
  const from = 20, to = 172, slot = (to - from) / n;
  let side = Math.random() < 0.5 ? -1 : 1;   // -1 = above the stem, 1 = below
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const x = from + slot * (i + 0.5) + rnd(-0.18, 0.18) * slot;
    const s = rnd(0.75, 1.12);
    const stemDeg = Math.atan(slope(x)) * 180 / Math.PI;
    let off = rnd(35, 58);
    // Keep the tip inside the drawing
    const tipY = () => y(x) + Math.sin((stemDeg + side * off) * Math.PI / 180) * 17 * s;
    while ((tipY() < 3 || tipY() > H - 3) && off > 20) off -= 4;
    leaves.push({ x, side, s, deg: stemDeg + side * off, color: pick(greens) });
    side = -side;
  }
  const leafSvg = leaves.map(l =>
    `<g transform="translate(${f(l.x)} ${f(y(l.x))}) rotate(${f(l.deg)}) scale(${l.s.toFixed(2)})">` +
    `<path class="v-leaf" style="fill:${l.color}" d="${LEAF}"/></g>`).join("");

  // Tendril: sometimes, in the widest gap between two leaves, on the side of the leaf after the gap
  // (that leaf points away from it, and the leaf before the gap is on the other side)
  let tendril = "", tendrilX = null;
  if (n > 1 && Math.random() < 0.75) {
    let g = 0;
    for (let i = 1; i < n - 1; i++) if (leaves[i + 1].x - leaves[i].x > leaves[g + 1].x - leaves[g].x) g = i;
    const cx = (leaves[g].x + leaves[g + 1].x) / 2, sd = leaves[g + 1].side, cy = y(cx);
    tendrilX = cx;
    tendril = `<path class="v-tendril" pathLength="1" ` +
      `d="M${f(cx)} ${f(cy)}c1 ${sd * 7} -8 ${sd * 9} -9 ${sd * 3}c0 ${-sd * 3} 4 ${-sd * 3} 4 0"/>`;
  }

  // Flower at the end of the stem: 5 or 6 petals in one of several soft colours
  const petals = pick([
    ["#f1d7ca", "#c4877b"],   // blush
    ["#f6e6a8", "#c9a74a"],   // butter yellow
    ["#ddd3ee", "#9a87b8"],   // lavender
    ["#fbf8f1", "#b9ae9a"],   // white
    ["#f5c2b3", "#c97a66"],   // coral
    ["#d4e4ef", "#7f9fb5"],   // sky blue
    ["#ecc6cf", "#b0707f"]    // rose
  ]);
  const count = Math.random() < 0.6 ? 5 : 6, turn = rnd(0, 360 / count);
  const fx = 212, fy = Math.min(Math.max(y(END), 12), H - 12);
  const petalDeg = Array.from({ length: count }, (_, i) => turn + i * 360 / count);
  const petalSvg = petalDeg.map(a =>
    `<g transform="rotate(${f(a)})"><ellipse cx="0" cy="-5" rx="${rnd(2.8, 3.4).toFixed(2)}" ry="${rnd(4.8, 5.6).toFixed(2)}" ` +
    `style="fill:${petals[0]};stroke:${petals[1]}" class="v-petal"/></g>`).join("");
  const heart = pick(["#b8902f", "#c79a3a", "#9c7a2a"]);

  // Gold dots: 2 or 3 above and to the right of the flower, well clear of the petals
  const dots = [], dotPos = [];
  const angles = [rnd(15, 35), rnd(45, 60), rnd(70, 85)].slice(0, 2 + Math.floor(Math.random() * 2));
  angles.forEach((a, i) => {
    const dist = rnd(13, 18), r = [1.7, 1.1, 0.8][i];
    const x = Math.min(fx + Math.cos(a * Math.PI / 180) * dist, W - 2);
    const yy = Math.max(fy - Math.sin(a * Math.PI / 180) * dist, 2);
    dots.push(`<circle class="v-dot" style="fill:${heart}" cx="${f(x)}" cy="${f(yy)}" r="${r}"/>`);
    dotPos.push([x, yy]);
  });

  // The paintbrush: bristle tip at (0,0), handle leaning up and to the right
  const brush = `<g class="v-brush" transform="translate(4 ${f(y(4))})">
    <line class="handle" x1="5.6" y1="-10.5" x2="15" y2="-29"/>
    <line class="ferrule" x1="3" y1="-5.4" x2="5.8" y2="-10.9"/>
    <path class="bristles" d="M0 0C-1.4-1.6-.2-4.6 1.6-6.2L4.6-4.7C4.2-2.4 2.4-.4 0 0z"/></g>`;

  const html = `<svg viewBox="0 0 ${W} ${H}" focusable="false"><g class="v-art">
    <path class="v-stem" pathLength="1" d="${d}"/><path class="v-stem2" pathLength="1" transform="translate(0.5 -0.9)" d="${d}"/>${tendril}${leafSvg}
    <g transform="translate(${fx} ${f(fy)})"><g class="v-flower">${petalSvg}<circle class="v-heart" r="2.4" style="fill:${heart}"/></g></g>
    ${dots.join("")}</g>${brush}
  </svg>`;
  return { html, plan: { y, start: 4, end: END, leafX: leaves.map(l => l.x), tendrilX, fx, fy, petalDeg, petalColor: petals[1], gold: heart, dotPos } };
}

/* Paint a vine: a little brush draws the stem (leaves swipe out as it passes),
   dabs the petals one by one, adds the gold heart and dots, then lifts away. */
function paintVine(v) {
  const P = v._plan, svg = v.querySelector("svg");
  const q = (s) => [...svg.querySelectorAll(s)];
  const stems = q(".v-stem, .v-stem2"), leaves = q(".v-leaf"), petals = q(".v-petal"), dots = q(".v-dot");
  const tendril = svg.querySelector(".v-tendril"), heart = svg.querySelector(".v-heart");
  const brush = svg.querySelector(".v-brush"), bristles = svg.querySelector(".bristles");
  const on = (el) => el && el.classList.add("on");

  if (!P || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    [...leaves, ...petals, ...dots, tendril, heart].forEach(on);
    stems.forEach(s => s.style.strokeDashoffset = 0);
    if (brush) brush.remove();
    v.classList.add("painted");
    return;
  }

  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const stemAt = (p) => { const x = P.start + (P.end - P.start) * p; return [x, P.y(x)]; };
  const petalAt = (a, r) => [P.fx + r * Math.sin(a * Math.PI / 180), P.fy - r * Math.cos(a * Math.PI / 180)];

  // Steps run one after another; each hop moves the brush from where the last step ended
  const steps = [];
  const hop = (ms, to, done, before) => steps.push({ ms, to, done, before });
  steps.push({ ms: 1500, path: true });
  hop(220, [P.fx, P.fy], null, () => bristles.style.fill = P.petalColor);   // fresh paint for the flower
  P.petalDeg.forEach((a, i) => { hop(85, petalAt(a, 7.5), null); hop(70, petalAt(a, 3), () => on(petals[i])); });
  hop(130, [P.fx, P.fy], () => on(heart), () => bristles.style.fill = P.gold);
  P.dotPos.forEach((p, i) => hop(120, p, () => on(dots[i])));
  steps.push({ ms: 450, lift: true });

  let i = 0, t0 = null, from = stemAt(0);
  const place = ([x, y], tilt) => brush.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${tilt.toFixed(1)})`);
  const frame = (now) => {
    const s = steps[i];
    if (t0 === null) { t0 = now; if (s.before) s.before(); }
    const t = Math.min((now - t0) / s.ms, 1);
    if (s.path) {
      const p = 1 - Math.pow(1 - t, 1.6), pos = stemAt(p);
      stems.forEach(el => el.style.strokeDashoffset = 1 - p);
      P.leafX.forEach((x, k) => { if (pos[0] >= x) on(leaves[k]); });
      if (P.tendrilX !== null && pos[0] >= P.tendrilX) on(tendril);
      place(pos, Math.sin(now / 110) * 4);   // a slight wobble, like a hand
      if (t === 1) from = pos;
    } else if (s.lift) {
      const e = ease(t);
      place([from[0] + 14 * e, from[1] - 18 * e], -10 * e);
      brush.style.opacity = 1 - t;
    } else {
      const e = ease(t), dip = Math.sin(t * Math.PI) * 2.5;   // lifts a little between dabs
      place([from[0] + (s.to[0] - from[0]) * e, from[1] + (s.to[1] - from[1]) * e - dip], -6 * Math.sin(t * Math.PI));
      if (t === 1) { from = s.to; if (s.done) s.done(); }
    }
    if (t === 1) { i++; t0 = null; }
    if (i < steps.length) requestAnimationFrame(frame);
    else { brush.remove(); v.classList.add("painted"); }
  };
  requestAnimationFrame(frame);
}
