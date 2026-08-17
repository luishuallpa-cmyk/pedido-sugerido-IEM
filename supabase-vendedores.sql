-- Ejecutar UNA vez en Supabase → SQL Editor
create table if not exists public.pedidos_sugeridos (
  id uuid primary key default gen_random_uuid(),
  vendedor_codigo text,
  vendedor_nombre text,
  ruta text,
  items jsonb not null default '[]'::jsonb,
  total_cajas integer default 0,
  total_unidades integer default 0,
  notas text,
  estado text default 'pendiente',
  created_at timestamptz default now()
);
alter table public.pedidos_sugeridos enable row level security;
drop policy if exists "pedidos_sugeridos_insert_auth" on public.pedidos_sugeridos;
create policy "pedidos_sugeridos_insert_auth" on public.pedidos_sugeridos
  for insert to authenticated with check (true);
drop policy if exists "pedidos_sugeridos_select_auth" on public.pedidos_sugeridos;
create policy "pedidos_sugeridos_select_auth" on public.pedidos_sugeridos
  for select to authenticated using (true);
drop policy if exists "pedidos_sugeridos_update_auth" on public.pedidos_sugeridos;
create policy "pedidos_sugeridos_update_auth" on public.pedidos_sugeridos
  for update to authenticated using (true) with check (true);
