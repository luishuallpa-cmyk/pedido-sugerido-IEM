(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function debounce(fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

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
    // Vendedores NO deben ver ni pedir PROM / CBM / CMB / COMBO / packs promo
    // Nota: en catálogo Laive los combos salen como "CMB2(...)" (no CBM).
    function norm(s) {
      return String(s || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    var d = norm(p.descripcion);
    var c = norm(p.codigo);
    var f = norm(p.codigo_fabrica);
    var linea = norm(p.linea);
    var marca = norm(p.marca);
    var blob = d + ' ' + c + ' ' + f + ' ' + linea + ' ' + marca;

    // Descripción empieza por PROM. / PROMO / CMB2 / CBM /
    if (/^(PROM|PROMO|CBM|CMB|COMBO|PACK)[\s.0-9(]/.test(d)) return true;
    if (/\bPROM\.|\bPROMO\b|\bPROMOS\b|\bPROMOCION\b|\bPROM\b/.test(blob)) return true;
    // CMB2(...), CBM1, COMBO, PACK PROMO (CMB ≠ CBM)
    if (/\bCMB\d*\b|\bCBM\d*\b|\bCOMBO\b|PACK\s*PROM/.test(blob)) return true;
    if (/CMB\d*\(|CBM\d*\(/.test(d)) return true;
    if (/PROM|CBM|CMB|COMBO/.test(c) || /PROM|CBM|CMB|COMBO/.test(f)) return true;
    // Códigos 9xxx típicos de promo/combo cuando el nombre lo confirma
    if (/^9\d{3,}$/.test(c) && /PROM|CBM|CMB|COMBO|PACK/.test(d)) return true;
    if (/^900\d+/.test(c)) return true;
    if (/PROMOS?\s*\/\s*COMBOS?|PROMOS|COMBOS/.test(linea)) return true;
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
    var o = {
      codigo: String(p.codigo || '').trim(),
      codigo_fabrica: p.codigo_fabrica ? String(p.codigo_fabrica) : '',
      codigo_barras: p.codigo_barras ? String(p.codigo_barras) : '',
      descripcion: String(p.descripcion || '').trim(),
      unidad_ref: p.unidad_ref || '',
      factor_empaque: Number(p.factor_empaque) > 0 ? Number(p.factor_empaque) : 1,
      linea: p.linea ? String(p.linea) : '',
      marca: p.marca ? String(p.marca) : '',
      tipo_almacen: normalizarTipo(p.tipo_almacen) || inferirTipo(p),
      imagen_url: p.imagen_url ? String(p.imagen_url) : '',
      activo: p.activo !== false
    };
    o._sb = (o.codigo + '\u0001' + o.codigo_fabrica + '\u0001' + o.codigo_barras + '\u0001' + o.descripcion + '\u0001' + o.linea + '\u0001' + o.marca).toLowerCase();
    return o;
  }

  function imgHtml(url, cls) {
    if (!url) {
      return '<span class="' + (cls || 'ri-img') + ' ri-img-placeholder" aria-hidden="true">📦</span>';
    }
    return '<img class="' + (cls || 'ri-img') + '" src="' + escapeHtml(url) + '" alt="" loading="lazy" decoding="async" onerror="this.classList.add(\'ri-img-broken\');this.removeAttribute(\'src\');">';
  }

  function initSupabase() {
    var url = (window.IEM_CONFIG && window.IEM_CONFIG.SUPABASE_URL) || window.SUPABASE_URL || '';
    var key = (window.IEM_CONFIG && window.IEM_CONFIG.SUPABASE_ANON_KEY) || window.SUPABASE_ANON_KEY || '';
    if (!url || !key) {
      toast('Falta config.js (Supabase). Sube config.js a la raíz del repo.', true);
      return null;
    }
    if (!window.supabase || !window.supabase.createClient) {
      toast('No cargó la librería Supabase (CDN). Revisa conexión.', true);
      return null;
    }
    return window.supabase.createClient(url, key);
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
          .select('codigo,codigo_fabrica,codigo_barras,descripcion,unidad_ref,factor_empaque,linea,marca,activo,tipo_almacen,imagen_url')
          .eq('activo', true)
          .range(from, from + page - 1);
        // Si falta alguna columna nueva, reintentar sin ella
        if (error && /imagen_url|tipo_almacen|codigo_barras/i.test(error.message || '')) {
          var r2 = await supabaseClient
            .from('productos')
            .select('codigo,codigo_fabrica,descripcion,unidad_ref,factor_empaque,linea,marca,activo')
            .eq('activo', true)
            .range(from, from + page - 1);
          data = r2.data; error = r2.error;
        }
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
      // Lookup O(1) por código
      window._vMapCodigo = Object.create(null);
      catalogo.forEach(function (p) {
        window._vMapCodigo[p.codigo] = p;
        if (p.codigo_fabrica) window._vMapCodigo[String(p.codigo_fabrica)] = p;
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
    var list = [];
    // Atajo: código exacto
    if (window._vMapCodigo && window._vMapCodigo[q]) {
      var ex = window._vMapCodigo[q];
      if (!filtroTipo || ex.tipo_almacen === filtroTipo) list = [ex];
    }
    if (!list.length) {
      for (var i = 0; i < catalogo.length && list.length < 40; i++) {
        var p = catalogo[i];
        if (filtroTipo && p.tipo_almacen !== filtroTipo) continue;
        var blob = p._sb || (p.codigo + ' ' + p.descripcion).toLowerCase();
        if (blob.indexOf(q) !== -1) list.push(p);
      }
    }

    if (!list.length) {
      box.innerHTML = '<p class="muted">Sin resultados</p>';
      return;
    }
    box.innerHTML = list.map(function (p) {
      return (
        '<button type="button" class="result-item" data-codigo="' + escapeHtml(p.codigo) + '">' +
          imgHtml(p.imagen_url, 'ri-img') +
          '<div class="ri-body">' +
            '<div class="ri-name">' + escapeHtml(p.descripcion) + '</div>' +
            '<div class="ri-meta">Cód: ' + escapeHtml(p.codigo) +
              (p.codigo_fabrica ? ' · Fáb: ' + escapeHtml(p.codigo_fabrica) : '') +
              (p.tipo_almacen ? ' · ' + escapeHtml(p.tipo_almacen) : '') +
              (p.linea ? ' · ' + escapeHtml(p.linea) : '') +
            '</div>' +
          '</div>' +
        '</button>'
      );
    }).join('');
  }

  function seleccionar(codigo) {
    selected = catalogo.find(function (p) { return p.codigo === codigo; }) || null;
    if (!selected) return;
    $('vProductoCard').classList.remove('hidden');
    var imgEl = $('vProdImg');
    if (imgEl) {
      if (selected.imagen_url) {
        imgEl.src = selected.imagen_url;
        imgEl.style.display = '';
        imgEl.onerror = function () { imgEl.style.display = 'none'; };
      } else {
        imgEl.removeAttribute('src');
        imgEl.style.display = 'none';
      }
    }
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
      box.innerHTML = '<p class="muted">Aún no hay productos. Busca y agrega del catálogo.</p>';
    } else {
      box.innerHTML = pedido.map(function (x, i) {
        return (
          '<div class="pedido-item">' +
            '<div class="pi-left">' +
              imgHtml(x.imagen_url, 'pi-img') +
              '<div class="pi-info">' +
                '<div class="pi-name">' + escapeHtml(x.descripcion) + '</div>' +
                '<div class="pi-qty">' + escapeHtml(x.codigo) + ' · ' + x.cajas + ' cajas · ' + x.unidades + ' unid.</div>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="btn btn-danger pi-del" data-idx="' + i + '" title="Quitar">✕</button>' +
          '</div>'
        );
      }).join('');
    }
    var tc = 0, tu = 0;
    pedido.forEach(function (x) { tc += x.cajas; tu += x.unidades; });
    $('vTotales').textContent = tc + ' cajas · ' + tu + ' unidades · ' + pedido.length + ' ítems';
    var badge = $('vPedidoBadge');
    if (badge) badge.textContent = pedido.length + (pedido.length === 1 ? ' ítem' : ' ítems');
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
        imagen_url: selected.imagen_url || '',
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
      ruta: (perfil && (perfil.ruta || perfil.Ruta)) || null,
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
    var _nom = String((perfil && perfil.nombre) || '').trim();
    var _usr = String((perfil && perfil.usuario) || '').trim();
    if (_nom && _usr && _nom.toLowerCase() !== _usr.toLowerCase()) {
      $('vWho').textContent = _nom + ' · ' + _usr;
    } else {
      $('vWho').textContent = _usr ? ('Vendedor ' + _usr) : 'Vendedor';
    }
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
        .select('usuario, nombre, rol, activo')
        .eq('usuario', user)
        .maybeSingle();
      if (e2) throw e2;
      if (!perf) {
        // fallback by auth id if column exists
        var r2 = await supabaseClient.from('perfiles').select('usuario, nombre, rol, activo').limit(20);
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


  // Tema claro/oscuro (mismo criterio que inventario; el usuario elige)
  var THEME_KEY = 'buscador_tema';
  function aplicarTema(tema) {
    if (tema === 'light') document.body.classList.add('light-theme');
    else document.body.classList.remove('light-theme');
    var icon = tema === 'light' ? '☀️' : '🌙';
    ['themeToggleBtn', 'themeToggleBtnApp'].forEach(function (id) {
      var b = $(id);
      if (b) b.textContent = icon;
    });
    try {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', tema === 'light' ? '#0A784C' : '#0c1220');
    } catch (e) {}
  }
  function cargarTema() {
    var tema = 'dark';
    try { tema = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    aplicarTema(tema);
  }
  function alternarTema() {
    var esClaro = document.body.classList.contains('light-theme');
    var nuevo = esClaro ? 'dark' : 'light';
    aplicarTema(nuevo);
    try { localStorage.setItem(THEME_KEY, nuevo); } catch (e) {}
  }

  function bind() {
    var t1 = $('themeToggleBtn'); if (t1) t1.addEventListener('click', alternarTema);
    var t2 = $('themeToggleBtnApp'); if (t2) t2.addEventListener('click', alternarTema);
    $('vLoginBtn').addEventListener('click', login);
    $('vPass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') login();
    });
    $('vLogoutBtn').addEventListener('click', logout);
    $('vSearch').addEventListener('input', debounce(renderResults, 150));
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
        .select('usuario, nombre, rol, activo')
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

  cargarTema();
  bind();
  tryRestore();
})();
