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
  renderFooterLegal();
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
/* Footer line on every page: links to the terms and privacy page, and who sells (with CVR once it is in config.js) */
function renderFooterLegal() {
  const b = CONFIG.business || {};
  const seller = [b.name, b.city, b.cvr ? t("footer.cvr", { n: b.cvr }) : ""].filter(Boolean).map(esc).join(" · ");
  $$(".footer-legal").forEach(p => {
    p.innerHTML = `<a href="betingelser.html#${LANG === "en" ? "terms" : "handel"}">${t("footer.terms")}</a>
      <a href="betingelser.html#${LANG === "en" ? "privacy" : "privatliv"}">${t("footer.privacy")}</a>
      <span>${seller}</span>`;
  });
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
const CANCEL_HOURS = CONFIG.cancelHours ?? 24;
const DAILY_LIMIT = CONFIG.dailyLimit ?? 50;
// Prints are only sent inside Denmark for now: a Danish postcode is 4 digits, 1000 to 9990.
// 39xx is Greenland, which counts as abroad for shipping. Same rule as place_order() in supabase-setup.sql.
const dkZip = (zip) => /^[1-9]\d{3}$/.test(zip) && +zip <= 9990 && !/^39/.test(zip);
// The postcode in an address made by submitOrder ("street\n5000 Odense C\nDanmark")
const zipOf = (address) => ((address || "").match(/(?:^|\n)\s*(\d{4})\s+\S/) || [])[1] || "";
// Can the buyer still cancel this order themselves? (not paid, and inside the cancel window)
const canCancel = (o) => o.status === "awaiting_payment" && CANCEL_HOURS > 0 && o.created_at &&
  Date.now() - Date.parse(o.created_at) < CANCEL_HOURS * 36e5;
/* The text to write in MobilePay: order number and what was bought, e.g. "LK-12345 2x VESTIGE, 1x FLORERE".
   Same format as place_order() in supabase-setup.sql. MobilePay allows 60 characters. */
function payMessage(code, lines) {
  const msg = code + " " + lines.map(l => `${l.qty}x ${l.title}`).join(", ");
  return msg.length > 60 ? msg.slice(0, 57) + "..." : msg;
}
const fmtDate = (d) => new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }).format(new Date(d));

