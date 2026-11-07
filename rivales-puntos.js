/**
 * rivales-puntos.js
 * CTQ Escalerilla — Bloque "Rivales y puntos obtenidos" del perfil de jugador.
 *
 * Va justo debajo de "Ultimos resultados". Por cada partido de la
 * escalerilla del jugador muestra: rival -> puntos obtenidos, usando el
 * MISMO sistema de puntuacion que calcularRanking() (objeto global PUNTOS):
 *
 *   Gana en 2 sets .......... +300
 *   Gana en 3 sets .......... +200
 *   Gana 6-0 6-0 ............ +300 +100 (bono) = +400
 *   Pierde en 3 sets ........ +50
 *   Pierde en 2 sets ........ +25
 *   Gana por W.O. ........... +300
 *   Pierde por W.O. / Doble . +0
 *
 * Los bonos de serie (todos ganados 500, todos jugados 150, disponibilidad)
 * no pertenecen a un partido: se muestran como linea aparte, calculados
 * como (puntos del ranking - suma de los partidos), asi el total siempre
 * coincide con lo que dice el ranking.
 *
 * Depende de globals de index.html: DATA, PUNTOS, esc(), parseFechaDDMMYYYY().
 * DATA.results.score llega SIEMPRE en orden ganador-perdedor (ver
 * cargarJugadoresYResultadosSupabase), por eso el 6-0 6-0 se evalua asi.
 */

var RP_STYLES_INJECTED = false;
function rpEnsureStyles() {
  if (RP_STYLES_INJECTED) return;
  RP_STYLES_INJECTED = true;
  var css = ''
    + '.rpblk{padding:1.1rem;border-top:1px solid rgba(255,255,255,.05)}'
    + '.rprow{display:flex;align-items:center;gap:.6rem;padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.85rem}'
    + '.rprow:last-child{border-bottom:none}'
    + '.rpres{font-family:"Bebas Neue",sans-serif;font-size:.9rem;width:18px;text-align:center;flex-shrink:0}'
    + '.rpres.W{color:var(--v)}.rpres.L{color:var(--ro)}'
    + '.rpmain{flex:1;min-width:0}'
    + '.rpopp{font-weight:600;color:var(--bl);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.rpdet{font-size:.68rem;color:var(--gl);margin-top:1px}'
    + '.rpbonus{display:inline-block;margin-left:.35rem;font-family:"Barlow Condensed",sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--ng);background:var(--am);border-radius:10px;padding:.05rem .4rem;vertical-align:middle}'
    + '.rppts{font-family:"Bebas Neue",sans-serif;font-size:1.15rem;letter-spacing:.5px;min-width:56px;text-align:right;color:var(--v)}'
    + '.rppts.low{color:var(--gl)}'
    + '.rppts.gold{color:var(--am)}'
    + '.rpsum{margin-top:.6rem;padding-top:.6rem;border-top:1px dashed rgba(255,255,255,.15);display:flex;flex-direction:column;gap:.3rem}'
    + '.rpsumrow{display:flex;justify-content:space-between;font-size:.8rem;color:var(--gl)}'
    + '.rpsumrow.total{font-weight:800;color:var(--bl);font-size:.9rem}'
    + '.rpsumrow.total b{color:var(--am);font-family:"Bebas Neue",sans-serif;font-size:1.2rem;letter-spacing:.5px}';
  var st = document.createElement('style');
  st.setAttribute('data-rp-styles', '1');
  st.textContent = css;
  document.head.appendChild(st);
}

/**
 * Puntos que obtuvo `nombre` en un partido de DATA.results.
 * @returns {{pts:number, gano:boolean, bagel:boolean, wo:boolean, dobleWO:boolean, rival:string, sets:number}}
 */
function rpBases() {
  // Bases de puntuacion del club: PUNTOS (global del index) y, si el club
  // define configuracion_sitio.clave='bases_puntos', esas claves lo pisan.
  var base = { gana2sets: 300, gana3sets: 200, pierde3sets: 50, pierde2sets: 25, ganaWO: 300, pierdeWO: 0, bonoBagelBagel: 100 };
  var g = (typeof PUNTOS !== 'undefined') ? PUNTOS : {};
  var o = (typeof window !== 'undefined' && window.BASES_PUNTOS_CLUB) ? window.BASES_PUNTOS_CLUB : {};
  var out = {};
  Object.keys(base).forEach(function (k) {
    out[k] = (typeof o[k] === 'number') ? o[k] : (typeof g[k] === 'number' ? g[k] : base[k]);
  });
  return out;
}

