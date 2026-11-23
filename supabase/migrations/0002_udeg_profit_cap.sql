-- Spirit Bali v1.0 — A10: Bandar net profit per round is capped at the round's Udeg.
-- Losers are charged clockwise (settlement_order). A loser whose full ayahan no longer fits
-- under (udeg_limit + total payouts) pays nothing and is recorded as CAPPED_UDEG (never partial).
-- Mirrors settleRound() in src/domain/settlementEngine.ts.

alter table public.settlement_results
  drop constraint if exists settlement_results_payment_status_check;

alter table public.settlement_results
  add constraint settlement_results_payment_status_check
  check (payment_status in ('PAID','COLLECTED','SKIPPED_UDEG','CAPPED_UDEG'));

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
  v_mult integer;
  v_claim bigint;
  v_udeg_before bigint;
  v_next_completed integer;
  v_eligible_count integer;
  v_next_dealer uuid;
  v_dealer_seat integer;
  v_next_phase text;

  -- A10 planning state
  v_l_uid uuid[] := '{}';
  v_l_amt bigint[] := '{}';
  v_l_charged boolean[] := '{}';
  v_w_uid uuid[] := '{}';
  v_w_claim bigint[] := '{}';
  v_w_mult integer[] := '{}';
  v_w_paid boolean[] := '{}';
  v_collected bigint;
  v_pool bigint;
  v_total_paid bigint;
  v_allowed bigint;
  v_acc bigint;
  v_changed boolean;
  i integer;
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

  -- Pass 0: reveal & evaluate every player; record losers in clockwise order
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
      v_l_uid := v_l_uid || v_uid;
      v_l_amt := v_l_amt || v_rp.bet;
      v_l_charged := v_l_charged || true;
    end if;
  end loop;

  -- Winners in payout priority (666 -> Triple -> Besar -> Nilai 9 -> Normal, then clockwise seat_order)
  for v_uid, v_claim, v_mult in
    select rp.user_id,
      rp.bet * case
        when rev.evaluated_hand->>'handType' in ('SIX_SIX_SIX', 'TRIPLE') then 3
        when rev.evaluated_hand->>'handType' = 'BESAR' or (rev.evaluated_hand->>'numericScore')::integer = 9 then 2
        else 1
      end,
      case
        when rev.evaluated_hand->>'handType' in ('SIX_SIX_SIX', 'TRIPLE') then 3
        when rev.evaluated_hand->>'handType' = 'BESAR' or (rev.evaluated_hand->>'numericScore')::integer = 9 then 2
        else 1
      end
    from public.round_players rp
    join public.round_reveals rev on rev.round_id = rp.round_id and rev.user_id = rp.user_id
    where rp.round_id = p_round_id and not rp.is_dealer
      and (rev.evaluated_hand->>'rank')::integer > v_dealer_rank
    order by
      case
        when rev.evaluated_hand->>'handType' = 'SIX_SIX_SIX' then 0
        when rev.evaluated_hand->>'handType' = 'TRIPLE' then 1
        when rev.evaluated_hand->>'handType' = 'BESAR' then 2
        when (rev.evaluated_hand->>'numericScore')::integer = 9 then 3
        else 4
      end,
      rp.seat_order
  loop
    v_w_uid := v_w_uid || v_uid;
    v_w_claim := v_w_claim || v_claim;
    v_w_mult := v_w_mult || v_mult;
    v_w_paid := v_w_paid || false;
  end loop;

  -- A10 planning: shrink the charged-loser set until Bandar net profit <= udeg_limit
  loop
    v_collected := 0;
    for i in 1 .. coalesce(array_length(v_l_uid, 1), 0) loop
      if v_l_charged[i] then
        v_collected := v_collected + v_l_amt[i];
      end if;
    end loop;

    v_pool := v_round.udeg_limit + v_collected;
    v_total_paid := 0;
    for i in 1 .. coalesce(array_length(v_w_uid, 1), 0) loop
      if v_w_claim[i] <= v_pool then
        v_pool := v_pool - v_w_claim[i];
        v_total_paid := v_total_paid + v_w_claim[i];
        v_w_paid[i] := true;
      else
        v_w_paid[i] := false;
      end if;
    end loop;

    v_allowed := v_round.udeg_limit + v_total_paid;
    v_acc := 0;
    v_changed := false;
    for i in 1 .. coalesce(array_length(v_l_uid, 1), 0) loop
      if v_l_charged[i] then
        if v_acc + v_l_amt[i] <= v_allowed then
          v_acc := v_acc + v_l_amt[i];
        else
          v_l_charged[i] := false;
          v_changed := true;
        end if;
      end if;
    end loop;

    exit when not v_changed;
  end loop;

  -- Pass 1: collect ayahan from charged losers into the Bandar payout pool
  v_remaining := v_round.udeg_limit;
  for i in 1 .. coalesce(array_length(v_l_uid, 1), 0) loop
    if v_l_charged[i] then
      v_remaining := v_remaining + v_l_amt[i];
      v_dealer_delta := v_dealer_delta + v_l_amt[i];

      update public.room_members
        set balance = balance - v_l_amt[i], reserved_bet = 0
        where room_id = v_round.room_id and user_id = v_l_uid[i];

      insert into public.ledger_entries (round_id, participant_id, counterparty_id, signed_amount, kind, settlement_key)
      values
        (p_round_id, v_l_uid[i], v_round.dealer_id, -v_l_amt[i], 'COLLECTION', p_round_id::text || ':' || v_l_uid[i]::text || ':COLLECTION:P'),
        (p_round_id, v_round.dealer_id, v_l_uid[i], v_l_amt[i], 'COLLECTION', p_round_id::text || ':' || v_l_uid[i]::text || ':COLLECTION:D');
    else
      update public.room_members
        set reserved_bet = 0
        where room_id = v_round.room_id and user_id = v_l_uid[i];
    end if;
  end loop;

  -- Pass 2: pay winners following the converged plan
  for i in 1 .. coalesce(array_length(v_w_uid, 1), 0) loop
    select * into v_rp from public.round_players where round_id = p_round_id and user_id = v_w_uid[i];
    v_udeg_before := v_remaining;

    if v_w_paid[i] then
      v_remaining := v_remaining - v_w_claim[i];
      v_dealer_delta := v_dealer_delta - v_w_claim[i];
      v_sum_delta := v_sum_delta + v_w_claim[i];

      update public.room_members
        set balance = balance + v_w_claim[i], reserved_bet = 0
        where room_id = v_round.room_id and user_id = v_w_uid[i];

      insert into public.ledger_entries (round_id, participant_id, counterparty_id, signed_amount, kind, settlement_key)
      values
        (p_round_id, v_w_uid[i], v_round.dealer_id, v_w_claim[i], 'PAYOUT', p_round_id::text || ':' || v_w_uid[i]::text || ':PAYOUT:P'),
        (p_round_id, v_round.dealer_id, v_w_uid[i], -v_w_claim[i], 'PAYOUT', p_round_id::text || ':' || v_w_uid[i]::text || ':PAYOUT:D');

      insert into public.settlement_results (
        round_id, player_id, seat_order, bet, outcome, multiplier,
        claim, paid, loss, balance_delta, payment_status, udeg_before, udeg_after
      ) values (
        p_round_id, v_w_uid[i], v_rp.seat_order, v_rp.bet, 'WIN', v_w_mult[i],
        v_w_claim[i], v_w_claim[i], 0, v_w_claim[i], 'PAID', v_udeg_before, v_remaining
      );
    else
      update public.room_members
        set reserved_bet = 0
        where room_id = v_round.room_id and user_id = v_w_uid[i];

      insert into public.settlement_results (
        round_id, player_id, seat_order, bet, outcome, multiplier,
        claim, paid, loss, balance_delta, payment_status, udeg_before, udeg_after
      ) values (
        p_round_id, v_w_uid[i], v_rp.seat_order, v_rp.bet, 'WIN', v_w_mult[i],
        v_w_claim[i], 0, 0, 0, 'SKIPPED_UDEG', v_udeg_before, v_remaining
      );
    end if;
  end loop;

  -- Loser result rows (charged or capped)
  for i in 1 .. coalesce(array_length(v_l_uid, 1), 0) loop
    select * into v_rp from public.round_players where round_id = p_round_id and user_id = v_l_uid[i];

    if v_l_charged[i] then
      v_sum_delta := v_sum_delta - v_l_amt[i];
    end if;

    insert into public.settlement_results (
      round_id, player_id, seat_order, bet, outcome, multiplier,
      claim, paid, loss, balance_delta, payment_status, udeg_before, udeg_after
    ) values (
      p_round_id, v_l_uid[i], v_rp.seat_order, v_rp.bet, 'LOSE', 1,
      0, 0,
      case when v_l_charged[i] then v_l_amt[i] else 0 end,
      case when v_l_charged[i] then -v_l_amt[i] else 0 end,
      case when v_l_charged[i] then 'COLLECTED' else 'CAPPED_UDEG' end,
      v_remaining, v_remaining
    );
  end loop;

  -- Invariants
  if v_sum_delta + v_dealer_delta <> 0 then
    raise exception 'INVARIANT_ZERO_SUM_VIOLATED';
  end if;

  if v_dealer_delta > v_round.udeg_limit then
    raise exception 'INVARIANT_DEALER_PROFIT_EXCEEDS_UDEG';
  end if;

  if v_dealer_delta < -v_round.udeg_limit then
    raise exception 'INVARIANT_DEALER_LOSS_EXCEEDS_UDEG';
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
