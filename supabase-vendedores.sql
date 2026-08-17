-- IEM GROUP: PWA vendedores
-- Los usuarios YA están en public.perfiles (rol = vendedor) + Auth (password).
-- NO hace falta tabla `vendedores` aparte.
-- Solo crea la tabla de sugerencias de pedido:

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

-- Login PWA (igual que inventario):
-- usuario "400" → email 400@iem.local + password de Supabase Auth
-- perfiles.rol = 'vendedor' y activo = true