/* Errors arrive as codes like "BID_TOO_LOW:5250" and are shown in the visitor's language */
// "Only n prints left today" (or sold out / only 1) for the daily limit
function dailyLimitText(n) {
  return n <= 0 ? t("err.SOLD_OUT_TODAY") : n === 1 ? t("err.DAILY_LIMIT_ONE") : t("err.DAILY_LIMIT", { n });
}
function errText(err) {
  const raw = String((err && err.message) || "");
  const [code, a, b] = raw.split(":");
  if (code === "DAILY_LIMIT") return dailyLimitText(+a);
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
/* Captcha at checkout (Cloudflare Turnstile), only with the real database */
const CAPTCHA = LIVE && !!CONFIG.turnstileSiteKey;
let captchaId = null, captchaReady = null;
function loadTurnstile() {
  if (!captchaReady) captchaReady = new Promise((resolve, reject) => {
    window.onTurnstileLoad = resolve;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
    s.async = true; s.onerror = () => { captchaReady = null; reject(new Error("CAPTCHA_LOAD")); };
    document.head.appendChild(s);
  });
  return captchaReady;
}
// Put the captcha in the checkout form (called every time the basket is drawn)
async function mountCaptcha() {
  const box = $("#co-captcha"); if (!CAPTCHA || !box) return;
  try { await loadTurnstile(); } catch { box.textContent = t("err.CAPTCHA_LOAD"); return; }
  if (!box.isConnected) return;
  if (captchaId !== null) { try { turnstile.remove(captchaId); } catch {} }
  captchaId = turnstile.render(box, { sitekey: CONFIG.turnstileSiteKey, language: LANG, theme: "light" });
}
const captchaToken = () => { try { return captchaId !== null ? turnstile.getResponse(captchaId) || "" : ""; } catch { return ""; } };
// A token works only once, so get a new one after a failed order
const resetCaptcha = () => { try { if (captchaId !== null) turnstile.reset(captchaId); } catch {} };

function remoteApi() {
  const base = CONFIG.supabaseUrl.replace(/\/$/, "");
  // Works with both kinds of Supabase key: the new publishable key (sb_publishable_...) goes only in "apikey";
  // the older anon key (a long text starting with eyJ) is also sent as Authorization.
  const key = CONFIG.supabaseAnonKey;
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
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
    shop: () => rpc("shop_state"),
    bid: (b) => rpc("place_bid", { p_artwork: b.artwork, p_name: b.name, p_email: b.email, p_phone: b.phone, p_amount: b.amount }),
    // With the captcha on, orders go through the place-order function, which checks the captcha first
    order: (o) => CAPTCHA
      ? call("/functions/v1/place-order", { method: "POST", body: JSON.stringify({ name: o.name, email: o.email, phone: o.phone, address: o.address, delivery: o.delivery, items: o.items, plan: o.plan || "full", captcha: o.captcha }) })
      : rpc("place_order", { p_name: o.name, p_email: o.email, p_phone: o.phone, p_address: o.address, p_delivery: o.delivery, p_items: o.items, p_plan: o.plan || "full" }),
    status: (code, email) => rpc("order_status", { p_code: code, p_email: email }),
    cancel: (code, email) => rpc("cancel_order", { p_code: code, p_email: email }),
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
      if (plan !== "full") return fail("PLAN");
      if (!validEmail(email)) return fail("EMAIL");
      if (delivery === "ship" && (address || "").trim().length < 8) return fail("ADDRESS");
      if (delivery === "ship" && !dkZip(zipOf(address))) return fail("ADDRESS_DK");
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
      // Daily limit for all buyers together (same as place_order)
      const count = items.reduce((s, it) => s + it.qty, 0), left = DAILY_LIMIT - demoSoldToday(db.orders);
      if (count > left) return fail("DAILY_LIMIT:" + Math.max(left, 0));
      const pay_now = total, pay_later = 0;
      db.orders.push({ order_code, name, email: em, phone, address, delivery, items: lines, total, message, payment_plan: plan, pay_now, pay_later, status: "awaiting_payment", created_at: new Date().toISOString() });
      save(); return ok({ order_code, total, message, items: lines, payment_plan: plan, pay_now, pay_later });
    },
    status(code, email) {
      const o = db.orders.find(x => x.order_code === code && x.email === email.trim().toLowerCase());
      if (!o) return ok(null);
      const expired = o.status === "awaiting_payment" && Date.now() - Date.parse(o.created_at) > CONFIG.reserveHours * 36e5;
      return ok({ order_code: o.order_code, total: o.total, message: o.message, items: o.items, payment_plan: o.payment_plan || "full",
                  pay_now: o.pay_now ?? o.total, pay_later: o.pay_later || 0, created_at: o.created_at,
                  status: expired ? "expired" : (o.status || "awaiting_payment") });
    },
    // Same rules as cancel_order() in supabase-setup.sql
    cancel(code, email) {
      const o = db.orders.find(x => x.order_code === code && x.email === email.trim().toLowerCase());
      if (!o) return fail("NOT_FOUND");
      if (o.status === "cancelled") return ok({ order_code: code, status: "cancelled" });
      if (o.status !== "awaiting_payment") return fail("CANCEL_PAID");
      if (Date.now() - Date.parse(o.created_at) > CANCEL_HOURS * 36e5) return fail("CANCEL_LATE");
      o.status = "cancelled"; save();
      return ok({ order_code: code, status: "cancelled" });
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
    },
    // Same as shop_state() in supabase-setup.sql
    shop() {
      const sold = demoSoldToday(db.orders);
      return ok({ daily_limit: DAILY_LIMIT, sold_today: sold, left_today: Math.max(DAILY_LIMIT - sold, 0) });
    }
  };
}
// Prints ordered today (Danish calendar day), not counting cancelled orders: same as prints_sold_today()
function demoSoldToday(orders) {
  const day = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  const today = day(Date.now());
  return orders.filter(o => o.status !== "cancelled" && day(o.created_at) === today)
               .reduce((s, o) => s + o.items.reduce((n, l) => n + l.qty, 0), 0);
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
/* Small icons for the "safe to buy" lines above the order button */
const ico = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const TRUST_ICONS = {
  pay: ico(`<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>`),
  undo: ico(`<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4l2.5 2"/>`),
  box: ico(`<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>`),
  back: ico(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`)
};
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
// How many prints are left today for everyone together (null until known; then the shop simply allows ordering)
let shopState = null;
const leftToday = () => shopState ? shopState.left_today : Infinity;
const soldOutToday = () => leftToday() <= 0;
async function loadPrints() {
  const [prints, shop] = await Promise.all([api.prints(), api.shop().catch(() => null)]);
  printsCache = prints; shopState = shop;
  return printsCache;
}

function addToBasket(artwork_id, signed, qty) {
  signed = true; // only signed and numbered prints are sold
  if (!printFor(artwork_id)) { toast(t("err.UNAVAILABLE")); return false; }   // no stock limit, only that the print exists
  // The daily limit for everyone together (the server checks it again when the order is placed)
  const dayRoom = leftToday() - basketQty();
  if (soldOutToday()) { toast(t("err.SOLD_OUT_TODAY")); return false; }
  if (dayRoom <= 0) { toast(dailyLimitText(leftToday())); return false; }
  // At most MAX_PER_PERSON of each print per person (the server also counts earlier orders)
  const room = Math.min(MAX_PER_PERSON - inBasket(artwork_id), dayRoom);
  if (MAX_PER_PERSON - inBasket(artwork_id) <= 0) { toast(t("err.LIMIT_BASKET", { n: MAX_PER_PERSON, t: artById(artwork_id).title })); return false; }
  const capped = qty > room, byDay = capped && dayRoom < MAX_PER_PERSON - inBasket(artwork_id);
  if (capped) qty = room;
  const ex = basket.find(i => i.artwork_id === artwork_id && i.signed === signed);
  if (ex) ex.qty += qty; else basket.push({ artwork_id, signed, qty });
  saveBasket(); bumpBasket();
  toast(byDay ? dailyLimitText(leftToday())
        : capped ? t("err.LIMIT_BASKET", { n: MAX_PER_PERSON, t: artById(artwork_id).title }) : t("toast.added", { t: artById(artwork_id).title }),
        { label: t("toast.view"), onClick: openBasket });
  return true;
}

/* Basket drawer, built once and shared by every page */
let drawer;
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
    body.innerHTML = `<p class="lede">${t("basket.empty")}</p><a class="btn line" href="prints.html" onclick="this.closest('dialog').close()">${t("basket.see")}</a>
      ${mine.length ? `<div class="my-orders"><h3>${t("orders.head")}</h3>${mine.map(o => `
        <div class="line-item order-item"><div><b>${esc(o.order_code)}</b><small>${esc(o.items.map(l => `${l.qty}× ${l.title}`).join(", "))}</small><small>${kr(o.total)}</small></div>
          <span class="order-status ${esc(o.status)}">${orderStatusText(o)}</span>
          <button class="link-btn" type="button" data-order="${esc(o.order_code)}">${t("orders.show")}</button></div>`).join("")}</div>` : ""}`;
    $$("[data-order]", body).forEach(b => b.addEventListener("click", () => showPayment(mine.find(o => o.order_code === b.dataset.order))));
    return;
  }
  const ship = CONFIG.shipping.ship;
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
        <label class="radio"><input type="radio" name="delivery" value="ship" checked disabled>${t("basket.ship")}<span class="price">${kr(CONFIG.shipping.ship)}</span></label>
      </fieldset>
      <div class="row-2">
        <label class="field"><span>${t("basket.name")}</span><input name="name" autocomplete="name" value="${esc(keep.name ?? me.name ?? "")}" required></label>
        <label class="field"><span>${t("email.label")}</span><input name="email" type="email" inputmode="email" autocomplete="email" value="${esc(keep.email ?? me.email ?? "")}" required></label>
      </div>
      <label class="field"><span>${t("basket.phone")}</span><input name="phone" type="tel" autocomplete="tel" value="${esc(keep.phone ?? me.phone ?? "")}"></label>
      <fieldset class="address"><legend>${t("basket.address")}</legend>
        <label class="field"><span>${t("basket.street")}</span><input name="street" autocomplete="address-line1" placeholder="${t("basket.streetPh")}" value="${esc(keep.street ?? "")}" required></label>
        <div class="row-zip">
          <label class="field"><span>${t("basket.zip")}</span><input name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="4" pattern="[0-9]{4}" placeholder="5000" value="${esc(keep.zip ?? "")}" required></label>
          <label class="field"><span>${t("basket.city")}</span><input name="city" autocomplete="address-level2" placeholder="${t("basket.cityAuto")}" value="${esc(keep.city ?? "")}" required></label>
        </div>
        <p class="zip-hint msg" id="zip-hint" role="status"></p>
        <p class="fineprint">${t("basket.dkOnly")}</p>
      </fieldset>
      <div class="totals">
        <div><span>${t("basket.prints")}</span><span>${kr(subtotal())}</span></div>
        <div><span>${t("basket.shipping")}</span><span>${kr(ship)}</span></div>
        <div class="grand"><span>${t("basket.total")}</span><span>${kr(subtotal() + ship)}</span></div>
      </div>
      ${basketQty() > leftToday() ? `<p class="msg err">${soldOutToday() ? t("err.SOLD_OUT_TODAY") : dailyLimitText(leftToday())}</p>` : ""}
      <ul class="trust">
        <li>${TRUST_ICONS.pay}<span>${t("trust.pay")}</span></li>
        <li>${TRUST_ICONS.undo}<span>${t("trust.cancel", { h: CANCEL_HOURS })}</span></li>
        <li>${TRUST_ICONS.box}<span>${t("trust.ship")}</span></li>
        <li>${TRUST_ICONS.back}<span>${t("trust.return")}</span></li>
      </ul>
      ${CAPTCHA ? `<div class="captcha" id="co-captcha"></div>` : ""}
      <button class="btn block" type="submit" ${basketQty() > leftToday() ? "disabled" : ""}>${t("basket.submit")}</button>
      <p class="msg" id="co-msg" role="status"></p>
      <p class="fineprint">${t("basket.held", { h: CONFIG.reserveHours })}</p>
      <p class="fineprint">${t("basket.terms")}</p>
    </form>`;
  $$("[data-rm]", body).forEach(b => b.addEventListener("click", () => { basket.splice(+b.dataset.rm, 1); saveBasket(); renderBasket(); }));
  $("#checkout").addEventListener("submit", submitOrder);
  mountCaptcha();
  wireZip();
}

/* ---------- Address check: the official list of Danish postcodes (js/postnumre.json, from PostNord) ----------
   Typing a postcode fills in the town by itself and locks it, so the town always matches the postcode.
   If the list cannot be loaded, the checkout simply works as before (the town is typed by hand). */
let POSTNUMRE = null, postnumreReady = null;
function loadPostnumre() {
  if (!postnumreReady) postnumreReady = fetch("js/postnumre.json?v=20261124")
    .then(r => r.ok ? r.json() : null).then(j => (POSTNUMRE = j))
    .catch(() => { postnumreReady = null; return null; });
  return postnumreReady;
}
async function wireZip() {
  const zipIn = $("#checkout [name=zip]"), cityIn = $("#checkout [name=city]"), hint = $("#zip-hint");
  if (!zipIn || !cityIn) return;
  const update = () => {
    const zip = zipIn.value.replace(/\D/g, "").slice(0, 4);
    if (zipIn.value !== zip) zipIn.value = zip;
    hint.textContent = ""; hint.className = "zip-hint msg";
    if (!POSTNUMRE) return;                                   // no list: the town is typed by hand
    const town = zip.length === 4 && dkZip(zip) ? POSTNUMRE[zip] : null;
    cityIn.readOnly = !!town || zip.length < 4;              // locked while there is no valid postcode
    cityIn.classList.toggle("auto", !!town);
    cityIn.value = town || "";
    if (zip.length === 4 && !town) {
      hint.className = "zip-hint msg err";
      hint.innerHTML = /^39/.test(zip) || !dkZip(zip) ? t("err.ADDRESS_DK") : t("err.ZIP_UNKNOWN", { e: esc(CONFIG.contact.email) });
    }
  };
  zipIn.addEventListener("input", update);
  await loadPostnumre();
  if (zipIn.isConnected) update();
}

async function submitOrder(e) {
  e.preventDefault();
  const form = e.target, f = Object.fromEntries(new FormData(form)), msg = $("#co-msg"), btn = form.querySelector("button[type=submit]");
  msg.className = "msg err";
  if ((f.name || "").trim().length < 2) { msg.textContent = t("err.NAME"); return; }
  if (!validEmail(f.email)) { msg.textContent = t("err.EMAIL"); return; }
  // Every order is shipped (the disabled "delivery" radio is not part of the form data)
  const street = (f.street || "").trim(), zip = (f.zip || "").trim();
  if (street.length < 4 || !/\d/.test(street) || !/\p{L}{2}/u.test(street)) { msg.textContent = t("err.STREET"); return; }
  if (!dkZip(zip)) { msg.textContent = t("err.ADDRESS_DK"); return; }
  // The town always comes from the official postcode list, so "1710 Enschede" becomes impossible
  if (POSTNUMRE && !POSTNUMRE[zip]) { msg.innerHTML = t("err.ZIP_UNKNOWN", { e: esc(CONFIG.contact.email) }); return; }
  const city = POSTNUMRE ? POSTNUMRE[zip] : (f.city || "").trim();
  if (city.length < 2) { msg.textContent = t("err.CITY"); return; }
  const address = `${street}\n${zip} ${city}\nDanmark`;   // the same format place_order() checks
  const captcha = captchaToken();
  if (CAPTCHA && !captcha) { msg.textContent = t("err.CAPTCHA_WAIT"); return; }
  btn.disabled = true; msg.className = "msg"; msg.textContent = t("basket.reserving");
  try {
    const items = basket.map(i => ({ artwork_id: i.artwork_id, signed: i.signed, qty: i.qty }));
    const r = await api.order({ name: f.name.trim(), email: f.email.trim(), phone: (f.phone || "").trim(), address, delivery: "ship", items, plan: "full", captcha });
    local.set("lk-me", { ...local.get("lk-me", {}), name: f.name.trim(), email: f.email.trim(), phone: (f.phone || "").trim() });
    const order = { order_code: r.order_code, total: r.total, items: r.items || [], email: f.email.trim().toLowerCase(),
                    message: r.message || payMessage(r.order_code, r.items || []), status: "awaiting_payment", created_at: new Date().toISOString(),
                    payment_plan: "full", pay_now: r.total, pay_later: 0 };
    saveMyOrder(order);
    basket = []; saveBasket();
    try { await loadPrints(); } catch {}
    document.dispatchEvent(new CustomEvent("prints:change"));
    showPayment(order);
  } catch (err) {
    msg.className = "msg err"; msg.textContent = errText(err); btn.disabled = false;
    resetCaptcha();
    try { await loadPrints(); document.dispatchEvent(new CustomEvent("prints:change")); } catch {}
  }
}

const orderStatusText = (o) => t("order." + o.status);
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
  const closed = order.status === "cancelled" || order.status === "expired";   // nothing to pay any more
  const open = !paid && !closed;
  const title = paid ? "pay.titlePaid" : order.status === "cancelled" ? "pay.titleCancelled" : order.status === "expired" ? "pay.titleExpired" : "pay.title";
  const text = paid ? "pay.textPaid" : order.status === "cancelled" ? "pay.textCancelled" : order.status === "expired" ? "pay.textExpired" : "pay.text";
  $("#drawer-title").textContent = t(paid ? "pay.headPaid" : closed ? "orders.head" : "pay.head");
  $("#drawer-body").innerHTML = `
    <div class="pay-box">
      <p class="order-status big ${esc(order.status)}">${orderStatusText(order)}</p>
      <h3>${t(title)}</h3>
      <p>${t(text, { h: CONFIG.reserveHours })}</p>
      <ul class="pay-items">${order.items.map(l => `<li>${l.qty} × ${esc(l.title)}, 50 × 70 cm</li>`).join("")}</ul>
      ${!open ? "" : `<ol class="pay-steps">
        <li>${t("pay.step1")}</li><li>${t("pay.step2")}</li><li>${t("pay.step3")}</li></ol>
      <dl>
        <div class="pay-row"><dt>${t("pay.to")}</dt><dd>${esc(mp.number)}</dd><button class="copy" type="button" data-copy="${esc(number)}">${t("pay.copy")}</button></div>
        <div class="pay-row"><dt>${t("pay.name")}</dt><dd>${esc(mp.name)}</dd></div>
        <div class="pay-row"><dt>${t("pay.amount")}</dt><dd>${kr(order.total)}</dd><button class="copy" type="button" data-copy="${order.total}">${t("pay.copy")}</button></div>
        <div class="pay-row"><dt>${t("pay.msg")}</dt><dd class="pay-msg">${esc(order.message)}</dd><button class="copy" type="button" data-copy="${esc(order.message)}">${t("pay.copy")}</button></div>
      </dl>
      <p class="fineprint">${t("pay.msgWhy")}</p>`}
      ${closed ? "" : `<p class="fineprint">${t(paid ? "pay.afterPaid" : "pay.after", { e: esc(order.email) })}</p>`}
    </div>
    ${open ? `<button class="btn block" type="button" id="pay-check">${t("pay.check")}</button><p class="msg" id="pay-msg" role="status"></p>` : ""}
    <button class="btn line block" type="button" id="pay-done">${t("close")}</button>
    ${canCancel(order) ? `<div class="pay-cancel" id="pay-cancel">
      <button class="link-btn" type="button" id="cancel-ask">${t("pay.cancel")}</button>
      <p class="fineprint">${t("pay.cancelHint", { h: CANCEL_HOURS, until: cancelDeadline(order) })}</p>
    </div>` : ""}`;
  $$("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast(t("toast.copied")); } catch { toast(t("toast.copyFail")); }
  }));
  $("#pay-done").addEventListener("click", () => drawer.close());

  // Merge what the server says into the order kept in this browser, and redraw if the status changed
  const update = (s) => {
    const next = { ...order, status: s.status, created_at: s.created_at || order.created_at };
    saveMyOrder(next);
    return next;
  };

  const check = $("#pay-check");
  if (check) check.addEventListener("click", async () => {
    check.disabled = true;
    const msg = $("#pay-msg"); msg.className = "msg"; msg.textContent = t("pay.checking");
    try {
      const s = await api.status(order.order_code, order.email);
      if (!s) throw new Error("GENERIC");
      const next = update(s);
      if (s.status !== order.status) { showPayment(next); return; }
      msg.textContent = t("pay.stillWaiting");
    } catch (err) { msg.className = "msg err"; msg.textContent = errText(err); }
    check.disabled = false;
  });

  // Cancel: first ask, then cancel on the server (which checks the 24 hours and that it is not paid)
  const box = $("#pay-cancel");
  if (box) $("#cancel-ask").addEventListener("click", () => {
    box.innerHTML = `<p><b>${t("pay.cancelSure", { c: esc(order.order_code) })}</b></p>
      <p class="fineprint">${t("pay.cancelPaidNote")}</p>
      <div class="pay-cancel-actions">
        <button class="btn" type="button" id="cancel-yes">${t("pay.cancelYes")}</button>
        <button class="btn line" type="button" id="cancel-no">${t("pay.cancelNo")}</button>
      </div>
      <p class="msg" id="cancel-msg" role="status"></p>`;
    $("#cancel-no").addEventListener("click", () => showPayment(order));
    $("#cancel-yes").addEventListener("click", async (e) => {
      e.target.disabled = true;
      const msg = $("#cancel-msg");
      try {
        const s = await api.cancel(order.order_code, order.email);
        showPayment(update({ ...s, status: s.status || "cancelled" }));
        toast(t("toast.cancelled"));
      } catch (err) {
        msg.className = "msg err"; msg.textContent = errText(err);
        e.target.disabled = false;
        // The server knows best (e.g. Laura marked it as paid meanwhile): refresh the status
        try { const s = await api.status(order.order_code, order.email); if (s && s.status !== order.status) setTimeout(() => showPayment(update(s)), 2500); } catch {}
      }
    });
  });

  // Auto-poll for status changes while drawer is open (unless order is already complete)
  if (open) {
    const poll = setInterval(async () => {
      if (!drawer.open) { clearInterval(poll); return; }
      try {
        const s = await api.status(order.order_code, order.email);
        if (s && s.status !== order.status) {
          clearInterval(poll);
          showPayment(update(s));
        }
      } catch {}
    }, 5000); // Poll every 5 seconds
  }
}

