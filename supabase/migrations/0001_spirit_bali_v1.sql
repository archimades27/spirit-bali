-- Spirit Bali Master Implementation Plan v1.0
-- Authoritative Postgres schema, private deck/hand isolation, RLS, and atomic transactional RPC.

create schema if not exists private;

-- Revoke public/anon/authenticated direct access to private schema
revoke all on schema private from public, anon, authenticated;

-- 1. Rooms
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_id uuid not null,
  rules_version text not null default '1.0' check (rules_version = '1.0'),
  config jsonb not null default '{"maxPlayers":5,"startingBalance":1000000,"betStep":10000,"dealerRotationRounds":3}'::jsonb,
  phase text not null default 'LOBBY' check (
    phase in ('LOBBY','ROUND_SETUP','FIRST_DEAL','BETTING','SECOND_DEAL','DRAW_DECISION','REVEAL','SETTLEMENT','NEXT_ROUND','FINISHED')
  ),
  dealer_id uuid not null,
  dealer_rounds_completed integer not null default 0 check (dealer_rounds_completed >= 0 and dealer_rounds_completed <= 3),
  round_sequence integer not null default 0 check (round_sequence >= 0),
  state_version integer not null default 1 check (state_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Room Members (balances mutated ONLY via transactional RPC)
create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  seat integer not null check (seat between 0 and 5),
  balance bigint not null default 1000000 check (balance >= 0),
  reserved_bet bigint not null default 0 check (reserved_bet >= 0 and reserved_bet <= balance),
  ready boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','WAITING_NEXT_ROUND','LEFT','BANKRUPT')),
  pending_leave boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

-- 3. Rounds
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sequence integer not null check (sequence >= 1),
  rules_version text not null default '1.0' check (rules_version = '1.0'),
  dealer_id uuid not null,
  dealer_count_before integer not null default 0,
  phase text not null check (
    phase in ('ROUND_SETUP','FIRST_DEAL','BETTING','SECOND_DEAL','DRAW_DECISION','REVEAL','SETTLEMENT','NEXT_ROUND','FINISHED')
  ),
  version integer not null default 1,
  deadline timestamptz,
  udeg_limit bigint not null default 0 check (udeg_limit >= 0),
  udeg_remaining bigint not null default 0 check (udeg_remaining >= 0),
  settlement_order uuid[] not null default '{}',
  draw_turn_order uuid[] not null default '{}',
  active_draw_turn_index integer not null default 0,
  dealer_delta bigint not null default 0,
  cancelled_reason text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, sequence)
);

-- 4. Round Players
create table if not exists public.round_players (
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null,
  seat integer not null,
  seat_order integer not null, -- 0 for dealer, 1..N clockwise payment order
  is_dealer boolean not null default false,
  bet bigint not null default 0 check (bet >= 0),
  bet_locked boolean not null default false,
  decision text not null default 'PENDING' check (decision in ('PENDING','STOP','DRAW')),
  primary key (round_id, user_id)
);

-- 5. Private Deck & Hands (NEVER exposed via PostgREST or Realtime)
create table if not exists private.round_decks (
  round_id uuid primary key references public.rounds(id) on delete cascade,
  ordered_tiles jsonb not null, -- array of 28 canonical [a,b] pairs
  cursor integer not null default 0 check (cursor between 0 and 28),
  shuffle_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.hands (
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null,
  tiles jsonb not null default '[]'::jsonb,
  primary key (round_id, user_id)
);

-- 6. Public Reveals (populated ONLY after all draw decisions are final)
create table if not exists public.round_reveals (
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null,
  tiles jsonb not null,
  evaluated_hand jsonb not null,
  revealed_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

-- 7. Idempotency Action Receipts (checked BEFORE expectedVersion per T17 & T34)
create table if not exists public.action_receipts (
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_id uuid not null,
  action_id text not null,
  payload_hash text not null,
  accepted_version integer not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, actor_id, action_id)
);

-- 8. Append-only Balanced Ledger Entries
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  participant_id uuid not null,
  counterparty_id uuid not null,
  signed_amount bigint not null,
  kind text not null check (kind in ('PAYOUT','COLLECTION')),
  settlement_key text not null unique,
  created_at timestamptz not null default now()
);

