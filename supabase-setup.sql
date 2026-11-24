-- ============================================================
--  Laura Kruuse: shop and auction database (Supabase / Postgres)
--  Paste this whole file into Supabase → SQL Editor → Run.
--  Safe to read top to bottom; edit the SEED section at the end.
-- ============================================================

-- ---------- Tables ----------
create table if not exists auctions (
  artwork_id      text primary key,          -- must match the id in js/config.js (e.g. 'vestige')
  title           text not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  start_price     integer not null default 5000,  -- DKK
  min_increment   integer not null default 250,   -- DKK
  extend_minutes  integer not null default 5      -- a bid in the last N minutes extends the auction by N minutes
);

create table if not exists bids (
  id          bigserial primary key,
  artwork_id  text not null references auctions(artwork_id),
  bidder_name text not null,
  email       text not null,
  phone       text,
  amount      integer not null,
  created_at  timestamptz not null default now()
);

create table if not exists prints (
  artwork_id     text primary key,           -- must match the id in js/config.js
  title          text not null,
  stock          integer not null default 0, -- not used any more (no stock limit), kept so old data still loads
  edition_size   integer not null default 50,
  sold           integer not null default 0,
  price_unsigned integer not null,           -- DKK
  price_signed   integer not null,           -- DKK (signed + numbered)
  active         boolean not null default true
);

create table if not exists orders (
  id          bigserial primary key,
  order_code  text unique not null,
  name        text not null,
  email       text not null,
  phone       text,
  address     text,
  delivery    text not null,                 -- 'ship' or 'pickup'
  items       jsonb not null,
  total       integer not null,
  status      text not null default 'awaiting_payment',  -- see "Order status" further down
  created_at  timestamptz not null default now()
);
-- Added later: safe to run again on a database made with an older version of this file
alter table orders add column if not exists mobilepay_message text;   -- the exact text the buyer writes in MobilePay
alter table orders add column if not exists paid_at timestamptz;
-- Payment plan: 'full' = everything with MobilePay now; 'deposit' = part now, the rest at pickup (pickup only)
alter table orders add column if not exists payment_plan text not null default 'full';
alter table orders add column if not exists pay_now integer;               -- what to MobilePay now
alter table orders add column if not exists pay_later integer not null default 0;  -- what to pay at pickup

create table if not exists waitlist (
  id          bigserial primary key,
  email       text not null,
  topic       text not null,                 -- e.g. 'auction:florere', 'stickers', 'sizes'
  created_at  timestamptz not null default now(),
  unique (email, topic)
);

-- ---------- Security ----------
-- Errors are short codes (like BID_TOO_LOW:5250). The website turns them into Danish or English.
-- Visitors can READ auctions and prints, nothing else.
-- Bids, orders and the waitlist (which hold e-mails) can only be written through the
-- functions below and only read by Laura in the Supabase dashboard.
alter table auctions enable row level security;
alter table bids     enable row level security;
alter table prints   enable row level security;
alter table orders   enable row level security;
alter table waitlist enable row level security;

-- Spelled out, so it does not depend on Supabase's default settings: visitors may read auctions and
-- prints; they can never write to any table directly (only through the functions further down).
grant select on auctions, prints to anon, authenticated;
revoke insert, update, delete on auctions, bids, prints, orders, waitlist from anon, authenticated;
revoke select on bids, orders, waitlist from anon, authenticated;

drop policy if exists "public read auctions" on auctions;
create policy "public read auctions" on auctions for select using (true);
drop policy if exists "public read prints" on prints;
create policy "public read prints" on prints for select using (true);

-- ---------- Public auction status (no e-mails exposed) ----------
create or replace function auction_state()
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select a.artwork_id, a.starts_at, a.ends_at, a.start_price, a.min_increment,
           (select max(amount) from bids b where b.artwork_id = a.artwork_id) as top_bid,
           (select count(*)    from bids b where b.artwork_id = a.artwork_id) as bid_count,
           (select coalesce(json_agg(r), '[]'::json) from (
              select b.id, b.amount, b.created_at,
                     split_part(b.bidder_name, ' ', 1) ||
                       case when position(' ' in trim(b.bidder_name)) > 0
                            then ' ' || left(split_part(trim(b.bidder_name), ' ', 2), 1) || '.'
                            else '' end as name
              from bids b where b.artwork_id = a.artwork_id
              order by b.amount desc limit 8) r) as recent
    from auctions a
  ) t;
