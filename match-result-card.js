/**
 * match-result-card.js
 * ChileTenis PRO — MatchResultCard: componente unico y reutilizable de
 * resultados de partido (Multi-Club).
 *
 * FUSION de dos implementaciones previas: se queda con lo mejor de cada
 * una para que esta sea la UNICA fuente de verdad, incluida por
 * <script src="match-result-card.js"> tanto en index.html como en
 * escalerilla-admin.html / admin-torneo.html.
 *
 *   - Normalizadores para las DOS tablas de origen posibles (resultados y
 *     torneo_partidos), asi la misma tarjeta sirve para Escalerilla y para
 *     el Torneo Interno (punto 3 del prompt ChileTenis PRO).
 *   - Comparacion de ganador por ID (no por nombre): correcta aunque haya
 *     dos jugadores con el mismo nombre.
 *   - Forma de jugador en camelCase (avatarUrl/banderaIso/pais/id), igual
 *     que ya usa DATA.players en index.html -- cero traduccion de campos.
 *   - Fallback de avatar roto via funcion global + data-attributes (nunca
 *     HTML armado a mano dentro de un onerror).
 *   - Extraccion de sets flexible: acepta set1/set2/set3 sueltos O un
 *     string ya combinado "6-4 3-6" (que es lo que ya guarda DATA.results).
 *   - Identidad de marca por club (logo + colores) inyectable por llamada,
 *     para paginas que no tengan --v/--am seteados dinamicamente.
 *   - i18n con placeholders {jugador}/{n}, es/en/it.
 *
 * Alineado 1:1 con el schema real de Supabase (proyecto Club Tenis App):
 *   resultados.estado_partido / torneo_partidos.estado_partido
 *     CHECK IN ('programado','en_juego','finalizado','w_o','retirado','cancelado','suspendido')
 *   jugadores.avatar_url, jugadores.pais, jugadores.bandera_iso (CHECK ^[A-Z]{2}$)
 *   clubes.tema jsonb {primario, primario_oscuro, primario_claro, acento}, logo_url
 *
 * ============================================================
 * USO
 * ============================================================
 * ensureMatchResultCardStyles(); // una vez por pagina, idempotente
 *
 * // 1) A mano (ya tienes match armado):
 * var html = renderMatchResultCard(match, opts);
 *
 * // 2) Desde una fila cruda de "resultados" (mas comun):
 * var jugadoresById = normalizarJugadoresById(DATA.players); // {id: {id,nombre,avatarUrl,banderaIso,pais}}
 * var match = normalizarMatchDesdeResultado(filaResultado, jugadoresById, {torneoNombre:'Escalerilla 2026'});
 * var html = renderMatchResultCard(match, {idioma:'es', club:{nombre:CLUB_NOMBRE, logo_url:CLUB_LOGO_URL}});
 *
 * // 3) Desde una fila cruda de "torneo_partidos" (cuadro del Torneo Interno):
 * var match = normalizarMatchDesdeTorneoPartido(filaPartido, jugadoresById, {serie:'A'});
 *
 * match = {
 *   estado, ganadorId (uuid o null),
 *   jugador1, jugador2: {id,nombre,avatarUrl,banderaIso,pais} o null,
 *   set1,set2,set3 (o) score:"6-4 3-6 10-8" como respaldo,
 *   tipo ('Normal'|'W.O.'), fecha, hora, cancha, serie, torneoNombre,
 *   esBye, esMejorPerdedor, ronda (solo torneo_partidos)
 * }
 * opts = { idioma:'es'|'en'|'it', compact:bool, mostrarTorneo:bool,
 *          club:{nombre,logo_url,tema,color_tema}, mostrarClub:bool,
 *          onClick:string (JS inline opcional) }
 *
 * jugador1 se muestra a la izquierda, jugador2 a la derecha, en el mismo
 * orden en que estan guardados en la base (no se reordena por quien gano).
 * El que gano se resalta comparando match.ganadorId contra jugador.id.
 */