// "kl. 14:30 i morgen" style end of the cancel window, in the visitor's language
function cancelDeadline(o) {
  const end = new Date(Date.parse(o.created_at) + CANCEL_HOURS * 36e5);
  return end.toLocaleString(locale(), { weekday: "long", hour: "2-digit", minute: "2-digit" });
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

/* The logo and "Forside" links point to index.html#top. Arriving that way already lands at the top;
   drop the #top from the address bar so a later refresh is a normal refresh (keeps its scroll
   position) instead of a jump to the top on top of the browser's own scroll restore. */
if (location.hash === "#top") history.replaceState(null, "", location.pathname + location.search);

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

  const io = new IntersectionObserver(es => es.forEach(x => {
    if (x.isIntersecting) { x.target.classList.add("visible"); io.unobserve(x.target); x.target.querySelectorAll(".vine").forEach(tryPaint); }
  }), { threshold: 0.1 });
  $$(".reveal").forEach(el => io.observe(el));

  /* Hand-drawn vine under the section headings, different for every heading and every page load
     (see makeVine). It is a sibling (not inside the heading), because the language switch
     rewrites the heading's HTML. Painted in by a little brush when scrolled into view (see paintVine). */
  const heads = $$("main .h-section, main .h-display");
  if (!document.getElementById("vine-paint")) {
    // Shared filter that gives the vines rough, painted edges
    document.body.insertAdjacentHTML("beforeend",
      `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="vine-paint" x="-20%" y="-60%" width="140%" height="220%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
  }
  /* Start painting only when someone can actually watch it: the vine is mostly on screen,
     the tab is in front, and any fade-in (.reveal) around it has finished. Every page load
     starts from a blank vine, so a refresh paints it again. */
  const vio = new IntersectionObserver(es => es.forEach(x => { x.target._inView = x.isIntersecting; tryPaint(x.target); }), { threshold: 0.6 });
  function tryPaint(v) {
    if (v._painting || v._waiting || !v._inView || document.hidden) return;
    const rev = v.closest(".reveal");
    if (rev && !rev.classList.contains("visible")) return;   // tried again when the block is revealed
    // Wait a moment (and for any fade-in to finish), then check it is still in view: while a page
    // loads, the browser can jump past a vine (scroll restore, #anchors) and that must not count
    v._waiting = true;
    setTimeout(() => {
      v._waiting = false;
      if (!v._inView || document.hidden) return;              // left again: tried on the next visit
      v._painting = true;
      vio.unobserve(v);
      paintVine(v);
    }, rev ? 600 : 250);
  }
  document.addEventListener("visibilitychange", () => $$(".vine").forEach(tryPaint));
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

/* ---------- Hand-painted motifs (SVG) under the section headings ----------
   Every heading gets its own little painting: a vine with a flower, a ginkgo twig, wildflowers,
   lavender or a berry branch, randomised on every page load (no motif repeats until all are used).
   Everything stays inside the 240 × 44 drawing, so it never reaches the heading above or the text below.
   makeVine returns the SVG plus a plan for the brush: strokes along lines (things appear as the
   brush passes them), dabs (petals, berries, dots) and paint colour changes. paintVine plays it. */
const VINE_MOTIFS = { vine: motifVine, ginkgo: motifGinkgo, wildflowers: motifWildflowers, lavender: motifLavender, berries: motifBerries };
let vineBag = [], vineLast = "";
function makeVine(only) {
  if (!vineBag.length) {
    vineBag = Object.keys(VINE_MOTIFS).sort(() => Math.random() - 0.5);
    if (vineBag[vineBag.length - 1] === vineLast) vineBag.reverse();   // no repeat across refills
  }
  const motif = only || (vineLast = vineBag.pop());
  const P = vinePainter();
  VINE_MOTIFS[motif](P);
  return P.done();
}

/* Drawing kit shared by the motifs: adds SVG pieces and records what the brush does */
function vinePainter(W = 240, H = 44) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const f = (n) => n.toFixed(1);
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  let svg = "", n = 0, paint = "var(--green-mid)";
  const steps = [];
  const LEAF = "M0 0c4-6 12-7 17-4c-4 5-12 7-17 4z";   // points along +x from (0,0)
  const P = {
    rnd, pick, f, clamp,
    greens: ["#7a9e6e", "#4a6741", "#93b386", "#5f7f52", "#6d8f5f"],
    golds: ["#b8902f", "#c79a3a", "#9c7a2a"],
    blooms: [
      ["#f1d7ca", "#c4877b"],   // blush
      ["#f6e6a8", "#c9a74a"],   // butter yellow
      ["#ddd3ee", "#9a87b8"],   // lavender
      ["#fbf8f1", "#b9ae9a"],   // white
      ["#f5c2b3", "#c97a66"],   // coral
      ["#d4e4ef", "#7f9fb5"],   // sky blue
      ["#ecc6cf", "#b0707f"]    // rose
    ],
    add(s) { svg += s; },
    // Switch the paint on the brush (only recorded when it actually changes)
    color(c) { if (c !== paint) { steps.push({ color: c }); paint = c; } },
    // A painted line through pts. Things in `reveal` ({at: 0..1 along the line, id}) appear as the brush passes.
    line(pts, { width = 2.2, color = "var(--green-mid)", ms = 600, streak = false, reveal = [] } = {}) {
      const d = "M" + pts.map(p => f(p[0]) + " " + f(p[1])).join("L");
      const ids = [n++];
      svg += `<path class="v-line" data-p="${ids[0]}" pathLength="1" d="${d}" style="stroke:${color};stroke-width:${width}"/>`;
      if (streak) {   // a thin, lighter streak beside it, like the dry edge of the brush
        ids.push(n++);
        svg += `<path class="v-line v-streak" data-p="${ids[1]}" pathLength="1" transform="translate(0.5 -0.9)" d="${d}"/>`;
      }
      P.color(color);
      steps.push({ path: pts, els: ids, ms, reveal });
      return ids[0];
    },
    // Brush pass without a line (e.g. lavender buds appearing along a stem)
    sweep(pts, ms, reveal) { steps.push({ path: pts, els: [], ms, reveal }); },
    dab(to, ids, ms = 110) { steps.push({ to, on: [].concat(ids), ms }); },
    // Words in a brush font, written out left to right: a clip opens up to wherever the brush tip is
    write(text, { x, y, len, size = 20, color = "var(--green-dark)", ms = 1200, font = "'Caveat Brush', 'Segoe Print', cursive" }) {
      const id = n++, clip = "vw" + Math.random().toString(36).slice(2, 9), top = y - size * 1.05, h = size * 1.45;
      svg += `<clipPath id="${clip}"><rect data-p="${id}" data-full="${f(len + 12)}" x="${f(x - 6)}" y="${f(top)}" width="0" height="${f(h)}"/></clipPath>` +
        `<text x="${f(x)}" y="${f(y)}" textLength="${f(len)}" lengthAdjust="spacingAndGlyphs" clip-path="url(#${clip})" ` +
        `style="font-family:${font};font-size:${size}px;fill:${color}">${text}</text>`;
      // The brush zigzags along the letters, like writing
      const pts = [], mid = y - size * 0.32;
      for (let k = 0, xx = x - 2; xx <= x + len + 2; xx += 5, k++) pts.push([xx, mid + (k % 2 ? 1 : -1) * size * 0.22 + rnd(-0.8, 0.8)]);
      P.color(color);
      steps.push({ path: pts, els: [], ms, reveal: [], linear: true, wipe: { id, x0: x - 6 } });
      return id;
    },
    // Fraction of the way along pts at the first point at or past x
    atX(pts, x) {
      let L = 0, total = 0, hit = null;
      for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (hit === null && pts[i][0] >= x) hit = total;
      }
      return (hit === null ? total : hit) / (total || 1);
    },
    atIndex(pts, k) {
      let L = 0, total = 0;
      for (let i = 1; i < pts.length; i++) { const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); total += s; if (i <= k) L += s; }
      return L / (total || 1);
    },
    // Smooth curve (quadratic) from a through control c to b, as points
    curve(a, c, b, count = 12) {
      return Array.from({ length: count + 1 }, (_, i) => {
        const t = i / count, u = 1 - t;
        return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
      });
    },
    leaf(x, y, deg, s, color) {
      const id = n++;
      svg += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(deg)}) scale(${s.toFixed(2)})"><path class="v-leaf" data-p="${id}" style="fill:${color}" d="${LEAF}"/></g>`;
      return id;
    },
    // A shape that grows out from its base at (0,0), pointing up before rotation
    grow(d, x, y, deg, s, fill, stroke) {
      const id = n++;
      svg += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(deg)}) scale(${s.toFixed(2)})"><path class="v-grow" data-p="${id}" d="${d}" style="fill:${fill};stroke:${stroke};stroke-width:0.5"/></g>`;
      return id;
    },
    pop(inner) { const id = n++; svg += inner.replace("<POP", `<g class="v-pop" data-p="${id}"`).replace("</POP>", "</g>"); return id; },
    dot(x, y, r, color) { const id = n++; svg += `<circle class="v-pop" data-p="${id}" cx="${f(x)}" cy="${f(y)}" r="${r}" style="fill:${color}"/>`; return id; },
    tendril(x, y, sd) {
      const id = n++;
      svg += `<path class="v-tendril" data-p="${id}" pathLength="1" d="M${f(x)} ${f(y)}c1 ${sd * 7} -8 ${sd * 9} -9 ${sd * 3}c0 ${-sd * 3} 4 ${-sd * 3} 4 0"/>`;
      return id;
    },
    // Flower with petals that grow out from the middle; paintFlower dabs them on one by one
    flower(cx, cy, { colors, count = 5, size = 1 } = {}) {
      const turn = rnd(0, 360 / count), heart = pick(P.golds);
      const petals = Array.from({ length: count }, (_, i) => ({ id: n++, deg: turn + i * 360 / count }));
      const heartId = n++;
      svg += `<g transform="translate(${f(cx)} ${f(cy)}) scale(${size.toFixed(2)})"><g class="v-flower">` +
        petals.map(p => `<g transform="rotate(${f(p.deg)})"><ellipse class="v-grow" data-p="${p.id}" cx="0" cy="-5" rx="${rnd(2.8, 3.4).toFixed(2)}" ry="${rnd(4.8, 5.6).toFixed(2)}" style="fill:${colors[0]};stroke:${colors[1]};stroke-width:0.6"/></g>`).join("") +
        `<circle class="v-pop" data-p="${heartId}" r="2.4" style="fill:${heart}"/></g></g>`;
      return { cx, cy, size, colors, petals, heartId, heart };
    },
    paintFlower(fl, quick) {
      const at = (deg, r) => [fl.cx + r * fl.size * Math.sin(deg * Math.PI / 180), fl.cy - r * fl.size * Math.cos(deg * Math.PI / 180)];
      P.color(fl.colors[1]);
      P.dab([fl.cx, fl.cy], [], 180);
      fl.petals.forEach(p => {
        if (quick) P.dab(at(p.deg, 5), p.id, 60);
        else { P.dab(at(p.deg, 7.5), [], 85); P.dab(at(p.deg, 3), p.id, 70); }
      });
      P.color(fl.heart);
      P.dab([fl.cx, fl.cy], fl.heartId, quick ? 90 : 130);
    },
    // 2 or 3 gold dots above and to the right of a point, well clear of it
    goldDots(cx, cy, color = pick(P.golds), near = 13) {
      const angles = [rnd(15, 35), rnd(45, 60), rnd(70, 85)].slice(0, 2 + Math.floor(Math.random() * 2));
      P.color(color);
      angles.forEach((a, i) => {
        const dist = rnd(near, near + 5), r = [1.7, 1.1, 0.8][i];
        const x = Math.min(cx + Math.cos(a * Math.PI / 180) * dist, W - 2), y = Math.max(cy - Math.sin(a * Math.PI / 180) * dist, 2);
        P.dab([x, y], P.dot(x, y, r, color), 120);
      });
    },
    done() {
      const first = steps.find(s => s.path || s.to);
      const [bx, by] = first ? (first.path ? first.path[0] : first.to) : [4, 22];
      // The paintbrush: bristle tip at (0,0), handle leaning up and to the right
      const brush = `<g class="v-brush" transform="translate(${f(bx)} ${f(by)})">
        <line class="handle" x1="5.6" y1="-10.5" x2="15" y2="-29"/>
        <line class="ferrule" x1="3" y1="-5.4" x2="5.8" y2="-10.9"/>
        <path class="bristles" d="M0 0C-1.4-1.6-.2-4.6 1.6-6.2L4.6-4.7C4.2-2.4 2.4-.4 0 0z"/></g>`;
      const html = `<svg viewBox="0 0 ${W} ${H}" focusable="false"><g class="v-art">${svg}</g>${brush}</svg>`;
      return { html, plan: { steps } };
    }
  };
  return P;
}