$$;

-- ---------- Place a bid (all rules checked on the server) ----------
create or replace function place_bid(p_artwork text, p_name text, p_email text, p_phone text, p_amount integer)
returns json language plpgsql security definer set search_path = public as $$
declare a auctions; top integer; min_bid integer; new_id bigint;
begin
  select * into a from auctions where artwork_id = p_artwork for update;
  if not found then raise exception 'NOT_AUCTION'; end if;
  if now() < a.starts_at then raise exception 'NOT_OPEN'; end if;
  if now() > a.ends_at  then raise exception 'ENDED'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'NAME'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'EMAIL'; end if;
  if p_amount > 10000000 then raise exception 'AMOUNT'; end if;

  select max(amount) into top from bids where artwork_id = p_artwork;
  min_bid := case when top is null then a.start_price else top + a.min_increment end;
  if p_amount < min_bid then
    raise exception 'BID_TOO_LOW:%', min_bid;
  end if;

  insert into bids (artwork_id, bidder_name, email, phone, amount)
  values (p_artwork, trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone,'')), ''), p_amount)
  returning id into new_id;

  -- anti-sniping: a late bid pushes the end time back
  if a.ends_at - now() < make_interval(mins => a.extend_minutes) then
    update auctions set ends_at = now() + make_interval(mins => a.extend_minutes) where artwork_id = p_artwork;
  end if;

  return json_build_object('id', new_id, 'amount', p_amount);
end $$;

-- ---------- Order prints ----------
-- Prints are made to order (no stock limit) and are all signed and numbered.
-- These rules are checked here on the server, so nobody can get around them in the browser:
--   * the price comes from the prints table, never from the browser
--   * one person (same e-mail or same phone number) can buy at most 10 of each print in total.
--     Paid orders count, and so do unpaid orders that are still inside the 48 hour payment window.
--   * an order is NOT approved when it is placed. It waits as 'awaiting_payment' until Laura
--     has seen the MobilePay payment and sets the status to 'paid' (see "Order status" below).
--   * with pickup, the buyer may pay a deposit now (deposit_percent of the total, rounded up to
--     whole kroner) and the rest in person at pickup. With shipping, everything is paid now.
-- Keep these numbers the same as in js/config.js (maxPerPerson, reserveHours, shipping.ship, depositPercent).
drop function if exists place_order(text, text, text, text, text, jsonb);   -- the older version without p_plan
create or replace function place_order(p_name text, p_email text, p_phone text, p_address text,
                                       p_delivery text, p_items jsonb, p_plan text default 'full')
returns json language plpgsql security definer set search_path = public as $$
declare
  max_per_person  constant integer := 10;
  hold_hours      constant integer := 48;
  ship_price      constant integer := 59;
  deposit_percent constant integer := 50;
  v_plan text := coalesce(p_plan, 'full'); v_now integer; v_later integer := 0; v_zip text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
  item jsonb; p prints; v_art text; qty integer; already integer; total integer := 0;
  wanted jsonb := '{}'::jsonb; lines jsonb := '[]'::jsonb; code text; msg text := '';