var MRC_I18N = {
  es: {
    'match.scheduled':'Programado', 'match.live':'En juego', 'match.finished':'Finalizado',
    'match.walkover':'W.O.', 'match.retired':'Retirado', 'match.cancelled':'Cancelado',
    'match.suspended':'Suspendido', 'match.winner':'Ganador', 'match.vs':'Por definir',
    'match.tbd':'Por definir', 'match.retiredPlayer':'{jugador} se retir\u00f3',
    'match.court':'Cancha {n}'
  },
  en: {
    'match.scheduled':'Scheduled', 'match.live':'Live', 'match.finished':'Finished',
    'match.walkover':'W.O.', 'match.retired':'Retired', 'match.cancelled':'Cancelled',
    'match.suspended':'Suspended', 'match.winner':'Winner', 'match.vs':'TBD',
    'match.tbd':'TBD', 'match.retiredPlayer':'{jugador} retired',
    'match.court':'Court {n}'
  },
  it: {
    'match.scheduled':'Programmato', 'match.live':'In corso', 'match.finished':'Finito',
    'match.walkover':'W.O.', 'match.retired':'Ritirato', 'match.cancelled':'Annullato',
    'match.suspended':'Sospeso', 'match.winner':'Vincitore', 'match.vs':'Da definire',
    'match.tbd':'Da definire', 'match.retiredPlayer':'{jugador} si \u00e8 ritirato',
    'match.court':'Campo {n}'
  }
};
function mrcT(clave, idioma, vars){
  var dic = MRC_I18N[idioma] || MRC_I18N.es;
  var s = dic[clave] || MRC_I18N.es[clave] || clave;
  if(vars){ for(var k in vars){ s = s.replace('{'+k+'}', vars[k]); } }
  return s;
}

var MRC_ESTADOS = {
  programado: { claveI18n:'match.scheduled', color:'var(--mrc-az,#2E7DD1)', icono:'\ud83d\udcc5' },
  en_juego:   { claveI18n:'match.live',      color:'var(--mrc-ro,#C0392B)', icono:'\ud83d\udd34' },
  finalizado: { claveI18n:'match.finished',  color:'var(--mrc-v,#5BBF2A)',  icono:'\u2705' },
  w_o:        { claveI18n:'match.walkover',  color:'var(--mrc-am,#D4E60A)', icono:'\u26a0\ufe0f' },
  retirado:   { claveI18n:'match.retired',   color:'var(--mrc-am,#D4E60A)', icono:'\ud83e\ude79' },
  cancelado:  { claveI18n:'match.cancelled', color:'var(--mrc-gl,#9a9a9a)', icono:'\ud83d\udeab' },
  suspendido: { claveI18n:'match.suspended', color:'var(--mrc-gl,#9a9a9a)', icono:'\u23f8\ufe0f' }
};