/* Vine: a wavy stem with leaves, sometimes a curl, a flower at the end and gold dots */
function motifVine(P) {
  const { rnd, pick, clamp } = P;
  const MID = 22, END = 202;
  const amp = rnd(2.5, 4.2), waves = rnd(0.9, 1.6), phase = rnd(0, Math.PI * 2);
  const k = (Math.PI * 2 * waves) / (END - 4);
  const y = (x) => MID + amp * Math.sin(k * x + phase);
  const slope = (x) => amp * k * Math.cos(k * x + phase);
  const pts = [];
  for (let x = 4; x <= END; x += 4) pts.push([x, y(x)]);
  const reveal = [];
  P.line(pts, { width: 2.2, streak: true, ms: 1500, reveal });

  // Leaves: 3 to 5, one per slot, alternating above and below the stem, always pointing forward
  const n = 3 + Math.floor(Math.random() * 3);
  const from = 20, to = 172, slot = (to - from) / n;
  let side = Math.random() < 0.5 ? -1 : 1;
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const x = from + slot * (i + 0.5) + rnd(-0.18, 0.18) * slot;
    const s = rnd(0.75, 1.12), stemDeg = Math.atan(slope(x)) * 180 / Math.PI;
    let off = rnd(35, 58);
    const tipY = () => y(x) + Math.sin((stemDeg + side * off) * Math.PI / 180) * 17 * s;
    while ((tipY() < 3 || tipY() > 41) && off > 20) off -= 4;
    reveal.push({ at: P.atX(pts, x), id: P.leaf(x, y(x), stemDeg + side * off, s, pick(P.greens)) });
    leaves.push({ x, side });
    side = -side;
  }
  // A curl in the widest gap between two leaves, on the side of the leaf after the gap
  if (n > 1 && Math.random() < 0.75) {
    let g = 0;
    for (let i = 1; i < n - 1; i++) if (leaves[i + 1].x - leaves[i].x > leaves[g + 1].x - leaves[g].x) g = i;
    const cx = (leaves[g].x + leaves[g + 1].x) / 2;
    reveal.push({ at: P.atX(pts, cx), id: P.tendril(cx, y(cx), leaves[g + 1].side) });
  }
  const fx = 212, fy = clamp(y(END), 12, 32);
  const fl = P.flower(fx, fy, { colors: pick(P.blooms), count: Math.random() < 0.6 ? 5 : 6 });
  P.paintFlower(fl);
  P.goldDots(fx, fy, fl.heart);
}

