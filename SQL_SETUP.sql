create table if not exists public.baudicht_state (
  id integer primary key check (id = 1),
  payload jsonb not null
);

insert into public.baudicht_state (id, payload)
values (1, jsonb_build_object('teams', (select jsonb_agg('Team ' || n order by n) from generate_series(1,24) n), 'matches','[]'::jsonb,'playoffs','[]'::jsonb))
on conflict (id) do nothing;

create table if not exists public.baudicht_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.baudicht_state enable row level security;
alter table public.baudicht_admins enable row level security;

-- Public spectator read access
create policy "Public read tournament state" on public.baudicht_state
  for select to anon, authenticated using (true);

-- Authenticated administrators only can write state
create policy "Admin insert tournament state" on public.baudicht_state
  for insert to authenticated with check (exists (select 1 from public.baudicht_admins a where a.user_id = auth.uid()));
create policy "Admin update tournament state" on public.baudicht_state
  for update to authenticated using (exists (select 1 from public.baudicht_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.baudicht_admins a where a.user_id = auth.uid()));

-- Admin lookup function used by the admin page
create or replace function public.is_baudicht_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.baudicht_admins where user_id = auth.uid()); $$;

grant execute on function public.is_baudicht_admin() to authenticated;