function mrcEsc(s){
  return String(s==null?"":s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function mrcBanderaEmoji(iso2){
  // OJO: esto ya NO devuelve un emoji de bandera (dos "regional indicator
  // symbols" Unicode). El emoji se ve como bandera en iOS/Android/macOS,
  // pero Windows no trae fuente de emoji con banderas y en su lugar
  // muestra las dos letras del codigo pais sueltas (ej. "CL"), que es
  // justo el problema de "en el notebook sale CL en vez de la bandera".
  // La solucion consistente entre plataformas es usar una IMAGEN real de
  // bandera (via flagcdn.com, gratuito y sin key) en vez de depender de
  // que el sistema operativo tenga esos glifos instalados.
  if(!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return '';
  var code = iso2.toLowerCase();
  return '<img class="mrc-bandera-img" src="https://flagcdn.com/24x18/'+code+'.png" srcset="https://flagcdn.com/48x36/'+code+'.png 2x" width="18" height="14" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
}

function mrcHashStr(s){
  var h=0;
  for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; }
  return Math.abs(h);
}
function mrcIniciales(nombre){
  var ini="", partes=(nombre||"?").split(" ");
  for(var i=0;i<partes.length && ini.length<2;i++){ if(partes[i]) ini+=partes[i][0]; }
  return ini.toUpperCase() || "?";
}
function mrcColorIniciales(nombre){
  var h = mrcHashStr(String(nombre||"")) % 360;
  return "hsl("+h+",56%,40%)";
}

function mrcAvatarFallback(img){
  if(!img || img.dataset.mrcDone) return;
  img.dataset.mrcDone = "1";
  var d = document.createElement('div');
  d.className = 'mrc-avatar mrc-avatar-i';
  d.textContent = img.dataset.mrcIni || '?';
  d.style.background = img.dataset.mrcColor || '#888';
  if(img.parentNode) img.parentNode.replaceChild(d, img);
}
function mrcAvatarHtml(j){
  var nombre = (j && j.nombre) || '?';
  var ini = mrcIniciales(nombre);
  var color = mrcColorIniciales(nombre);
  if(j && j.avatarUrl){
    return '<img class="mrc-avatar" src="'+mrcEsc(j.avatarUrl)+'" alt="" data-mrc-ini="'+mrcEsc(ini)+'" data-mrc-color="'+mrcEsc(color)+'" onerror="mrcAvatarFallback(this)">';
  }
  return '<div class="mrc-avatar mrc-avatar-i" style="background:'+color+'">'+mrcEsc(ini)+'</div>';
}

function mrcExtraerSets(match){
  if(match.set1 || match.set2 || match.set3) return [match.set1, match.set2, match.set3].filter(Boolean);
  if(match.score && match.score !== 'W.O.') return String(match.score).split(' ').filter(Boolean);
  return [];
}
function mrcCalcularSets(match){
  var sets = mrcExtraerSets(match);
  var g1=0, g2=0;
  sets.forEach(function(s){
    var p = String(s).split('-');
    if(p.length!==2) return;
    var a=parseInt(p[0],10), b=parseInt(p[1],10);
    if(isNaN(a)||isNaN(b)) return;
    if(a>b) g1++; else if(b>a) g2++;
  });
  return { sets:sets, setsJ1:g1, setsJ2:g2 };
}

function normalizarJugadoresById(players){
  var out = {};
  (players||[]).forEach(function(p){
    if(!p || !p.id) return;
    out[p.id] = {id:p.id, nombre:p.nombre, avatarUrl:p.avatarUrl||'', banderaIso:p.banderaIso||'', pais:p.pais||''};
  });
  return out;
}
function normalizarMatchDesdeResultado(r, jugadoresById, opts){
  opts = opts || {};
  jugadoresById = jugadoresById || {};
  return {
    id: r.id,
    origen: 'resultado',
    estado: r.estado_partido || (r.ganador_id ? 'finalizado' : 'programado'),
    serie: r.serie,
    fecha: r.fecha, hora: r.hora, cancha: r.cancha,
    set1: r.set1, set2: r.set2, set3: r.set3,
    tipo: r.tipo,
    ganadorId: r.ganador_id || null,
    jugador1: jugadoresById[r.jugador1_id] || null,
    jugador2: jugadoresById[r.jugador2_id] || null,
    torneoNombre: opts.torneoNombre || null
  };
}
function normalizarMatchDesdeTorneoPartido(p, jugadoresById, opts){
  opts = opts || {};
  jugadoresById = jugadoresById || {};
  return {
    id: p.id,
    origen: 'torneo_partido',
    estado: p.estado_partido || (p.ganador_id ? 'finalizado' : 'programado'),
    serie: opts.serie || null,
    fecha: p.fecha, hora: null, cancha: null,
    set1: p.set1, set2: p.set2, set3: p.set3,
    tipo: p.tipo,
    ganadorId: p.ganador_id || null,
    esBye: !!p.es_bye,
    esMejorPerdedor: !!p.es_mejor_perdedor,
    jugador1: jugadoresById[p.jugador1_id] || null,
    jugador2: jugadoresById[p.jugador2_id] || null,
    torneoNombre: opts.torneoNombre || null,
    ronda: p.ronda
  };
}

function renderMatchResultCard(match, opts){
  match = match || {}; opts = opts || {};
  var idioma = opts.idioma || 'es';
  var estado = match.estado || (match.ganadorId ? 'finalizado' : 'programado');
  var esWO = match.tipo === 'W.O.' || estado === 'w_o';
  if(esWO) estado = 'w_o';
  var estadoInfo = MRC_ESTADOS[estado] || MRC_ESTADOS.programado;
  var estadoLabel = mrcT(estadoInfo.claveI18n, idioma);

  var j1 = match.jugador1, j2 = match.jugador2;
  var nombre1 = j1 ? j1.nombre : mrcT('match.tbd', idioma);
  var nombre2 = j2 ? j2.nombre : mrcT('match.tbd', idioma);
  var ganador1 = !!(match.ganadorId && j1 && match.ganadorId===j1.id);
  var ganador2 = !!(match.ganadorId && j2 && match.ganadorId===j2.id);

  var calc = mrcCalcularSets(match);
  var esRetirado = estado==='retirado';
  var esCancelado = estado==='cancelado';
  var esSuspendido = estado==='suspendido';
  var esProgramado = estado==='programado';
  var esEnJuego = estado==='en_juego';

  function jugadorHtml(j, nombre, esGanador){
    var banderaH = (j && j.banderaIso) ? '<span class="mrc-bandera" title="'+mrcEsc(j.pais||'')+'">'+mrcBanderaEmoji(j.banderaIso)+'</span>' : '';
    return '<div class="mrc-jugador'+(esGanador?' mrc-jugador-win':'')+'">'
      + mrcAvatarHtml(j)
      + '<span class="mrc-jnombre">'+banderaH+'<span class="mrc-jnombre-txt">'+mrcEsc(nombre)+'</span></span>'
      + (esGanador ? '<span class="mrc-winbadge" title="'+mrcEsc(mrcT('match.winner',idioma))+'">\ud83c\udfc6</span>' : '')
      + '</div>';
  }

  var centroH;
  if(esProgramado){
    centroH = '<div class="mrc-centro mrc-centro-txt">'+mrcEsc(mrcT('match.vs',idioma))+'</div>';
  } else if(esEnJuego){
    centroH = '<div class="mrc-centro mrc-centro-live">'+mrcEsc(mrcT('match.vs',idioma))+'</div>';
  } else if(esCancelado || esSuspendido){
    centroH = '<div class="mrc-centro mrc-centro-txt">\u2014</div>';
  } else if(esWO){
    centroH = '<div class="mrc-centro mrc-centro-sets">W.O.</div>';
  } else {
    centroH = '<div class="mrc-centro mrc-centro-sets">'+calc.setsJ1+'\u2013'+calc.setsJ2+'</div>';
  }

  var setsDetalleH = '';
  if(calc.sets.length && !esCancelado){
    setsDetalleH = '<div class="mrc-setsrow">'+calc.sets.map(function(s){
      var p=String(s).split('-'); var a=parseInt(p[0],10), b=parseInt(p[1],10);
      var validos = !isNaN(a) && !isNaN(b);
      var g1win = validos && a>b, g2win = validos && b>a;
      return '<span class="mrc-setchip'+(g1win?' win1':'')+(g2win?' win2':'')+'">'+mrcEsc(s)+'</span>';
    }).join('')+'</div>';
  }

  var notaEspecialH = '';
  if(esRetirado && match.ganadorId){
    var quienSeRetiro = ganador1 ? nombre2 : (ganador2 ? nombre1 : '');
    if(quienSeRetiro) notaEspecialH = '<div class="mrc-nota">'+mrcEsc(mrcT('match.retiredPlayer',idioma,{jugador:quienSeRetiro}))+'</div>';
  }

  var metaPartes = [];
  if(match.fecha) metaPartes.push(mrcEsc(match.fecha));
  if(match.hora) metaPartes.push(mrcEsc(match.hora));
  if(match.cancha) metaPartes.push(mrcEsc(mrcT('match.court',idioma,{n:match.cancha})));
  if(match.serie) metaPartes.push('Serie '+mrcEsc(match.serie));
  if(opts.mostrarTorneo!==false && match.torneoNombre) metaPartes.push(mrcEsc(match.torneoNombre));
  var metaH = metaPartes.length ? '<div class="mrc-meta">'+metaPartes.join(' &middot; ')+'</div>' : '';

  var club = opts.club || null;
  var tema = (club && club.tema && typeof club.tema==='object') ? club.tema : {};
  var primary = tema.primario || (club && club.color_tema) || null;
  var accent = tema.acento || primary || null;
  var styleVars = '';
  if(primary) styleVars += '--mrc-primary:'+mrcEsc(primary)+';';
  if(accent) styleVars += '--mrc-accent:'+mrcEsc(accent)+';';

  var headH = '';
  if(opts.mostrarClub!==false && club && (club.nombre || club.logo_url)){
    headH = '<div class="mrc-head">'
      + (club.logo_url ? '<img class="mrc-headlogo" src="'+mrcEsc(club.logo_url)+'" alt="" onerror="this.style.display=\'none\'">' : '')
      + '<span class="mrc-headname">'+mrcEsc(club.nombre||'')+'</span>'
      + '</div>';
  }

  var mpBadgeH = (match.esMejorPerdedor) ? '<span class="mrc-mpbadge">Mejor perdedor</span>' : '';
  var clickAttr = opts.onClick ? ' onclick="'+opts.onClick+'" role="button" tabindex="0"' : '';

  return ''
    + '<div class="mrc-card mrc-'+mrcEsc(estado)+(opts.compact?' mrc-compact':'')+'" style="'+styleVars+'"'+clickAttr+'>'
    +   headH
    +   '<div class="mrc-top">'
    +     mpBadgeH
    +     '<span class="mrc-estado" style="--mrc-estado-color:'+estadoInfo.color+'">'
    +       '<span class="mrc-estado-dot"></span>'+estadoInfo.icono+' '+mrcEsc(estadoLabel)
    +     '</span>'
    +   '</div>'
    +   '<div class="mrc-body">'
    +     jugadorHtml(j1, nombre1, ganador1)
    +     centroH
    +     jugadorHtml(j2, nombre2, ganador2)
    +   '</div>'
    +   setsDetalleH
    +   notaEspecialH
    +   metaH
    + '</div>';
}

var MRC_STYLES_INJECTED = false;
function ensureMatchResultCardStyles(){
  if(MRC_STYLES_INJECTED) return;
  MRC_STYLES_INJECTED = true;
  var css = ''
    + '.mrc-card{--mrc-v:var(--v,#5BBF2A);--mrc-ng:var(--ng,#0e0e0e);--mrc-gd:var(--gd,#1a1a1a);--mrc-g:var(--g,#2a2a2a);--mrc-gm:var(--gm,#3a3a3a);--mrc-gl:var(--gl,#9a9a9a);--mrc-bl:var(--bl,#f5f5f0);--mrc-am:var(--am,#D4E60A);--mrc-az:var(--az,#2E7DD1);--mrc-ro:var(--ro,#C0392B);--mrc-primary:var(--mrc-v);--mrc-accent:var(--mrc-am);'
    +   'font-family:inherit;background:var(--mrc-g);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:.85rem .9rem;max-width:100%;box-sizing:border-box;transition:border-color .2s,transform .15s;position:relative}'
    + '.mrc-card[role="button"]{cursor:pointer}'
    + '.mrc-card[role="button"]:hover{border-color:color-mix(in srgb,var(--mrc-primary) 45%,transparent);transform:translateY(-1px)}'
    + '.mrc-head{display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem;font-size:.66rem;letter-spacing:.5px;text-transform:uppercase;color:var(--mrc-gl)}'
    + '.mrc-headlogo{width:16px;height:16px;border-radius:4px;object-fit:cover;flex-shrink:0}'
    + '.mrc-top{display:flex;justify-content:flex-end;align-items:center;gap:.4rem;margin-bottom:.5rem}'
    + '.mrc-head+.mrc-top{margin-top:-1.9rem}'
    + '.mrc-mpbadge{margin-right:auto;font-size:.6rem;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mrc-az);background:color-mix(in srgb,var(--mrc-az) 18%,transparent);border-radius:10px;padding:.12rem .5rem}'
    + '.mrc-estado{display:inline-flex;align-items:center;gap:.3rem;font-size:.62rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mrc-estado-color);border:1px solid color-mix(in srgb,var(--mrc-estado-color) 45%,transparent);background:color-mix(in srgb,var(--mrc-estado-color) 14%,transparent);border-radius:20px;padding:.18rem .6rem}'
    + '.mrc-estado-dot{width:6px;height:6px;border-radius:50%;background:var(--mrc-estado-color)}'
    + '.mrc-en_juego .mrc-estado-dot{animation:mrcPulse 1.3s ease-in-out infinite}'
    + '@keyframes mrcPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}'
    + '.mrc-body{display:flex;align-items:center;gap:.6rem}'
    + '.mrc-jugador{flex:1;min-width:0;display:flex;align-items:center;gap:.5rem}'
    + '.mrc-jugador:last-child{flex-direction:row-reverse;text-align:right}'
    + '.mrc-jugador-win .mrc-jnombre-txt{color:var(--mrc-primary);font-weight:700}'
    + '.mrc-avatar{width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;box-shadow:0 0 0 1px rgba(255,255,255,.15)}'
    + '.mrc-avatar-i{display:flex;align-items:center;justify-content:center;color:#fff;font-family:inherit;font-weight:700;font-size:.78rem}'
    + '.mrc-jnombre{font-size:.86rem;font-weight:600;color:var(--mrc-bl);display:inline-flex;align-items:center;gap:.3rem;flex:1;min-width:0}'
    + '.mrc-jugador:last-child .mrc-jnombre{flex-direction:row-reverse}'
    + '.mrc-jnombre-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}'
    + '.mrc-bandera{font-size:.9rem;flex-shrink:0;display:inline-flex;align-items:center}'
    + '.mrc-bandera-img{display:block;border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.18);vertical-align:middle}'
    + '.mrc-winbadge{font-size:.75rem;flex-shrink:0}'
    + '.mrc-centro{flex:0 0 auto;min-width:36px;max-width:76px;text-align:center;font-weight:700;color:var(--mrc-gl)}'
    + '.mrc-centro-sets{font-family:inherit;font-size:1.15rem;color:var(--mrc-bl);letter-spacing:1px;white-space:nowrap}'
    + '.mrc-centro-txt{font-size:.62rem;text-transform:uppercase;letter-spacing:.5px;line-height:1.2;white-space:normal;word-break:break-word}'
    + '.mrc-centro-live{font-size:.62rem;text-transform:uppercase;letter-spacing:.5px;line-height:1.2;white-space:normal;word-break:break-word;color:var(--mrc-ro)}'
    + '.mrc-setsrow{display:flex;justify-content:center;gap:.35rem;margin-top:.55rem;flex-wrap:wrap}'
    + '.mrc-setchip{font-size:.68rem;color:var(--mrc-gl);background:rgba(255,255,255,.05);border-radius:4px;padding:.12rem .4rem}'
    + '.mrc-setchip.win1,.mrc-setchip.win2{color:var(--mrc-bl);background:color-mix(in srgb,var(--mrc-primary) 22%,transparent)}'
    + '.mrc-nota{margin-top:.4rem;text-align:center;font-size:.72rem;font-style:italic;color:var(--mrc-am)}'
    + '.mrc-meta{margin-top:.5rem;text-align:center;font-size:.68rem;color:var(--mrc-gl)}'
    + '.mrc-cancelado,.mrc-suspendido{opacity:.75}'
    + '.mrc-compact{padding:.65rem .75rem}'
    + '.mrc-compact .mrc-avatar,.mrc-compact .mrc-avatar-i{width:28px;height:28px}';
  var styleEl = document.createElement('style');
  styleEl.setAttribute('data-mrc-styles','1');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderMatchResultCard: renderMatchResultCard,
    ensureMatchResultCardStyles: ensureMatchResultCardStyles,
    mrcBanderaEmoji: mrcBanderaEmoji,
    mrcCalcularSets: mrcCalcularSets,
    mrcT: mrcT,
    normalizarJugadoresById: normalizarJugadoresById,
    normalizarMatchDesdeResultado: normalizarMatchDesdeResultado,
    normalizarMatchDesdeTorneoPartido: normalizarMatchDesdeTorneoPartido
  };
}