begin
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'NAME'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'EMAIL'; end if;
  if p_delivery not in ('ship','pickup') then raise exception 'DELIVERY'; end if;
  if p_delivery = 'ship' and length(trim(coalesce(p_address,''))) < 8 then raise exception 'ADDRESS'; end if;
  -- Prints are only sent inside Denmark for now: the address must have a Danish postcode (4 digits, 1000-9990)
  -- at the start of a line, followed by the town ("5000 Odense C"). 39xx is Greenland, which counts as abroad.
  if p_delivery = 'ship' then
    v_zip := substring(p_address from '(?:^|\n)\s*([0-9]{4})\s+\S');
    if v_zip is null or v_zip::int < 1000 or v_zip::int > 9990 or v_zip like '39%' then raise exception 'ADDRESS_DK'; end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'EMPTY'; end if;
  if v_plan not in ('full', 'deposit') or (v_plan = 'deposit' and p_delivery <> 'pickup') then raise exception 'PLAN'; end if;
  if length(v_phone) < 8 then v_phone := null; end if;

  -- One order per person at a time, so two orders sent at the same moment cannot both slip under the limit
  perform pg_advisory_xact_lock(hashtext('order:' || v_email));
  if v_phone is not null then perform pg_advisory_xact_lock(hashtext('order:' || v_phone)); end if;

  -- Add up the quantity per print (the same print could be listed twice)
  for item in select * from jsonb_array_elements(p_items) loop
    begin qty := (item->>'qty')::int; exception when others then raise exception 'QTY'; end;
    if qty is null or qty < 1 or qty > max_per_person then raise exception 'QTY'; end if;
    v_art := coalesce(item->>'artwork_id', '');
    wanted := jsonb_set(wanted, array[v_art], to_jsonb(coalesce((wanted->>v_art)::int, 0) + qty));
  end loop;

  for v_art, qty in select key, value::int from jsonb_each_text(wanted) loop
    select * into p from prints where artwork_id = v_art and active;
    if not found then raise exception 'UNAVAILABLE'; end if;

    -- How many of this print the same person already has: paid, or ordered and still inside the payment window
    select coalesce(sum((li->>'qty')::int), 0) into already
    from orders o, jsonb_array_elements(o.items) li
    where li->>'artwork_id' = v_art
      and (o.email = v_email
           or (v_phone is not null and right(regexp_replace(coalesce(o.phone, ''), '\D', '', 'g'), 8) = v_phone))
      and (o.status in ('paid', 'shipped')
           or (o.status = 'awaiting_payment' and o.created_at > now() - make_interval(hours => hold_hours)));
    if already + qty > max_per_person then
      raise exception 'LIMIT:%:%', greatest(max_per_person - already, 0), p.title;
    end if;

    total := total + qty * p.price_signed;
    lines := lines || jsonb_build_object('artwork_id', p.artwork_id, 'title', p.title, 'signed', true,
                                         'qty', qty, 'unit_price', p.price_signed);
    msg := msg || case when msg = '' then '' else ', ' end || qty || 'x ' || p.title;
  end loop;

  if p_delivery = 'ship' then total := total + ship_price; end if;

  v_now := total;
  if v_plan = 'deposit' then
    v_now := ceil(total * deposit_percent / 100.0)::int;
    v_later := total - v_now;
  end if;

  code := 'LK-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');
  while exists (select 1 from orders where order_code = code) loop
    code := 'LK-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');
  end loop;

  -- The MobilePay message: order number first, then what was bought. MobilePay allows 60 characters.
  msg := code || ' ' || msg;
  if length(msg) > 60 then msg := left(msg, 57) || '...'; end if;

  insert into orders (order_code, name, email, phone, address, delivery, items, total, mobilepay_message,
                      payment_plan, pay_now, pay_later)
  values (code, trim(p_name), v_email, nullif(trim(coalesce(p_phone,'')), ''), p_address, p_delivery, lines, total, msg,
          v_plan, v_now, v_later);

  return json_build_object('order_code', code, 'total', total, 'message', msg, 'items', lines,
                           'payment_plan', v_plan, 'pay_now', v_now, 'pay_later', v_later);
end $$;

-- ---------- Order status ----------
-- Laura approves an order in Supabase → Table editor → orders, by changing "status":
--   awaiting_payment  placed, not paid yet (every order starts here)
--   paid              Laura has seen the MobilePay payment (pay_now): the order is approved.
--                     For a deposit order, the rest (pay_later) is still owed at pickup.
--   shipped           sent or handed over (and for a deposit order: the rest has been paid at pickup)
--   cancelled         never paid, or refunded
-- Only paid and shipped orders count as sold (prints.sold). This trigger keeps that number right
-- and notes when the order was paid.
create or replace function orders_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare was_sold boolean; is_sold boolean; li jsonb;
begin
  if new.status not in ('awaiting_payment', 'paid', 'shipped', 'cancelled') then
    raise exception 'status must be awaiting_payment, paid, shipped or cancelled';
  end if;
  was_sold := tg_op = 'UPDATE' and old.status in ('paid', 'shipped');
  is_sold  := new.status in ('paid', 'shipped');
  if is_sold and new.paid_at is null then new.paid_at := now(); end if;
  if is_sold <> was_sold then
    for li in select * from jsonb_array_elements(new.items) loop
      update prints set sold = greatest(0, sold + (case when is_sold then 1 else -1 end) * (li->>'qty')::int)
      where artwork_id = li->>'artwork_id';
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists orders_status_change on orders;
create trigger orders_status_change before insert or update of status on orders
  for each row execute function orders_status_change();