/* Ginkgo: a thin twig with golden fan-shaped leaves (like the gold ginkgo leaves in the paintings) */
function motifGinkgo(P) {
  const { rnd, pick } = P;
  const GINKGO = "M-.4 0L.4 0L.6-5L7.6-11.2C6-15.2 2.4-16 .3-14.6L0-13.2L-.3-14.6C-2.4-16-6-15.2-7.6-11.2L-.6-5Z";
  const fills = ["#d9b84f", "#c9a23e", "#bfb45c", "#a8b86b", "#e3c86a"];
  const y0 = rnd(27, 31), rise = rnd(4, 8), amp = rnd(1, 2.2), ph = rnd(0, Math.PI * 2);
  const y = (x) => y0 - rise * (x - 6) / 190 + amp * Math.sin(x / 30 + ph);
  const pts = [];
  for (let x = 6; x <= 196; x += 4) pts.push([x, y(x)]);
  const reveal = [];
  P.line(pts, { width: 1.9, color: "#8a7556", ms: 1400, reveal });
  const n = 4 + Math.floor(Math.random() * 3), slot = 150 / n;
  let up = true;
  for (let i = 0; i < n; i++) {
    const x = 22 + slot * (i + 0.5) + rnd(-0.2, 0.2) * slot;
    const deg = up ? rnd(5, 40) : rnd(125, 150), s = up ? rnd(0.8, 1.05) : rnd(0.6, 0.78);
    reveal.push({ at: P.atX(pts, x), id: P.grow(GINKGO, x, y(x), deg, s, pick(fills), "#9c7a2a") });
    up = Math.random() < 0.65 ? !up : up;
  }
  reveal.push({ at: 1, id: P.grow(GINKGO, 196, y(196), rnd(55, 75), 1.05, pick(fills), "#9c7a2a") });
  P.goldDots(204, y(196) - 2, pick(P.golds), 16);
}

