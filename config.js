// Configuración pública de Supabase (visible en el cliente)
// La seguridad real está en RLS de Supabase, no en ocultar esta clave.
window.IEM_CONFIG = {
  // Versión única de la app (HTML, SW, core y textos de login deben coincidir al publicar)
  VERSION: '1.2.9',

  SUPABASE_URL: 'https://rgqlkeuzzqrmmgxtmren.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJncWxrZXV6enFybW1neHRtcmVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDE5NzMsImV4cCI6MjEwMjIxNzk3M30.P-Y577WPIgckmqCcy77rm-R55TDj6McQFvGayd0_yq0',

  // ------------------------------------------------------------------
  // Roles de respaldo en el CLIENTE (no sustituyen RLS ni public.perfiles)
  // Preferir siempre rol = 'admin' / 'vendedor' en la tabla perfiles.
  // Estas listas solo sirven si perfiles falla o no existe todavía.
  // ------------------------------------------------------------------
  // Usuarios que se tratan como admin aunque perfiles diga otra cosa
  ADMIN_USUARIOS: ['luis', 'andric'],

  // Usuarios (no admin) autorizados a abrir el escáner QR/barras
  SCAN_USUARIOS_PERMITIDOS: ['adelante'],

  // CDN de librerías pesadas (carga diferida solo al usar Excel / escáner)
  CDN_XLSX: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  CDN_JSZIP: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  CDN_HTML5_QRCODE: 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
};

window.SUPABASE_URL = window.IEM_CONFIG.SUPABASE_URL;
window.SUPABASE_ANON_KEY = window.IEM_CONFIG.SUPABASE_ANON_KEY;
window.IEM = window.IEM || {};
window.IEM.VERSION = window.IEM_CONFIG.VERSION;
