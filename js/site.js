/* Shared code for every page: database calls, basket and checkout,
   the phone menu, countdowns and small helpers. */

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- Language: Danish by default, English as an option ---------- */
let LANG = (() => { try { return localStorage.getItem("lk-lang") || CONFIG.defaultLanguage || "da"; } catch { return "da"; } })();
const locale = () => LANG === "en" ? "en-GB" : "da-DK";
/* t("key", {n: 3}) returns the text for the current language */
function t(key, vars = {}) {
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
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || "");
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

/* A print shown on paper inside the wooden frame (images/frame.png) */
function printMockupHTML(a) {
  const title = L(a.title);
  return `<div class="mock">
    <div class="mock-paper"><img src="${esc(a.image)}" alt="${esc(title)}, print 50 × 70 cm" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('noimg')"><span class="ph">${esc(title)}</span></div>
    <img class="mock-frame" src="images/frame.png" alt="" aria-hidden="true" width="574" height="788" loading="lazy" decoding="async">
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
    row.innerHTML = `<a class="social-pill" href="${esc(c.instagram.url)}" target="_blank" rel="noopener">${ICONS.instagram}${esc(c.instagram.handle)}</a>
      <a class="social-pill" href="${esc(c.tiktok.url)}" target="_blank" rel="noopener">${ICONS.tiktok}${esc(c.tiktok.handle)}</a>`;
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
    order: (o) => rpc("place_order", { p_name: o.name, p_email: o.email, p_phone: o.phone, p_address: o.address, p_delivery: o.delivery, p_items: o.items }),
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
      prints: ARTWORKS.map(a => ({ artwork_id: a.id, stock: 10, edition_size: 50, sold: 0, price_unsigned: 450, price_signed: 750 })),
      orders: [], waitlist: []
    };
  }
  if (!db) { db = seed(); local.set(KEY, db); }
  else if (db.scheduleVersion !== SCHEDULE_VERSION) {
    db.auctions.forEach(a => { if (AUCTION_SCHEDULE[a.artwork_id]) Object.assign(a, AUCTION_SCHEDULE[a.artwork_id]); });
    db.scheduleVersion = SCHEDULE_VERSION;
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
    order({ name, email, phone, address, delivery, items }) {
      if ((name || "").trim().length < 2) return fail("NAME");
      if (!validEmail(email)) return fail("EMAIL");
      if (delivery === "ship" && (address || "").trim().length < 8) return fail("ADDRESS");
      if (!items.length) return fail("EMPTY");
      for (const it of items) {
        const p = db.prints.find(x => x.artwork_id === it.artwork_id);
        if (!p || p.stock < it.qty) return fail("STOCK:" + (p ? p.stock : 0) + ":" + artById(it.artwork_id)?.title);
      }
      let total = 0;
      for (const it of items) {
        const p = db.prints.find(x => x.artwork_id === it.artwork_id);
        p.stock -= it.qty; p.sold += it.qty; total += it.qty * (it.signed ? p.price_signed : p.price_unsigned);
      }
      if (delivery === "ship") total += CONFIG.shipping.ship;
      const order_code = "LK-" + (10000 + Math.floor(Math.random() * 90000));
      db.orders.push({ order_code, name, email, phone, address, delivery, items, total, created_at: new Date().toISOString() });
      save(); return ok({ order_code, total });
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
  const p = printFor(artwork_id);
  const room = p ? p.stock - inBasket(artwork_id) : 0;
  if (qty > room) { toast(room > 0 ? t("toast.onlyLeft", { n: room }) : t("toast.none")); return false; }
  const ex = basket.find(i => i.artwork_id === artwork_id && i.signed === signed);
  if (ex) ex.qty = Math.min(5, ex.qty + qty); else basket.push({ artwork_id, signed, qty });
  saveBasket(); bumpBasket();
  toast(t("toast.added", { t: artById(artwork_id).title }), { label: t("toast.view"), onClick: openBasket });
  return true;
}

/* Basket drawer, built once and shared by every page */
let drawer, delivery = "ship";
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
    body.innerHTML = `<p class="lede">${t("basket.empty")}</p><a class="btn line" href="gallery.html">${t("basket.see")}</a>`;
    return;
  }
  const ship = delivery === "ship" ? CONFIG.shipping.ship : CONFIG.shipping.pickup;
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
      </div>
      <button class="btn block" type="submit">${t("basket.submit")}</button>
      <p class="msg" id="co-msg" role="status"></p>
      <p class="fineprint">${t("basket.held", { h: CONFIG.reserveHours })}</p>
    </form>`;
  $$("[data-rm]", body).forEach(b => b.addEventListener("click", () => { basket.splice(+b.dataset.rm, 1); saveBasket(); renderBasket(); }));
  const form = $("#checkout");
  $$("input[name=delivery]", form).forEach(r => r.addEventListener("change", () => { delivery = r.value; renderBasket(); }));
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
    const r = await api.order({ name: f.name.trim(), email: f.email.trim(), phone: (f.phone || "").trim(), address: f.address || "", delivery: f.delivery, items });
    local.set("lk-me", { ...local.get("lk-me", {}), name: f.name.trim(), email: f.email.trim(), phone: (f.phone || "").trim() });
    basket = []; saveBasket();
    try { await loadPrints(); } catch {}
    document.dispatchEvent(new CustomEvent("prints:change"));
    showPayment(r.order_code, r.total, f.email.trim());
  } catch (err) {
    msg.className = "msg err"; msg.textContent = errText(err); btn.disabled = false;
    try { await loadPrints(); document.dispatchEvent(new CustomEvent("prints:change")); } catch {}
  }
}

function showPayment(code, total, email) {
  drawer.dataset.paid = "1";
  $("#drawer-title").textContent = t("pay.head");
  const mp = CONFIG.mobilepay;
  $("#drawer-body").innerHTML = `
    <div class="pay-box">
      <h3>${t("pay.title")}</h3>
      <p>${t("pay.text", { h: CONFIG.reserveHours })}</p>
      <dl>
        <div class="pay-row"><dt>${t("pay.amount")}</dt><dd>${kr(total)}</dd><button class="copy" type="button" data-copy="${total}">${t("pay.copy")}</button></div>
        <div class="pay-row"><dt>${t("pay.to")}</dt><dd>${esc(mp.number)}</dd><button class="copy" type="button" data-copy="${esc(mp.number.replace(/\s/g, ""))}">${t("pay.copy")}</button></div>
        <div class="pay-row"><dt>${t("pay.name")}</dt><dd>${esc(mp.name)}</dd></div>
        <div class="pay-row"><dt>${t("pay.msg")}</dt><dd>${esc(code)}</dd><button class="copy" type="button" data-copy="${esc(code)}">${t("pay.copy")}</button></div>
      </dl>
      <p class="fineprint">${t("pay.after", { e: esc(email) })}</p>
    </div>
    <button class="btn line block" type="button" id="pay-done">${t("close")}</button>`;
  $$("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast(t("toast.copied")); } catch { toast(t("toast.copyFail")); }
  }));
  $("#pay-done").addEventListener("click", () => drawer.close());
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

  $$(".year").forEach(y => y.textContent = new Date().getFullYear());

  if (!LIVE) {
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = `<div class="wrap"><span></span><button type="button"></button></div>`;
    bar.querySelector("button").addEventListener("click", () => { api.reset(); local.set("lk-mybids", {}); local.set("lk-basket", []); location.reload(); });
    document.body.appendChild(bar);
  }

  fillSocialRows();
  $$(".lang-btn").forEach(b => b.addEventListener("click", () => setLang(LANG === "da" ? "en" : "da")));
  applyLang();
});