/* Wildflowers: a strip of ground with three or four flowers on thin stems */
function motifWildflowers(P) {
  const { rnd, pick } = P;
  const base = rnd(36, 39), ph = rnd(0, Math.PI * 2);
  const gy = (x) => base + 1.2 * Math.sin(x / 18 + ph);
  const ground = [];
  for (let x = 6; x <= 232; x += 6) ground.push([x, gy(x)]);
  P.line(ground, { width: 1.5, color: "var(--green-light)", ms: 700 });
  const m = 3 + (Math.random() < 0.4 ? 1 : 0), slot = 196 / m;
  const palette = [["#fbf8f1", "#b9ae9a"], ...[...P.blooms].sort(() => Math.random() - 0.5)];
  for (let i = 0; i < m; i++) {
    const x = 24 + slot * (i + 0.5) + rnd(-0.2, 0.2) * slot;
    const a = [x, gy(x)], b = [x + rnd(-8, 14), rnd(9, 17)], c = [x + rnd(-10, 10), (a[1] + b[1]) / 2];
    const pts = P.curve(a, c, b, 10);
    const reveal = [];
    P.line(pts, { width: 1.3, color: "var(--green-mid)", ms: 420, reveal });
    // One small leaf part way up the stem
    const k = 4 + Math.floor(Math.random() * 2), p0 = pts[k], p1 = pts[k + 1];
    const dir = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI, side = Math.random() < 0.5 ? -1 : 1;
    reveal.push({ at: P.atIndex(pts, k), id: P.leaf(p0[0], p0[1], dir + side * rnd(35, 55), rnd(0.5, 0.65), pick(P.greens)) });
    const fl = P.flower(b[0], b[1], { colors: palette[i % palette.length], count: 5 + Math.floor(Math.random() * 3), size: rnd(0.55, 0.68) });
    P.paintFlower(fl, true);
  }
}