-- 9. Per-player Settlement Results (records SKIPPED_UDEG even when paid=0)
create table if not exists public.settlement_results (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null,
  seat_order integer not null,
  bet bigint not null,
  outcome text not null check (outcome in ('WIN','LOSE')),
  multiplier integer not null check (multiplier in (1, 2, 3)),
  claim bigint not null check (claim >= 0),
  paid bigint not null check (paid >= 0),
  loss bigint not null check (loss >= 0),
  balance_delta bigint not null,
  payment_status text not null check (payment_status in ('PAID','COLLECTED','SKIPPED_UDEG')),
  udeg_before bigint not null,
  udeg_after bigint not null,
  primary key (round_id, player_id)
);

-- Enable Row Level Security on all public tables
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.rounds enable row level security;
alter table public.round_players enable row level security;
alter table public.round_reveals enable row level security;
alter table public.action_receipts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.settlement_results enable row level security;

-- Helper membership check
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.room_members rm
    where rm.room_id = p_room_id
      and rm.user_id = auth.uid()
      and rm.status <> 'LEFT'
  );
$$;

-- Strict SELECT-only RLS policies for authenticated room members
create policy rooms_select_member on public.rooms
  for select to authenticated
  using (public.is_room_member(id) or phase = 'LOBBY');

create policy room_members_select_member on public.room_members
  for select to authenticated
  using (public.is_room_member(room_id));

create policy rounds_select_member on public.rounds
  for select to authenticated
  using (public.is_room_member(room_id));

create policy round_players_select_member on public.round_players
  for select to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_room_member(r.room_id)
    )
  );

create policy round_reveals_select_member on public.round_reveals
  for select to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_room_member(r.room_id)
    )
  );

create policy settlement_results_select_member on public.settlement_results
  for select to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_room_member(r.room_id)
    )
  );

create policy ledger_entries_select_member on public.ledger_entries
  for select to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_room_member(r.room_id)
    )
  );

create policy action_receipts_select_own on public.action_receipts
  for select to authenticated
  using (actor_id = auth.uid());

-- Revoke direct write permissions from authenticated/anon; mutations go through Edge Function + RPC
revoke insert, update, delete on public.rooms, public.room_members, public.rounds,
  public.round_players, public.round_reveals, public.action_receipts,
  public.ledger_entries, public.settlement_results from anon, authenticated;