function rpPuntosDePartido(r, nombre) {
  var P = rpBases();

  if (r.dobleWO) {
    return { pts: 0, gano: false, bagel: false, wo: true, dobleWO: true, rival: (r.jugador1 === nombre ? r.jugador2 : r.jugador1), sets: 0 };
  }
  var gano = r.ganador === nombre;
  var rival = gano ? r.perdedor : r.ganador;
  var wo = r.score === 'W.O.';
  var sets = wo ? 0 : String(r.score || '').split(' ').filter(Boolean).length;

  var pts, bagel = false;
  if (gano) {
    pts = wo ? P.ganaWO : (sets === 2 ? P.gana2sets : P.gana3sets);
    if (!wo && sets === 2) {
      var s = String(r.score).split(' ');
      bagel = (s[0] === '6-0' && s[1] === '6-0'); // score viene ganador-perdedor
      if (bagel) pts += P.bonoBagelBagel;
    }
  } else {
    pts = wo ? P.pierdeWO : (sets === 2 ? P.pierde2sets : P.pierde3sets);
  }
  return { pts: pts, gano: gano, bagel: bagel, wo: wo, dobleWO: false, rival: rival, sets: sets };
}

/**
 * Lista de partidos del jugador con sus puntos, mas recientes primero.
 * Se omiten los partidos contra jugadores "Retirado -50%" (anulados): en
 * DATA.players quedan con retirado:true y pj:0, igual que en calcularRanking.
 */
function rpPartidosConPuntos(nombre) {
  var anulados = {};
  (DATA.players || []).forEach(function (p) { if (p.retirado && p.pj === 0) anulados[p.nombre] = true; });

  var lista = [];
  (DATA.results || []).forEach(function (r) {
    var participa = r.dobleWO ? (r.jugador1 === nombre || r.jugador2 === nombre)
                              : (r.ganador === nombre || r.perdedor === nombre);
    if (!participa) return;
    var info = rpPuntosDePartido(r, nombre);
    if (anulados[info.rival]) return;
    info.fecha = r.fecha;
    info.score = r.score;
    lista.push(info);
  });
  lista.sort(function (a, b) { return parseFechaDDMMYYYY(b.fecha) - parseFechaDDMMYYYY(a.fecha); });
  return lista;
}

/** HTML del bloque. Devuelve '' si el jugador no tiene partidos. */
function rRivalesPuntos(nombre) {
  rpEnsureStyles();
  var jugador = null;
  for (var i = 0; i < DATA.players.length; i++) { if (DATA.players[i].nombre === nombre) { jugador = DATA.players[i]; break; } }
  var lista = rpPartidosConPuntos(nombre);
  if (!lista.length) return '';

  var suma = 0, h = '';
  lista.forEach(function (m) {
    suma += m.pts;
    var detalle = m.dobleWO ? 'Doble W.O.' : (m.wo ? 'W.O.' : m.score);
    var cls = m.bagel ? 'gold' : (m.pts <= 50 ? 'low' : '');
    h += '<div class="rprow">'
      + '<span class="rpres ' + (m.gano ? 'W' : 'L') + '">' + (m.gano ? 'W' : 'L') + '</span>'
      + '<div class="rpmain"><div class="rpopp">' + esc(m.rival)
      + (m.bagel ? '<span class="rpbonus">6-0 6-0</span>' : '') + '</div>'
      + '<div class="rpdet">' + esc(detalle) + ' \u00b7 ' + esc(m.fecha) + '</div></div>'
      + '<span class="rppts ' + cls + '">+' + m.pts + '</span></div>';
  });

  var resumen = '<div class="rpsum"><div class="rpsumrow"><span>Puntos por partidos</span><span>' + suma + '</span></div>';
  var bonos = jugador ? (jugador.pts - suma) : 0;
  if (bonos > 0) {
    resumen += '<div class="rpsumrow"><span>Bonos de la serie (todos ganados / jugados / disponibilidad)</span><span>+' + bonos + '</span></div>';
  }
  resumen += '<div class="rpsumrow total"><span>Total en la Escalerilla</span><b>' + (jugador ? jugador.pts : suma) + ' pts</b></div></div>';

  return '<div class="rpblk"><div class="rmt">Rivales y puntos obtenidos en la Escalerilla</div>' + h + resumen + '</div>';
}

