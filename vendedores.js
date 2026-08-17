/* IEM GROUP — PWA vendedores: buscar catálogo y enviar sugerencia de pedido a Supabase */
(function () {
  'use strict';

  const cfg = window.IEM_CONFIG || {};
  let sb = null;
  if (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  const SES_KEY = 'iem_vendedor_sesion_v1';
  const PED_KEY = 'iem_vendedor_pedido_v1';

  let catalogo = [];
  let pedido = [];
  let sesion = null;
  let selected = null;
  let filtroTipo = '';
  let searchTimer = null;

  const $ = function (id) { return document.getElementById(id); };

  function toast(msg, isError) {
    const el = $('vToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2800);
  }

  function normalizarTipo(t) {
    const s = String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/FRIO/.test(s)) return 'FRIOS';
    if (/SECO/.test(s)) return 'SECOS';
    return '';
  }

  function factorDe(p) {
    const f = Number(p.factor_empaque || p.FactorEmpaque || 1);
    return f > 0 ? f : 1;
  }

  function mapProducto(p) {
    return {
      codigo: String(p.codigo || '').trim(),
      codigo_fabrica: p.codigo_fabrica || '',
      descripcion: p.descripcion || p.Producto || '',
      unidad_ref: p.unidad_ref || '',
      factor_empaque: factorDe(p),
      linea: p.linea || '',
      marca: p.marca || '',
      tipo_almacen: normalizarTipo(p.tipo_almacen || p.Tipo || ''),
      activo: p.activo !== false
    };
  }

  async function cargarCatalogo() {
    if (!sb) {
      toast('Sin conexión a Supabase (config.js).', true);
      return;
    }
    try {
      let all = [];
      let from = 0;
      const page = 1000;
      while (true) {
        const { data, error } = await sb
          .from('productos')
          .select('codigo,codigo_fabrica,descripcion,unidad_ref,factor_empaque,linea,marca,tipo_almacen,activo')
          .eq('activo', true)
          .range(from, from + page - 1);
        if (error) throw error;
        if (!data || !data.length) break;
        all = all.concat(data.map(mapProducto));
        if (data.length < page) break;
        from += page;
      }
      catalogo = all.filter(function (p) { return p.codigo; });
      toast('Catálogo: ' + catalogo.length + ' productos');
    } catch (e) {
      console.error(e);
      toast('No se pudo cargar catálogo: ' + (e.message || e), true);
    }
  }

  function buscar(q) {
    const term = String(q || '').trim().toUpperCase();
    if (!term || term.length < 1) {
      $('vResults').innerHTML = '<p class="v-muted">Escribe para buscar en el catálogo.</p>';
      return;
    }
    const parts = term.split(/\s+/).filter(Boolean);
    let list = catalogo.filter(function (p) {
      if (filtroTipo && p.tipo_almacen && p.tipo_almacen !== filtroTipo) return false;
      if (filtroTipo && !p.tipo_almacen) return false;
      const blob = (
        p.codigo + ' ' + p.codigo_fabrica + ' ' + p.descripcion + ' ' +
        (p.marca || '') + ' ' + (p.linea || '')
      ).toUpperCase();
      return parts.every(function (w) { return blob.indexOf(w) !== -1; });
    });
    list = list.slice(0, 80);
    if (!list.length) {
      $('vResults').innerHTML = '<p class="v-muted">Sin resultados.</p>';
      return;
    }
    $('vResults').innerHTML = list.map(function (p) {
      return (
        '<div class="v-item" data-cod="' + escapeAttr(p.codigo) + '">' +
        '<div class="cod">' + escapeHtml(p.codigo) + '</div>' +
        '<div class="desc">' + escapeHtml(p.descripcion) +
        '<div class="meta">' + escapeHtml(p.linea || '-') +
        (p.tipo_almacen ? ' · ' + p.tipo_almacen : '') +
        ' · factor ' + p.factor_empaque + '</div></div></div>'
      );
    }).join('');
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function seleccionar(codigo) {
    selected = catalogo.find(function (p) { return p.codigo === codigo; }) || null;
    if (!selected) return;
    $('vQtyCard').hidden = false;
    $('vProdSel').innerHTML =
      '<strong>' + escapeHtml(selected.codigo) + '</strong> · ' +
      escapeHtml(selected.descripcion);
    $('vFactor').textContent = '×' + selected.factor_empaque;
    $('vCajas').value = '0';
    $('vUnidades').value = '0';
    $('vCajas').focus();
  }

  function renderPedido() {
    const list = $('vPedList');
    $('vPedCount').textContent = String(pedido.length);
    let tc = 0, tu = 0;
    pedido.forEach(function (p) {
      tc += Number(p.cajas) || 0;
      tu += Number(p.unidades) || 0;
    });
    $('vPedTotales').textContent = 'Cajas ' + tc + ' · Unidades ' + tu;
    if (!pedido.length) {
      list.innerHTML = '<p class="v-muted">Aún no hay productos.</p>';
      return;
    }
    list.innerHTML = pedido.map(function (p, i) {
      return (
        '<div class="v-ped-row">' +
        '<div><strong>' + escapeHtml(p.codigo) + '</strong><br><span class="v-muted">' +
        escapeHtml(p.descripcion) + '</span></div>' +
        '<div>' + p.cajas + ' cj / ' + p.unidades + ' u</div>' +
        '<button type="button" data-del="' + i + '" title="Quitar">🗑</button>' +
        '</div>'
      );
    }).join('');
  }

  function agregarAlPedido() {
    if (!selected) {
      toast('Selecciona un producto.', true);
      return;
    }
    const cajas = parseInt($('vCajas').value, 10) || 0;
    const unidades = parseInt($('vUnidades').value, 10) || 0;
    if (cajas + unidades <= 0) {
      toast('Indica cantidad.', true);
      return;
    }
    const ex = pedido.find(function (x) { return x.codigo === selected.codigo; });
    if (ex) {
      ex.cajas += cajas;
      ex.unidades += unidades;
    } else {
      pedido.push({
        codigo: selected.codigo,
        codigo_fabrica: selected.codigo_fabrica,
        descripcion: selected.descripcion,
        unidad_ref: selected.unidad_ref,
        factor: selected.factor_empaque,
        linea: selected.linea,
        cajas: cajas,
        unidades: unidades
      });
    }
    try { localStorage.setItem(PED_KEY, JSON.stringify(pedido)); } catch (e) {}
    renderPedido();
    toast('Agregado: ' + selected.codigo);
    $('vCajas').value = '0';
    $('vUnidades').value = '0';
  }

  // Misma auth que inventario: 400 → 400@iem.local + password de Auth
  const AUTH_EMAIL_DOMAIN = 'iem.local';

  async function login() {
    const codigo = String($('vCodigo').value || '').trim().toLowerCase();
    const clave = String($('vClave').value || '').trim();
    if (!codigo || !clave) {
      $('vLoginHint').textContent = 'Completa código y clave.';
      return;
    }
    if (!sb) {
      $('vLoginHint').textContent = 'Falta config de Supabase.';
      return;
    }
    $('vLoginHint').textContent = 'Validando…';
    try {
      const email = codigo + '@' + AUTH_EMAIL_DOMAIN;
      const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
        email: email,
        password: clave
      });
      if (authErr) throw authErr;
      if (!authData || !authData.session || !authData.user) {
        throw new Error('Sin sesión');
      }

      const uid = authData.user.id;
      const { data: perfil, error: perfilErr } = await sb
        .from('perfiles')
        .select('usuario, nombre, rol, activo')
        .eq('id', uid)
        .maybeSingle();
      if (perfilErr) throw perfilErr;
      if (!perfil) {
        await sb.auth.signOut();
        $('vLoginHint').textContent = 'Usuario sin perfil. Pide alta al admin.';
        return;
      }
      if (perfil.activo === false) {
        await sb.auth.signOut();
        $('vLoginHint').textContent = 'Usuario desactivado.';
        return;
      }
      const rol = String(perfil.rol || '').toLowerCase();
      if (rol !== 'vendedor') {
        await sb.auth.signOut();
        $('vLoginHint').textContent = 'Este acceso es solo para rol vendedor.';
        return;
      }

      sesion = {
        codigo: String(perfil.usuario || codigo),
        nombre: perfil.nombre || perfil.usuario || codigo,
        ruta: '',
        celular: '',
        userId: uid
      };
      try { localStorage.setItem(SES_KEY, JSON.stringify(sesion)); } catch (e) {}
      entrarApp();
    } catch (e) {
      console.error(e);
      const msg = String((e && e.message) || e || '');
      if (/invalid login|invalid credentials|email/i.test(msg)) {
        $('vLoginHint').textContent = 'Usuario o clave incorrectos.';
      } else {
        $('vLoginHint').textContent = 'Error: ' + msg;
      }
    }
  }

  function entrarApp() {
    $('vLoginCard').hidden = true;
    $('vApp').hidden = false;
    $('vLogoutBtn').hidden = false;
    $('vUserLabel').textContent = (sesion.nombre || sesion.codigo) +
      (sesion.ruta ? ' · Ruta ' + sesion.ruta : '');
    try {
      pedido = JSON.parse(localStorage.getItem(PED_KEY) || '[]') || [];
    } catch (e) { pedido = []; }
    renderPedido();
    cargarCatalogo();
  }

  function logout() {
    sesion = null;
    try {
      localStorage.removeItem(SES_KEY);
      localStorage.removeItem(PED_KEY);
    } catch (e) {}
    try { if (sb) sb.auth.signOut(); } catch (e2) {}
    pedido = [];
    $('vApp').hidden = true;
    $('vLoginCard').hidden = false;
    $('vLogoutBtn').hidden = true;
    $('vUserLabel').textContent = 'Vendedor';
  }

  async function enviarSugerencia() {
    if (!sesion) return;
    if (!pedido.length) {
      toast('El pedido está vacío.', true);
      return;
    }
    if (!sb) {
      toast('Sin Supabase.', true);
      return;
    }
    let tc = 0, tu = 0;
    pedido.forEach(function (p) {
      tc += Number(p.cajas) || 0;
      tu += Number(p.unidades) || 0;
    });
    const payload = {
      vendedor_codigo: sesion.codigo,
      vendedor_nombre: sesion.nombre,
      ruta: sesion.ruta || null,
      items: pedido,
      total_cajas: tc,
      total_unidades: tu,
      notas: String($('vNotas').value || '').trim() || null,
      estado: 'pendiente'
    };
    try {
      const { error } = await sb.from('pedidos_sugeridos').insert(payload);
      if (error) throw error;
      toast('Sugerencia enviada a IEM.');
      pedido = [];
      try { localStorage.removeItem(PED_KEY); } catch (e) {}
      renderPedido();
      $('vNotas').value = '';
    } catch (e) {
      console.error(e);
      toast('No se pudo enviar: ' + (e.message || e) +
        ' (¿tabla pedidos_sugeridos?)', true);
    }
  }

  // Eventos
  $('vLoginBtn').addEventListener('click', login);
  $('vClave').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') login();
  });
  $('vLogoutBtn').addEventListener('click', logout);
  $('vSearch').addEventListener('input', function () {
    clearTimeout(searchTimer);
    const q = $('vSearch').value;
    searchTimer = setTimeout(function () { buscar(q); }, 180);
  });
  $('vResults').addEventListener('click', function (e) {
    const row = e.target.closest && e.target.closest('.v-item');
    if (!row) return;
    seleccionar(row.getAttribute('data-cod'));
  });
  document.querySelectorAll('.v-chip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.v-chip').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      filtroTipo = (btn.getAttribute('data-tipo') || '').toUpperCase();
      buscar($('vSearch').value);
    });
  });
  $('vAddBtn').addEventListener('click', agregarAlPedido);
  $('vClearBtn').addEventListener('click', function () {
    if (!pedido.length) return;
    if (!confirm('¿Vaciar el pedido?')) return;
    pedido = [];
    try { localStorage.removeItem(PED_KEY); } catch (e) {}
    renderPedido();
  });
  $('vPedList').addEventListener('click', function (e) {
    const btn = e.target.closest && e.target.closest('[data-del]');
    if (!btn) return;
    const i = parseInt(btn.getAttribute('data-del'), 10);
    if (!isNaN(i)) {
      pedido.splice(i, 1);
      try { localStorage.setItem(PED_KEY, JSON.stringify(pedido)); } catch (err) {}
      renderPedido();
    }
  });
  $('vSendBtn').addEventListener('click', enviarSugerencia);

  // Restaurar sesión
  try {
    const raw = localStorage.getItem(SES_KEY);
    if (raw) {
      sesion = JSON.parse(raw);
      if (sesion && sesion.codigo) entrarApp();
    }
  } catch (e) {}
})();