-- Pure SQL hand evaluator matching TypeScript rules v1.0 parity
create or replace function private.evaluate_hand_v1(p_tiles jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_len integer := jsonb_array_length(p_tiles);
  v_total integer := 0;
  v_all_doubles boolean := true;
  v_tile jsonb;
  v_a integer;
  v_b integer;
  v_score integer;
  v_is_triple boolean;
  v_rank integer;
begin
  if v_len < 2 or v_len > 3 then
    raise exception 'INVALID_HAND_SIZE';
  end if;

  for v_tile in select * from jsonb_array_elements(p_tiles)
  loop
    v_a := (v_tile->>0)::integer;
    v_b := (v_tile->>1)::integer;
    if v_a < 0 or v_a > 6 or v_b < 0 or v_b > 6 then
      raise exception 'INVALID_TILE';
    end if;
    v_total := v_total + v_a + v_b;
    if v_a <> v_b then
      v_all_doubles := false;
    end if;
  end loop;

  v_score := v_total % 10;
  v_is_triple := (v_len = 3 and v_all_doubles);
  v_rank := case when v_is_triple then 10 else v_score end;

  return jsonb_build_object(
    'tiles', p_tiles,
    'numericScore', v_score,
    'handType', case when v_is_triple then 'TRIPLE' else 'NORMAL' end,
    'isPureNine', (v_len = 2 and v_score = 9),
    'rank', v_rank
  );
end;
$$;

-- Viewer-safe private hand getter (returns ONLY caller's own tiles)
create or replace function public.get_my_hand(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_tiles jsonb;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select h.tiles into v_tiles
  from private.hands h
  join public.rounds r on r.id = h.round_id
  where h.round_id = p_round_id
    and h.user_id = auth.uid()
    and public.is_room_member(r.room_id);

  return coalesce(v_tiles, '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_hand(uuid) to authenticated;

-- Atomic settlement helper executed inside the single action transaction
create or replace function private.settle_round_atomic_v1(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_round public.rounds%rowtype;
  v_room public.rooms%rowtype;
  v_dealer_tiles jsonb;
  v_dealer_eval jsonb;
  v_dealer_rank integer;
  v_remaining bigint;
  v_dealer_delta bigint := 0;
  v_sum_delta bigint := 0;
  v_uid uuid;
  v_rp public.round_players%rowtype;
  v_tiles jsonb;
  v_eval jsonb;
  v_rank integer;
  v_outcome text;
  v_mult integer;
  v_claim bigint;
  v_paid bigint;
  v_loss bigint;
  v_delta bigint;
  v_status text;
  v_udeg_before bigint;
  v_next_completed integer;
  v_eligible_count integer;
  v_next_dealer uuid;
  v_dealer_seat integer;
  v_next_phase text;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if v_round.settled_at is not null then
    return;
  end if;

  select * into v_room from public.rooms where id = v_round.room_id for update;

  -- Lock all room members in deterministic seat order to prevent deadlocks
  perform 1 from public.room_members where room_id = v_round.room_id order by seat for update;

  select tiles into v_dealer_tiles from private.hands where round_id = p_round_id and user_id = v_round.dealer_id;
  v_dealer_eval := private.evaluate_hand_v1(v_dealer_tiles);
  v_dealer_rank := (v_dealer_eval->>'rank')::integer;

  insert into public.round_reveals (round_id, user_id, tiles, evaluated_hand)
  values (p_round_id, v_round.dealer_id, v_dealer_tiles, v_dealer_eval)
  on conflict (round_id, user_id) do nothing;

  -- Pass 1: Evaluate all players & collect ayahan (losses/ties) into Bandar payout pool first
  v_remaining := v_round.udeg_limit;

  foreach v_uid in array v_round.settlement_order
  loop
    select * into v_rp from public.round_players where round_id = p_round_id and user_id = v_uid;
    select tiles into v_tiles from private.hands where round_id = p_round_id and user_id = v_uid;
    v_eval := private.evaluate_hand_v1(v_tiles);
    v_rank := (v_eval->>'rank')::integer;

    insert into public.round_reveals (round_id, user_id, tiles, evaluated_hand)
    values (p_round_id, v_uid, v_tiles, v_eval)
    on conflict (round_id, user_id) do nothing;

    if v_rank <= v_dealer_rank then
      v_remaining := v_remaining + v_rp.bet;
      v_dealer_delta := v_dealer_delta + v_rp.bet;

      update public.room_members
        set balance = balance - v_rp.bet, reserved_bet = 0
        where room_id = v_round.room_id and user_id = v_uid;

      insert into public.ledger_entries (round_id, participant_id, counterparty_id, signed_amount, kind, settlement_key)
      values
        (p_round_id, v_uid, v_round.dealer_id, -v_rp.bet, 'COLLECTION', p_round_id::text || ':' || v_uid::text || ':COLLECTION:P'),
        (p_round_id, v_round.dealer_id, v_uid, v_rp.bet, 'COLLECTION', p_round_id::text || ':' || v_uid::text || ':COLLECTION:D');
    end if;
  end loop;

  -- Pass 2: Pay winners in priority order (Triple -> Nilai 9 -> Normal, then clockwise seat_order)
  for v_uid in
    select rp.user_id
    from public.round_players rp
    join public.round_reveals rev on rev.round_id = rp.round_id and rev.user_id = rp.user_id
    where rp.round_id = p_round_id and not rp.is_dealer
    order by
      case
        when (rev.evaluated_hand->>'rank')::integer <= v_dealer_rank then 3
        when rev.evaluated_hand->>'handType' = 'TRIPLE' then 0
        when (rev.evaluated_hand->>'numericScore')::integer = 9 then 1
        else 2
      end,
      rp.seat_order
  loop
    select * into v_rp from public.round_players where round_id = p_round_id and user_id = v_uid;
    select evaluated_hand into v_eval from public.round_reveals where round_id = p_round_id and user_id = v_uid;
    v_rank := (v_eval->>'rank')::integer;
    v_udeg_before := v_remaining;

    if v_rank > v_dealer_rank then
      v_outcome := 'WIN';
      v_mult := case
        when v_eval->>'handType' = 'TRIPLE' then 3
        when (v_eval->>'numericScore')::integer = 9 then 2
        else 1
      end;
      v_claim := v_rp.bet * v_mult;
      v_loss := 0;

      if v_claim <= v_remaining then
        v_paid := v_claim;
        v_remaining := v_remaining - v_claim;
        v_delta := v_claim;
        v_status := 'PAID';
        v_dealer_delta := v_dealer_delta - v_claim;

        update public.room_members
          set balance = balance + v_claim, reserved_bet = 0
          where room_id = v_round.room_id and user_id = v_uid;

        insert into public.ledger_entries (round_id, participant_id, counterparty_id, signed_amount, kind, settlement_key)
        values
          (p_round_id, v_uid, v_round.dealer_id, v_claim, 'PAYOUT', p_round_id::text || ':' || v_uid::text || ':PAYOUT:P'),
          (p_round_id, v_round.dealer_id, v_uid, -v_claim, 'PAYOUT', p_round_id::text || ':' || v_uid::text || ':PAYOUT:D');
      else
        v_paid := 0;
        v_delta := 0;
        v_status := 'SKIPPED_UDEG';

        update public.room_members
          set reserved_bet = 0
          where room_id = v_round.room_id and user_id = v_uid;
      end if;
    else
      v_outcome := 'LOSE';
      v_mult := 1;
      v_claim := 0;
      v_paid := 0;
      v_loss := v_rp.bet;
      v_delta := -v_rp.bet;
      v_status := 'COLLECTED';
    end if;

    v_sum_delta := v_sum_delta + v_delta;

    insert into public.settlement_results (
      round_id, player_id, seat_order, bet, outcome, multiplier,
      claim, paid, loss, balance_delta, payment_status, udeg_before, udeg_after
    ) values (
      p_round_id, v_uid, v_rp.seat_order, v_rp.bet, v_outcome, v_mult,
      v_claim, v_paid, v_loss, v_delta, v_status, v_udeg_before, v_remaining
    );
  end loop;

  -- Zero-sum invariant check
  if v_sum_delta + v_dealer_delta <> 0 then
    raise exception 'INVARIANT_ZERO_SUM_VIOLATED';
  end if;

  update public.room_members
    set balance = balance + v_dealer_delta, reserved_bet = 0
    where room_id = v_round.room_id and user_id = v_round.dealer_id;

  -- Dealer rotation after exactly 3 completed rounds (never on pure 9)
  v_next_completed := v_room.dealer_rounds_completed + 1;

  select count(*) into v_eligible_count
  from public.room_members
  where room_id = v_round.room_id and status <> 'LEFT' and not pending_leave and balance >= 10000;

  if v_eligible_count < 2 then
    v_next_phase := 'FINISHED';
    v_next_dealer := v_round.dealer_id;
    v_next_completed := 0;
  else
    v_next_phase := 'NEXT_ROUND';
    if v_next_completed >= 3 or not exists (
      select 1 from public.room_members
      where room_id = v_round.room_id and user_id = v_round.dealer_id
        and status <> 'LEFT' and not pending_leave and balance >= 10000
    ) then
      select seat into v_dealer_seat from public.room_members
      where room_id = v_round.room_id and user_id = v_round.dealer_id;

      select user_id into v_next_dealer
      from public.room_members
      where room_id = v_round.room_id and status <> 'LEFT' and not pending_leave and balance >= 10000
      order by case when seat > v_dealer_seat then 0 else 1 end, seat
      limit 1;

      v_next_completed := 0;
    else
      v_next_dealer := v_round.dealer_id;
    end if;
  end if;

  update public.rounds
    set phase = v_next_phase,
        udeg_remaining = v_remaining,
        dealer_delta = v_dealer_delta,
        settled_at = now(),
        deadline = null
    where id = p_round_id;

  update public.rooms
    set phase = v_next_phase,
        dealer_id = v_next_dealer,
        dealer_rounds_completed = v_next_completed,
        state_version = state_version + 1,
        updated_at = now()
    where id = v_round.room_id;
end;
$$;
