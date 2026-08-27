-- ============================================================
-- Tabla y políticas para cierre forzado de sesiones (admin)
-- Ejecutar en Supabase → SQL Editor
--
-- MEJORAS v1.2.9:
-- - RLS más estricta: cada usuario gestiona SOLO su fila
-- - Solo admins (perfiles.rol = 'admin') pueden ver/actualizar/borrar
--   sesiones de otros (necesario para "Cerrar sesión" del panel admin)
-- - Función helper is_iem_admin() reutilizable
-- ============================================================

-- 1) Tabla (si aún no existe)
create table if not exists public.sesiones_activas (
  id text primary key,
  usuario text not null,
  device_id text,
  nombre_dispositivo text,
  ultimo_ping timestamptz default now(),
  conectado_en timestamptz default now(),
  forzar_cierre boolean not null default false
);

-- Índices útiles
create index if not exists idx_sesiones_ultimo_ping on public.sesiones_activas (ultimo_ping desc);
create index if not exists idx_sesiones_usuario on public.sesiones_activas (usuario);

-- 2) Activar RLS
alter table public.sesiones_activas enable row level security;

-- 3) Quitar políticas viejas (por si existen y bloquean)
drop policy if exists "sesiones_select" on public.sesiones_activas;
drop policy if exists "sesiones_insert" on public.sesiones_activas;
drop policy if exists "sesiones_update" on public.sesiones_activas;
drop policy if exists "sesiones_delete" on public.sesiones_activas;
drop policy if exists "auth all sesiones_activas" on public.sesiones_activas;
drop policy if exists "sesiones authenticated all" on public.sesiones_activas;
drop policy if exists "sesiones_select_own_or_admin" on public.sesiones_activas;
drop policy if exists "sesiones_insert_own" on public.sesiones_activas;
drop policy if exists "sesiones_update_own_or_admin" on public.sesiones_activas;
drop policy if exists "sesiones_delete_own_or_admin" on public.sesiones_activas;

-- 4) Helper: ¿el usuario autenticado es admin en public.perfiles?
--    (security definer para poder leer perfiles sin pelear con RLS de perfiles)
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

-- 5) Políticas restrictivas
-- SELECT: propia fila O admin (para listar conectados en el panel)
create policy "sesiones_select_own_or_admin"
  on public.sesiones_activas
  for select
  to authenticated
  using (
    usuario = coalesce(
      (select p.usuario from public.perfiles p where p.id = auth.uid() limit 1),
      split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    )
    or public.is_iem_admin()
  );

-- INSERT: solo puede crear sesión con su propio nombre de usuario
create policy "sesiones_insert_own"
  on public.sesiones_activas
  for insert
  to authenticated
  with check (
    usuario = coalesce(
      (select p.usuario from public.perfiles p where p.id = auth.uid() limit 1),
      split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    )
  );

-- UPDATE: propia fila (ping / auto-cierre) O admin (forzar_cierre en otros)
create policy "sesiones_update_own_or_admin"
  on public.sesiones_activas
  for update
  to authenticated
  using (
    usuario = coalesce(
      (select p.usuario from public.perfiles p where p.id = auth.uid() limit 1),
      split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    )
    or public.is_iem_admin()
  )
  with check (
    usuario = coalesce(
      (select p.usuario from public.perfiles p where p.id = auth.uid() limit 1),
      split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    )
    or public.is_iem_admin()
  );

-- DELETE: propia fila O admin (limpieza de inactivos)
create policy "sesiones_delete_own_or_admin"
  on public.sesiones_activas
  for delete
  to authenticated
  using (
    usuario = coalesce(
      (select p.usuario from public.perfiles p where p.id = auth.uid() limit 1),
      split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    )
    or public.is_iem_admin()
  );

-- 6) (Opcional) Publicar en Realtime para cierre inmediato
--    En Dashboard → Database → Replication → sesiones_activas → habilitar
--    O por SQL (si tienes permiso):
-- alter publication supabase_realtime add table public.sesiones_activas;

-- Verificación rápida:
-- select * from public.sesiones_activas;
-- select public.is_iem_admin();
-- update public.sesiones_activas set forzar_cierre = true where id = 'algun_id';
