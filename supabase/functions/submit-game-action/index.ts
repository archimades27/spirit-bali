// Supabase Edge Function: submit-game-action
// Action gateway validating JWT, payload, safe integers, and CSPRNG deck entropy
// before invoking a single atomic Postgres transaction RPC.

// @ts-nocheck — Deno Edge Runtime types
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function createShuffledDeck(): [number, number][] {
  const deck: [number, number][] = [];
  for (let a = 0; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) {
      deck.push([a, b]);
    }
  }
  const uint32Range = 0x100000000;
  const buf = new Uint32Array(1);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const bound = i + 1;
    const limit = uint32Range - (uint32Range % bound);
    let r = 0;
    for (;;) {
      crypto.getRandomValues(buf);
      if (buf[0] < limit) {
        r = buf[0] % bound;
        break;
      }
    }
    const tmp = deck[i];
    deck[i] = deck[r];
    deck[r] = tmp;
  }
  return deck;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json(
        { accepted: false, code: 'UNAUTHENTICATED', message: 'Missing Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify caller JWT using anon client with caller's Authorization header
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) {
      return Response.json(
        { accepted: false, code: 'UNAUTHENTICATED', message: 'Invalid session' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { roomId, roundId, actionId, expectedVersion, type, payload } = body ?? {};

    if (
      typeof roomId !== 'string' ||
      typeof actionId !== 'string' ||
      !Number.isSafeInteger(expectedVersion) ||
      typeof type !== 'string'
    ) {
      return Response.json(
        { accepted: false, code: 'INVALID_STATE', message: 'Malformed action payload' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (payload?.amount !== undefined && !Number.isSafeInteger(payload.amount)) {
      return Response.json(
        { accepted: false, code: 'INVALID_BET', message: 'Amount must be a safe integer' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Generate server-side CSPRNG deck only when needed (SET_UDEG)
    const shuffledDeck = type === 'SET_UDEG' ? createShuffledDeck() : null;

    // Execute single atomic RPC via service role (never trusting payload.userId)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await adminClient.rpc('submit_game_action_rpc', {
      p_actor_id: userData.user.id,
      p_room_id: roomId,
      p_round_id: roundId ?? null,
      p_action_id: actionId,
      p_expected_version: expectedVersion,
      p_type: type,
      p_payload: payload ?? {},
      p_shuffled_deck: shuffledDeck,
    });

    if (error) {
      return Response.json(
        { accepted: false, actionId, code: 'INVALID_STATE', message: error.message },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json(data, { status: 200, headers: corsHeaders });
  } catch (err) {
    return Response.json(
      { accepted: false, code: 'INVALID_STATE', message: String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
});
