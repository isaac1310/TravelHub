-- Run this in Supabase: SQL Editor → New query → Run
-- Shared vacation budget (Phase 1): access only via RPC with room id + secret

create table if not exists public.shared_budgets (
  id uuid primary key default gen_random_uuid(),
  room_secret text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shared_budgets enable row level security;

-- No direct table access for anon (all access through functions below)
revoke all on public.shared_budgets from anon, authenticated;

-- Track creation time for rate limiting (safe to run on an existing table)
alter table public.shared_budgets
  add column if not exists created_at timestamptz not null default now();

create or replace function public.create_shared_budget(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_secret text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_recent int;
begin
  -- Payload size cap: 8 MB (documents are capped client-side at 4 MB total)
  if pg_column_size(p_payload) > 8 * 1024 * 1024 then
    raise exception 'Payload too large';
  end if;

  -- Rate limit: at most 20 new rooms per hour across the project.
  -- (Anon key is public; this stops mass room creation / storage abuse.)
  select count(*) into v_recent
  from public.shared_budgets
  where created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'Too many new shared trips right now — try again later';
  end if;

  insert into public.shared_budgets (id, room_secret, payload)
  values (v_id, v_secret, coalesce(p_payload, '{}'::jsonb));

  return jsonb_build_object('id', v_id, 'secret', v_secret);
end;
$$;

create or replace function public.fetch_shared_budget(p_id uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_updated timestamptz;
begin
  select payload, updated_at
  into v_payload, v_updated
  from public.shared_budgets
  where id = p_id and room_secret = p_secret;

  if v_payload is null then
    return null;
  end if;

  return jsonb_build_object(
    'payload', v_payload,
    'updated_at', v_updated
  );
end;
$$;

create or replace function public.save_shared_budget(
  p_id uuid,
  p_secret text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated timestamptz;
begin
  -- Same 8 MB cap as create
  if pg_column_size(p_payload) > 8 * 1024 * 1024 then
    raise exception 'Payload too large';
  end if;

  update public.shared_budgets
  set
    payload = coalesce(p_payload, '{}'::jsonb),
    updated_at = now()
  where id = p_id and room_secret = p_secret
  returning updated_at into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true, 'updated_at', v_updated);
end;
$$;

grant execute on function public.create_shared_budget(jsonb) to anon, authenticated;
grant execute on function public.fetch_shared_budget(uuid, text) to anon, authenticated;
grant execute on function public.save_shared_budget(uuid, text, jsonb) to anon, authenticated;
