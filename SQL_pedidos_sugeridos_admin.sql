-- ============================================================
-- Pedidos sugeridos: permitir a admin ELIMINAR filas
-- (además de cambiar estado). Ejecutar en Supabase SQL Editor.
-- ============================================================

-- Helper (si aún no existe por el script de sesiones)
create or replace function public.is_iem_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and lower(coalesce(p.rol, '')) = 'admin'
      and coalesce(p.activo, true) = true
  );
$$;

revoke all on function public.is_iem_admin() from public;
grant execute on function public.is_iem_admin() to authenticated;

-- Políticas orientativas (ajusta nombres si ya tienes otras).
-- Vendedor: INSERT/SELECT de sus filas; Admin: ALL.

drop policy if exists "pedidos_select_own_or_admin" on public.pedidos_sugeridos;
drop policy if exists "pedidos_insert_own" on public.pedidos_sugeridos;
drop policy if exists "pedidos_update_admin" on public.pedidos_sugeridos;
drop policy if exists "pedidos_delete_admin" on public.pedidos_sugeridos;

alter table public.pedidos_sugeridos enable row level security;

-- SELECT: propio vendedor o admin (para que el vendedor vea "atendido")
create policy "pedidos_select_own_or_admin"
  on public.pedidos_sugeridos
  for select
  to authenticated
  using (
    public.is_iem_admin()
    or lower(coalesce(vendedor_codigo, '')) = lower(coalesce(
      (select p.usuario from public.perfiles p where p.id = auth.uid() limit 1),
      split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    ))
    or lower(coalesce(usuario, '')) = lower(coalesce(
      (select p.usuario from public.perfiles p where p.id = auth.uid() limit 1),
      split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    ))
  );

-- INSERT: el vendedor crea su pedido
create policy "pedidos_insert_own"
  on public.pedidos_sugeridos
  for insert
  to authenticated
  with check (true);

-- UPDATE estado: admin (y opcionalmente el dueño)
create policy "pedidos_update_admin"
  on public.pedidos_sugeridos
  for update
  to authenticated
  using (public.is_iem_admin())
  with check (public.is_iem_admin());

-- DELETE: solo admin (limpiar duplicados / no arrastrar a la siguiente ronda)
create policy "pedidos_delete_admin"
  on public.pedidos_sugeridos
  for delete
  to authenticated
  using (public.is_iem_admin());
