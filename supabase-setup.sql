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
  stock          integer not null default 0, -- prints printed and ready to ship (e.g. a batch of 10)
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
  status      text not null default 'awaiting_payment',  -- change to 'paid' / 'shipped' in the table editor
  created_at  timestamptz not null default now()
);

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

-- ---------- Order prints (stock is checked and reserved on the server) ----------
create or replace function place_order(p_name text, p_email text, p_phone text, p_address text,
                                       p_delivery text, p_items jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare item jsonb; p prints; qty integer; signed boolean; total integer := 0;
        lines jsonb := '[]'::jsonb; code text;
begin
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'NAME'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'EMAIL'; end if;
  if p_delivery not in ('ship','pickup') then raise exception 'DELIVERY'; end if;
  if p_delivery = 'ship' and length(trim(coalesce(p_address,''))) < 8 then raise exception 'ADDRESS'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'EMPTY'; end if;

  for item in select * from jsonb_array_elements(p_items) loop
    qty := (item->>'qty')::int;
    signed := coalesce((item->>'signed')::boolean, false);
    if qty < 1 or qty > 5 then raise exception 'QTY'; end if;
    select * into p from prints where artwork_id = item->>'artwork_id' and active for update;
    if not found then raise exception 'UNAVAILABLE'; end if;
    if p.stock < qty then
      raise exception 'STOCK:%:%', p.stock, p.title;
    end if;
    update prints set stock = stock - qty, sold = sold + qty where artwork_id = p.artwork_id;
    total := total + qty * (case when signed then p.price_signed else p.price_unsigned end);
    lines := lines || jsonb_build_object('artwork_id', p.artwork_id, 'title', p.title, 'signed', signed, 'qty', qty,
                                         'unit_price', case when signed then p.price_signed else p.price_unsigned end);
  end loop;

  -- shipping price: keep in sync with CONFIG.shipping in js/config.js
  if p_delivery = 'ship' then total := total + 59; end if;

  code := 'LK-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');
  while exists (select 1 from orders where order_code = code) loop
    code := 'LK-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');
  end loop;

  insert into orders (order_code, name, email, phone, address, delivery, items, total)
  values (code, trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone,'')), ''), p_address, p_delivery, lines, total);

  return json_build_object('order_code', code, 'total', total);
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
grant execute on function place_order(text, text, text, text, text, jsonb) to anon;
grant execute on function join_waitlist(text, text) to anon;

-- ============================================================
--  SEED: edit dates, prices and stock, then run.
--  Times are Danish time (Europe/Copenhagen).
-- ============================================================
insert into auctions (artwork_id, title, starts_at, ends_at, start_price, min_increment) values
  ('vestige', 'VESTIGE', '2026-11-20 18:00 Europe/Copenhagen', '2026-11-27 20:00 Europe/Copenhagen', 5000, 250),
  ('florere', 'FLORERE', '2026-12-04 18:00 Europe/Copenhagen', '2026-12-11 20:00 Europe/Copenhagen', 5000, 250)
on conflict (artwork_id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at,
  start_price = excluded.start_price, min_increment = excluded.min_increment;

insert into prints (artwork_id, title, stock, edition_size, price_unsigned, price_signed) values
  ('vestige', 'VESTIGE', 10, 50, 450, 750),
  ('florere', 'FLORERE', 10, 50, 450, 750),
  ('falling', 'FALLING', 10, 50, 450, 750)
on conflict (artwork_id) do update set stock = excluded.stock,
  price_unsigned = excluded.price_unsigned, price_signed = excluded.price_signed;