/**
 * Desglose del Torneo Interno / Abierto: mismo sistema de puntos por partido,
 * leido de TORNEOS_POR_TIPO (filas torneo_partidos). Omite byes y partidos
 * sin resultado. Devuelve '' si el jugador no jugo ninguno.
 */
function rpPartidosTorneo(nombre) {
  var P = rpBases(), out = [];
  var porTipo = (typeof TORNEOS_POR_TIPO !== 'undefined') ? TORNEOS_POR_TIPO : {};
  var vis = (typeof torneoVisiblePorTipo !== 'undefined') ? torneoVisiblePorTipo : null;
  Object.keys(porTipo).forEach(function (tipo) {
    // Solo torneos visibles en la web del club (configuracion_sitio torneo_*_visible)
    if (vis && vis[tipo] === false) return;
    Object.keys(porTipo[tipo] || {}).forEach(function (key) {
      var t = porTipo[tipo][key];
      (t.rondas || []).forEach(function (ronda, ri) {
        ronda.forEach(function (m) {
          var p = m.raw || {};
          if (m.bye || p.es_bye || !m.j1Nombre || !m.j2Nombre || !p.ganador_id) return;
          if (m.j1Nombre !== nombre && m.j2Nombre !== nombre) return;
          var j1 = m.j1Nombre === nombre;
          var rival = j1 ? m.j2Nombre : m.j1Nombre;
          var gano = (p.ganador_id === (j1 ? p.jugador1_id : p.jugador2_id));
          var wo = p.tipo === 'W.O.' || p.estado_partido === 'w_o';
          var sets = [p.set1, p.set2, p.set3].filter(Boolean);
          var n = sets.length, pts, bagel = false, det;
          if (wo) { pts = gano ? P.ganaWO : P.pierdeWO; det = 'W.O.'; }
          else {
            // sets guardados jugador1-jugador2: se muestran desde la vista del jugador
            var vista = sets.map(function (x) {
              var a = String(x).split('-'); return j1 ? x : (a.length === 2 ? a[1] + '-' + a[0] : x);
            });
            det = vista.join(' ');
            if (gano) {
              pts = n === 2 ? P.gana2sets : P.gana3sets;
              if (n === 2 && vista[0] === '6-0' && vista[1] === '6-0') { bagel = true; pts += P.bonoBagelBagel; }
            } else pts = n === 2 ? P.pierde2sets : P.pierde3sets;
          }
          out.push({ pts: pts, gano: gano, bagel: bagel, wo: wo, rival: rival, det: det,
            ronda: ri + 1, torneo: (t.nombre || (t.serie ? 'Serie ' + t.serie : 'Abierto')) + ' ' + t.temporada,
            fecha: p.fecha || '' });
        });
      });
    });
  });
  return out;
}

function rRivalesPuntosTorneo(nombre) {
  rpEnsureStyles();
  var lista = rpPartidosTorneo(nombre);
  if (!lista.length) return '';
  var suma = 0, h = '';
  lista.forEach(function (m) {
    suma += m.pts;
    var cls = m.bagel ? 'gold' : (m.pts <= 50 ? 'low' : '');
    h += '<div class="rprow"><span class="rpres ' + (m.gano ? 'W' : 'L') + '">' + (m.gano ? 'W' : 'L') + '</span>'
      + '<div class="rpmain"><div class="rpopp">' + esc(m.rival) + (m.bagel ? '<span class="rpbonus">6-0 6-0</span>' : '') + '</div>'
      + '<div class="rpdet">' + esc(m.det) + ' · ' + esc(m.torneo) + ' · R' + m.ronda + '</div></div>'
      + '<span class="rppts ' + cls + '">+' + m.pts + '</span></div>';
  });
  return '<div class="rpblk"><div class="rmt">Rivales y puntos obtenidos en el Torneo</div>' + h
    + '<div class="rpsum"><div class="rpsumrow total"><span>Total en el Torneo</span><b>' + suma + ' pts</b></div></div></div>';
}

/** Ambos bloques, en el orden en que van bajo "Ultimos resultados". */
function rRivalesPuntosTodo(nombre) {
  return rRivalesPuntos(nombre) + rRivalesPuntosTorneo(nombre);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { rpBases: rpBases, rpPartidosTorneo: rpPartidosTorneo, rRivalesPuntosTorneo: rRivalesPuntosTorneo, rpPuntosDePartido: rpPuntosDePartido, rpPartidosConPuntos: rpPartidosConPuntos, rRivalesPuntos: rRivalesPuntos };
}
