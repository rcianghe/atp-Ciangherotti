#!/usr/bin/env node
/* ==========================================================================
   Genera una pagina de entrada por club para compartir en WhatsApp/redes.

   Por que existe: WhatsApp, Facebook y Google leen titulo, descripcion e imagen
   ANTES de que cargue el JavaScript, asi que "index.html?club=otro" siempre se
   veria como el club base. Cada club recibe su propio archivo con sus datos:

       <slug>.html          -> https://TU-SITIO/<slug>.html   (enlace para compartir)
       manifest-<slug>.json -> "instalar como app" con el nombre/colores del club

   Los archivos quedan junto a index.html (mismas rutas relativas, nada se rompe)
   y son copias de index.html con la cabecera cambiada + el club fijado.

   Uso:
     node generar-paginas-club.js                 (lee los clubes de Supabase)
     node generar-paginas-club.js --json clubes.json   (prueba sin red)

   Variables opcionales: SITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, OUT_DIR
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const DIR = process.env.OUT_DIR || __dirname;
const DEFAULT_SLUG = 'quilicura';                       // el club base vive en index.html
const RESERVADOS = new Set(['index', 'escalerilla-admin', 'admin-torneo', 'manifest', '404', 'firebase-messaging-sw']);
const TEMPLATE = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

const SITE_URL = (process.env.SITE_URL || 'https://rcianghe.github.io/atp-Ciangherotti/').replace(/\/?$/, '/');
const SUPABASE_URL = process.env.SUPABASE_URL || (TEMPLATE.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/) || [])[1];
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || (TEMPLATE.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/) || [])[1];

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const absoluta = u => !u ? '' : (/^https?:\/\//i.test(u) ? u : SITE_URL + String(u).replace(/^\.?\//, ''));

async function cargarClubes() {
  const i = process.argv.indexOf('--json');
  if (i > -1) return JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'));
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY.');
  const q = 'select=slug,nombre,nombre_corto,logo_url,og_image_url,hero_tagline,color_tema,activo,sitio_web_externo&activo=eq.true';
  const r = await fetch(SUPABASE_URL + '/rest/v1/clubes?' + q, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
  if (!r.ok) throw new Error('Supabase respondio ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

function reemplazarMeta(html, regex, nuevo) {
  if (!regex.test(html)) return html;
  return html.replace(regex, nuevo);
}

function paginaDeClub(club) {
  const nombre = club.nombre;
  const corto = club.nombre_corto || nombre;
  const url = SITE_URL + club.slug + '.html';
  const desc = `Ranking en vivo, resultados y estadisticas de ${nombre}. Jugadores, partidos y mas.`;
  // Sin logo propio el club usa la pelota de tenis neutra (nunca el escudo de otro club).
  const imagen = absoluta(club.og_image_url) || absoluta(club.logo_url) || SITE_URL + 'pelota-512.png';
  const color = club.color_tema || '#0e0e0e';
  let h = TEMPLATE;

  h = reemplazarMeta(h, /<title>[\s\S]*?<\/title>/, `<title>${esc(nombre)}</title>`);
  h = reemplazarMeta(h, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  h = reemplazarMeta(h, /<meta property="og:site_name" content="[^"]*">/, `<meta property="og:site_name" content="${esc(nombre)}">`);
  h = reemplazarMeta(h, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(nombre)}">`);
  h = reemplazarMeta(h, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  h = reemplazarMeta(h, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(imagen)}">`);
  h = reemplazarMeta(h, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(url)}">`);
  h = reemplazarMeta(h, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(nombre)}">`);
  h = reemplazarMeta(h, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(desc)}">`);
  h = reemplazarMeta(h, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(imagen)}">`);
  h = reemplazarMeta(h, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(url)}">`);
  h = reemplazarMeta(h, /<link rel="manifest" href="[^"]*">/, `<link rel="manifest" href="manifest-${esc(club.slug)}.json">`);
  h = reemplazarMeta(h, /<link rel="apple-touch-icon" href="[^"]*">/, `<link rel="apple-touch-icon" href="${esc(absoluta(club.logo_url) || SITE_URL + 'pelota-192.png')}">`);
  h = reemplazarMeta(h, /<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${esc(color)}">`);
  h = reemplazarMeta(h, /<meta name="apple-mobile-web-app-title" content="[^"]*">/, `<meta name="apple-mobile-web-app-title" content="${esc(corto)}">`);
  // Datos estructurados para buscadores
  const ld = { '@context': 'https://schema.org', '@type': 'SportsClub', name: nombre, sport: 'Tennis', url, logo: imagen };
  h = reemplazarMeta(h, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
  // Fija el club ANTES de cualquier otro script de la pagina.
  h = h.replace(/<meta charset="UTF-8">/, `<meta charset="UTF-8">\n<script>window.CLUB_SLUG_FORZADO=${JSON.stringify(club.slug)};</script>`);
  return h;
}

function manifestDeClub(club) {
  const base = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  const corto = club.nombre_corto || club.nombre;
  const pagina = './' + club.slug + '.html';
  base.id = pagina;
  base.name = club.nombre;
  base.short_name = corto.slice(0, 12);
  base.description = `Ranking en vivo, resultados y estadisticas de ${club.nombre}`;
  base.start_url = pagina + '?utm_source=pwa';
  base.scope = './';
  if (!club.logo_url) {
    base.icons = [
      { src: 'pelota-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'pelota-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'pelota-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ];
  } else {
    const L = absoluta(club.logo_url);
    base.icons = [{ src: L, sizes: '512x512', type: /\.png(\?|$)/i.test(L) ? 'image/png' : 'image/jpeg', purpose: 'any' }];
  }
  (base.shortcuts || []).forEach(s => { s.icons = [{ src: club.logo_url ? absoluta(club.logo_url) : 'pelota-192.png', sizes: '192x192' }]; });
  base.theme_color = club.color_tema || base.theme_color;
  (base.shortcuts || []).forEach(s => { s.url = s.url.replace(/^\.\/(#.*)$/, pagina + '$1'); });
  return base;
}

(async () => {
  const clubes = await cargarClubes();
  const hechos = [];
  const omitidos = [];
  for (const c of clubes) {
    const slug = String(c.slug || '').toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { omitidos.push(`${slug || '(sin slug)'}: slug no valido`); continue; }
    if (slug === DEFAULT_SLUG) { omitidos.push(`${slug}: es el club base (usa index.html)`); continue; }
    if (RESERVADOS.has(slug)) { omitidos.push(`${slug}: nombre reservado, cambia el slug del club`); continue; }
    if (c.activo === false) { omitidos.push(`${slug}: inactivo`); continue; }
    if (c.sitio_web_externo) { omitidos.push(`${slug}: tiene sitio externo`); continue; }
    c.slug = slug;
    fs.writeFileSync(path.join(DIR, slug + '.html'), paginaDeClub(c));
    fs.writeFileSync(path.join(DIR, 'manifest-' + slug + '.json'), JSON.stringify(manifestDeClub(c), null, 2) + '\n');
    hechos.push(slug);
  }
  console.log('Paginas generadas: ' + (hechos.length ? hechos.map(s => SITE_URL + s + '.html').join('\n  ') : '(ninguna)'));
  if (omitidos.length) console.log('Omitidos:\n  ' + omitidos.join('\n  '));
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