-- The buyer can look up their own order, but only with both the order number and the e-mail.
create or replace function order_status(p_code text, p_email text)
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'order_code', order_code, 'total', total, 'message', mobilepay_message, 'items', items, 'paid_at', paid_at,
    'payment_plan', payment_plan, 'pay_now', coalesce(pay_now, total), 'pay_later', pay_later, 'created_at', created_at,
    'status', case when status = 'awaiting_payment' and created_at < now() - interval '48 hours'
                   then 'expired' else status end)
  from orders
  where order_code = upper(trim(p_code)) and email = lower(trim(p_email));
$$;

-- ---------- The buyer cancels their own order ----------
-- Allowed within 24 hours of ordering, and only while it is not paid yet (status awaiting_payment).
-- Like order_status, it needs both the order number and the e-mail, so nobody can cancel someone else's order.
-- Keep the 24 the same as cancelHours in js/config.js.
create or replace function cancel_order(p_code text, p_email text)
returns json language plpgsql security definer set search_path = public as $$
declare
  cancel_hours constant integer := 24;
  o orders;
begin
  select * into o from orders
  where order_code = upper(trim(p_code)) and email = lower(trim(p_email))
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.status = 'cancelled' then return json_build_object('order_code', o.order_code, 'status', 'cancelled'); end if;
  if o.status <> 'awaiting_payment' then raise exception 'CANCEL_PAID'; end if;
  if o.created_at < now() - make_interval(hours => cancel_hours) then raise exception 'CANCEL_LATE'; end if;
  update orders set status = 'cancelled' where id = o.id;
  return json_build_object('order_code', o.order_code, 'status', 'cancelled');
end $$;

-- ---------- "Notify me" sign-ups ----------
create or replace function join_waitlist(p_email text, p_topic text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'EMAIL'; end if;
  insert into waitlist (email, topic) values (lower(trim(p_email)), left(p_topic, 60)) on conflict do nothing;
  return json_build_object('ok', true);
end $$;

grant execute on function auction_state() to anon;
grant execute on function place_bid(text, text, text, text, integer) to anon;
grant execute on function place_order(text, text, text, text, text, jsonb, text) to anon;
grant execute on function join_waitlist(text, text) to anon;
grant execute on function order_status(text, text) to anon;
grant execute on function cancel_order(text, text) to anon;
revoke execute on function orders_status_change() from public, anon;

-- ============================================================
--  SEED: edit dates, prices and stock, then run.
--  Times are Danish time (Europe/Copenhagen).
-- ============================================================
insert into auctions (artwork_id, title, starts_at, ends_at, start_price, min_increment) values
  ('vestige', 'VESTIGE', '2026-11-01 18:00 Europe/Copenhagen', '2027-01-01 20:00 Europe/Copenhagen', 5000, 250),
  ('florere', 'FLORERE', '2026-11-01 18:00 Europe/Copenhagen', '2027-01-01 20:00 Europe/Copenhagen', 5000, 250)
on conflict (artwork_id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at,
  start_price = excluded.start_price, min_increment = excluded.min_increment;

insert into prints (artwork_id, title, stock, edition_size, price_unsigned, price_signed) values
  ('vestige', 'VESTIGE', 10, 50, 450, 750),
  ('florere', 'FLORERE', 10, 50, 450, 750),
  ('will-you-catch-me', 'WILL YOU CATCH ME?', 10, 50, 450, 750)
on conflict (artwork_id) do update set stock = excluded.stock,
  price_unsigned = excluded.price_unsigned, price_signed = excluded.price_signed;
