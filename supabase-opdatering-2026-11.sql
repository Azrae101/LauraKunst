-- ============================================================
--  ONE-TIME UPDATE (november 2026). Run this ONCE in Supabase: SQL Editor, New query, paste ALL of it, Run.
--  Safe to run again. It does not touch prices, prints or existing orders.
--
--  It sets up everything orders and the order overview (ordrer.html) need, also on a database that was
--  made before the order overview existed:
--   1. place_order: only shipping and full payment (no pickup, no deposit)
--   2. place_order can only be called by the place-order function (so the captcha cannot be skipped)
--   3. the order overview: the admins table, admin_orders, admin_set_status (with tracking number)
--      and admin_purge_old (the "Slet gamle ordrer" button)
--   4. the buyer's own order lookup and cancelling (order_status, cancel_order)
--
--  supabase-setup.sql already has all of this, so a fresh database made from it needs nothing from here.
-- ============================================================

alter table orders add column if not exists mobilepay_message text;   -- the exact text the buyer writes in MobilePay
alter table orders add column if not exists paid_at timestamptz;
-- Payment plan: always 'full' now. 'deposit' (part now, the rest at pickup) is only on old orders.
alter table orders add column if not exists payment_plan text not null default 'full';
alter table orders add column if not exists pay_now integer;               -- what to MobilePay (= total)
alter table orders add column if not exists pay_later integer not null default 0;  -- only old deposit orders
alter table orders add column if not exists tracking text;                 -- tracking number, set when shipped

-- ---------- Daily limit: at most 50 prints a day in total, for all buyers together ----------
-- A day is a Danish calendar day (midnight to midnight, Copenhagen time). Every order placed that day
-- counts, except cancelled ones, so a cancelled order frees its prints again.
-- To change 50: change it here AND dailyLimit in js/config.js, then run this file again.
create or replace function daily_print_limit() returns integer language sql immutable as $$ select 50 $$;

create or replace function prints_sold_today() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum((li->>'qty')::int), 0)::int
  from orders o, jsonb_array_elements(o.items) li
  where o.status <> 'cancelled'
    and (o.created_at at time zone 'Europe/Copenhagen')::date = (now() at time zone 'Europe/Copenhagen')::date;
$$;

-- What the shop shows: how many prints are left today (0 = "sold out for today")
create or replace function shop_state() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('daily_limit', daily_print_limit(),
                           'sold_today', prints_sold_today(),
                           'left_today', greatest(daily_print_limit() - prints_sold_today(), 0));
$$;

-- ---------- Order prints ----------
-- Prints are made to order (no stock limit) and are all signed and numbered.
-- These rules are checked here on the server, so nobody can get around them in the browser:
--   * the price comes from the prints table, never from the browser
--   * one person (same e-mail or same phone number) can buy at most 10 of each print in total.
--     Paid orders count, and so do unpaid orders that are still inside the 48 hour payment window.
--   * an order is NOT approved when it is placed. It waits as 'awaiting_payment' until Laura
--     has seen the MobilePay payment and sets the status to 'paid' (see "Order status" below).
--   * every order is shipped inside Denmark and paid in full (no pickup, no deposit)
--   * at most daily_print_limit() prints a day in total for all buyers (see "Daily limit" above)
-- Keep these numbers the same as in js/config.js (maxPerPerson, reserveHours, shipping.ship).
drop function if exists place_order(text, text, text, text, text, jsonb);   -- the older version without p_plan
create or replace function place_order(p_name text, p_email text, p_phone text, p_address text,
                                       p_delivery text, p_items jsonb, p_plan text default 'full')
returns json language plpgsql security definer set search_path = public as $$
declare
  max_per_person  constant integer := 10;
  hold_hours      constant integer := 48;
  ship_price      constant integer := 59;
  v_plan text := coalesce(p_plan, 'full'); v_zip text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
  item jsonb; p prints; v_art text; qty integer; already integer; total integer := 0;
  wanted jsonb := '{}'::jsonb; lines jsonb := '[]'::jsonb; code text; msg text := '';
  v_count integer := 0; v_left integer;
