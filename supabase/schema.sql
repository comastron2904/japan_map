-- =========================================================
--  일본 여행지 실시간 지도 · Supabase 스키마
--  Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) 방(반) : 교사가 만드는 세션. teacher_key는 해시로만 저장
create table if not exists public.rooms (
  code             text primary key check (code ~ '^[A-Z0-9]{4,8}$'),
  teacher_key_hash text not null,
  created_at       timestamptz not null default now()
);

-- 2) 학생 선택 : 한 기기(client_id)당 방마다 1개. 다시 고르면 덮어씀
create table if not exists public.picks (
  id         uuid primary key default gen_random_uuid(),
  room       text not null references public.rooms(code) on delete cascade,
  client_id  text not null,
  nickname   text not null check (char_length(nickname) between 1 and 12),
  region     text not null check (region ~ '^[a-z]{2,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room, client_id)
);
create index if not exists picks_room_idx on public.picks(room);

-- 3) RLS : 직접 쓰기는 전부 막고, 읽기만 허용. 쓰기는 아래 함수로만.
alter table public.rooms enable row level security;
alter table public.picks enable row level security;

drop policy if exists "picks readable" on public.picks;
create policy "picks readable" on public.picks
  for select to anon, authenticated using (true);
-- rooms 에는 정책 없음 → 교사 키 해시는 아무도 못 읽음

revoke insert, update, delete on public.picks from anon, authenticated;
revoke all on public.rooms from anon, authenticated;

-- 4) 함수 (security definer : 테이블 권한 대신 함수 안에서 검증)

-- 교사 키 확인 (내부용)
create or replace function public._is_teacher(p_room text, p_key text)
returns boolean language sql security definer
set search_path = public, extensions as $$
  select exists (
    select 1 from public.rooms
    where code = upper(p_room)
      and teacher_key_hash = crypt(p_key, teacher_key_hash)
  );
$$;
revoke all on function public._is_teacher(text, text) from public, anon, authenticated;

-- 방 존재 여부
create or replace function public.room_exists(p_code text)
returns boolean language sql security definer
set search_path = public as $$
  select exists (select 1 from public.rooms where code = upper(p_code));
$$;

-- 방 만들기 (교사 화면이 자동 호출)
create or replace function public.create_room(p_code text, p_key text)
returns void language plpgsql security definer
set search_path = public, extensions as $$
begin
  if upper(p_code) !~ '^[A-Z0-9]{4,8}$' then raise exception 'BAD_CODE'; end if;
  if char_length(p_key) < 16 then raise exception 'BAD_KEY'; end if;
  insert into public.rooms(code, teacher_key_hash)
  values (upper(p_code), crypt(p_key, gen_salt('bf')));
exception when unique_violation then
  raise exception 'ROOM_TAKEN';
end $$;

-- 학생 제출 (같은 기기에서 다시 고르면 수정)
create or replace function public.submit_pick(
  p_room text, p_client text, p_nickname text, p_region text)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_room text := upper(p_room);
  v_nick text := btrim(p_nickname);
begin
  if not exists (select 1 from public.rooms where code = v_room) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if char_length(v_nick) < 1 or char_length(v_nick) > 12 then
    raise exception 'BAD_NICKNAME';
  end if;
  if p_region !~ '^[a-z]{2,20}$' then raise exception 'BAD_REGION'; end if;
  if char_length(p_client) < 8 or char_length(p_client) > 64 then
    raise exception 'BAD_CLIENT';
  end if;
  if (select count(*) from public.picks where room = v_room) >= 300
     and not exists (select 1 from public.picks where room = v_room and client_id = p_client) then
    raise exception 'ROOM_FULL';
  end if;

  insert into public.picks(room, client_id, nickname, region)
  values (v_room, p_client, v_nick, p_region)
  on conflict (room, client_id)
  do update set nickname = excluded.nickname,
                region   = excluded.region,
                updated_at = now();
end $$;

-- 교사 : 한 명 삭제 (부적절한 닉네임 등)
create or replace function public.teacher_delete_pick(p_room text, p_key text, p_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public._is_teacher(p_room, p_key) then raise exception 'NOT_TEACHER'; end if;
  delete from public.picks where id = p_id and room = upper(p_room);
end $$;

-- 교사 : 전체 초기화
create or replace function public.teacher_clear_room(p_room text, p_key text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public._is_teacher(p_room, p_key) then raise exception 'NOT_TEACHER'; end if;
  delete from public.picks where room = upper(p_room);
end $$;

grant execute on function public.room_exists(text)                         to anon, authenticated;
grant execute on function public.create_room(text, text)                   to anon, authenticated;
grant execute on function public.submit_pick(text, text, text, text)       to anon, authenticated;
grant execute on function public.teacher_delete_pick(text, text, uuid)     to anon, authenticated;
grant execute on function public.teacher_clear_room(text, text)            to anon, authenticated;

-- 5) 실시간(Realtime) : picks 변경을 교사 화면으로 푸시
do $$
begin
  alter publication supabase_realtime add table public.picks;
exception when duplicate_object then null;
end $$;

-- (선택) 30일 지난 방 정리 : 필요할 때 SQL Editor에서 실행
-- delete from public.rooms where created_at < now() - interval '30 days';