/* Lavender: a few stems lying on their side, purple buds along the tips, tied with a gold band */
function motifLavender(P) {
  const { rnd, pick } = P;
  const purples = ["#9a87b8", "#8a76b0", "#b3a2d1", "#7d68a6"];
  const bx = rnd(8, 14), by = rnd(29, 33);
  const tips = [[rnd(178, 214), rnd(9, 14)], [rnd(196, 226), rnd(18, 24)], [rnd(160, 200), rnd(28, 33)]];
  if (Math.random() < 0.35) tips.splice(Math.floor(Math.random() * 3), 1);
  const stems = tips.map(t => P.curve([bx, by], [(bx + t[0]) / 2, (by + t[1]) / 2 + rnd(-6, 2)], t, 16));
  stems.forEach(pts => P.line(pts, { width: 1.2, color: "#6d8f5f", ms: 600 }));
  // Buds along the last part of each stem, painted on in a second pass with purple
  P.color(pick(purples));
  stems.forEach(pts => {
    const from = 9, part = pts.slice(from), reveal = [];
    part.forEach((p, j) => {
      if (j === 0) return;
      const q = part[j - 1], dir = Math.atan2(p[1] - q[1], p[0] - q[0]) * 180 / Math.PI;
      [-1, 1].forEach(sd => {
        const ox = -Math.sin(dir * Math.PI / 180) * 1.3 * sd, oy = Math.cos(dir * Math.PI / 180) * 1.3 * sd;
        const id = P.pop(`<g transform="translate(${P.f(p[0] + ox)} ${P.f(p[1] + oy)}) rotate(${P.f(dir + 90 + sd * 35)})"><POP><ellipse rx="1.4" ry="2.5" style="fill:${pick(purples)}"/></POP></g>`);
        reveal.push({ at: P.atIndex(part, j), id });
      });
    });
    P.sweep(part, 520, reveal);
  });
  // Gold band around the stems near the base
  const tx = bx + 24, ys = stems.map(pts => pts.reduce((best, p) => Math.abs(p[0] - tx) < Math.abs(best[0] - tx) ? p : best)[1]);
  P.line([[tx - 1.2, Math.min(...ys) - 2.6], [tx + 1.2, Math.max(...ys) + 2.6]], { width: 2.4, color: pick(P.golds), ms: 220 });
}