begin
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'NAME'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'EMAIL'; end if;
  if p_delivery is distinct from 'ship' then raise exception 'DELIVERY'; end if;   -- shipping only
  if length(trim(coalesce(p_address,''))) < 8 then raise exception 'ADDRESS'; end if;
  -- Prints are only sent inside Denmark for now: the address must have a Danish postcode (4 digits, 1000-9990)
  -- at the start of a line, followed by the town ("5000 Odense C"). 39xx is Greenland, which counts as abroad.
  v_zip := substring(p_address from '(?:^|\n)\s*([0-9]{4})\s+\S');
  if v_zip is null or v_zip::int < 1000 or v_zip::int > 9990 or v_zip like '39%' then raise exception 'ADDRESS_DK'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'EMPTY'; end if;
  if v_plan <> 'full' then raise exception 'PLAN'; end if;                         -- paid in full, no deposit
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
    v_count := v_count + qty;
  end loop;

  -- Daily limit for all buyers together. The lock makes orders wait for each other here,
  -- so two orders at the same moment cannot both take the last prints of the day.
  perform pg_advisory_xact_lock(hashtext('order:daily-limit'));
  v_left := daily_print_limit() - prints_sold_today();
  if v_count > v_left then raise exception 'DAILY_LIMIT:%', greatest(v_left, 0); end if;

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

  total := total + ship_price;

  code := 'LK-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');
  while exists (select 1 from orders where order_code = code) loop
    code := 'LK-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');
  end loop;

  -- The MobilePay message: order number first, then what was bought. MobilePay allows 60 characters.
  msg := code || ' ' || msg;
  if length(msg) > 60 then msg := left(msg, 57) || '...'; end if;

  insert into orders (order_code, name, email, phone, address, delivery, items, total, mobilepay_message,
                      payment_plan, pay_now, pay_later)
  values (code, trim(p_name), v_email, nullif(trim(coalesce(p_phone,'')), ''), p_address, 'ship', lines, total, msg,
          'full', total, 0);

  return json_build_object('order_code', code, 'total', total, 'message', msg, 'items', lines,
                           'payment_plan', 'full', 'pay_now', total, 'pay_later', 0);
end $$;

-- ---------- Order status ----------
-- Laura approves an order in Supabase → Table editor → orders, by changing "status":
--   awaiting_payment  placed, not paid yet (every order starts here)
--   paid              Laura has seen the MobilePay payment: the order is approved.
--   shipped           sent (with a tracking number if Laura added one)
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

-- ---------- Order overview (ordrer.html) ----------
-- Only people whose e-mail is in "admins" can see and change orders. They log in on ordrer.html with a
-- link sent to their e-mail (Supabase Auth). The functions below check the e-mail of the logged-in person
-- against this table, so nobody else gets anything, not even with the page's code.
-- Add or remove people in the SEED section at the bottom (insert into admins ...).
create table if not exists admins (
  email text primary key   -- lower case
);
alter table admins enable row level security;
revoke all on admins from anon, authenticated;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- All orders, newest first, with everything the overview shows
create or replace function admin_orders() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  return (
    select coalesce(json_agg(row_to_json(o) order by o.created_at desc), '[]'::json)
    from (
      select order_code, name, email, phone, address, delivery, items, total,
             coalesce(pay_now, total) as pay_now, pay_later, payment_plan, mobilepay_message,
             status, created_at, paid_at, tracking,
             (status = 'awaiting_payment' and created_at < now() - interval '48 hours') as expired
      from orders
      order by created_at desc
      limit 1000
    ) o
  );
end $$;

-- Change an order's status from the overview: paid, shipped, cancelled, or back to awaiting_payment.
-- p_tracking: the tracking number, saved when the order is marked as shipped (it goes into the buyer's e-mail).
-- The trigger orders_status_change keeps prints.sold right and notes when it was paid.
drop function if exists admin_set_status(text, text);   -- the older version without p_tracking
create or replace function admin_set_status(p_code text, p_status text, p_tracking text default null) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_status not in ('awaiting_payment', 'paid', 'shipped', 'cancelled') then raise exception 'STATUS'; end if;
  update orders
     set status = p_status,
         paid_at = case when p_status = 'awaiting_payment' then null else paid_at end,
         tracking = case when p_status = 'shipped' then coalesce(nullif(left(trim(coalesce(p_tracking, '')), 80), ''), tracking)
                         else tracking end
   where order_code = upper(trim(p_code));
  if not found then raise exception 'NOT_FOUND'; end if;
  return json_build_object('order_code', upper(trim(p_code)), 'status', p_status);
end $$;

-- Delete cancelled and unpaid orders older than 1 year (the privacy policy promises this).
-- Paid and shipped orders are never deleted here: the bookkeeping law says keep them 5 years.
create or replace function admin_purge_old() returns json
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from orders
   where status in ('cancelled', 'awaiting_payment')
     and created_at < now() - interval '1 year';
  get diagnostics n = row_count;
  return json_build_object('deleted', n);
end $$;

-- Who may call what
grant execute on function shop_state() to anon, authenticated;
revoke execute on function place_order(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function place_order(text, text, text, text, text, jsonb, text) to service_role;
grant execute on function order_status(text, text) to anon;
grant execute on function cancel_order(text, text) to anon;
revoke execute on function admin_orders() from public, anon;
revoke execute on function admin_set_status(text, text, text) from public, anon;
revoke execute on function admin_purge_old() from public, anon;
grant execute on function admin_orders() to authenticated;
grant execute on function admin_set_status(text, text, text) to authenticated;
grant execute on function admin_purge_old() to authenticated;
revoke execute on function orders_status_change() from public, anon;

-- Who may see orders on ordrer.html (they must also be added as users under Authentication, Users)
insert into admins (email) values
  ('laur723kru@gmail.com'),
  ('clara.holst@outlook.com')
on conflict (email) do nothing;

-- Tell the API about the new functions right away
notify pgrst, 'reload schema';
