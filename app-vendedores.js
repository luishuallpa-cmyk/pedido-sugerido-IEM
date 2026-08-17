(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var supabaseClient = null;
  var perfil = null;
  var catalogo = [];
  var pedido = [];
  var selected = null;
  var filtroTipo = '';

  function toast(msg, err) {
    var el = $('vToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('err', !!err);
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.add('hidden'); }, 3200);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function normalizarTipo(t) {
    t = String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (t.indexOf('FRIO') !== -1) return 'FRIOS';
    if (t.indexOf('SECO') !== -1) return 'SECOS';
    return '';
  }

  function inferirTipo(p) {
    var t = normalizarTipo(p.tipo_almacen || p.Tipo || p.tipo || '');
    if (t) return t;
    var blob = (String(p.linea || '') + ' ' + String(p.descripcion || '')).toUpperCase();
    if (/YOGUR|QUESO|LECHE|FRESCA|JAMON|SALCHICH|MORTADEL|MANTECOS|CREMA|FRIO/.test(blob)) return 'FRIOS';
    if (/EVAPOR|LECHE.*CAJA|WATTS|NUTRILAC|SECO|GALLETA|AVENA/.test(blob)) return 'SECOS';
    return '';
  }

  function esPromOCbm(p) {
    var d = String(p.descripcion || '').toUpperCase();
    var c = String(p.codigo || '');
    if (/\bPROM\b|\bPROM\.|PROM\s|\bCBM\b|COMBO\b/.test(d)) return true;
    if (/^9\d{3}$/.test(c) && /PROM|CBM|COMBO/.test(d)) return true;
    return false;
  }

  function esBasura(p) {
    var d = String(p.descripcion || '').toUpperCase();
    var c = String(p.codigo || '');
    if (/RECOJO|VEHICULO|VEHÍCULO|DESCUENTO|SERVICIO|FLETE|TRANSPORTE/.test(d)) return true;
    if (/^0+$/.test(c)) return true;
    return false;
  }

  function mapProducto(p) {
    return {
      codigo: String(p.codigo || '').trim(),
      codigo_fabrica: p.codigo_fabrica ? String(p.codigo_fabrica) : '',
      descripcion: String(p.descripcion || '').trim(),
      unidad_ref: p.unidad_ref || '',
      factor_empaque: Number(p.factor_empaque) > 0 ? Number(p.factor_empaque) : 1,
      linea: p.linea ? String(p.linea) : '',
      marca: p.marca ? String(p.marca) : '',
      tipo_almacen: inferirTipo(p),
      activo: p.activo !== false
    };
  }

  function initSupabase() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      toast('Falta config.js (Supabase)', true);
      return null;
    }
    if (!window.supabase || !window.supabase.createClient) {
      toast('No cargó la librería Supabase', true);
      return null;
    }
    return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }

  async function cargarCatalogo() {
    if (!supabaseClient) return;
    var { data: sess } = await supabaseClient.auth.getSession();
    if (!sess || !sess.session) {
      toast('Sesión expirada. Vuelve a entrar.', true);
      mostrarLogin();
      return;
    }
    try {
      var all = [];
      var from = 0;
      var page = 1000;
      while (true) {
        var { data, error } = await supabaseClient
          .from('productos')
          .select('codigo,codigo_fabrica,descripcion,unidad_ref,factor_empaque,linea,marca,activo')
          .eq('activo', true)
          .range(from, from + page - 1);
        if (error) throw error;
        if (!data || !data.length) break;
        all = all.concat(data);
        if (data.length < page) break;
        from += page;
      }
      catalogo = all
        .map(mapProducto)
        .filter(function (p) {
          if (!p.codigo) return false;
          if (esBasura(p)) return false;
          if (esPromOCbm(p)) return false; // vendedores no piden PROM/CBM
          return true;
        });
      $('vCatalogCount').textContent = 'Catálogo: ' + catalogo.length + ' productos habilitados (sin PROM/CBM)';
      if (!catalogo.length) {
        toast('Sin productos habilitados. Sube el Excel base en inventario.', true);
      } else {
        toast('Catálogo: ' + catalogo.length + ' productos');
      }
      renderResults();
    } catch (e) {
      console.error(e);
      toast('No se pudo cargar catálogo: ' + (e.message || e), true);
    }
  }

  function renderResults() {
    var q = String(($('vSearch') && $('vSearch').value) || '').trim().toLowerCase();
    var box = $('vResults');
    if (!box) return;
    if (!q || q.length < 1) {
      box.innerHTML = '<p class="muted">Escribe un código o nombre…</p>';
      return;
    }
    var list = catalogo.filter(function (p) {
      if (filtroTipo && p.tipo_almacen !== filtroTipo) return false;
      var blob = (p.codigo + ' ' + p.codigo_fabrica + ' ' + p.descripcion + ' ' + p.linea).toLowerCase();
      return blob.indexOf(q) !== -1;
    }).slice(0, 40);

    if (!list.length) {
      box.innerHTML = '<p class="muted">Sin resultados</p>';
      return;
    }
    box.innerHTML = list.map(function (p) {
      return (
        '<button type="button" class="result-item" data-codigo="' + escapeHtml(p.codigo) + '">' +
          '<div class="ri-name">' + escapeHtml(p.descripcion) + '</div>' +
          '<div class="ri-meta">Cód: ' + escapeHtml(p.codigo) +
            (p.codigo_fabrica ? ' · Fáb: ' + escapeHtml(p.codigo_fabrica) : '') +
            (p.tipo_almacen ? ' · ' + escapeHtml(p.tipo_almacen) : '') +
            (p.linea ? ' · ' + escapeHtml(p.linea) : '') +
          '</div>' +
        '</button>'
      );
    }).join('');
  }

  function seleccionar(codigo) {
    selected = catalogo.find(function (p) { return p.codigo === codigo; }) || null;
    if (!selected) return;
    $('vProductoCard').classList.remove('hidden');
    $('vProdName').textContent = selected.descripcion;
    $('vProdCodes').textContent =
      'Cód: ' + selected.codigo +
      ' · Cód. Fábrica: ' + (selected.codigo_fabrica || '—') +
      (selected.linea ? ' · ' + selected.linea : '');
    $('vFactor').textContent = 'Factor empaque: ×' + selected.factor_empaque +
      (selected.unidad_ref ? ' · UM: ' + selected.unidad_ref : '');
    $('vCajas').value = '0';
    $('vUnidades').value = '0';
    $('vResults').innerHTML = '';
    if ($('vSearch')) $('vSearch').value = '';
  }

  function renderPedido() {
    var box = $('vPedidoList');
    if (!pedido.length) {
      box.innerHTML = '<p class="muted">Aún no hay productos.</p>';
    } else {
      box.innerHTML = pedido.map(function (x, i) {
        return (
          '<div class="pedido-item">' +
            '<div class="pi-info">' +
              '<div class="pi-name">' + escapeHtml(x.descripcion) + '</div>' +
              '<div class="pi-qty">' + escapeHtml(x.codigo) + ' · ' + x.cajas + ' cajas · ' + x.unidades + ' unid.</div>' +
            '</div>' +
            '<button type="button" class="pi-del" data-idx="' + i + '" title="Quitar">✕</button>' +
          '</div>'
        );
      }).join('');
    }
    var tc = 0, tu = 0;
    pedido.forEach(function (x) { tc += x.cajas; tu += x.unidades; });
    $('vTotales').textContent = tc + ' cajas · ' + tu + ' unidades · ' + pedido.length + ' ítems';
  }

  function agregar() {
    if (!selected) {
      toast('Elige un producto', true);
      return;
    }
    var cajas = Math.max(0, parseInt($('vCajas').value, 10) || 0);
    var unidades = Math.max(0, parseInt($('vUnidades').value, 10) || 0);
    if (cajas === 0 && unidades === 0) {
      toast('Indica cajas o unidades', true);
      return;
    }
    var ex = pedido.find(function (x) { return x.codigo === selected.codigo; });
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
    toast('Agregado: ' + selected.codigo);
    selected = null;
    $('vProductoCard').classList.add('hidden');
    renderPedido();
  }

  async function enviar() {
    if (!pedido.length) {
      toast('El pedido está vacío', true);
      return;
    }
    if (!supabaseClient || !perfil) {
      toast('Sin sesión', true);
      return;
    }
    var tc = 0, tu = 0;
    pedido.forEach(function (x) { tc += x.cajas; tu += x.unidades; });
    var payload = {
      vendedor_codigo: perfil.usuario,
      vendedor_nombre: perfil.nombre || perfil.usuario,
      ruta: perfil.ruta || null,
      items: pedido,
      total_cajas: tc,
      total_unidades: tu,
      notas: ($('vNotas') && $('vNotas').value) || null,
      estado: 'pendiente'
    };
    try {
      var { error } = await supabaseClient.from('pedidos_sugeridos').insert(payload);
      if (error) throw error;
      toast('Sugerencia enviada');
      pedido = [];
      if ($('vNotas')) $('vNotas').value = '';
      renderPedido();
    } catch (e) {
      console.error(e);
      toast('No se pudo enviar: ' + (e.message || e) + ' (¿ejecutaste el SQL?)', true);
    }
  }

  function mostrarLogin() {
    $('loginScreen').classList.remove('hidden');
    $('appScreen').classList.add('hidden');
    perfil = null;
  }

  function mostrarApp() {
    $('loginScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');
    $('vWho').textContent = (perfil.nombre || perfil.usuario) + ' · ' + (perfil.usuario || '');
  }

  async function login() {
    var user = String(($('vUser') && $('vUser').value) || '').trim();
    var pass = String(($('vPass') && $('vPass').value) || '');
    if (!user || !pass) {
      toast('Usuario y clave requeridos', true);
      return;
    }
    if (!supabaseClient) supabaseClient = initSupabase();
    if (!supabaseClient) return;
    $('vLoginBtn').disabled = true;
    try {
      var email = user.indexOf('@') !== -1 ? user : (user + '@iem.local');
      var { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: pass });
      if (error) throw error;
      var uid = data.user && data.user.id;
      var { data: perf, error: e2 } = await supabaseClient
        .from('perfiles')
        .select('usuario, nombre, rol, activo, ruta')
        .eq('usuario', user)
        .maybeSingle();
      if (e2) throw e2;
      if (!perf) {
        // fallback by auth id if column exists
        var r2 = await supabaseClient.from('perfiles').select('usuario, nombre, rol, activo, ruta').limit(20);
        if (r2.data) {
          perf = r2.data.find(function (x) {
            return String(x.usuario || '').toLowerCase() === user.toLowerCase();
          });
        }
      }
      if (!perf) throw new Error('No hay perfil para este usuario');
      if (String(perf.rol || '').toLowerCase() !== 'vendedor') {
        await supabaseClient.auth.signOut();
        throw new Error('Solo rol vendedor');
      }
      if (perf.activo === false) {
        await supabaseClient.auth.signOut();
        throw new Error('Usuario inactivo');
      }
      perfil = perf;
      mostrarApp();
      await cargarCatalogo();
    } catch (e) {
      console.error(e);
      var msg = e.message || String(e);
      if (/invalid login|invalid credentials|email/i.test(msg)) {
        msg = 'Usuario o clave incorrectos';
      }
      toast(msg, true);
    } finally {
      $('vLoginBtn').disabled = false;
    }
  }

  async function logout() {
    try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch (e) {}
    catalogo = [];
    pedido = [];
    selected = null;
    mostrarLogin();
  }

  function bind() {
    $('vLoginBtn').addEventListener('click', login);
    $('vPass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') login();
    });
    $('vLogoutBtn').addEventListener('click', logout);
    $('vSearch').addEventListener('input', renderResults);
    $('vResults').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-codigo]');
      if (btn) seleccionar(btn.getAttribute('data-codigo'));
    });
    $('vAddBtn').addEventListener('click', agregar);
    $('vClearProd').addEventListener('click', function () {
      selected = null;
      $('vProductoCard').classList.add('hidden');
    });
    $('vPedidoList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-idx]');
      if (!b) return;
      var i = parseInt(b.getAttribute('data-idx'), 10);
      if (!isNaN(i)) {
        pedido.splice(i, 1);
        renderPedido();
      }
    });
    $('vSendBtn').addEventListener('click', enviar);
    document.querySelectorAll('#vFiltros .filtro-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#vFiltros .filtro-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        filtroTipo = (btn.getAttribute('data-tipo') || '').toUpperCase();
        renderResults();
      });
    });
  }

  async function tryRestore() {
    supabaseClient = initSupabase();
    if (!supabaseClient) return;
    var { data } = await supabaseClient.auth.getSession();
    if (!data || !data.session) return;
    try {
      var email = (data.session.user && data.session.user.email) || '';
      var user = email.replace(/@iem\.local$/i, '');
      var { data: perf } = await supabaseClient
        .from('perfiles')
        .select('usuario, nombre, rol, activo, ruta')
        .eq('usuario', user)
        .maybeSingle();
      if (perf && String(perf.rol || '').toLowerCase() === 'vendedor' && perf.activo !== false) {
        perfil = perf;
        mostrarApp();
        await cargarCatalogo();
      }
    } catch (e) {
      console.warn(e);
    }
  }

  bind();
  tryRestore();
})();