/* Berries: a branch with a few leaves and one or two hanging clusters of berries */
function motifBerries(P) {
  const { rnd, pick } = P;
  const kind = pick([["#b5473a", "#8e3328"], ["#4f5d8a", "#3a4670"], ["#d0703a", "#a8552a"], ["#7a3b5c", "#5b2a44"]]);
  const MID = rnd(17, 21), amp = rnd(2, 3.4), ph = rnd(0, Math.PI * 2);
  const y = (x) => MID + amp * Math.sin(x / 34 + ph);
  const pts = [];
  for (let x = 6; x <= 214; x += 4) pts.push([x, y(x)]);
  const reveal = [];
  P.line(pts, { width: 1.9, color: "#6b5b3f", ms: 1400, reveal });
  const clusters = [rnd(62, 92), rnd(142, 178)];
  if (Math.random() < 0.3) clusters.pop();
  // Leaves where there are no berries, alternating sides, pointing forward
  let side = Math.random() < 0.5 ? -1 : 1;
  for (let x = 18 + rnd(0, 10); x < 206; x += rnd(26, 36)) {
    if (clusters.some(c => Math.abs(c - x) < 16)) continue;
    const s = rnd(0.7, 0.95), deg = Math.atan(amp / 34 * Math.cos(x / 34 + ph)) * 180 / Math.PI + side * rnd(30, 48);
    reveal.push({ at: P.atX(pts, x), id: P.leaf(x, y(x), deg, s, pick(P.greens)) });
    side = -side;
  }
  const layout = [[0, 0], [-4, 2.1], [3.8, 2.3], [-0.4, 5], [4.2, -2]];
  clusters.forEach(cx => {
    const hang = [cx, y(cx)], c = [cx + rnd(2, 5), y(cx) + rnd(8, 9.5)];
    P.line([hang, [(hang[0] + c[0]) / 2 + 1, (hang[1] + c[1]) / 2], c], { width: 0.9, color: "#6b5b3f", ms: 160 });
    P.color(kind[0]);
    layout.slice(0, 3 + Math.floor(Math.random() * 3)).forEach(([ox, oy]) => {
      const x = c[0] + ox, yy = c[1] + oy, r = rnd(2.5, 3.1);
      const id = P.pop(`<POP><circle cx="${P.f(x)}" cy="${P.f(yy)}" r="${r.toFixed(2)}" style="fill:${kind[0]};stroke:${kind[1]};stroke-width:0.5"/>` +
        `<circle cx="${P.f(x - r * 0.35)}" cy="${P.f(yy - r * 0.35)}" r="${(r * 0.28).toFixed(2)}" style="fill:#fff;opacity:0.7"/></POP>`);
      P.dab([x, yy], id, 95);
    });
  });
}

/* Play a motif's plan: the brush paints the lines (things appear as it passes), dabs the
   petals, berries and dots, changes paint when the plan says so, then lifts away. */
function paintVine(v) {
  const plan = v._plan, svg = v.querySelector("svg");
  if (!svg) return;
  const brush = svg.querySelector(".v-brush"), bristles = svg.querySelector(".bristles");
  const byId = {};
  svg.querySelectorAll("[data-p]").forEach(e => byId[e.dataset.p] = e);
  const on = (id) => byId[id] && byId[id].classList.add("on");
  const finish = () => {
    Object.values(byId).forEach(e => {
      if (e.classList.contains("v-line")) { e.style.strokeDashoffset = 0; e.classList.add("go"); }
      else if (e.dataset.full) e.setAttribute("width", e.dataset.full);   // written words: fully shown
      else e.classList.add("on");
    });
    if (brush) brush.remove();
    v.classList.add("painted");
  };
  if (!plan || matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();

  // Fly the brush to the start of each line (in the air), and measure the lines
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const steps = [];
  let pos = null;
  plan.steps.forEach(s => {
    if (s.path) {
      if (pos && dist(pos, s.path[0]) > 1.5) steps.push({ to: s.path[0], ms: Math.min(150 + dist(pos, s.path[0]) * 3, 340), air: true });
      const cum = [0];
      for (let i = 1; i < s.path.length; i++) cum.push(cum[i - 1] + dist(s.path[i], s.path[i - 1]));
      steps.push({ ...s, cum, total: cum[cum.length - 1] || 1 });
      pos = s.path[s.path.length - 1];
    } else {
      steps.push(s);
      if (s.to) pos = s.to;
    }
  });
  steps.push({ ms: 450, lift: true });

  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const pointAt = (s, p) => {
    const L = p * s.total;
    let i = 1;
    while (i < s.cum.length - 1 && s.cum[i] < L) i++;
    const a = s.path[i - 1], b = s.path[i], u = Math.min(Math.max((L - s.cum[i - 1]) / ((s.cum[i] - s.cum[i - 1]) || 1), 0), 1);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  const place = ([x, y], tilt) => brush.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${tilt.toFixed(1)})`);

  let i = 0, t0 = null;
  let from = (steps.find(s => s.path || s.to) || {}).path?.[0] || [4, 22];
  const frame = (now) => {
    if (v._plan !== plan) return;   // a new painting replaced this one (e.g. "paint it again")
    while (i < steps.length && steps[i].color) { bristles.style.fill = steps[i].color; i++; }
    const s = steps[i];
    if (t0 === null) { t0 = now; if (s.path) s.els.forEach(id => byId[id] && byId[id].classList.add("go")); }
    const t = Math.min((now - t0) / s.ms, 1);
    if (s.path) {
      const p = s.linear ? t : 1 - Math.pow(1 - t, 1.6), at = pointAt(s, p);
      s.els.forEach(id => byId[id] && (byId[id].style.strokeDashoffset = 1 - p));
      if (s.wipe && byId[s.wipe.id]) byId[s.wipe.id].setAttribute("width", Math.max(0, at[0] - s.wipe.x0 + 1).toFixed(1));
      s.reveal.forEach(r => { if (r.at <= p + 0.001) on(r.id); });
      place(at, Math.sin(now / 110) * 4);   // a slight wobble, like a hand
      if (t === 1) from = s.path[s.path.length - 1];
    } else if (s.lift) {
      const e = ease(t);
      place([from[0] + 14 * e, from[1] - 18 * e], -10 * e);
      brush.style.opacity = 1 - t;
    } else {
      const e = ease(t), hop = s.air ? Math.min(2.5 + dist(from, s.to) * 0.12, 9) : 2.5;
      place([from[0] + (s.to[0] - from[0]) * e, from[1] + (s.to[1] - from[1]) * e - Math.sin(t * Math.PI) * hop], -6 * Math.sin(t * Math.PI));
      if (t === 1) { from = s.to; (s.on || []).forEach(on); }
    }
    if (t === 1) { i++; t0 = null; }
    if (i < steps.length) requestAnimationFrame(frame);
    else finish();
  };
  requestAnimationFrame(frame);
}
