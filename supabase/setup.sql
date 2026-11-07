-- Chạy 1 lần trong Supabase: SQL Editor → New query → dán toàn bộ → Run.
-- Chạy lại nhiều lần cũng an toàn.

-- 1) Skill người dùng đã nhận (người dùng chỉ xem được của chính mình)
create table if not exists public.claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null,
  created_at timestamptz not null default now(),
  unique (user_id, skill)
);
alter table public.claims enable row level security;
drop policy if exists "claims_select_own" on public.claims;
create policy "claims_select_own" on public.claims
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- 2) Nhật ký nhập mật khẩu (chặn đoán mò). Không có policy => chỉ Edge Function đọc/ghi được.
create table if not exists public.claim_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
alter table public.claim_attempts enable row level security;
create index if not exists claim_attempts_user_time on public.claim_attempts (user_id, created_at);

-- 3) Kho file skill RIÊNG TƯ (không ai tải trực tiếp được, chỉ qua link tạm của Edge Function)
insert into storage.buckets (id, name, public)
values ('skills', 'skills', false)
on conflict (id) do update set public = false;

-- Xem thống kê: ai đã nhận skill nào
-- select c.skill, u.email, c.created_at from public.claims c join auth.users u on u.id = c.user_id order by c.created_at desc;
