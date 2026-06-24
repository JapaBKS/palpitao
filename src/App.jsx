import { useState, useEffect, useRef } from "react";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sfpdbotvobdzuckpfcbv.supabase.co';
const supabaseKey = 'sb_publishable_FQaWYA6nqB1Fz9IS2O4klg_Eu1Q2mU4';
const supabase = createClient(supabaseUrl, supabaseKey);

/* ── Hooks ── */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 600);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 600);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// Mede a safe area do topo de verdade. Se estiver em PWA (standalone) num iPhone
// com notch e o env() não cooperar, aplica um fallback seguro para não cobrir o conteúdo.
function useSafeAreaTop() {
  const [pad, setPad] = useState(0);
  useEffect(() => {
    const measure = () => {
      // lê o valor real de env(safe-area-inset-top) via um elemento de teste
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;top:0;left:0;height:env(safe-area-inset-top);width:0;visibility:hidden;pointer-events:none;";
      document.body.appendChild(probe);
      const measured = probe.getBoundingClientRect().height;
      probe.remove();
      const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      const ios = /iphone|ipod/i.test(navigator.userAgent);
      // Fallback: PWA em iPhone com tela "edge-to-edge" alta mas env() zerado → assume ~50px
      let fallback = 0;
      if (standalone && ios && measured < 20) {
        const ratio = window.screen.height / window.screen.width;
        if (ratio > 2 || window.screen.height >= 812) fallback = 50; // iPhone X+ com notch/Dynamic Island
      }
      setPad(Math.max(measured, fallback));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("orientationchange", measure); };
  }, []);
  return pad;
}

/* ── Utils ── */
let _n = 0;
const uid = () => `${Date.now()}_${++_n}`;

function calcPts(pred, result) {
  if (!result || !pred || pred.a == null || pred.b == null || pred.a === "" || pred.b === "") return null;
  const pa = parseInt(pred.a), pb = parseInt(pred.b), ra = parseInt(result.a), rb = parseInt(result.b);
  if ([pa, pb, ra, rb].some((v) => isNaN(v) || v < 0)) return null;
  if (pa === ra && pb === rb) return 10;
  const pt = Math.sign(pa - pb), rt = Math.sign(ra - rb);
  const ok = pt === rt;
  if (ok && (pa === ra || pb === rb)) return 7;
  if (ok) return 5;
  if (pa === ra || pb === rb) return 2;
  return 0;
}

// Multiplicador de fase do mata-mata (incide sobre TUDO: placar + bônus)
const PHASE_MULT = { "32-avos de Final": 1, "Oitavas de Final": 1.2, "Quartas de Final": 1.5, "Semifinal": 1.8, "3º Lugar": 1.5, "Final": 2 };
const KO_BONUS = { classif: 5, prorrog: 3, placarProrrog: 5, penalti: 3 };

// Quem se classifica num placar (empate → null; precisa de quem decide depois)
function whoAdvances(a, b, teamA, teamB) {
  if (a > b) return teamA; if (b > a) return teamB; return null;
}

// Resolve o "estado final" de um jogo (palpite OU resultado), seguindo a árvore:
// normal → (empate) prorrogação → (empate) pênaltis.
// Estrutura esperada: { a, b, etA, etB (prorrogação, opcional), pen ('A'|'B', opcional) }
// Retorna { finalA, finalB, hadET (bool), hadPK (bool), advancer (teamA|teamB|null) }
function resolveKO(obj, teamA, teamB) {
  if (!obj || obj.a == null || obj.b === "" || obj.a === "" || obj.b == null) return null;
  const a = parseInt(obj.a), b = parseInt(obj.b);
  if (isNaN(a) || isNaN(b)) return null;
  if (a !== b) return { finalA: a, finalB: b, hadET: false, hadPK: false, advancer: whoAdvances(a, b, teamA, teamB) };
  // empate no normal → prorrogação
  const hasET = obj.etA != null && obj.etB != null && obj.etA !== "" && obj.etB !== "";
  if (hasET) {
    const ea = parseInt(obj.etA), eb = parseInt(obj.etB);
    if (!isNaN(ea) && !isNaN(eb) && ea !== eb) return { finalA: ea, finalB: eb, hadET: true, hadPK: false, advancer: whoAdvances(ea, eb, teamA, teamB) };
    // prorrogação empate → pênaltis
    const adv = obj.pen === "A" ? teamA : obj.pen === "B" ? teamB : null;
    return { finalA: !isNaN(ea) ? ea : a, finalB: !isNaN(eb) ? eb : b, hadET: true, hadPK: true, advancer: adv };
  }
  // empatou no normal mas sem prorrogação informada → mantém placar, vai pros pênaltis
  const adv = obj.pen === "A" ? teamA : obj.pen === "B" ? teamB : null;
  return { finalA: a, finalB: b, hadET: true, hadPK: true, advancer: adv };
}

// Pontuação de um jogo do mata-mata (já multiplicada pela fase)
function calcPtsKnockout(pred, match) {
  if (!match || !match.result) return null;
  const teamA = match.teamA, teamB = match.teamB;
  const R = resolveKO(match.result, teamA, teamB);
  const P = resolveKO(pred, teamA, teamB);
  if (!R || !P) return null;
  let pts = 0;
  // 1. Placar final (mesma régua do calcPts, sobre o placar que decidiu)
  const base = calcPts({ a: P.finalA, b: P.finalB }, { a: R.finalA, b: R.finalB });
  if (base != null) pts += base;
  // 2. Classificado (+5)
  if (R.advancer && P.advancer === R.advancer) pts += KO_BONUS.classif;
  // 3. Foi pra prorrogação (+3)
  if (P.hadET === R.hadET) pts += KO_BONUS.prorrog;
  // 4. Placar da prorrogação (+5) — só se de fato houve prorrogação e o palpite previu ET com placar exato
  if (R.hadET && P.hadET && P.finalA === R.finalA && P.finalB === R.finalB) pts += KO_BONUS.placarProrrog;
  // 5. Pênaltis: quem passa (+3)
  if (R.hadPK && P.hadPK && R.advancer && P.advancer === R.advancer) pts += KO_BONUS.penalti;
  const mult = PHASE_MULT[match.phase] || 1;
  return Math.round(pts * mult);
}

// Decide se um jogo usa pontuação de mata-mata
function isKnockoutMatch(match) { return match && MATA_MATA.includes(match.phase); }

// Placar a EXIBIR: se houve prorrogação (etA/etB preenchidos), mostra o placar acumulado
// da prorrogação; senão, o placar do tempo normal. Retorna { a, b, isET }.
function displayScore(m) {
  if (!m || !m.result) return null;
  const r = m.result;
  const hasET = r.etA != null && r.etA !== "" && r.etB != null && r.etB !== "";
  if (hasET) return { a: parseInt(r.etA), b: parseInt(r.etB), isET: true };
  return { a: r.a, b: r.b, isET: false };
}

// Pontuação unificada: grupos usa calcPts, mata-mata usa calcPtsKnockout
function scoreMatch(pred, match) {
  if (!match || !match.result) return null;
  if (isKnockoutMatch(match)) return calcPtsKnockout(pred, match);
  return calcPts(pred, match.result);
}

function getStats(pid, matches, preds) {
  let total = 0, c10 = 0, c7 = 0, c5 = 0, c2 = 0, c0 = 0;
  for (const m of matches) {
    if (!m.result) continue;
    const p = preds[pid]?.[m.id];
    if (!p || p.a === "" || p.b === "" || p.a == null || p.b == null) continue;
    const pts = scoreMatch(p, m);
    if (pts == null) continue;
    total += pts;
    // Categoria de cravada baseada no PLACAR (não no total multiplicado do mata-mata)
    const placarPts = isKnockoutMatch(m) ? calcPts({ a: resolveKO(p, m.teamA, m.teamB)?.finalA, b: resolveKO(p, m.teamA, m.teamB)?.finalB }, { a: resolveKO(m.result, m.teamA, m.teamB)?.finalA, b: resolveKO(m.result, m.teamA, m.teamB)?.finalB }) : pts;
    if (placarPts === 10) c10++; else if (placarPts === 7) c7++; else if (placarPts === 5) c5++; else if (placarPts === 2) c2++; else c0++;
  }
  return { total, c10, c7, c5, c2, c0 };
}

function getDetailedStats(pid, matches, preds) {
  const base = getStats(pid, matches, preds);
  let bestPts = -1, bestMatch = null, worstPts = 11, worstMatch = null, streak = 0, streakDone = false;
  const played = matches.filter(m => m.result);
  for (let i = played.length - 1; i >= 0; i--) {
    const m = played[i];
    const p = preds[pid]?.[m.id];
    if (!p || p.a === "" || p.b === "" || p.a == null || p.b == null) { if (!streakDone) streakDone = true; continue; }
    const pts = scoreMatch(p, m);
    if (pts == null) { if (!streakDone) streakDone = true; continue; }
    if (!streakDone) { if (pts > 0) streak++; else streakDone = true; }
    if (pts > bestPts) { bestPts = pts; bestMatch = m; }
    if (pts < worstPts) { worstPts = pts; worstMatch = m; }
  }
  const withPred = played.filter(m => { const p = preds[pid]?.[m.id]; return p && p.a !== "" && p.b !== "" && p.a != null && p.b != null; });
  const accuracy = withPred.length > 0 ? Math.round(((base.c10 + base.c7 + base.c5) / withPred.length) * 100) : 0;

  // Conquistas permanentes: calcula em ordem cronológica para travar no pico histórico
  const sortedPlayed = [...played].sort((a, b) => {
    const da = parseMatchDate(a.date), db = parseMatchDate(b.date);
    if (!da && !db) return 0; if (!da) return 1; if (!db) return -1; return da - db;
  });
  let maxStreak = 0, currAny = 0, maxExactStreak = 0, currExact = 0;
  let rollingCorrect = 0, rollingTotal = 0, everAccurate = false;
  let exactDraws = 0, exactGoleadas = 0;
  for (const m of sortedPlayed) {
    const p = preds[pid]?.[m.id];
    if (!p || p.a === "" || p.b === "" || p.a == null || p.b == null) { currAny = 0; currExact = 0; continue; }
    const pts = isKnockoutMatch(m) ? calcPts({a:resolveKO(p,m.teamA,m.teamB)?.finalA,b:resolveKO(p,m.teamA,m.teamB)?.finalB},{a:resolveKO(m.result,m.teamA,m.teamB)?.finalA,b:resolveKO(m.result,m.teamA,m.teamB)?.finalB}) : calcPts(p, m.result);
    if (pts == null) { currAny = 0; currExact = 0; continue; }
    if (pts > 0) { currAny++; if (currAny > maxStreak) maxStreak = currAny; } else currAny = 0;
    if (pts === 10) { currExact++; if (currExact > maxExactStreak) maxExactStreak = currExact; } else currExact = 0;
    if (pts === 10 && m.result.a === m.result.b) exactDraws++;
    if (pts === 10 && Math.abs(m.result.a - m.result.b) >= 3) exactGoleadas++;
    rollingTotal++;
    if (pts >= 5) rollingCorrect++;
    if (!everAccurate && rollingTotal >= 5 && rollingCorrect / rollingTotal >= 0.60) everAccurate = true;
  }

  return { ...base, bestPts, bestMatch, worstPts, worstMatch, streak, maxStreak, maxExactStreak, withPredCount: withPred.length, accuracy, everAccurate, exactDraws, exactGoleadas };
}

function getChampionWinner(matches) {
  const final = matches.find(m => m.phase === "Final" && m.result && !m.live);
  if (!final) return null;
  if (final.result.a > final.result.b) return final.teamA;
  if (final.result.b > final.result.a) return final.teamB;
  return null;
}

function getViceWinner(matches) {
  const final = matches.find(m => m.phase === "Final" && m.result && !m.live);
  if (!final) return null;
  if (final.result.a > final.result.b) return final.teamB;
  if (final.result.b > final.result.a) return final.teamA;
  return null;
}

function getThirdWinner(matches) {
  const m = matches.find(mm => mm.phase === "3º Lugar" && mm.result && !mm.live);
  if (!m) return null;
  return m.result.a >= m.result.b ? m.teamA : m.teamB;
}

const BRAZIL_PHASES = ["Fase de Grupos", "32-avos de Final", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Vice", "Campeão"];

function getBrazilPhase(matches) {
  const champion = getChampionWinner(matches);
  if (champion === "Brasil") return "Campeão";
  const finalM = matches.find(m => m.phase === "Final" && m.result && !m.live);
  if (finalM && (finalM.teamA === "Brasil" || finalM.teamB === "Brasil")) return "Vice";
  for (const phase of ["3º Lugar", "Semifinal", "Quartas de Final", "Oitavas de Final", "32-avos de Final"]) {
    if (matches.find(m => m.phase === phase && m.result && !m.live && (m.teamA === "Brasil" || m.teamB === "Brasil"))) return phase;
  }
  return "Fase de Grupos";
}

const PIX_CODE = "00020126360014br.gov.bcb.pix0114+5541992774415520400005303986540550.005802BR5915Bruno Sakaguchi6009Sao Paulo62230519daqr25755251968148163044C9D";

const CHAMPION_PTS = 100;
const VICE_PTS = 50;
const THIRD_PTS = 30;
const BRAZIL_PTS = 50;

function getRanked(participants, matches, preds, championPts = CHAMPION_PTS) {
  const winner = getChampionWinner(matches);
  const vice = getViceWinner(matches);
  const third = getThirdWinner(matches);
  const actualBrazilPhase = getBrazilPhase(matches);
  const brazilKnockoutPlayed = matches.some(m => m.phase !== "Fase de Grupos" && m.result && (m.teamA === "Brasil" || m.teamB === "Brasil"));
  return [...participants]
    .map(p => {
      const stats = getStats(p.id, matches, preds);
      const champBonus = (winner && p.champion_pick && p.champion_pick.toLowerCase().trim() === winner.toLowerCase().trim()) ? championPts : 0;
      const viceBonus = (vice && p.vice_pick && p.vice_pick.toLowerCase().trim() === vice.toLowerCase().trim()) ? VICE_PTS : 0;
      const thirdBonus = (third && p.third_pick && p.third_pick.toLowerCase().trim() === third.toLowerCase().trim()) ? THIRD_PTS : 0;
      const brazilBonus = (brazilKnockoutPlayed && p.brazil_pick && p.brazil_pick === actualBrazilPhase) ? BRAZIL_PTS : 0;
      return { ...p, ...stats, total: stats.total + champBonus + viceBonus + thirdBonus + brazilBonus, champBonus, viceBonus, thirdBonus, brazilBonus };
    })
    .sort((a, b) => b.total - a.total || b.c10 - a.c10 || b.c7 - a.c7 || b.c5 - a.c5 || a.name.localeCompare(b.name, 'pt-BR'));
}

// Mapa { participanteId: posição } a partir de um conjunto de jogos.
function getStandingsMap(participants, matches, preds) {
  return getRanked(participants, matches, preds).reduce((acc, pl, i) => { acc[pl.id] = i + 1; return acc; }, {});
}

// "Ranking anterior" = ranking antes do ÚLTIMO jogo com resultado (por data+hora do jogo).
// Granularidade por jogo: a cada placar lançado, a referência avança e as setas mudam.
// Usa a data/hora do jogo (sempre existe) → não depende de migração.
function getPreviousMatches(matches) {
  const withRes = matches.filter(m => m.result && parseMatchDate(m.date));
  if (withRes.length === 0) return matches;
  let maxT = -Infinity;
  withRes.forEach(m => { const t = parseMatchDate(m.date).getTime(); if (t > maxT) maxT = t; });
  // Remove o(s) jogo(s) com a data/hora mais recente (jogos simultâneos contam juntos)
  return matches.map(m => {
    const d = parseMatchDate(m.date);
    return (m.result && d && d.getTime() === maxT) ? { ...m, result: null } : m;
  });
}

function parseMatchDate(dateStr) {
  if (!dateStr || dateStr.includes("TBD")) return null;
  try {
    const m = dateStr.match(/(\d{2})\/(\d{2}).*- (\d{2}):(\d{2})/);
    if (!m) return null;
    const [, day, month, hour, minute] = m;
    return new Date(`2026-${month}-${day}T${hour}:${minute}:00-03:00`);
  } catch { return null; }
}

function isLocked(dateStr) {
  const d = parseMatchDate(dateStr);
  return d ? new Date() > d : false;
}

function isClosingSoon(dateStr, minutes = 30) {
  const d = parseMatchDate(dateStr);
  if (!d) return false;
  const diff = d - new Date();
  return diff > 0 && diff < minutes * 60 * 1000;
}

const PHASES = ["Fase de Grupos", "32-avos de Final", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Final"];
const MATA_MATA = ["32-avos de Final", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Final"];

const GRUPOS = {
  A: ["México", "África do Sul", "Coreia do Sul", "República Tcheca"], B: ["Canadá", "Bósnia", "Catar", "Suíça"],
  C: ["Brasil", "Marrocos", "Haiti", "Escócia"], D: ["Estados Unidos", "Paraguai", "Austrália", "Turquia"],
  E: ["Alemanha", "Curaçao", "Costa do Marfim", "Equador"], F: ["Holanda", "Japão", "Suécia", "Tunísia"],
  G: ["Bélgica", "Egito", "Irã", "Nova Zelândia"], H: ["Espanha", "Cabo Verde", "Arábia Saudita", "Uruguai"],
  I: ["França", "Senegal", "Iraque", "Noruega"], J: ["Argentina", "Argélia", "Áustria", "Jordânia"],
  K: ["Portugal", "RD Congo", "Uzbequistão", "Colômbia"], L: ["Inglaterra", "Croácia", "Gana", "Panamá"],
};
const ALL_TEAMS = Object.values(GRUPOS).flat().sort((a, b) => a.localeCompare(b, 'pt-BR'));
const TEAM_TO_GROUP = {};
Object.entries(GRUPOS).forEach(([letter, teams]) => { teams.forEach(team => { TEAM_TO_GROUP[team.toLowerCase()] = letter; }); });

// ── Alocação oficial dos 8 melhores terceiros (Anexo C FIFA, 495 combinações) ──
// Chave = 8 grupos que classificam terceiros (ordenados A-L). Valor = grupo do 3º p/ slots [1A,1B,1D,1E,1G,1I,1K,1L].
const THIRD_ALLOC = {"EFGHIJKL":"EJIFHGLK","DFGHIJKL":"HGIDJFLK","DEGHIJKL":"EJIDHGLK","DEFHIJKL":"EJIDHFLK","DEFGIJKL":"EGIDJFLK","DEFGHJKL":"EGJDHFLK","DEFGHIKL":"EGIDHFLK","DEFGHIJL":"EGJDHFLI","DEFGHIJK":"EGJDHFIK","CFGHIJKL":"HGICJFLK","CEGHIJKL":"EJICHGLK","CEFHIJKL":"EJICHFLK","CEFGIJKL":"EGICJFLK","CEFGHJKL":"EGJCHFLK","CEFGHIKL":"EGICHFLK","CEFGHIJL":"EGJCHFLI","CEFGHIJK":"EGJCHFIK","CDGHIJKL":"HGICJDLK","CDFHIJKL":"CJIDHFLK","CDFGIJKL":"CGIDJFLK","CDFGHJKL":"CGJDHFLK","CDFGHIKL":"CGIDHFLK","CDFGHIJL":"CGJDHFLI","CDFGHIJK":"CGJDHFIK","CDEHIJKL":"EJICHDLK","CDEGIJKL":"EGICJDLK","CDEGHJKL":"EGJCHDLK","CDEGHIKL":"EGICHDLK","CDEGHIJL":"EGJCHDLI","CDEGHIJK":"EGJCHDIK","CDEFIJKL":"CJEDIFLK","CDEFHJKL":"CJEDHFLK","CDEFHIKL":"CEIDHFLK","CDEFHIJL":"CJEDHFLI","CDEFHIJK":"CJEDHFIK","CDEFGJKL":"CGEDJFLK","CDEFGIKL":"CGEDIFLK","CDEFGIJL":"CGEDJFLI","CDEFGIJK":"CGEDJFIK","CDEFGHKL":"CGEDHFLK","CDEFGHJL":"CGJDHFLE","CDEFGHJK":"CGJDHFEK","CDEFGHIL":"CGEDHFLI","CDEFGHIK":"CGEDHFIK","CDEFGHIJ":"CGJDHFEI","BFGHIJKL":"HJBFIGLK","BEGHIJKL":"EJIBHGLK","BEFHIJKL":"EJBFIHLK","BEFGIJKL":"EJBFIGLK","BEFGHJKL":"EJBFHGLK","BEFGHIKL":"EGBFIHLK","BEFGHIJL":"EJBFHGLI","BEFGHIJK":"EJBFHGIK","BDGHIJKL":"HJBDIGLK","BDFHIJKL":"HJBDIFLK","BDFGIJKL":"IGBDJFLK","BDFGHJKL":"HGBDJFLK","BDFGHIKL":"HGBDIFLK","BDFGHIJL":"HGBDJFLI","BDFGHIJK":"HGBDJFIK","BDEHIJKL":"EJBDIHLK","BDEGIJKL":"EJBDIGLK","BDEGHJKL":"EJBDHGLK","BDEGHIKL":"EGBDIHLK","BDEGHIJL":"EJBDHGLI","BDEGHIJK":"EJBDHGIK","BDEFIJKL":"EJBDIFLK","BDEFHJKL":"EJBDHFLK","BDEFHIKL":"EIBDHFLK","BDEFHIJL":"EJBDHFLI","BDEFHIJK":"EJBDHFIK","BDEFGJKL":"EGBDJFLK","BDEFGIKL":"EGBDIFLK","BDEFGIJL":"EGBDJFLI","BDEFGIJK":"EGBDJFIK","BDEFGHKL":"EGBDHFLK","BDEFGHJL":"HGBDJFLE","BDEFGHJK":"HGBDJFEK","BDEFGHIL":"EGBDHFLI","BDEFGHIK":"EGBDHFIK","BDEFGHIJ":"HGBDJFEI","BCGHIJKL":"HJBCIGLK","BCFHIJKL":"HJBCIFLK","BCFGIJKL":"IGBCJFLK","BCFGHJKL":"HGBCJFLK","BCFGHIKL":"HGBCIFLK","BCFGHIJL":"HGBCJFLI","BCFGHIJK":"HGBCJFIK","BCEHIJKL":"EJBCIHLK","BCEGIJKL":"EJBCIGLK","BCEGHJKL":"EJBCHGLK","BCEGHIKL":"EGBCIHLK","BCEGHIJL":"EJBCHGLI","BCEGHIJK":"EJBCHGIK","BCEFIJKL":"EJBCIFLK","BCEFHJKL":"EJBCHFLK","BCEFHIKL":"EIBCHFLK","BCEFHIJL":"EJBCHFLI","BCEFHIJK":"EJBCHFIK","BCEFGJKL":"EGBCJFLK","BCEFGIKL":"EGBCIFLK","BCEFGIJL":"EGBCJFLI","BCEFGIJK":"EGBCJFIK","BCEFGHKL":"EGBCHFLK","BCEFGHJL":"HGBCJFLE","BCEFGHJK":"HGBCJFEK","BCEFGHIL":"EGBCHFLI","BCEFGHIK":"EGBCHFIK","BCEFGHIJ":"HGBCJFEI","BCDHIJKL":"HJBCIDLK","BCDGIJKL":"IGBCJDLK","BCDGHJKL":"HGBCJDLK","BCDGHIKL":"HGBCIDLK","BCDGHIJL":"HGBCJDLI","BCDGHIJK":"HGBCJDIK","BCDFIJKL":"CJBDIFLK","BCDFHJKL":"CJBDHFLK","BCDFHIKL":"CIBDHFLK","BCDFHIJL":"CJBDHFLI","BCDFHIJK":"CJBDHFIK","BCDFGJKL":"CGBDJFLK","BCDFGIKL":"CGBDIFLK","BCDFGIJL":"CGBDJFLI","BCDFGIJK":"CGBDJFIK","BCDFGHKL":"CGBDHFLK","BCDFGHJL":"CGBDHFLJ","BCDFGHJK":"HGBCJFDK","BCDFGHIL":"CGBDHFLI","BCDFGHIK":"CGBDHFIK","BCDFGHIJ":"HGBCJFDI","BCDEIJKL":"EJBCIDLK","BCDEHJKL":"EJBCHDLK","BCDEHIKL":"EIBCHDLK","BCDEHIJL":"EJBCHDLI","BCDEHIJK":"EJBCHDIK","BCDEGJKL":"EGBCJDLK","BCDEGIKL":"EGBCIDLK","BCDEGIJL":"EGBCJDLI","BCDEGIJK":"EGBCJDIK","BCDEGHKL":"EGBCHDLK","BCDEGHJL":"HGBCJDLE","BCDEGHJK":"HGBCJDEK","BCDEGHIL":"EGBCHDLI","BCDEGHIK":"EGBCHDIK","BCDEGHIJ":"HGBCJDEI","BCDEFJKL":"CJBDEFLK","BCDEFIKL":"CEBDIFLK","BCDEFIJL":"CJBDEFLI","BCDEFIJK":"CJBDEFIK","BCDEFHKL":"CEBDHFLK","BCDEFHJL":"CJBDHFLE","BCDEFHJK":"CJBDHFEK","BCDEFHIL":"CEBDHFLI","BCDEFHIK":"CEBDHFIK","BCDEFHIJ":"CJBDHFEI","BCDEFGKL":"CGBDEFLK","BCDEFGJL":"CGBDJFLE","BCDEFGJK":"CGBDJFEK","BCDEFGIL":"CGBDEFLI","BCDEFGIK":"CGBDEFIK","BCDEFGIJ":"CGBDJFEI","BCDEFGHL":"CGBDHFLE","BCDEFGHK":"CGBDHFEK","BCDEFGHJ":"HGBCJFDE","BCDEFGHI":"CGBDHFEI","AFGHIJKL":"HJIFAGLK","AEGHIJKL":"EJIAHGLK","AEFHIJKL":"EJIFAHLK","AEFGIJKL":"EJIFAGLK","AEFGHJKL":"EGJFAHLK","AEFGHIKL":"EGIFAHLK","AEFGHIJL":"EGJFAHLI","AEFGHIJK":"EGJFAHIK","ADGHIJKL":"HJIDAGLK","ADFHIJKL":"HJIDAFLK","ADFGIJKL":"IGJDAFLK","ADFGHJKL":"HGJDAFLK","ADFGHIKL":"HGIDAFLK","ADFGHIJL":"HGJDAFLI","ADFGHIJK":"HGJDAFIK","ADEHIJKL":"EJIDAHLK","ADEGIJKL":"EJIDAGLK","ADEGHJKL":"EGJDAHLK","ADEGHIKL":"EGIDAHLK","ADEGHIJL":"EGJDAHLI","ADEGHIJK":"EGJDAHIK","ADEFIJKL":"EJIDAFLK","ADEFHJKL":"HJEDAFLK","ADEFHIKL":"HEIDAFLK","ADEFHIJL":"HJEDAFLI","ADEFHIJK":"HJEDAFIK","ADEFGJKL":"EGJDAFLK","ADEFGIKL":"EGIDAFLK","ADEFGIJL":"EGJDAFLI","ADEFGIJK":"EGJDAFIK","ADEFGHKL":"HGEDAFLK","ADEFGHJL":"HGJDAFLE","ADEFGHJK":"HGJDAFEK","ADEFGHIL":"HGEDAFLI","ADEFGHIK":"HGEDAFIK","ADEFGHIJ":"HGJDAFEI","ACGHIJKL":"HJICAGLK","ACFHIJKL":"HJICAFLK","ACFGIJKL":"IGJCAFLK","ACFGHJKL":"HGJCAFLK","ACFGHIKL":"HGICAFLK","ACFGHIJL":"HGJCAFLI","ACFGHIJK":"HGJCAFIK","ACEHIJKL":"EJICAHLK","ACEGIJKL":"EJICAGLK","ACEGHJKL":"EGJCAHLK","ACEGHIKL":"EGICAHLK","ACEGHIJL":"EGJCAHLI","ACEGHIJK":"EGJCAHIK","ACEFIJKL":"EJICAFLK","ACEFHJKL":"HJECAFLK","ACEFHIKL":"HEICAFLK","ACEFHIJL":"HJECAFLI","ACEFHIJK":"HJECAFIK","ACEFGJKL":"EGJCAFLK","ACEFGIKL":"EGICAFLK","ACEFGIJL":"EGJCAFLI","ACEFGIJK":"EGJCAFIK","ACEFGHKL":"HGECAFLK","ACEFGHJL":"HGJCAFLE","ACEFGHJK":"HGJCAFEK","ACEFGHIL":"HGECAFLI","ACEFGHIK":"HGECAFIK","ACEFGHIJ":"HGJCAFEI","ACDHIJKL":"HJICADLK","ACDGIJKL":"IGJCADLK","ACDGHJKL":"HGJCADLK","ACDGHIKL":"HGICADLK","ACDGHIJL":"HGJCADLI","ACDGHIJK":"HGJCADIK","ACDFIJKL":"CJIDAFLK","ACDFHJKL":"HJFCADLK","ACDFHIKL":"HFICADLK","ACDFHIJL":"HJFCADLI","ACDFHIJK":"HJFCADIK","ACDFGJKL":"CGJDAFLK","ACDFGIKL":"CGIDAFLK","ACDFGIJL":"CGJDAFLI","ACDFGIJK":"CGJDAFIK","ACDFGHKL":"HGFCADLK","ACDFGHJL":"CGJDAFLH","ACDFGHJK":"HGJCAFDK","ACDFGHIL":"HGFCADLI","ACDFGHIK":"HGFCADIK","ACDFGHIJ":"HGJCAFDI","ACDEIJKL":"EJICADLK","ACDEHJKL":"HJECADLK","ACDEHIKL":"HEICADLK","ACDEHIJL":"HJECADLI","ACDEHIJK":"HJECADIK","ACDEGJKL":"EGJCADLK","ACDEGIKL":"EGICADLK","ACDEGIJL":"EGJCADLI","ACDEGIJK":"EGJCADIK","ACDEGHKL":"HGECADLK","ACDEGHJL":"HGJCADLE","ACDEGHJK":"HGJCADEK","ACDEGHIL":"HGECADLI","ACDEGHIK":"HGECADIK","ACDEGHIJ":"HGJCADEI","ACDEFJKL":"CJEDAFLK","ACDEFIKL":"CEIDAFLK","ACDEFIJL":"CJEDAFLI","ACDEFIJK":"CJEDAFIK","ACDEFHKL":"HEFCADLK","ACDEFHJL":"HJFCADLE","ACDEFHJK":"HJECAFDK","ACDEFHIL":"HEFCADLI","ACDEFHIK":"HEFCADIK","ACDEFHIJ":"HJECAFDI","ACDEFGKL":"CGEDAFLK","ACDEFGJL":"CGJDAFLE","ACDEFGJK":"CGJDAFEK","ACDEFGIL":"CGEDAFLI","ACDEFGIK":"CGEDAFIK","ACDEFGIJ":"CGJDAFEI","ACDEFGHL":"HGFCADLE","ACDEFGHK":"HGECAFDK","ACDEFGHJ":"HGJCAFDE","ACDEFGHI":"HGECAFDI","ABGHIJKL":"HJBAIGLK","ABFHIJKL":"HJBAIFLK","ABFGIJKL":"IJBFAGLK","ABFGHJKL":"HJBFAGLK","ABFGHIKL":"HGBAIFLK","ABFGHIJL":"HJBFAGLI","ABFGHIJK":"HJBFAGIK","ABEHIJKL":"EJBAIHLK","ABEGIJKL":"EJBAIGLK","ABEGHJKL":"EJBAHGLK","ABEGHIKL":"EGBAIHLK","ABEGHIJL":"EJBAHGLI","ABEGHIJK":"EJBAHGIK","ABEFIJKL":"EJBAIFLK","ABEFHJKL":"EJBFAHLK","ABEFHIKL":"EIBFAHLK","ABEFHIJL":"EJBFAHLI","ABEFHIJK":"EJBFAHIK","ABEFGJKL":"EJBFAGLK","ABEFGIKL":"EGBAIFLK","ABEFGIJL":"EJBFAGLI","ABEFGIJK":"EJBFAGIK","ABEFGHKL":"EGBFAHLK","ABEFGHJL":"HJBFAGLE","ABEFGHJK":"HJBFAGEK","ABEFGHIL":"EGBFAHLI","ABEFGHIK":"EGBFAHIK","ABEFGHIJ":"HJBFAGEI","ABDHIJKL":"IJBDAHLK","ABDGIJKL":"IJBDAGLK","ABDGHJKL":"HJBDAGLK","ABDGHIKL":"IGBDAHLK","ABDGHIJL":"HJBDAGLI","ABDGHIJK":"HJBDAGIK","ABDFIJKL":"IJBDAFLK","ABDFHJKL":"HJBDAFLK","ABDFHIKL":"HIBDAFLK","ABDFHIJL":"HJBDAFLI","ABDFHIJK":"HJBDAFIK","ABDFGJKL":"FJBDAGLK","ABDFGIKL":"IGBDAFLK","ABDFGIJL":"FJBDAGLI","ABDFGIJK":"FJBDAGIK","ABDFGHKL":"HGBDAFLK","ABDFGHJL":"HGBDAFLJ","ABDFGHJK":"HGBDAFJK","ABDFGHIL":"HGBDAFLI","ABDFGHIK":"HGBDAFIK","ABDFGHIJ":"HGBDAFIJ","ABDEIJKL":"EJBAIDLK","ABDEHJKL":"EJBDAHLK","ABDEHIKL":"EIBDAHLK","ABDEHIJL":"EJBDAHLI","ABDEHIJK":"EJBDAHIK","ABDEGJKL":"EJBDAGLK","ABDEGIKL":"EGBAIDLK","ABDEGIJL":"EJBDAGLI","ABDEGIJK":"EJBDAGIK","ABDEGHKL":"EGBDAHLK","ABDEGHJL":"HJBDAGLE","ABDEGHJK":"HJBDAGEK","ABDEGHIL":"EGBDAHLI","ABDEGHIK":"EGBDAHIK","ABDEGHIJ":"HJBDAGEI","ABDEFJKL":"EJBDAFLK","ABDEFIKL":"EIBDAFLK","ABDEFIJL":"EJBDAFLI","ABDEFIJK":"EJBDAFIK","ABDEFHKL":"HEBDAFLK","ABDEFHJL":"HJBDAFLE","ABDEFHJK":"HJBDAFEK","ABDEFHIL":"HEBDAFLI","ABDEFHIK":"HEBDAFIK","ABDEFHIJ":"HJBDAFEI","ABDEFGKL":"EGBDAFLK","ABDEFGJL":"EGBDAFLJ","ABDEFGJK":"EGBDAFJK","ABDEFGIL":"EGBDAFLI","ABDEFGIK":"EGBDAFIK","ABDEFGIJ":"EGBDAFIJ","ABDEFGHL":"HGBDAFLE","ABDEFGHK":"HGBDAFEK","ABDEFGHJ":"HGBDAFEJ","ABDEFGHI":"HGBDAFEI","ABCHIJKL":"IJBCAHLK","ABCGIJKL":"IJBCAGLK","ABCGHJKL":"HJBCAGLK","ABCGHIKL":"IGBCAHLK","ABCGHIJL":"HJBCAGLI","ABCGHIJK":"HJBCAGIK","ABCFIJKL":"IJBCAFLK","ABCFHJKL":"HJBCAFLK","ABCFHIKL":"HIBCAFLK","ABCFHIJL":"HJBCAFLI","ABCFHIJK":"HJBCAFIK","ABCFGJKL":"CJBFAGLK","ABCFGIKL":"IGBCAFLK","ABCFGIJL":"CJBFAGLI","ABCFGIJK":"CJBFAGIK","ABCFGHKL":"HGBCAFLK","ABCFGHJL":"HGBCAFLJ","ABCFGHJK":"HGBCAFJK","ABCFGHIL":"HGBCAFLI","ABCFGHIK":"HGBCAFIK","ABCFGHIJ":"HGBCAFIJ","ABCEIJKL":"EJBAICLK","ABCEHJKL":"EJBCAHLK","ABCEHIKL":"EIBCAHLK","ABCEHIJL":"EJBCAHLI","ABCEHIJK":"EJBCAHIK","ABCEGJKL":"EJBCAGLK","ABCEGIKL":"EGBAICLK","ABCEGIJL":"EJBCAGLI","ABCEGIJK":"EJBCAGIK","ABCEGHKL":"EGBCAHLK","ABCEGHJL":"HJBCAGLE","ABCEGHJK":"HJBCAGEK","ABCEGHIL":"EGBCAHLI","ABCEGHIK":"EGBCAHIK","ABCEGHIJ":"HJBCAGEI","ABCEFJKL":"EJBCAFLK","ABCEFIKL":"EIBCAFLK","ABCEFIJL":"EJBCAFLI","ABCEFIJK":"EJBCAFIK","ABCEFHKL":"HEBCAFLK","ABCEFHJL":"HJBCAFLE","ABCEFHJK":"HJBCAFEK","ABCEFHIL":"HEBCAFLI","ABCEFHIK":"HEBCAFIK","ABCEFHIJ":"HJBCAFEI","ABCEFGKL":"EGBCAFLK","ABCEFGJL":"EGBCAFLJ","ABCEFGJK":"EGBCAFJK","ABCEFGIL":"EGBCAFLI","ABCEFGIK":"EGBCAFIK","ABCEFGIJ":"EGBCAFIJ","ABCEFGHL":"HGBCAFLE","ABCEFGHK":"HGBCAFEK","ABCEFGHJ":"HGBCAFEJ","ABCEFGHI":"HGBCAFEI","ABCDIJKL":"IJBCADLK","ABCDHJKL":"HJBCADLK","ABCDHIKL":"HIBCADLK","ABCDHIJL":"HJBCADLI","ABCDHIJK":"HJBCADIK","ABCDGJKL":"CJBDAGLK","ABCDGIKL":"IGBCADLK","ABCDGIJL":"CJBDAGLI","ABCDGIJK":"CJBDAGIK","ABCDGHKL":"HGBCADLK","ABCDGHJL":"HGBCADLJ","ABCDGHJK":"HGBCADJK","ABCDGHIL":"HGBCADLI","ABCDGHIK":"HGBCADIK","ABCDGHIJ":"HGBCADIJ","ABCDFJKL":"CJBDAFLK","ABCDFIKL":"CIBDAFLK","ABCDFIJL":"CJBDAFLI","ABCDFIJK":"CJBDAFIK","ABCDFHKL":"HFBCADLK","ABCDFHJL":"CJBDAFLH","ABCDFHJK":"HJBCAFDK","ABCDFHIL":"HFBCADLI","ABCDFHIK":"HFBCADIK","ABCDFHIJ":"HJBCAFDI","ABCDFGKL":"CGBDAFLK","ABCDFGJL":"CGBDAFLJ","ABCDFGJK":"CGBDAFJK","ABCDFGIL":"CGBDAFLI","ABCDFGIK":"CGBDAFIK","ABCDFGIJ":"CGBDAFIJ","ABCDFGHL":"CGBDAFLH","ABCDFGHK":"HGBCAFDK","ABCDFGHJ":"HGBCAFDJ","ABCDFGHI":"HGBCAFDI","ABCDEJKL":"EJBCADLK","ABCDEIKL":"EIBCADLK","ABCDEIJL":"EJBCADLI","ABCDEIJK":"EJBCADIK","ABCDEHKL":"HEBCADLK","ABCDEHJL":"HJBCADLE","ABCDEHJK":"HJBCADEK","ABCDEHIL":"HEBCADLI","ABCDEHIK":"HEBCADIK","ABCDEHIJ":"HJBCADEI","ABCDEGKL":"EGBCADLK","ABCDEGJL":"EGBCADLJ","ABCDEGJK":"EGBCADJK","ABCDEGIL":"EGBCADLI","ABCDEGIK":"EGBCADIK","ABCDEGIJ":"EGBCADIJ","ABCDEGHL":"HGBCADLE","ABCDEGHK":"HGBCADEK","ABCDEGHJ":"HGBCADEJ","ABCDEGHI":"HGBCADEI","ABCDEFKL":"CEBDAFLK","ABCDEFJL":"CJBDAFLE","ABCDEFJK":"CJBDAFEK","ABCDEFIL":"CEBDAFLI","ABCDEFIK":"CEBDAFIK","ABCDEFIJ":"CJBDAFEI","ABCDEFHL":"HFBCADLE","ABCDEFHK":"HEBCAFDK","ABCDEFHJ":"HJBCAFDE","ABCDEFHI":"HEBCAFDI","ABCDEFGL":"CGBDAFLE","ABCDEFGK":"CGBDAFEK","ABCDEFGJ":"CGBDAFEJ","ABCDEFGI":"CGBDAFEI","ABCDEFGH":"HGBCAFDE"};
const THIRD_SLOTS = ["A", "B", "D", "E", "G", "I", "K", "L"];

function getGroupStandings(matches, includeLive = true) {
  const st = {};
  Object.keys(GRUPOS).forEach(g => { st[g] = GRUPOS[g].map(t => ({ team: t, pts: 0, gf: 0, ga: 0, gd: 0, pld: 0 })); });
  const groupMatches = matches.filter(m => m.phase === "Fase de Grupos" && m.result && (includeLive || !m.live));
  groupMatches.forEach(m => {
    let gA = TEAM_TO_GROUP[m.teamA.toLowerCase()], gB = TEAM_TO_GROUP[m.teamB.toLowerCase()];
    if(!gA) Object.keys(TEAM_TO_GROUP).forEach(k => { if(m.teamA.toLowerCase().includes(k)) gA = TEAM_TO_GROUP[k]; });
    if(!gB) Object.keys(TEAM_TO_GROUP).forEach(k => { if(m.teamB.toLowerCase().includes(k)) gB = TEAM_TO_GROUP[k]; });

    const rA = m.result.a, rB = m.result.b;
    if (gA && st[gA]) {
      const t = st[gA].find(x => x.team.toLowerCase() === m.teamA.toLowerCase() || m.teamA.toLowerCase().includes(x.team.toLowerCase()));
      if (t) { t.pld++; t.gf += rA; t.ga += rB; t.gd += (rA - rB); if (rA > rB) t.pts += 3; else if (rA === rB) t.pts += 1; }
    }
    if (gB && st[gB]) {
      const t = st[gB].find(x => x.team.toLowerCase() === m.teamB.toLowerCase() || m.teamB.toLowerCase().includes(x.team.toLowerCase()));
      if (t) { t.pld++; t.gf += rB; t.ga += rA; t.gd += (rB - rA); if (rB > rA) t.pts += 3; else if (rA === rB) t.pts += 1; }
    }
  });
  Object.keys(st).forEach(g => { st[g].sort((a, b) => rankGroupTeams(a, b, st[g], groupMatches)); });
  return st;
}

// Desempate oficial FIFA: 1) pontos gerais; entre empatados no MESMO grupo → confronto direto
// (pontos h2h → saldo h2h → gols h2h); se persistir → saldo geral → gols gerais.
// Fair play (cartões) omitido por falta de dados.
function rankGroupTeams(a, b, allTeams, groupMatches) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  // empatados em pontos: junta TODOS os times com os mesmos pontos pra calcular o mini-grupo h2h
  const tied = allTeams.filter(t => t.pts === a.pts);
  if (tied.length >= 2) {
    const h2h = headToHead(tied, groupMatches);
    const ha = h2h[a.team], hb = h2h[b.team];
    if (ha && hb) {
      if (hb.pts !== ha.pts) return hb.pts - ha.pts;
      if (hb.gd !== ha.gd) return hb.gd - ha.gd;
      if (hb.gf !== ha.gf) return hb.gf - ha.gf;
    }
  }
  // segundo passo: critérios gerais do grupo
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return 0;
}

// Mini-tabela só com os jogos ENTRE os times empatados
function headToHead(tiedTeams, groupMatches) {
  const names = tiedTeams.map(t => t.team.toLowerCase());
  const mini = {};
  tiedTeams.forEach(t => { mini[t.team] = { pts: 0, gf: 0, ga: 0, gd: 0 }; });
  const nameOf = (raw) => tiedTeams.find(t => t.team.toLowerCase() === raw.toLowerCase() || raw.toLowerCase().includes(t.team.toLowerCase()))?.team;
  groupMatches.forEach(m => {
    const inA = names.some(n => m.teamA.toLowerCase() === n || m.teamA.toLowerCase().includes(n));
    const inB = names.some(n => m.teamB.toLowerCase() === n || m.teamB.toLowerCase().includes(n));
    if (!inA || !inB) return; // só jogos entre os empatados
    const nA = nameOf(m.teamA), nB = nameOf(m.teamB);
    if (!nA || !nB) return;
    const rA = m.result.a, rB = m.result.b;
    mini[nA].gf += rA; mini[nA].ga += rB; mini[nA].gd += (rA - rB);
    mini[nB].gf += rB; mini[nB].ga += rA; mini[nB].gd += (rB - rA);
    if (rA > rB) mini[nA].pts += 3; else if (rA === rB) { mini[nA].pts += 1; mini[nB].pts += 1; } else mini[nB].pts += 3;
  });
  return mini;
}

/* ── Helpers: rodada, evolução, confronto direto ── */
// "Dia lógico" do jogo: como os jogos normalmente começam à tarde/noite (após o meio-dia),
// um jogo de madrugada (antes do meio-dia) é tratado como pertencente ao dia ANTERIOR —
// a continuação da "noite de ontem" — para não passar batido na aba "Hoje".
function getDayKey(dateStr) {
  const d = parseMatchDate(dateStr);
  if (d) {
    const shifted = d.getHours() < 12 ? new Date(d.getTime() - 24 * 60 * 60 * 1000) : d;
    return `${String(shifted.getDate()).padStart(2, "0")}/${String(shifted.getMonth() + 1).padStart(2, "0")}`;
  }
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{2})\/(\d{2})/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function getRoundSummary(participants, matches, preds) {
  const days = {};
  matches.filter(m => m.result).forEach(m => {
    const k = getDayKey(m.date) || "—";
    if (!days[k]) { const d = parseMatchDate(m.date); days[k] = { time: d ? d.getTime() : 0, ms: [] }; }
    days[k].ms.push(m);
  });
  const keys = Object.keys(days);
  if (!keys.length) return null;
  let latestKey = keys[0];
  keys.forEach(k => { if (days[k].time >= days[latestKey].time) latestKey = k; });
  const dayMatches = days[latestKey].ms;
  const scores = participants.map(p => {
    let pts = 0, exact = 0;
    dayMatches.forEach(m => { const v = scoreMatch(preds[p.id]?.[m.id], m); if (v != null) { pts += v; const pl = isKnockoutMatch(m) ? calcPts({a:resolveKO(preds[p.id]?.[m.id],m.teamA,m.teamB)?.finalA,b:resolveKO(preds[p.id]?.[m.id],m.teamA,m.teamB)?.finalB},{a:resolveKO(m.result,m.teamA,m.teamB)?.finalA,b:resolveKO(m.result,m.teamA,m.teamB)?.finalB}) : v; if (pl === 10) exact++; } });
    return { name: p.name, id: p.id, pts, exact };
  }).filter(s => s.pts > 0).sort((a, b) => b.pts - a.pts || b.exact - a.exact);
  return { dayLabel: latestKey, matchCount: dayMatches.length, top: scores.slice(0, 3) };
}

function getEvolution(participants, matches, preds) {
  const days = {};
  matches.filter(m => m.result).forEach(m => {
    const k = getDayKey(m.date) || "—";
    if (!days[k]) { const d = parseMatchDate(m.date); days[k] = { key: k, time: d ? d.getTime() : 0, ms: [] }; }
    days[k].ms.push(m);
  });
  const ordered = Object.values(days).sort((a, b) => a.time - b.time);
  if (ordered.length < 1) return null;
  const cum = {}; participants.forEach(p => { cum[p.id] = 0; });
  const series = participants.map(p => ({ id: p.id, name: p.name, points: [], positions: [] }));
  ordered.forEach(day => {
    day.ms.forEach(m => { participants.forEach(p => { const v = scoreMatch(preds[p.id]?.[m.id], m); if (v != null) cum[p.id] += v; }); });
    // Posição (rank) de cada um após essa rodada
    const sorted = [...participants].sort((a, b) => (cum[b.id] - cum[a.id]) || a.name.localeCompare(b.name, "pt-BR"));
    const posMap = {}; sorted.forEach((p, i) => { posMap[p.id] = i + 1; });
    series.forEach(s => { s.points.push(cum[s.id]); s.positions.push(posMap[s.id]); });
  });
  return { labels: ordered.map(d => d.key), series, count: participants.length };
}

function getGroupStageMeeting(teamA, teamB, matches) {
  return matches.find(m => m.phase === "Fase de Grupos" && m.result &&
    ((m.teamA === teamA && m.teamB === teamB) || (m.teamA === teamB && m.teamB === teamA)));
}

function setupPWA() {
  try {
    // Garante viewport-fit=cover p/ o env(safe-area-inset-*) funcionar no iPhone com notch/Dynamic Island
    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) { vp = document.createElement("meta"); vp.name = "viewport"; document.head.appendChild(vp); }
    if (!/viewport-fit/.test(vp.content || "")) vp.content = "width=device-width, initial-scale=1.0, viewport-fit=cover";
    const size = 512;
    const c = document.createElement("canvas"); c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#06090a"; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#ffca28"; ctx.font = "bold 300px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("⚽", size / 2, size / 2 + 20);
    const iconUrl = c.toDataURL("image/png");
    const metas = [["apple-mobile-web-app-capable", "yes"], ["apple-mobile-web-app-status-bar-style", "black-translucent"], ["apple-mobile-web-app-title", "Bolão Copa"], ["theme-color", "#06090a"], ["mobile-web-app-capable", "yes"]];
    metas.forEach(([n, ct]) => { if (!document.querySelector(`meta[name="${n}"]`)) { const m = document.createElement("meta"); m.name = n; m.content = ct; document.head.appendChild(m); } });
    // apple-touch-icon: usa o arquivo real se existir, senão o gerado em runtime
    let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleIcon) {
      appleIcon = document.createElement("link"); appleIcon.rel = "apple-touch-icon";
      fetch("/icon-192.png", { method: "HEAD" }).then(r => { appleIcon.href = r.ok ? "/icon-192.png" : iconUrl; }).catch(() => { appleIcon.href = iconUrl; });
      document.head.appendChild(appleIcon);
    }
    // manifest: prefere /manifest.json se o deploy tiver o arquivo; senão gera um via blob
    if (!document.querySelector('link[rel="manifest"]')) {
      fetch("/manifest.json", { method: "HEAD" }).then(r => {
        const link = document.createElement("link"); link.rel = "manifest";
        if (r.ok) { link.href = "/manifest.json"; }
        else {
          const manifest = { name: "Bolão da Copa 2026", short_name: "Bolão Copa", start_url: ".", display: "standalone", background_color: "#06090a", theme_color: "#06090a", icons: [{ src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" }, { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" }] };
          link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/json" }));
        }
        document.head.appendChild(link);
      }).catch(() => {});
    }
    // service worker: registra /sw.js se existir (offline + instalável no Android)
    if ("serviceWorker" in navigator) {
      fetch("/sw.js", { method: "HEAD" }).then(r => { if (r.ok) navigator.serviceWorker.register("/sw.js").catch(() => {}); }).catch(() => {});
    }
  } catch (e) { console.warn("PWA setup falhou:", e); }
}

function buildRankingText(ranked, totalCaixa) {
  const medals = ["🥇", "🥈", "🥉"];
  const lines = [];
  lines.push("🏆 *BOLÃO DA COPA 2026* 🏆");
  lines.push(`_Atualizado em ${new Date().toLocaleDateString("pt-BR")}_`);
  lines.push("");
  let pos = 0;
  ranked.forEach((p) => {
    if (!p.paid) return; // não-pagantes não entram no ranking de prêmio
    pos++;
    if (pos > 10) return;
    const tag = pos <= 3 ? medals[pos - 1] : `${pos}º`;
    lines.push(`${tag} *${p.name}* — ${p.total} pts`);
  });
  return lines.join("\n");
}

// Monta o texto dos palpites de TODOS os jogadores nos jogos visíveis (já travados/iniciados).
function buildRoundPicksText(matches, participants, preds, dayLabel) {
  const single = matches.length === 1;
  const lines = [];
  lines.push(single ? "⚽ *PALPITES DO JOGO* ⚽" : "⚽ *PALPITES DA RODADA* ⚽");
  if (dayLabel) lines.push(`_${dayLabel}_`);
  lines.push("");
  matches.forEach((m) => {
    const placar = m.result ? (() => { const ds = displayScore(m); return `  (${m.live ? "Parcial" : "Final"}: ${ds.a}×${ds.b}${ds.isET ? (m.result.pen ? " pênaltis" : " prorrog.") : ""})`; })() : "";
    if (!single) lines.push(`*${m.teamA} × ${m.teamB}*${placar}`);
    else if (placar) lines.push(`_${placar.trim()}_`);
    participants.forEach((p) => {
      const pr = preds[p.id]?.[m.id];
      const has = pr && pr.a !== "" && pr.b !== "" && pr.a != null && pr.b != null;
      if (has) {
        const pts = m.result ? scoreMatch(pr, m) : null;
        const tag = pts != null ? `  ➜ ${pts}pts` : "";
        lines.push(`• ${p.name}: ${pr.a}×${pr.b}${tag}`);
      }
    });
    lines.push("");
  });
  return lines.join("\n").trim();
}

function showShareFallback(text, alreadyCopied) {
  // Remove painel anterior, se houver
  const old = document.getElementById("share-fallback-overlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "share-fallback-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px;";

  const box = document.createElement("div");
  box.style.cssText = "background:#10171d;border:1px solid #1b2c38;border-radius:14px;max-width:440px;width:100%;padding:18px;display:flex;flex-direction:column;gap:12px;font-family:'Nunito',system-ui,sans-serif;";

  const title = document.createElement("div");
  title.style.cssText = "color:#cce8d4;font-weight:900;font-size:15px;";
  title.textContent = alreadyCopied ? "✅ Copiado! É só colar no WhatsApp" : "📋 Copie o texto abaixo";

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.readOnly = true;
  ta.style.cssText = "width:100%;height:200px;background:#0c1820;border:1px solid #1b2c38;border-radius:8px;color:#cce8d4;padding:10px;font-size:13px;font-family:monospace;resize:none;box-sizing:border-box;";

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;";

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "📋 Copiar";
  copyBtn.style.cssText = "flex:1;background:#00a152;border:none;border-radius:8px;color:#fff;padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;min-height:44px;";
  copyBtn.onclick = () => {
    ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* ignore */ }
    if (!ok && navigator.clipboard) { navigator.clipboard.writeText(text).catch(() => {}); }
    copyBtn.textContent = "✅ Copiado!";
    setTimeout(() => { copyBtn.textContent = "📋 Copiar"; }, 2000);
  };

  const waBtn = document.createElement("a");
  waBtn.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  waBtn.target = "_blank";
  waBtn.rel = "noopener";
  waBtn.textContent = "📲 Abrir WhatsApp";
  waBtn.style.cssText = "flex:1;background:#25D366;border:none;border-radius:8px;color:#062;padding:12px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;min-height:44px;display:flex;align-items:center;justify-content:center;text-decoration:none;";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Fechar";
  closeBtn.style.cssText = "background:none;border:1px solid #1b2c38;border-radius:8px;color:#4a6a5a;padding:8px;font-size:13px;cursor:pointer;font-family:inherit;min-height:40px;";
  closeBtn.onclick = () => overlay.remove();

  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  btnRow.appendChild(copyBtn);
  btnRow.appendChild(waBtn);
  box.appendChild(title);
  box.appendChild(ta);
  box.appendChild(btnRow);
  box.appendChild(closeBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

async function shareText(text) {
  // 1) Compartilhamento nativo (ideal no celular → abre o seletor com WhatsApp)
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e && e.name === "AbortError") return; /* senão, cai no painel */ }
  }
  // 2) Tenta copiar silenciosamente
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch { /* sem clipboard */ }
  // 3) Painel garantido: texto selecionável + copiar + link real do WhatsApp
  showShareFallback(text, copied);
}

async function shareRanking(ranked, totalCaixa) {
  await shareText(buildRankingText(ranked, totalCaixa));
}

/* ── Design tokens ── */
const C = { bg: "#06090a", surface: "#0b1015", card: "#10171d", border: "#1b2c38", green: "#00e676", greenDim: "#00a152", gold: "#ffca28", silver: "#90a4ae", bronze: "#ff8f00", text: "#cce8d4", muted: "#4a6a5a", red: "#ff5252", blue: "#40c4ff", input: "#0c1820" };
const INP = (extra = {}) => ({ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "10px 12px", fontSize: 16, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", ...extra });
const BTN = (extra = {}) => ({ background: C.greenDim, border: "none", borderRadius: 8, color: "#fff", padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", ...extra });
const GHOST_BTN = (extra = {}) => ({ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", ...extra });
const ptsColor = { 10: C.gold, 7: C.green, 5: C.blue, 2: C.bronze, 0: C.muted };
const ptsBg   = { 10: "#1a1200", 7: "#001a0d", 5: "#001428", 2: "#1a0a00", 0: "#101a17" };

/* ── Sub-components ── */
function Empty({ icon, msg }) { return <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}><div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div><div style={{ fontSize: 15 }}>{msg}</div></div>; }
function PtsBadge({ pts }) { if (pts === null) return <span style={{ width: 34, display: "inline-block" }} />; return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 34, height: 26, background: ptsBg[pts] ?? ptsBg[0], color: ptsColor[pts] ?? C.muted, border: `1px solid ${ptsColor[pts] ?? C.border}`, borderRadius: 6, fontWeight: 900, fontSize: 13 }}>{pts}</span>; }
function ScoreIn({ value, onChange, disabled, onKeyDown, autoFocus }) { if (disabled) return <span style={{ width: 52, textAlign: "center", padding: "8px 4px", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, fontWeight: 700 }}>{value !== "" ? value : "-"}</span>; return <input type="number" inputMode="numeric" min="0" max="99" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} autoFocus={autoFocus} style={INP({ width: 52, textAlign: "center", padding: "8px 4px", fontSize: 16 })} />; }
function Divider({ label }) { return <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 17, letterSpacing: 1, color: C.muted, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 10 }}>{label}</div>; }

// Avatar do participante: emoji, foto (URL) ou iniciais coloridas como fallback.
const AVATAR_COLORS = ["#e57373", "#ba68c8", "#64b5f6", "#4db6ac", "#81c784", "#ffd54f", "#ff8a65", "#a1887f", "#90a4ae", "#f06292"];
function avatarColor(seed) { let h = 0; for (let i = 0; i < (seed || "").length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function Avatar({ participant, size = 28 }) {
  const a = (participant?.avatar || "").trim();
  const border = `1px solid ${C.border}`;
  if (a && /^https?:\/\//i.test(a)) {
    return <img src={a} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border }} onError={(e) => { e.target.style.display = "none"; }} />;
  }
  if (a) { // emoji ou texto curto
    return <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.6, background: C.card, border }}>{a}</span>;
  }
  const initials = (participant?.name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 900, color: "#0008", background: avatarColor(participant?.name) }}>{initials}</span>;
}

// Comprime a imagem (recorta quadrado central, redimensiona p/ 256px, JPEG) → Blob leve
function compressImage(file, maxSize = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = maxSize; canvas.height = maxSize;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("Falha ao comprimir")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    img.src = url;
  });
}

// Faz upload pro bucket 'avatars' do Supabase Storage e retorna a URL pública
async function uploadAvatar(file, participantId) {
  const blob = await compressImage(file);
  const path = `${participantId}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: type === "error" ? "#c62828" : C.greenDim, color: "#fff", borderRadius: 20, padding: "12px 24px", fontWeight: 700, fontSize: 14, zIndex: 999, boxShadow: "0 4px 20px #000c", whiteSpace: "nowrap", pointerEvents: "none" }}>{message}</div>;
}

function NextMatchCountdown({ matches }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const upcoming = matches.map(m => ({ ...m, dateObj: parseMatchDate(m.date) })).filter(m => m.dateObj && m.dateObj > now).sort((a, b) => a.dateObj - b.dateObj)[0];
  if (!upcoming) return null;
  const diff = upcoming.dateObj - now;
  const h = Math.floor(diff / 3600000), min = Math.floor((diff % 3600000) / 60000), sec = Math.floor((diff % 60000) / 1000);
  const fmt = h > 0 ? `${h}h ${min}m` : `${min}m ${sec}s`;
  return (
    <div style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
      <span>⏱</span>
      <span style={{ color: C.text, fontWeight: 700 }}>{upcoming.teamA} × {upcoming.teamB}</span>
      <span>em</span>
      <span style={{ color: diff < 30 * 60 * 1000 ? C.gold : C.green, fontWeight: 900, fontFamily: "'Bebas Neue', cursive", fontSize: 14 }}>{fmt}</span>
    </div>
  );
}

/* ── Modais e Secoes ── */
function DonutChart({ segments, size = 120, thickness = 22 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
      {segments.map((seg, i) => {
        if (seg.value === 0) return null;
        const frac = seg.value / total;
        const dash = frac * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={thickness}
            strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`} />
        );
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="900" fontFamily="'Bebas Neue', cursive" fill={C.text}>{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill={C.muted}>palpites</text>
    </svg>
  );
}

function StatsModal({ participant, matches, preds, onClose }) {
  const stats = getDetailedStats(participant.id, matches, preds);
  const winner = getChampionWinner(matches);
  const vice = getViceWinner(matches);
  const third = getThirdWinner(matches);
  const actualBrazilPhase = getBrazilPhase(matches);
  const brazilKnockoutPlayed = matches.some(m => m.phase !== "Fase de Grupos" && m.result && (m.teamA === "Brasil" || m.teamB === "Brasil"));
  const champPick = participant.champion_pick || "";
  const champBonus = (winner && champPick && champPick.toLowerCase().trim() === winner.toLowerCase().trim()) ? CHAMPION_PTS : 0;
  const viceBonus = (vice && participant.vice_pick && participant.vice_pick.toLowerCase().trim() === vice.toLowerCase().trim()) ? VICE_PTS : 0;
  const thirdBonus = (third && participant.third_pick && participant.third_pick.toLowerCase().trim() === third.toLowerCase().trim()) ? THIRD_PTS : 0;
  const brazilBonus = (brazilKnockoutPlayed && participant.brazil_pick && participant.brazil_pick === actualBrazilPhase) ? BRAZIL_PTS : 0;
  const totalWithChamp = stats.total + champBonus + viceBonus + thirdBonus + brazilBonus;
  const bars = [
    { label: "Exato",     pts: 10, count: stats.c10, color: C.gold   },
    { label: "Tend+Gol",  pts:  7, count: stats.c7,  color: C.green  },
    { label: "Tendência", pts:  5, count: stats.c5,  color: C.blue   },
    { label: "1 Gol",     pts:  2, count: stats.c2,  color: C.bronze },
    { label: "Erro",      pts:  0, count: stats.c0,  color: C.muted  },
  ];
  const maxCount = Math.max(...bars.map(b => b.count), 1);
  const badges = [];
  if (stats.withPredCount >= 1)  badges.push({ icon: "🌱", name: "Estreante",       desc: "Fez o primeiro palpite" });
  if (stats.withPredCount >= 20) badges.push({ icon: "🎖️", name: "Veterano",        desc: "20+ palpites feitos" });
  if (stats.withPredCount >= 50) badges.push({ icon: "📋", name: "Dedicado",         desc: "50+ palpites feitos" });
  if (stats.c10 >= 1)            badges.push({ icon: "🎯", name: "Na Mosca",          desc: "Cravou o primeiro placar exato!" });
  if (stats.c10 >= 3)            badges.push({ icon: "🥷", name: "Sniper",           desc: "3+ placares exatos" });
  if (stats.c10 >= 10)           badges.push({ icon: "⭐", name: "Craque",           desc: "10+ placares exatos" });
  if (stats.maxExactStreak >= 3) badges.push({ icon: "🎩", name: "Hat-trick",        desc: "3 exatos consecutivos" });
  if (stats.maxStreak >= 4)      badges.push({ icon: "🔥", name: "On Fire",          desc: `Melhor série: ${stats.maxStreak} acertos seguidos` });
  if (stats.maxStreak >= 7)      badges.push({ icon: "🌊", name: "Maré Alta",        desc: `Série de ${stats.maxStreak}+ acertos seguidos` });
  if (stats.c0 >= 5)             badges.push({ icon: "🥶", name: "Pé Frio",          desc: "5+ palpites zerados" });
  if (stats.everAccurate)        badges.push({ icon: "🔮", name: "Mãe Dináh",        desc: "Já teve +60% de acerto" });
  if (stats.exactDraws >= 2)     badges.push({ icon: "🤝", name: "Empate Certo",     desc: "2+ empates exatos acertados" });
  if (stats.exactGoleadas >= 1)  badges.push({ icon: "💥", name: "Goleada Prevista", desc: "Exato com 3+ gols de diferença" });
  if (stats.total >= 100)        badges.push({ icon: "💎", name: "Centenário",       desc: "100+ pontos acumulados" });
  if (champBonus > 0)            badges.push({ icon: "🏹", name: "Caçador",          desc: "Acertou o campeão do torneio" });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, overflow: "hidden" }}>
            <Avatar participant={participant} size={52} />
            <div style={{ overflow: "hidden" }}><div style={{ fontWeight: 900, fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{participant.name}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{stats.withPredCount} palpites · {stats.accuracy}% acerto · 🔥 série de {stats.streak}</div></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 48, color: C.gold, lineHeight: 1 }}>{totalWithChamp}</span><span style={{ color: C.muted, fontSize: 13 }}>pontos</span>
          {champBonus > 0 && <span style={{ fontSize: 12, background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "2px 8px" }}>+{champBonus} campeão 🏆</span>}
          {viceBonus > 0 && <span style={{ fontSize: 12, background: `${C.silver}22`, color: C.silver, border: `1px solid ${C.silver}44`, borderRadius: 10, padding: "2px 8px" }}>+{viceBonus} vice 🥈</span>}
          {thirdBonus > 0 && <span style={{ fontSize: 12, background: `${C.bronze}22`, color: C.bronze, border: `1px solid ${C.bronze}44`, borderRadius: 10, padding: "2px 8px" }}>+{thirdBonus} 3º lugar 🥉</span>}
          {brazilBonus > 0 && <span style={{ fontSize: 12, background: "#009c3b22", color: "#009c3b", border: "1px solid #009c3b44", borderRadius: 10, padding: "2px 8px" }}>+{brazilBonus} Brasil 🇧🇷</span>}
        </div>
        {badges.length > 0 && (
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.gold, marginBottom: 12, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
              <span>🏅</span> Conquistas Desbloqueadas
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {badges.map((b, i) => (
                <div key={b.name} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: `${C.gold}12`, border: `1px solid ${C.gold}55`,
                  padding: "8px 14px", borderRadius: 20,
                  animation: `badgePop 0.45s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.14}s both, badgeGlow 1.6s ease-in-out ${i * 0.14 + 0.35}s 2`
                }}>
                  <span style={{ fontSize: 20 }}>{b.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: C.gold, lineHeight: 1.2 }}>{b.name}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{b.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Breakdown</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            {stats.withPredCount > 0 && <DonutChart segments={bars.map(b => ({ value: b.count, color: b.color }))} />}
            <div style={{ flex: 1, minWidth: 180 }}>
              {bars.map(b => (
                <div key={b.pts} style={{ display: "grid", gridTemplateColumns: "90px 1fr 24px", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><PtsBadge pts={b.pts} /><span style={{ fontSize: 11, color: b.color, fontWeight: 700 }}>{b.label}</span></div>
                  <div style={{ background: C.card, borderRadius: 4, height: 8, overflow: "hidden" }}><div style={{ width: `${(b.count / maxCount) * 100}%`, height: "100%", background: b.color, borderRadius: 4 }} /></div>
                  <div style={{ fontSize: 13, color: b.color, fontWeight: 900, textAlign: "right" }}>{b.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {stats.bestMatch && (
            <div style={{ background: `${C.gold}0a`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, marginBottom: 4 }}>⭐ MELHOR JOGO</div><div style={{ fontSize: 13 }}>{stats.bestMatch.teamA} × {stats.bestMatch.teamB}</div><div style={{ fontSize: 12, color: C.muted }}>Palpite: {preds[participant.id]?.[stats.bestMatch.id]?.a}×{preds[participant.id]?.[stats.bestMatch.id]?.b} · +{stats.bestPts}pts</div>
            </div>
          )}
          {stats.worstMatch && stats.worstPts === 0 && (
            <div style={{ background: `${C.red}0a`, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: C.red, fontWeight: 700, marginBottom: 4 }}>💔 PIOR JOGO</div><div style={{ fontSize: 13 }}>{stats.worstMatch.teamA} × {stats.worstMatch.teamB}</div><div style={{ fontSize: 12, color: C.muted }}>Palpite: {preds[participant.id]?.[stats.worstMatch.id]?.a}×{preds[participant.id]?.[stats.worstMatch.id]?.b} · 0pts</div>
            </div>
          )}
          {[
            { icon: "🏆", label: "Campeão", pick: champPick, bonus: champBonus, result: winner, hasResult: !!winner },
            { icon: "🥈", label: "Vice-Campeão", pick: participant.vice_pick || "", bonus: viceBonus, result: vice, hasResult: !!vice },
            { icon: "🥉", label: "3º Lugar", pick: participant.third_pick || "", bonus: thirdBonus, result: third, hasResult: !!third },
            { icon: "🇧🇷", label: "Brasil até onde?", pick: participant.brazil_pick || "", bonus: brazilBonus, result: brazilKnockoutPlayed ? actualBrazilPhase : null, hasResult: brazilKnockoutPlayed },
          ].map(pk => (
            <div key={pk.label} style={{ background: C.card, border: `1px solid ${pk.bonus > 0 ? C.gold : C.border}33`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>{pk.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{pk.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: pk.bonus > 0 ? C.gold : C.text }}>
                  {pk.pick || <span style={{ color: C.muted, fontStyle: "italic", fontWeight: 400 }}>Não definido</span>}
                  {pk.bonus > 0 && " ✅"}
                  {pk.hasResult && pk.pick && pk.bonus === 0 && <span style={{ color: C.red }}> ❌</span>}
                </div>
              </div>
              {pk.hasResult && <div style={{ fontSize: 11, color: C.muted, textAlign: "right" }}>Resultado:<br /><span style={{ color: C.text, fontWeight: 700 }}>{pk.result}</span></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpecialPicksSection({ activePid, participants, isAdmin, onPickSpecial, matches }) {
  const isMobile = useIsMobile();
  const activeUser = participants.find(p => p.id === activePid);
  const winner = getChampionWinner(matches);
  const vice = getViceWinner(matches);
  const third = getThirdWinner(matches);
  const actualBrazilPhase = getBrazilPhase(matches);
  const brazilKnockoutPlayed = matches.some(m => m.phase !== "Fase de Grupos" && m.result && (m.teamA === "Brasil" || m.teamB === "Brasil"));

  const locked = isAdmin ? false : matches.some(m => m.phase === "Fase de Grupos" && m.result != null);

  const picks = [
    { icon: "🏆", label: "Campeão", pts: CHAMPION_PTS, value: activeUser?.champion_pick || "", field: "champion_pick", options: ALL_TEAMS, result: winner, hasResult: !!winner },
    { icon: "🥈", label: "Vice-Campeão", pts: VICE_PTS, value: activeUser?.vice_pick || "", field: "vice_pick", options: ALL_TEAMS, result: vice, hasResult: !!vice },
    { icon: "🥉", label: "3º Lugar", pts: THIRD_PTS, value: activeUser?.third_pick || "", field: "third_pick", options: ALL_TEAMS, result: third, hasResult: !!third },
    { icon: "🇧🇷", label: "Até onde o Brasil vai?", pts: BRAZIL_PTS, value: activeUser?.brazil_pick || "", field: "brazil_pick", options: BRAZIL_PHASES, result: brazilKnockoutPlayed ? actualBrazilPhase : null, hasResult: brazilKnockoutPlayed },
  ];

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.gold}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏅</span>
          <div>
            <div style={{ fontWeight: 900, color: C.gold, fontSize: 14 }}>Palpites Especiais</div>
            <div style={{ fontSize: 11, color: C.muted }}>{locked ? "🔒 Encerrado — primeiro jogo da fase de grupos já iniciou" : "🔓 Disponível até o 1º jogo da fase de grupos"}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
      {picks.map(pk => {
        const isCorrect = pk.hasResult && pk.value && pk.result && pk.value.toLowerCase().trim() === pk.result.toLowerCase().trim();
        const isWrong = pk.hasResult && pk.value && pk.result && !isCorrect;
        return (
          <div key={pk.field} style={{ background: C.card, border: `1px solid ${isCorrect ? C.gold : isWrong ? C.red : C.border}44`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{pk.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 13, color: isCorrect ? C.gold : C.text }}>{pk.label}</div>
                <div style={{ fontSize: 10, color: C.muted }}>+{pk.pts} pontos bônus</div>
              </div>
              {pk.hasResult && <div style={{ fontSize: 11, color: C.muted }}>Resultado: <span style={{ fontWeight: 700, color: C.text }}>{pk.result}</span></div>}
            </div>
            {!locked ? (
              <select value={pk.value} onChange={e => onPickSpecial(activePid, pk.field, e.target.value)} style={INP({ fontSize: 14 })}>
                <option value="">— Escolha —</option>
                {pk.options.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : (
              <div style={{ fontSize: 14, fontWeight: pk.value ? 700 : 400, color: isCorrect ? C.gold : isWrong ? C.red : pk.value ? C.text : C.muted, fontStyle: pk.value ? "normal" : "italic" }}>
                {pk.value || "Não preenchido"}{isCorrect && " ✅"}{isWrong && " ❌"}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

function PicksDistribution({ match, participants, preds }) {
  // Conta quantas pessoas chutaram cada placar
  const counts = {};
  let totalPreds = 0;
  participants.forEach(p => {
    const pr = preds[p.id]?.[match.id];
    if (pr && pr.a !== "" && pr.b !== "" && pr.a != null && pr.b != null) {
      const key = `${pr.a}×${pr.b}`;
      counts[key] = (counts[key] || 0) + 1;
      totalPreds++;
    }
  });
  if (totalPreds < 2) return null;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = sorted[0][1];
  const resultKey = match.result ? `${match.result.a}×${match.result.b}` : null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>📊 PLACARES MAIS CHUTADOS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {sorted.map(([score, n]) => {
          const isResult = score === resultKey;
          return (
            <div key={score} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ minWidth: 42, fontSize: 12, fontWeight: 700, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, color: isResult ? C.green : C.text, textAlign: "right" }}>{score}</span>
              <div style={{ flex: 1, background: C.surface, borderRadius: 4, height: 16, overflow: "hidden", position: "relative" }}>
                <div style={{ width: `${(n / max) * 100}%`, height: "100%", background: isResult ? C.green : C.greenDim, borderRadius: 4, transition: "width .3s" }} />
              </div>
              <span style={{ minWidth: 18, fontSize: 11, fontWeight: 700, color: C.muted, textAlign: "left" }}>{n}</span>
              {isResult && <span style={{ fontSize: 11 }}>✅</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostGameMural({ match, participants, preds }) {
  const [open, setOpen] = useState(false);
  const sorted = [...participants].sort((a, b) => {
    const pa = scoreMatch(preds[a.id]?.[match.id], match) ?? -1;
    const pb = scoreMatch(preds[b.id]?.[match.id], match) ?? -1;
    return pb - pa || a.name.localeCompare(b.name, "pt-BR");
  });
  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "4px 10px", display: "flex", alignItems: "center", gap: 4, fontWeight: 700, marginTop: 4 }}>
        <span style={{ fontSize: 9, display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}>▶</span>
        {open ? "Ocultar lista de palpites" : match.result ? "Ver palpites de todos os participantes" : "👀 Ver palpites de todos (jogo em andamento)"}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <PicksDistribution match={match} participants={participants} preds={preds} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {sorted.map(p => {
            const pred = preds[p.id]?.[match.id];
            const pts = match.result ? scoreMatch(pred, match) : null;
            const hasPred = pred && pred.a !== "" && pred.b !== "" && pred.a != null && pred.b != null;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, background: C.surface }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span style={{ fontSize: 13, color: hasPred ? C.text : C.border, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, minWidth: 50, textAlign: "center" }}>
                  {hasPred ? `${pred.a} × ${pred.b}` : "—"}
                </span>
                <PtsBadge pts={pts} />
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

const RULES = [
  { pts: 10, icon: "🎯", label: "Placar Exato",       desc: "Acertou o placar em cheio" },
  { pts:  7, icon: "⭐", label: "Tendência + Gols",  desc: "Acertou o vencedor/empate e os gols de uma das equipes" },
  { pts:  5, icon: "✅", label: "Tendência Simples", desc: "Acertou quem ganharia ou se daria empate" },
  { pts:  2, icon: "〰️", label: "Gols de um time",    desc: "Errou o vencedor, mas cravou a quantidade de gols de um time" },
  { pts:  0, icon: "❌", label: "Erro Total",        desc: "Não pontuou na partida" },
];

function ScoringLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>📖 Consultar critérios de pontuação</span>
        <span style={{ fontSize: 10, transition: "transform .2s", display: "inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {RULES.map((r) => (
            <div key={r.pts} style={{ display: "grid", gridTemplateColumns: "36px 36px 1fr", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: r.pts < 10 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 32, height: 24, background: ptsBg[r.pts], color: ptsColor[r.pts], border: `1px solid ${ptsColor[r.pts]}`, borderRadius: 6, fontWeight: 900, fontSize: 13 }}>{r.pts}</span>
              <span style={{ fontSize: 16, textAlign: "center" }}>{r.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: ptsColor[r.pts] }}>{r.label}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function todayDDMM() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}

function applyFilter(matches, filter) {
  if (filter === "hoje") return matches.filter(m => getDayKey(m.date) === todayDDMM());
  if (filter === "grupos") return matches.filter(m => m.phase === "Fase de Grupos");
  if (filter === "mata") return matches.filter(m => MATA_MATA.includes(m.phase));
  if (filter.startsWith("grupo-")) {
    const letra = filter.split("-")[1];
    return matches.filter(m => {
      if (m.phase !== "Fase de Grupos") return false;
      const tA = m.teamA.toLowerCase(), tB = m.teamB.toLowerCase();
      return TEAM_TO_GROUP[tA] === letra || TEAM_TO_GROUP[tB] === letra;
    });
  }
  return matches;
}


function FilterBar({ active, onChange, matches }) {
  const count = (f) => applyFilter(matches, f).length;
  const options = [
    { id: "todos", label: "Ver Todos" },
    { id: "hoje", label: "Hoje" },
    { id: "grupos", label: "Fase de Grupos" },
    { id: "mata", label: "Mata-Mata" },
    ...Object.keys(GRUPOS).map(letter => ({ id: `grupo-${letter}`, label: `Grupo ${letter}` })),
  ];
  return (
    <div style={{ marginBottom: 16 }}>
      <select value={active} onChange={e => onChange(e.target.value)} style={INP({ fontSize: 14, fontWeight: 700 })}>
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.label} ({count(o.id)})</option>
        ))}
      </select>
    </div>
  );
}

function PixSection() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(PIX_CODE).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>💰 Pagar Inscrição (R$ 50) — PIX Copia e Cola</span>
        <span style={{ fontSize: 10, transition: "transform .2s", display: "inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, color: C.muted }}>Código PIX (Copia e Cola):</div>
          <div style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 11, color: C.text, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.6, userSelect: "all" }}>{PIX_CODE}</div>
          <button onClick={copy} style={{ ...BTN(), width: "100%", background: copied ? C.greenDim : C.greenDim, transition: "all .2s" }}>
            {copied ? "✅ Copiado!" : "📋 Copiar Código PIX"}
          </button>
          <div style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>Após pagar, avise o admin para confirmar sua inscrição no sistema.</div>
        </div>
      )}
    </div>
  );
}

/* ── Abas Principais ── */
function RoundSummary({ participants, matches, preds }) {
  const summary = getRoundSummary(participants, matches, preds);
  if (!summary || summary.top.length === 0) return null;
  const medals = ["🥇", "🥈", "🥉"];
  const champ = summary.top[0];
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.gold}14, ${C.card})`, border: `1px solid ${C.gold}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontWeight: 900, color: C.gold, fontSize: 14 }}>🔥 Resumo da Rodada</span>
        <span style={{ fontSize: 11, color: C.muted }}>{summary.dayLabel} · {summary.matchCount} jogo{summary.matchCount > 1 ? "s" : ""}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: summary.top.length > 1 ? 10 : 0 }}>
        <Avatar participant={participants.find(x => x.id === champ.id)} size={44} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ fontSize: 11, color: C.muted }}>⭐ Craque da Rodada</div>
          <div style={{ fontWeight: 900, color: C.text, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{champ.name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 30, color: C.gold, lineHeight: 1 }}>+{champ.pts}</div>
          {champ.exact > 0 && <div style={{ fontSize: 10, color: C.gold }}>🎯 {champ.exact} cravada{champ.exact > 1 ? "s" : ""}</div>}
        </div>
      </div>
      {summary.top.length > 1 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: `1px solid ${C.gold}22`, paddingTop: 8 }}>
          {summary.top.slice(1).map((s, i) => (
            <span key={s.id} style={{ fontSize: 12, color: C.muted, display: "inline-flex", alignItems: "center", gap: 5 }}>{medals[i + 1]} <Avatar participant={participants.find(x => x.id === s.id)} size={20} /> {s.name} <span style={{ color: C.text, fontWeight: 700 }}>+{s.pts}</span></span>
          ))}
        </div>
      )}
    </div>
  );
}

function EvolutionChart({ participants, matches, preds }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState("");
  const data = getEvolution(participants, matches, preds);
  if (!data || data.labels.length < 2) return null;
  const N = data.count;
  const W = 680, H = Math.max(260, 120 + N * 8), padL = 30, padR = 70, padT = 16, padB = 28;
  const n = data.labels.length;
  const x = i => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = pos => padT + (N === 1 ? 0 : ((pos - 1) / (N - 1)) * (H - padT - padB)); // 1º no topo
  const sortedNames = [...participants].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const hl = data.series.find(s => s.id === highlight);
  // níveis de posição pro eixo (1, ..., N) — mostra alguns se forem muitos
  const levels = N <= 10 ? Array.from({ length: N }, (_, i) => i + 1) : [1, Math.ceil(N / 4), Math.ceil(N / 2), Math.ceil(3 * N / 4), N];

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>📈 Evolução de Posição (todos os jogadores)</span>
        <span style={{ fontSize: 10, transition: "transform .2s", display: "inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 12px" }}>
          <select value={highlight} onChange={e => setHighlight(e.target.value)} style={INP({ marginBottom: 12, fontSize: 14, fontWeight: 700 })}>
            <option value="">🔍 Destacar minha trajetória…</option>
            {sortedNames.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={{ overflowX: "auto" }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 520, display: "block" }}>
              {levels.map((lv) => (
                <g key={lv}>
                  <line x1={padL} y1={y(lv)} x2={W - padR} y2={y(lv)} stroke={C.border} strokeWidth="1" strokeDasharray={lv === 1 ? "0" : "2 3"} />
                  <text x={padL - 5} y={y(lv) + 4} fill={lv === 1 ? C.gold : C.muted} fontSize="10" textAnchor="end" fontWeight={lv === 1 ? 700 : 400}>{lv}º</text>
                </g>
              ))}
              {/* linhas de todos, apagadas */}
              {data.series.map((s) => {
                if (s.id === highlight) return null;
                const d = s.positions.map((pos, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(pos)}`).join(" ");
                return <path key={s.id} d={d} fill="none" stroke={C.border} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity={highlight ? 0.3 : 0.55} />;
              })}
              {/* linha destacada por cima */}
              {hl && (() => {
                const d = hl.positions.map((pos, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(pos)}`).join(" ");
                const lastPos = hl.positions[hl.positions.length - 1];
                return <g>
                  <path d={d} fill="none" stroke={C.gold} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
                  {hl.positions.map((pos, i) => <circle key={i} cx={x(i)} cy={y(pos)} r="3.5" fill={C.gold} />)}
                  <text x={x(n - 1) + 8} y={y(lastPos) + 4} fill={C.gold} fontSize="12" fontWeight="900">{hl.name.split(" ")[0]} ({lastPos}º)</text>
                </g>;
              })()}
            </svg>
          </div>
          <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 8 }}>
            {hl ? `Trajetória de ${hl.name}: melhor ${Math.min(...hl.positions)}º · pior ${Math.max(...hl.positions)}º` : "Escolha um nome acima pra destacar a trajetória. Eixo: 1º no topo, posição ao longo das rodadas."}
          </div>
        </div>
      )}
    </div>
  );
}

function NextMatchHighlight({ matches, activePid, preds }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const next = matches.map(m => ({ ...m, dateObj: parseMatchDate(m.date) })).filter(m => m.dateObj && m.dateObj > now).sort((a, b) => a.dateObj - b.dateObj)[0];
  if (!next) return null;
  const diff = next.dateObj - now;
  const h = Math.floor(diff / 3600000), min = Math.floor((diff % 3600000) / 60000), sec = Math.floor((diff % 60000) / 1000);
  const fmt = h > 0 ? `${h}h ${min}m ${sec}s` : `${min}m ${sec}s`;
  const pred = preds[activePid]?.[next.id];
  const hasBet = pred && pred.a !== "" && pred.b !== "" && pred.a != null && pred.b != null;
  const soon = diff < 30 * 60 * 1000;
  return (
    <div style={{ background: `linear-gradient(135deg, ${soon ? C.gold : C.greenDim}1a, ${C.card})`, border: `1px solid ${soon ? C.gold : C.greenDim}55`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: soon ? C.gold : C.greenDim, fontWeight: 900, letterSpacing: 1 }}>⚽ PRÓXIMO JOGO</span>
        <span style={{ fontSize: 11, color: C.muted }}>{next.date}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
        <span style={{ flex: 1, textAlign: "right", fontWeight: 900, fontSize: 15, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{next.teamA}</span>
        <span style={{ fontSize: 12, color: C.muted }}>×</span>
        <span style={{ flex: 1, textAlign: "left", fontWeight: 900, fontSize: 15, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{next.teamB}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 12, color: C.muted }}>Começa em <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color: soon ? C.gold : C.green, letterSpacing: 1 }}>{fmt}</span></span>
        {hasBet
          ? <span style={{ fontSize: 12, fontWeight: 700, color: C.green, background: `${C.green}1a`, border: `1px solid ${C.green}44`, borderRadius: 10, padding: "3px 10px" }}>✅ Você palpitou {pred.a}×{pred.b}</span>
          : <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, background: `${C.gold}1a`, border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "3px 10px" }}>⚠️ Sem palpite ainda!</span>}
      </div>
    </div>
  );
}

function LiveMatchesPanel({ matches, participants, preds }) {
  // Jogos "ao vivo": placar parcial marcado pelo admin, OU já começaram sem resultado.
  const live = matches
    .filter(m => (m.live && m.result) || (isLocked(m.date) && !m.result && parseMatchDate(m.date)))
    .sort((a, b) => parseMatchDate(b.date) - parseMatchDate(a.date));
  if (live.length === 0) return null;
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.red}14, ${C.card})`, border: `1px solid ${C.red}55`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.red, display: "inline-block", animation: "livePulse 1.2s ease-in-out infinite" }} />
        <span style={{ fontWeight: 900, color: C.red, fontSize: 14, letterSpacing: 0.5 }}>AO VIVO — {live.length} jogo{live.length > 1 ? "s" : ""} em andamento</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {live.map(m => (
          <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ flex: 1, textAlign: "right", fontWeight: 700, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
              {m.result
                ? (() => { const ds = displayScore(m); return <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: C.red, letterSpacing: 1, padding: "0 8px", minWidth: 52, textAlign: "center", position: "relative" }}>{ds.a} × {ds.b}{ds.isET && <span style={{ position: "absolute", top: -6, right: -4, fontSize: 7, fontFamily: "system-ui", fontWeight: 900, background: C.gold, color: "#000", borderRadius: 3, padding: "1px 3px" }}>{m.result.pen ? "PEN" : "PROR"}</span>}</span>; })()
                : <span style={{ fontSize: 12, color: C.muted, padding: "0 6px" }}>×</span>}
              <span style={{ flex: 1, textAlign: "left", fontWeight: 700, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
            </div>
            <div style={{ textAlign: "center", fontSize: 10, color: C.muted, marginTop: 2 }}>{m.phase} · {m.date?.split(" - ")[0]}{m.result ? " · placar parcial" : ""}</div>
            <PostGameMural match={m} participants={participants} preds={preds} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TabPlacar({ participants, matches, preds, prevPositions }) {
  const isMobile = useIsMobile();
  const [statsFor, setStatsFor] = useState(null);
  const ranked = getRanked(participants, matches, preds);
  const paidCount = participants.filter(p => p.paid).length;
  const unpaidCount = participants.length - paidCount;
  const total = paidCount * 50;
  const played = matches.filter(m => m.result).length;
  // Jogo atual pra exportar palpites: o mais recente que já começou (travado).
  const lockedMatches = matches.filter(m => isLocked(m.date) && parseMatchDate(m.date)).sort((a, b) => parseMatchDate(b.date) - parseMatchDate(a.date));
  const currentMatch = lockedMatches.find(m => !m.result) || lockedMatches[0] || null;
  const medals = ["🥇", "🥈", "🥉"];
  const prizes = [ { color: C.gold, pct: "60%", val: Math.round(total * 0.6) }, { color: C.silver, pct: "30%", val: Math.round(total * 0.3) }, { color: C.bronze, pct: "10%", val: Math.round(total * 0.1) } ];
  const winner = getChampionWinner(matches);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: isMobile ? 8 : 12, marginBottom: 20 }}>
        {prizes.map((pr, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${pr.color}44`, borderRadius: 12, padding: isMobile ? "10px 6px" : "14px 10px", textAlign: "center" }}>
            <div style={{ fontSize: isMobile ? 20 : 26, marginBottom: 4 }}>{medals[i]}</div>
            <div style={{ fontSize: isMobile ? 10 : 11, color: C.muted }}>{i === 0 ? "1º Lugar" : i === 1 ? "2º Lugar" : "3º Lugar"} ({pr.pct})</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 16 : 22, letterSpacing: 1, color: pr.color, marginTop: 4 }}>R$ {pr.val.toLocaleString("pt-BR")}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>⚽ {played}/{matches.length} partidas finalizadas</span>
        <span>💰 Caixa (Pix confirmados): R$ {total.toLocaleString("pt-BR")}</span>
        <span>👥 {paidCount} pagantes{unpaidCount > 0 ? ` · ${unpaidCount} sem Pix` : ""}</span>
        {winner && <span style={{ color: C.gold }}>🏆 Vencedor: {winner}</span>}
      </div>
      {participants.length === 0 && <Empty icon="👥" msg="Nenhum participante cadastrado." />}
      {participants.some(p => !p.paid) && <PixSection />}
      <LiveMatchesPanel matches={matches} participants={participants} preds={preds} />
      {played > 0 && <RoundSummary participants={participants} matches={matches} preds={preds} />}
      <EvolutionChart participants={participants} matches={matches} preds={preds} />
      <ScoringLegend />
      {ranked.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {currentMatch && (
            <button onClick={() => shareText(buildRoundPicksText([currentMatch], participants, preds, `${currentMatch.teamA} × ${currentMatch.teamB}`))} className="pill-hover" style={{ background: `${C.gold}1a`, border: `1px solid ${C.gold}55`, color: C.gold, borderRadius: 20, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
              📋 Palpites do jogo atual
            </button>
          )}
          <button onClick={() => shareRanking(ranked, total)} className="pill-hover" style={{ background: `${C.green}1a`, border: `1px solid ${C.green}55`, color: C.green, borderRadius: 20, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
            📤 Compartilhar no WhatsApp
          </button>
        </div>
      )}
      {ranked.length > 0 && (
        <div className="card-hover" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 52px" : "44px 1fr 64px 40px 40px 40px", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 10, color: C.muted }}>POS</span><span style={{ fontSize: 10, color: C.muted }}>NOME (Clique para abrir estatísticas)</span><span style={{ fontSize: 10, color: C.muted, textAlign: "right" }}>PONTOS</span>
            {!isMobile && <><span style={{ fontSize: 10, color: C.gold, textAlign: "center" }}>10</span><span style={{ fontSize: 10, color: C.green, textAlign: "center" }}>7</span><span style={{ fontSize: 10, color: C.blue, textAlign: "center" }}>5</span></>}
          </div>
          {(() => { let _pos = 0; return ranked.map((p, i) => {
            const paidPos = p.paid ? ++_pos : null; // posição contando só pagantes; não-pagantes não ocupam número
            const isPodium = paidPos !== null && paidPos <= 3;
            return (
            <div key={p.id} className="row-hover" onClick={() => setStatsFor(p)} style={{ display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 52px" : "44px 1fr 64px 40px 40px 40px", gap: 6, padding: isMobile ? "12px 12px" : "14px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none", background: !p.paid ? "transparent" : isPodium ? `${[C.gold, C.silver, C.bronze][paidPos - 1]}0a` : "transparent", cursor: "pointer", opacity: p.paid ? 1 : 0.4, filter: p.paid ? "none" : "grayscale(0.8)" }}>
              <span style={{ display: "flex", alignItems: "center", fontSize: isPodium ? (isMobile ? 17 : 20) : 13, color: !p.paid ? C.muted : !isPodium ? C.muted : undefined }}>{isPodium ? medals[paidPos - 1] : p.paid ? `${paidPos}º` : "—"}</span>
              <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                <Avatar participant={p} size={isMobile ? 30 : 34} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: isMobile ? 13 : 14, minWidth: 0, flexShrink: 1, textDecoration: p.paid ? "none" : "line-through", textDecorationColor: C.muted }}>{p.name}</span>
                {(() => { const prev = prevPositions[p.id]; const delta = prev ? prev - (i + 1) : 0; return p.paid && delta !== 0 ? <span style={{ fontSize: 10, fontWeight: 900, color: delta > 0 ? C.green : C.red, flexShrink: 0 }}>{delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}</span> : null; })()}
                {!p.paid && <span style={{ fontSize: 9, background: `${C.muted}22`, color: C.muted, padding: "1px 5px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>não pago</span>}
                {p.paid && (p.champBonus + p.viceBonus + p.thirdBonus + p.brazilBonus) > 0 && <span style={{ fontSize: 9, background: `${C.gold}22`, color: C.gold, padding: "1px 5px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>🎁 +{p.champBonus + p.viceBonus + p.thirdBonus + p.brazilBonus}</span>}
                {isMobile && <span style={{ marginLeft: "auto", display: "flex", gap: 5, flexShrink: 0 }}>{p.c10 > 0 && <span style={{ fontSize: 10, color: C.gold }}>🎯×{p.c10}</span>}{p.c7 > 0 && <span style={{ fontSize: 10, color: C.green }}>⭐×{p.c7}</span>}</span>}
              </span>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 22 : 26, display: "flex", alignItems: "center", justifyContent: "flex-end", color: !p.paid ? C.muted : isPodium ? [C.gold, C.silver, C.bronze][paidPos - 1] : C.text }}>{p.total}</span>
              {!isMobile && <><span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontWeight: 900 }}>{p.c10 || "—"}</span><span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontWeight: 900 }}>{p.c7 || "—"}</span><span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, fontWeight: 900 }}>{p.c5 || "—"}</span></>}
            </div>
            );
          }); })()}
        </div>
      )}
      {statsFor && <StatsModal participant={statsFor} matches={matches} preds={preds} onClose={() => setStatsFor(null)} />}
    </div>
  );
}

function TabTabelas({ matches }) {
  const st = getGroupStandings(matches);
  let thirds = [];
  Object.keys(st).forEach(g => { if (st[g][2]) thirds.push({ ...st[g][2], group: g }); });
  thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || 0);

  return (
    <div>
      <Divider label="Classificação dos Grupos" />
      {matches.some(m => m.phase === "Fase de Grupos" && m.live && m.result) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.red, background: `${C.red}12`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, display: "inline-block", animation: "livePulse 1.2s ease-in-out infinite" }} />
          Classificação atualizada com jogos <b>ao vivo</b> — pode mudar até o apito final.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {Object.keys(st).map(g => (
          <div key={g} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ background: C.surface, padding: "8px 12px", fontWeight: 900, color: C.gold, borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>GRUPO {g}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}`, background: "#0003" }}>
                  <th style={{ padding: "8px", textAlign: "center", width: 30 }}>#</th><th style={{ padding: "8px", textAlign: "left" }}>Seleção</th><th style={{ padding: "8px", textAlign: "center", width: 40 }}>Pts</th><th style={{ padding: "8px", textAlign: "center", width: 30 }}>J</th><th style={{ padding: "8px", textAlign: "center", width: 40 }}>SG</th>
                </tr>
              </thead>
              <tbody>
                {st[g].map((t, i) => (
                  <tr key={t.team} style={{ borderBottom: `1px solid ${C.border}44` }}>
                    <td style={{ padding: "8px", textAlign: "center", fontWeight: 700, color: i < 2 ? C.green : (i === 2 ? C.blue : C.muted) }}>{i + 1}</td>
                    <td style={{ padding: "8px", fontWeight: 700, color: C.text }}>{t.team}</td><td style={{ padding: "8px", textAlign: "center", fontWeight: 900, color: C.text }}>{t.pts}</td><td style={{ padding: "8px", textAlign: "center", color: C.muted }}>{t.pld}</td><td style={{ padding: "8px", textAlign: "center", color: t.gd > 0 ? C.green : (t.gd < 0 ? C.red : C.muted) }}>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 30 }}>
        <Divider label="Ranking dos Terceiros Colocados (Avançam os 8 Melhores)" />
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.surface, color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "10px", textAlign: "center", width: 40 }}>#</th><th style={{ padding: "10px", textAlign: "center", width: 50 }}>Grupo</th><th style={{ padding: "10px", textAlign: "left" }}>Seleção</th><th style={{ padding: "10px", textAlign: "center", width: 60 }}>Pts</th><th style={{ padding: "10px", textAlign: "center", width: 60 }}>SG</th><th style={{ padding: "10px", textAlign: "center", width: 60 }}>GP</th>
              </tr>
            </thead>
            <tbody>
              {thirds.map((t, i) => (
                <tr key={t.team} style={{ borderBottom: `1px solid ${C.border}44`, background: i < 8 ? `${C.blue}08` : "transparent" }}>
                  <td style={{ padding: "10px", textAlign: "center", fontWeight: 900, color: i < 8 ? C.blue : C.muted }}>{i + 1}º</td><td style={{ padding: "10px", textAlign: "center", color: C.muted, fontWeight: 700 }}>{t.group}</td><td style={{ padding: "10px", fontWeight: 700, color: i < 8 ? C.text : C.muted }}>{t.team}</td><td style={{ padding: "10px", textAlign: "center", fontWeight: 900, color: i < 8 ? C.blue : C.muted }}>{t.pts}</td><td style={{ padding: "10px", textAlign: "center", color: C.text }}>{t.gd > 0 ? `+${t.gd}` : t.gd}</td><td style={{ padding: "10px", textAlign: "center", color: C.text }}>{t.gf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── ABA 3: ÁRVORE GRÁFICA DO CHAVEAMENTO DO MATA-MATA ── */
// Bandeira (emoji) por nome de seleção em PT-BR. Fallback: vazio.
const TEAM_FLAGS = {
  "brasil": "🇧🇷", "argentina": "🇦🇷", "franca": "🇫🇷", "inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "espanha": "🇪🇸", "portugal": "🇵🇹", "alemanha": "🇩🇪",
  "paises baixos": "🇳🇱", "holanda": "🇳🇱", "belgica": "🇧🇪", "croacia": "🇭🇷", "italia": "🇮🇹", "uruguai": "🇺🇾", "colombia": "🇨🇴",
  "mexico": "🇲🇽", "estados unidos": "🇺🇸", "eua": "🇺🇸", "canada": "🇨🇦", "japao": "🇯🇵", "coreia do sul": "🇰🇷", "coreia": "🇰🇷",
  "marrocos": "🇲🇦", "senegal": "🇸🇳", "gana": "🇬🇭", "nigeria": "🇳🇬", "camaroes": "🇨🇲", "egito": "🇪🇬", "argelia": "🇩🇿", "tunisia": "🇹🇳",
  "costa do marfim": "🇨🇮", "africa do sul": "🇿🇦", "australia": "🇦🇺", "equador": "🇪🇨", "peru": "🇵🇪", "chile": "🇨🇱", "paraguai": "🇵🇾",
  "venezuela": "🇻🇪", "bolivia": "🇧🇴", "suica": "🇨🇭", "servia": "🇷🇸", "dinamarca": "🇩🇰", "polonia": "🇵🇱", "suecia": "🇸🇪", "austria": "🇦🇹",
  "ucrania": "🇺🇦", "pais de gales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "escocia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "ira": "🇮🇷", "arabia saudita": "🇸🇦", "catar": "🇶🇦", "qatar": "🇶🇦",
  "haiti": "🇭🇹", "noruega": "🇳🇴", "turquia": "🇹🇷", "grecia": "🇬🇷", "hungria": "🇭🇺", "republica tcheca": "🇨🇿", "tchequia": "🇨🇿",
  "romenia": "🇷🇴", "panama": "🇵🇦", "costa rica": "🇨🇷", "honduras": "🇭🇳", "jamaica": "🇯🇲", "nova zelandia": "🇳🇿", "uzbequistao": "🇺🇿",
  "jordania": "🇯🇴", "iraque": "🇮🇶", "emirados arabes": "🇦🇪", "cabo verde": "🇨🇻", "angola": "🇦🇴",
  "bosnia": "🇧🇦", "bosnia e herzegovina": "🇧🇦", "rd congo": "🇨🇩", "republica democratica do congo": "🇨🇩", "congo": "🇨🇬",
};
function teamFlag(name) {
  if (!name) return "";
  const key = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return TEAM_FLAGS[key] || "";
}

function TabChaveamento({ matches }) {
  const isMobile = useIsMobile();
  const columns = ["32-avos de Final", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Final"];
  const finalM = matches.find(m => m.phase === "Final" && m.result && !m.live);
  const champion = finalM ? (finalM.result.a > finalM.result.b ? finalM.teamA : finalM.result.b > finalM.result.a ? finalM.teamB : null) : null;
  const isDefined = (t) => t && !/Definir|Vencedor|Perdedor|Grupo|3º/i.test(t);
  const byId = (id) => matches.find(m => m.id === id);

  // Mapa de origem OFICIAL FIFA: qual(is) jogo(s) alimenta(m) cada jogo do mata-mata.
  const ORIGIN_MAP = {
    m_89: [74, 77], m_90: [73, 75], m_91: [76, 78], m_92: [79, 80], m_93: [83, 84], m_94: [81, 82], m_95: [86, 88], m_96: [85, 87],
    m_97: [89, 90], m_98: [93, 94], m_99: [91, 92], m_100: [95, 96],
    m_101: [97, 98], m_102: [99, 100],
  };
  const originOf = (matchId) => {
    const n = parseInt((matchId || "").replace("m_", ""));
    if (isNaN(n) || n < 89) return null; // 32-avos não têm origem (vêm dos grupos)
    if (ORIGIN_MAP[matchId]) { const [x, y] = ORIGIN_MAP[matchId]; return { a: { id: `m_${x}`, kind: "W" }, b: { id: `m_${y}`, kind: "W" } }; }
    if (n === 103) return { a: { id: "m_101", kind: "L" }, b: { id: "m_102", kind: "L" } };
    if (n === 104) return { a: { id: "m_101", kind: "W" }, b: { id: "m_102", kind: "W" } };
    return null;
  };

  // Referência da origem de um slot: sempre devolve o número do jogo de origem (ex: J89);
  // se os 2 times desse jogo já estão definidos, também devolve eles ("Brasil ou Escócia").
  const possibleFor = (matchId, side) => {
    const orig = originOf(matchId);
    if (!orig) return null;
    const o = side === "a" ? orig.a : orig.b;
    const src = byId(o.id);
    const srcNum = o.id.replace("m_", "");
    const t1 = src?.teamA, t2 = src?.teamB;
    const teams = (src && isDefined(t1) && isDefined(t2)) ? [t1, t2] : null;
    return { teams, kind: o.kind, srcNum };
  };

  // Coleta TODOS os times que ainda podem chegar a um slot, recuando a árvore até a base.
  // Ex: lado A da final → recua semi → quartas → oitavas → 32-avos, juntando os times definidos.
  const allPossibleTeams = (matchId, side) => {
    const collect = (gameId, kind, acc, depth) => {
      const src = byId(gameId);
      if (!src || depth > 6) return;
      // Se este jogo já tem um vencedor/perdedor decidido, o caminho colapsa pra esse time só
      if (src.result && !src.live) {
        const aWin = src.result.a > src.result.b, bWin = src.result.b > src.result.a;
        const advancer = kind === "L" ? (aWin ? src.teamB : src.teamA) : (aWin ? src.teamA : bWin ? src.teamB : null);
        if (advancer && isDefined(advancer)) { acc.add(advancer); return; }
      }
      // Senão, olha os dois lados: se definido, é um candidato; se não, recua mais
      [src.teamA, src.teamB].forEach((t, i) => {
        if (isDefined(t)) { acc.add(t); return; }
        const o = originOf(gameId);
        if (o) { const branch = i === 0 ? o.a : o.b; collect(branch.id, branch.kind, acc, depth + 1); }
      });
    };
    const orig = originOf(matchId);
    if (!orig) return null;
    const o = side === "a" ? orig.a : orig.b;
    const acc = new Set();
    collect(o.id, o.kind, acc, 0);
    const srcNum = o.id.replace("m_", "");
    return { teams: [...acc], kind: o.kind, srcNum };
  };

  const TeamRow = ({ name, score, win, lose, live, possible, advanceTag }) => {
    const defined = isDefined(name);
    // Slot ainda não definido: mostra de onde vem (nº do jogo) e TODOS os times que podem chegar
    if (!defined && possible) {
      const verbo = possible.kind === "L" ? "Perdedor" : "Vencedor";
      const teams = possible.teams || [];
      return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 8px", borderRadius: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: C.gold, flexShrink: 0, background: `${C.gold}1a`, borderRadius: 5, padding: "2px 6px", marginTop: 1 }}>J{possible.srcNum}</span>
          {teams.length > 0 ? (
            <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
              {teams.length === 1 ? (
                <span style={{ fontWeight: 700 }}>{teamFlag(teams[0])} {teams[0]}</span>
              ) : teams.length <= 4 ? (
                teams.map((t, i) => <span key={t}>{i > 0 && <span style={{ color: C.muted, fontWeight: 400 }}> ou </span>}<span style={{ fontWeight: 700 }}>{teamFlag(t)} {t}</span></span>)
              ) : (
                <span title={teams.join(", ")}>
                  <span style={{ color: C.muted }}>{teams.length} times possíveis: </span>
                  {teams.map(t => teamFlag(t) || "⚽").join(" ")}
                </span>
              )}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>{verbo} do J{possible.srcNum}</span>
          )}
        </div>
      );
    }
    return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", borderRadius: 6, background: win ? `${C.green}1a` : "transparent", opacity: lose ? 0.5 : 1 }}>
      <span style={{ fontSize: 17, width: 22, textAlign: "center", flexShrink: 0 }}>{teamFlag(name) || (defined ? "⚽" : "·")}</span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: win ? 900 : 700, color: defined ? (win ? C.green : C.text) : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: defined ? "normal" : "italic", textDecoration: lose ? "line-through" : "none", textDecorationColor: `${C.muted}99` }}>{name}</span>
      {win && advanceTag && <span style={{ fontSize: 8.5, fontWeight: 900, color: "#06090a", background: C.green, borderRadius: 4, padding: "2px 5px", flexShrink: 0, letterSpacing: 0.3 }}>✓ {advanceTag}</span>}
      {win && !advanceTag && <span style={{ fontSize: 10, color: C.green, flexShrink: 0 }}>▲</span>}
      <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, minWidth: 20, textAlign: "center", color: score == null ? C.border : win ? C.green : live ? C.red : C.text, flexShrink: 0 }}>{score == null ? "–" : score}</span>
    </div>
    );
  };

  const MatchCard = ({ m, isFinal }) => {
    const h2h = getGroupStageMeeting(m.teamA, m.teamB, matches);
    const ds = displayScore(m);
    // Vencedor considerando prorrogação e pênaltis
    const adv = m.result ? resolveKO(m.result, m.teamA, m.teamB)?.advancer : null;
    const aWin = m.result && (adv ? adv === m.teamA : m.result.a > m.result.b);
    const bWin = m.result && (adv ? adv === m.teamB : m.result.b > m.result.a);
    const decided = m.result && !m.live;
    // Como o classificado avançou (só destaca em prorrogação/pênaltis, onde o placar não deixa óbvio)
    const koInfo = m.result ? resolveKO(m.result, m.teamA, m.teamB) : null;
    const advanceTag = koInfo && koInfo.hadPK ? "PÊNALTIS" : koInfo && koInfo.hadET ? "PRORROG." : null;
    return (
      <div style={{ background: C.card, border: `1px solid ${m.live && m.result ? C.red + "66" : isFinal && m.result ? C.gold : C.border}`, borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2, minHeight: 12 }}>
          {m.date ? <div style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>{m.date}</div> : <span />}
          <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            {ds && ds.isET && <span style={{ fontSize: 8, fontWeight: 900, color: "#000", background: C.gold, borderRadius: 3, padding: "1px 4px" }}>{m.result.pen ? "PÊNALTIS" : "PRORROG."}</span>}
            {m.live && m.result && <span style={{ fontSize: 9, fontWeight: 900, color: C.red, display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: C.red, animation: "livePulse 1.2s ease-in-out infinite" }} />AO VIVO</span>}
          </div>
        </div>
        <TeamRow name={m.teamA} score={ds ? ds.a : null} win={decided && aWin} lose={decided && bWin} live={m.live} possible={allPossibleTeams(m.id, "a")} advanceTag={decided && aWin ? advanceTag : null} />
        <TeamRow name={m.teamB} score={ds ? ds.b : null} win={decided && bWin} lose={decided && aWin} live={m.live} possible={allPossibleTeams(m.id, "b")} advanceTag={decided && bWin ? advanceTag : null} />
        {h2h && isDefined(m.teamA) && isDefined(m.teamB) && (
          <div style={{ fontSize: 9, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 4, marginTop: 3 }}>
            🔁 Nos grupos: <span style={{ color: C.text, fontWeight: 700 }}>{h2h.result.a}×{h2h.result.b}</span>
          </div>
        )}
      </div>
    );
  };

  // Fase padrão no mobile: a primeira que ainda tem jogo não decidido, senão a primeira com jogos
  const [selPhase, setSelPhase] = useState(null);
  const defaultPhase = columns.find(ph => matches.some(m => m.phase === ph && (!m.result || m.live))) || columns.find(ph => matches.some(m => m.phase === ph)) || columns[0];
  const phaseToShow = selPhase || defaultPhase;
  const phaseIdx = columns.indexOf(phaseToShow);

  const ChampionBanner = champion ? (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: `linear-gradient(135deg, ${C.gold}22, ${C.card})`, border: `1px solid ${C.gold}`, borderRadius: 12, padding: "12px 18px", marginBottom: 16 }}>
      <span style={{ fontSize: 28 }}>🏆</span>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: 1 }}>CAMPEÃO DO MUNDO</div>
        <div style={{ fontWeight: 900, fontSize: 20, color: C.text }}>{teamFlag(champion)} {champion}</div>
      </div>
      <span style={{ fontSize: 28 }}>🏆</span>
    </div>
  ) : null;

  const LiveNote = matches.some(m => m.live && m.result) ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.red, background: `${C.red}12`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, display: "inline-block", animation: "livePulse 1.2s ease-in-out infinite" }} />
      Classificados em <b>tempo real</b> com jogos ao vivo — definido de vez só no apito final.
    </div>
  ) : null;

  // 📱 MOBILE: deslize entre fases (swipe horizontal) + lista vertical
  if (isMobile) {
    const goPhase = (dir) => { const ni = phaseIdx + dir; if (ni >= 0 && ni < columns.length) setSelPhase(columns[ni]); };
    let touchStartX = 0;
    const onTouchStart = (e) => { touchStartX = e.touches[0].clientX; };
    const onTouchEnd = (e) => { const dx = e.changedTouches[0].clientX - touchStartX; if (Math.abs(dx) > 60) goPhase(dx < 0 ? 1 : -1); };
    const ms = matches.filter(m => m.phase === phaseToShow);
    const isFinal = phaseToShow === "Final";
    return (
      <div>
        {ChampionBanner}
        {LiveNote}
        {/* pílulas de fase */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 8, marginBottom: 4 }}>
          {columns.map(ph => {
            const count = matches.filter(m => m.phase === ph).length;
            const active = ph === phaseToShow;
            const fin = ph === "Final";
            return (
              <button key={ph} onClick={() => setSelPhase(ph)} style={{ flexShrink: 0, border: `1px solid ${active ? (fin ? C.gold : C.green) : C.border}`, background: active ? (fin ? `${C.gold}1a` : `${C.green}1a`) : C.card, color: active ? (fin ? C.gold : C.green) : C.muted, borderRadius: 20, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap" }}>
                {fin ? "🏆 " : ""}{ph.replace(" de Final", "").replace("3º Lugar", "3º L.")}{count > 0 ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>
        {/* navegação por setas (deslize tbm funciona) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "6px 0 10px" }}>
          <button onClick={() => goPhase(-1)} disabled={phaseIdx === 0} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: phaseIdx === 0 ? C.border : C.text, padding: "6px 12px", cursor: phaseIdx === 0 ? "default" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700 }}>‹ Anterior</button>
          <span style={{ fontSize: 11, color: C.muted }}>deslize ou use as setas</span>
          <button onClick={() => goPhase(1)} disabled={phaseIdx === columns.length - 1} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: phaseIdx === columns.length - 1 ? C.border : C.text, padding: "6px 12px", cursor: phaseIdx === columns.length - 1 ? "default" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700 }}>Próxima ›</button>
        </div>
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ marginTop: 4, minHeight: 200 }}>
          {ms.length === 0 ? <Empty icon="🌳" msg="Esta fase ainda será definida." /> : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{ms.map(m => <MatchCard key={m.id} m={m} isFinal={isFinal} />)}</div>}
        </div>
      </div>
    );
  }

  // 🖥️ DESKTOP: colunas horizontais com linhas conectoras
  return (
    <div>
      {ChampionBanner}
      {LiveNote}
      <div style={{ overflowX: "auto", paddingBottom: 20, scrollbarWidth: "thin" }}>
        <div style={{ display: "flex", gap: 0, minWidth: "max-content", padding: "10px 0" }}>
          {columns.map((ph, ci) => {
            const ms = matches.filter(m => m.phase === ph);
            const isFinal = ph === "Final";
            const hasConnector = ci > 0 && ph !== "3º Lugar" && columns[ci] !== "3º Lugar";
            return (
              <div key={ph} style={{ display: "flex", alignItems: "stretch" }}>
                {/* coluna conectora (linhas) entre fases — exceto 3º lugar */}
                {hasConnector && (
                  <div style={{ width: 22, display: "flex", flexDirection: "column", justifyContent: "center", alignSelf: "stretch" }}>
                    <div style={{ flex: 1, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, borderTopRightRadius: 6, borderBottomRightRadius: 6, margin: "30px 0" }} />
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 240, justifyContent: "space-around", paddingLeft: ci > 0 ? 8 : 0, paddingRight: 8 }}>
                  <div style={{ textAlign: "center", color: isFinal ? "#06090a" : C.gold, fontWeight: 900, marginBottom: 4, fontSize: 12, letterSpacing: 1, background: isFinal ? C.gold : C.surface, padding: "8px 0", borderRadius: 8, border: `1px solid ${isFinal ? C.gold : C.border}` }}>
                    {isFinal ? "🏆 " : ""}{ph.toUpperCase()}
                  </div>
                  {ms.length === 0 ? (
                    <div style={{ color: C.muted, fontSize: 12, textAlign: "center", fontStyle: "italic", padding: "30px 10px", border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                      Aguardando definições...
                    </div>
                  ) : (
                    ms.map(m => <MatchCard key={m.id} m={m} isFinal={isFinal} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TabParticipantes({ participants, onChange, onDelete, isAdmin, onAdminAccess, onAdminLogout }) {
  const [name, setName] = useState(""); const [pin, setPin] = useState(""); const [editingId, setEditingId] = useState(null); const [editName, setEditName] = useState(""); const [editPin, setEditPin] = useState(""); const [editAvatar, setEditAvatar] = useState(""); const [uploadingAv, setUploadingAv] = useState(false); const [authingId, setAuthingId] = useState(null); const [authPin, setAuthPin] = useState(""); const [authError, setAuthError] = useState("");

  const handleAvatarFile = async (file, pid) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Selecione um arquivo de imagem."); return; }
    setUploadingAv(true);
    try {
      const url = await uploadAvatar(file, pid || editingId || "novo");
      setEditAvatar(url);
    } catch (e) {
      console.error(e);
      alert("Não foi possível enviar a foto. Verifique se o bucket 'avatars' existe e é público no Supabase Storage.");
    } finally { setUploadingAv(false); }
  };

  const add = () => {
    if (!name.trim()) return alert("Por favor, digite seu nome!");
    if (pin.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!");
    onChange([...participants, { id: uid(), name: name.trim(), paid: false, pin: pin }]);
    setName(""); setPin("");
    if (!isAdmin) alert("Conta criada com sucesso! Vá na aba Palpites para fazer seu login e jogar.");
  };

  const startEdit = (p) => {
    if (isAdmin) {
      setEditingId(p.id); setEditName(p.name); setEditPin(""); setEditAvatar(p.avatar || "");
    } else {
      setAuthingId(p.id); setAuthPin(""); setAuthError("");
    }
  };

  const confirmAuth = () => {
    const p = participants.find(x => x.id === authingId);
    if (authPin !== p.pin) { setAuthError("Senha incorreta. Tente novamente."); return; }
    setAuthingId(null);
    setEditingId(p.id); setEditName(p.name); setEditPin(""); setEditAvatar(p.avatar || "");
  };

  const saveEdit = (id) => {
    if (!editName.trim()) return alert("O nome não pode ficar vazio!");
    if (editPin && editPin.length < 4) return alert("A nova senha deve ter no mínimo 4 caracteres!");
    const current = participants.find(p => p.id === id);
    onChange(participants.map(p => p.id === id ? { ...p, name: editName.trim(), pin: editPin || current.pin, avatar: editAvatar.trim() } : p));
    setEditingId(null);
  };

  const editingParticipant = participants.find(p => p.id === editingId);
  const authingParticipant = participants.find(p => p.id === authingId);

  return (
    <div>
      {authingParticipant && (
        <div onClick={() => setAuthingId(null)} style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 360 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>🔒 Verificar Identidade</div>
              <button onClick={() => setAuthingId(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22 }}>×</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, color: C.muted }}>Digite a senha atual de <span style={{ color: C.text, fontWeight: 700 }}>{authingParticipant.name}</span> para liberar a edição.</div>
              <input type="password" value={authPin} onChange={e => { setAuthPin(e.target.value); setAuthError(""); }} onKeyDown={e => e.key === "Enter" && confirmAuth()} placeholder="••••" style={INP({ textAlign: "center", letterSpacing: 4 })} autoFocus />
              {authError && <div style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>❌ {authError}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={confirmAuth} style={BTN({ flex: 1 })}>Confirmar</button>
                <button onClick={() => setAuthingId(null)} style={GHOST_BTN({ flex: 1 })}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {editingParticipant && (
        <div onClick={() => setEditingId(null)} style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 380 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>✏️ Editar Cadastro</div>
              <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22 }}>×</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>NOME</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(editingId)} style={INP()} autoFocus />
              </div>
              {isAdmin && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>FOTO / EMOJI</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar participant={{ name: editName, avatar: editAvatar }} size={48} />
                    <label style={{ ...BTN({ padding: "8px 14px", fontSize: 13, cursor: uploadingAv ? "default" : "pointer", opacity: uploadingAv ? 0.6 : 1 }), display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {uploadingAv ? "⏳ Enviando..." : "📷 Enviar foto"}
                      <input type="file" accept="image/*" disabled={uploadingAv} onChange={e => { handleAvatarFile(e.target.files?.[0], editingId); e.target.value = ""; }} style={{ display: "none" }} />
                    </label>
                    {editAvatar && <button onClick={() => setEditAvatar("")} style={GHOST_BTN({ padding: "8px 12px", minHeight: 36, color: C.red, borderColor: `${C.red}55` })}>Remover</button>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>ou emoji / link:</span>
                    <input value={editAvatar} onChange={e => setEditAvatar(e.target.value)} placeholder="🦊 ou https://..." style={INP({ flex: 1, fontSize: 13, padding: "6px 10px" })} />
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>NOVA SENHA <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— deixe em branco para manter</span></label>
                <input type="password" value={editPin} onChange={e => setEditPin(e.target.value)} placeholder="••••" onKeyDown={e => e.key === "Enter" && saveEdit(editingId)} style={INP({ textAlign: "center", letterSpacing: 4 })} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => saveEdit(editingId)} style={BTN({ flex: 1 })}>✓ Salvar</button>
                <button onClick={() => setEditingId(null)} style={GHOST_BTN({ flex: 1 })}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12, color: C.text, fontSize: 16 }}>{isAdmin ? "⚙️ Adicionar Jogador Manualmente (Admin)" : "👋 Novo por aqui? Cadastre-se no Bolão"}</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu Nome Completo" style={INP({ flex: 1, minWidth: 140 })} />
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Senha (mín. 4)" style={INP({ width: 140, textAlign: "center", letterSpacing: 2 })} />
          <button onClick={add} style={BTN()}>{isAdmin ? "+ Adicionar" : "Me Cadastrar"}</button>
        </div>
      </div>
      {participants.map((p) => (
        <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Avatar participant={p} size={32} />
            <span style={{ flex: 1, fontWeight: 700, minWidth: 80, color: C.text }}>{p.name}</span>
            <span style={{ fontSize: 12, color: p.paid ? C.green : C.red, fontWeight: 700 }}>{p.paid ? "✅ Inscrição Paga" : "❌ Pix Pendente"}</span>
            <button onClick={() => startEdit(p)} style={GHOST_BTN({ padding: "6px 12px", minHeight: 36 })}>✏️ Editar</button>
            {isAdmin && (
              <>
                <button onClick={() => onChange(participants.map(x => x.id === p.id ? { ...x, paid: !x.paid } : x))} style={GHOST_BTN({ padding: "6px 12px", minHeight: 36, borderColor: C.gold, color: C.gold })}>Aprovar Pix</button>
                <button onClick={() => { if(window.confirm(`Deseja apagar permanentemente o cadastro de ${p.name}?`)) onDelete(p.id); }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 24, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </>
            )}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "center" }}>
        {isAdmin
          ? <button onClick={onAdminLogout} style={GHOST_BTN({ padding: "8px 18px", minHeight: 40, borderColor: `${C.red}66`, color: C.red })}>🔓 Sair do modo Admin</button>
          : <button onClick={onAdminAccess} style={GHOST_BTN({ padding: "8px 18px", minHeight: 40 })}>🔒 Acesso Administrador</button>}
      </div>
    </div>
  );
}

/* ── MOTOR INTELIGENTE DE CHAVEAMENTO AUTOMÁTICO (REATIVO) ── */
function processKnockout(currentMatches) {
  // 1. Calcula a Fase de Grupos (INCLUI parciais ao vivo → classificados em tempo real)
  const st = getGroupStandings(currentMatches, true);
  const firsts = {}, seconds = {};
  let thirdsList = [];
  Object.keys(st).forEach(g => {
    firsts[g] = st[g][0] || { team: `1º Grupo ${g}` };
    seconds[g] = st[g][1] || { team: `2º Grupo ${g}` };
    if (st[g][2]) thirdsList.push({ ...st[g][2], group: g });
  });
  // Seleciona os 8 melhores terceiros (ranking oficial: pts → saldo → gols)
  thirdsList = thirdsList.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || 0).slice(0, 8);

  // Alocação OFICIAL FIFA (Anexo C / 495 combinações): dado o conjunto dos 8 grupos
  // que classificaram terceiros, a tabela diz qual grupo-terceiro vai p/ cada slot.
  const thirdByGroup = {}; thirdsList.forEach(t => { thirdByGroup[t.group] = t; });
  const qualifiedGroups = thirdsList.map(t => t.group).sort().join("");
  const allocStr = THIRD_ALLOC[qualifiedGroups]; // ex: "EJIFHGLK" → slots [A,B,D,E,G,I,K,L]
  const bestAssign = {};
  if (allocStr && allocStr.length === 8) {
    THIRD_SLOTS.forEach((slot, i) => {
      const grp = allocStr[i];
      bestAssign[slot] = thirdByGroup[grp] || { team: `3º Grupo ${grp}` };
    });
  } else {
    // Fallback (ainda não há 8 terceiros definidos): mostra placeholders por slot
    THIRD_SLOTS.forEach((slot, i) => { bestAssign[slot] = thirdsList[i] || { team: "3º a definir" }; });
  }

  // R32 conforme schedule OFICIAL (Match 73-88)
  const r32 = [
    { tA: seconds["A"].team, tB: seconds["B"].team },                 // 73: 2A x 2B
    { tA: firsts["E"].team,  tB: bestAssign["E"].team },              // 74: 1E x 3(A/B/C/D/F)
    { tA: firsts["F"].team,  tB: seconds["C"].team },                 // 75: 1F x 2C
    { tA: firsts["C"].team,  tB: seconds["F"].team },                 // 76: 1C x 2F
    { tA: firsts["I"].team,  tB: bestAssign["I"].team },              // 77: 1I x 3(C/D/F/G/H)
    { tA: seconds["E"].team, tB: seconds["I"].team },                 // 78: 2E x 2I
    { tA: firsts["A"].team,  tB: bestAssign["A"].team },              // 79: 1A x 3(C/E/F/H/I)
    { tA: firsts["L"].team,  tB: bestAssign["L"].team },              // 80: 1L x 3(E/H/I/J/K)
    { tA: firsts["D"].team,  tB: bestAssign["D"].team },              // 81: 1D x 3(B/E/F/I/J)
    { tA: firsts["G"].team,  tB: bestAssign["G"].team },              // 82: 1G x 3(A/E/H/I/J)
    { tA: seconds["K"].team, tB: seconds["L"].team },                 // 83: 2K x 2L
    { tA: firsts["H"].team,  tB: seconds["J"].team },                 // 84: 1H x 2J
    { tA: firsts["B"].team,  tB: bestAssign["B"].team },              // 85: 1B x 3(E/F/G/I/J)
    { tA: firsts["J"].team,  tB: seconds["H"].team },                 // 86: 1J x 2H
    { tA: firsts["K"].team,  tB: bestAssign["K"].team },              // 87: 1K x 3(D/E/I/J/L)
    { tA: seconds["D"].team, tB: seconds["G"].team },                 // 88: 2D x 2G
  ];

  // 2. Tabela oficial de IDs e Datas do Mata-Mata
  const K_DEF = [
    { id: "m_73", phase: "32-avos de Final", date: "28/06 (Dom) - 16:00" }, { id: "m_74", phase: "32-avos de Final", date: "29/06 (Seg) - 17:30" }, { id: "m_75", phase: "32-avos de Final", date: "29/06 (Seg) - 22:00" }, { id: "m_76", phase: "32-avos de Final", date: "29/06 (Seg) - 14:00" },
    { id: "m_77", phase: "32-avos de Final", date: "30/06 (Ter) - 18:00" }, { id: "m_78", phase: "32-avos de Final", date: "30/06 (Ter) - 14:00" }, { id: "m_79", phase: "32-avos de Final", date: "30/06 (Ter) - 22:00" }, { id: "m_80", phase: "32-avos de Final", date: "01/07 (Qua) - 13:00" },
    { id: "m_81", phase: "32-avos de Final", date: "01/07 (Qua) - 21:00" }, { id: "m_82", phase: "32-avos de Final", date: "01/07 (Qua) - 17:00" }, { id: "m_83", phase: "32-avos de Final", date: "02/07 (Qui) - 20:00" }, { id: "m_84", phase: "32-avos de Final", date: "02/07 (Qui) - 16:00" },
    { id: "m_85", phase: "32-avos de Final", date: "02/07 (Qui) - 00:00" }, { id: "m_86", phase: "32-avos de Final", date: "03/07 (Sex) - 19:00" }, { id: "m_87", phase: "32-avos de Final", date: "03/07 (Sex) - 22:30" }, { id: "m_88", phase: "32-avos de Final", date: "03/07 (Sex) - 15:00" },
    { id: "m_89", phase: "Oitavas de Final", date: "04/07 (Sáb) - 18:00" }, { id: "m_90", phase: "Oitavas de Final", date: "04/07 (Sáb) - 14:00" }, { id: "m_91", phase: "Oitavas de Final", date: "05/07 (Dom) - 17:00" }, { id: "m_92", phase: "Oitavas de Final", date: "05/07 (Dom) - 21:00" },
    { id: "m_93", phase: "Oitavas de Final", date: "06/07 (Seg) - 16:00" }, { id: "m_94", phase: "Oitavas de Final", date: "06/07 (Seg) - 21:00" }, { id: "m_95", phase: "Oitavas de Final", date: "07/07 (Ter) - 13:00" }, { id: "m_96", phase: "Oitavas de Final", date: "07/07 (Ter) - 17:00" },
    { id: "m_97", phase: "Quartas de Final", date: "09/07 (Qui) - 17:00" }, { id: "m_98", phase: "Quartas de Final", date: "10/07 (Sex) - 16:00" }, { id: "m_99", phase: "Quartas de Final", date: "11/07 (Sáb) - 18:00" }, { id: "m_100", phase: "Quartas de Final", date: "11/07 (Sáb) - 22:00" },
    { id: "m_101", phase: "Semifinal", date: "14/07 (Ter) - 16:00" }, { id: "m_102", phase: "Semifinal", date: "15/07 (Qua) - 16:00" },
    { id: "m_103", phase: "3º Lugar", date: "18/07 (Sáb) - 18:00" }, { id: "m_104", phase: "Final", date: "19/07 (Dom) - 16:00" }
  ];

  let nextMatches = [...currentMatches];
  
  // Helpers para puxar Vencedor (W) e Perdedor (L) dinamicamente
  const getM = (id) => nextMatches.find(m => m.id === id);
  // Quem avança: usa resolveKO pra considerar prorrogação e pênaltis (não só o placar normal)
  const getW = (id) => { const m = getM(id); if (!m || !m.result) return null; const r = resolveKO(m.result, m.teamA, m.teamB); return r && r.advancer ? r.advancer : (m.result.a >= m.result.b ? m.teamA : m.teamB); };
  const getL = (id) => { const m = getM(id); if (!m || !m.result) return null; const w = getW(id); return w === m.teamA ? m.teamB : m.teamA; };

  // 3. Garante que todos os 104 jogos existam na tela
  K_DEF.forEach(def => {
    if (!getM(def.id)) nextMatches.push({ id: def.id, teamA: "A Definir", teamB: "A Definir", phase: def.phase, date: def.date, result: null });
  });

  // 4. Injeta os times em tempo real, fase a fase (imutável — não muta objetos do estado)
  const update = (id, fields) => { const idx = nextMatches.findIndex(x => x.id === id); if (idx > -1) nextMatches[idx] = { ...nextMatches[idx], ...fields }; };

  for(let i=0; i<16; i++) { update(`m_${73+i}`, { teamA: r32[i].tA, teamB: r32[i].tB }); }
  // Oitavas (Round of 16) — mapeamento OFICIAL FIFA (não-sequencial)
  const R16 = { m_89: [74, 77], m_90: [73, 75], m_91: [76, 78], m_92: [79, 80], m_93: [83, 84], m_94: [81, 82], m_95: [86, 88], m_96: [85, 87] };
  Object.entries(R16).forEach(([id, [x, y]]) => update(id, { teamA: getW(`m_${x}`) || `Vencedor J${x}`, teamB: getW(`m_${y}`) || `Vencedor J${y}` }));
  // Quartas — oficial
  const QF = { m_97: [89, 90], m_98: [93, 94], m_99: [91, 92], m_100: [95, 96] };
  Object.entries(QF).forEach(([id, [x, y]]) => update(id, { teamA: getW(`m_${x}`) || `Vencedor J${x}`, teamB: getW(`m_${y}`) || `Vencedor J${y}` }));
  // Semis — oficial: m_101 = W97 v W98, m_102 = W99 v W100
  update("m_101", { teamA: getW("m_97") || "Vencedor J97", teamB: getW("m_98") || "Vencedor J98" });
  update("m_102", { teamA: getW("m_99") || "Vencedor J99", teamB: getW("m_100") || "Vencedor J100" });
  update("m_103", { teamA: getL("m_101") || "Perdedor J101", teamB: getL("m_102") || "Perdedor J102" });
  update("m_104", { teamA: getW("m_101") || "Vencedor J101", teamB: getW("m_102") || "Vencedor J102" });

  return nextMatches;
}

/* ── ABA 5: CONTROLE DE JOGOS E GERADORES AUTOMÁTICOS DA FIFA ── */
function TabJogos({ matches, onChange, isAdmin, onExport }) {
  const [teamA, setTeamA] = useState(""); const [teamB, setTeamB] = useState(""); const [dateStr, setDateStr] = useState(""); const [phase, setPhase] = useState("Fase de Grupos"); const [editId, setEditId] = useState(null); const [tempR, setTempR] = useState({ a: "", b: "" }); const [filter, setFilter] = useState("todos"); const [saving, setSaving] = useState(false);

  const add = () => { if (!teamA.trim() || !teamB.trim()) return; onChange([...matches, { id: uid(), teamA: teamA.trim(), teamB: teamB.trim(), phase, date: dateStr, result: null }]); setTeamA(""); setTeamB(""); setDateStr(""); };

  const gerarCopaCompleta = () => {
    if (matches.length > 0) return alert("⚠️ A tabela já foi gerada! Apague o banco se quiser recomeçar.");
    if (!window.confirm("Deseja gerar os 104 jogos da Copa de 2026 e ativar o Motor Automático?")) return;
    
    const SCHEDULE_OFICIAL = [
      { teamA: "México", teamB: "África do Sul", date: "11/06 (Qui) - 16:00" }, { teamA: "Coreia do Sul", teamB: "República Tcheca", date: "11/06 (Qui) - 23:00" },
      { teamA: "Canadá", teamB: "Bósnia", date: "12/06 (Sex) - 16:00" }, { teamA: "Estados Unidos", teamB: "Paraguai", date: "12/06 (Sex) - 22:00" },
      { teamA: "Austrália", teamB: "Turquia", date: "13/06 (Sáb) - 01:00" }, { teamA: "Catar", teamB: "Suíça", date: "13/06 (Sáb) - 16:00" }, { teamA: "Brasil", teamB: "Marrocos", date: "13/06 (Sáb) - 19:00" }, { teamA: "Haiti", teamB: "Escócia", date: "13/06 (Sáb) - 22:00" },
      { teamA: "Alemanha", teamB: "Curaçao", date: "14/06 (Dom) - 14:00" }, { teamA: "Holanda", teamB: "Japão", date: "14/06 (Dom) - 17:00" }, { teamA: "Costa do Marfim", teamB: "Equador", date: "14/06 (Dom) - 20:00" }, { teamA: "Suécia", teamB: "Tunísia", date: "14/06 (Dom) - 23:00" },
      { teamA: "Espanha", teamB: "Cabo Verde", date: "15/06 (Seg) - 13:00" }, { teamA: "Bélgica", teamB: "Egito", date: "15/06 (Seg) - 16:00" }, { teamA: "Arábia Saudita", teamB: "Uruguai", date: "15/06 (Seg) - 19:00" }, { teamA: "Irã", teamB: "Nova Zelândia", date: "15/06 (Seg) - 22:00" },
      { teamA: "França", teamB: "Senegal", date: "16/06 (Ter) - 16:00" }, { teamA: "Iraque", teamB: "Noruega", date: "16/06 (Ter) - 19:00" }, { teamA: "Argentina", teamB: "Argélia", date: "16/06 (Ter) - 22:00" },
      { teamA: "Áustria", teamB: "Jordânia", date: "17/06 (Qua) - 01:00" }, { teamA: "Portugal", teamB: "RD Congo", date: "17/06 (Qua) - 14:00" }, { teamA: "Inglaterra", teamB: "Croácia", date: "17/06 (Qua) - 17:00" }, { teamA: "Gana", teamB: "Panamá", date: "17/06 (Qua) - 20:00" }, { teamA: "Uzbequistão", teamB: "Colômbia", date: "17/06 (Qua) - 23:00" },
      { teamA: "República Tcheca", teamB: "África do Sul", date: "18/06 (Qui) - 13:00" }, { teamA: "Suíça", teamB: "Bósnia", date: "18/06 (Qui) - 16:00" }, { teamA: "Canadá", teamB: "Catar", date: "18/06 (Qui) - 19:00" }, { teamA: "México", teamB: "Coreia do Sul", date: "18/06 (Qui) - 22:00" },
      { teamA: "Turquia", teamB: "Paraguai", date: "19/06 (Sex) - 01:00" }, { teamA: "Estados Unidos", teamB: "Austrália", date: "19/06 (Sex) - 16:00" }, { teamA: "Escócia", teamB: "Marrocos", date: "19/06 (Sex) - 19:00" }, { teamA: "Brasil", teamB: "Haiti", date: "19/06 (Sex) - 22:00" },
      { teamA: "Holanda", teamB: "Suécia", date: "20/06 (Sáb) - 14:00" }, { teamA: "Alemanha", teamB: "Costa do Marfim", date: "20/06 (Sáb) - 17:00" }, { teamA: "Equador", teamB: "Curaçao", date: "20/06 (Sáb) - 21:00" },
      { teamA: "Tunísia", teamB: "Japão", date: "21/06 (Dom) - 01:00" }, { teamA: "Espanha", teamB: "Arábia Saudita", date: "21/06 (Dom) - 13:00" }, { teamA: "Bélgica", teamB: "Irã", date: "21/06 (Dom) - 16:00" }, { teamA: "Uruguai", teamB: "Cabo Verde", date: "21/06 (Dom) - 19:00" }, { teamA: "Nova Zelândia", teamB: "Egito", date: "21/06 (Dom) - 22:00" },
      { teamA: "Argentina", teamB: "Áustria", date: "22/06 (Seg) - 14:00" }, { teamA: "França", teamB: "Iraque", date: "22/06 (Seg) - 18:00" }, { teamA: "Noruega", teamB: "Senegal", date: "22/06 (Seg) - 21:00" },
      { teamA: "Jordânia", teamB: "Argélia", date: "23/06 (Ter) - 00:00" }, { teamA: "Portugal", teamB: "Uzbequistão", date: "23/06 (Ter) - 14:00" }, { teamA: "Inglaterra", teamB: "Gana", date: "23/06 (Ter) - 17:00" }, { teamA: "Panamá", teamB: "Croácia", date: "23/06 (Ter) - 20:00" }, { teamA: "Colômbia", teamB: "RD Congo", date: "23/06 (Ter) - 23:00" },
      { teamA: "Suíça", teamB: "Canadá", date: "24/06 (Qua) - 16:00" }, { teamA: "Bósnia", teamB: "Catar", date: "24/06 (Qua) - 16:00" }, { teamA: "Escócia", teamB: "Brasil", date: "24/06 (Qua) - 19:00" }, { teamA: "Marrocos", teamB: "Haiti", date: "24/06 (Qua) - 19:00" }, { teamA: "República Tcheca", teamB: "México", date: "24/06 (Qua) - 22:00" }, { teamA: "África do Sul", teamB: "Coreia do Sul", date: "24/06 (Qua) - 22:00" },
      { teamA: "Equador", teamB: "Alemanha", date: "25/06 (Qui) - 17:00" }, { teamA: "Curaçao", teamB: "Costa do Marfim", date: "25/06 (Qui) - 17:00" }, { teamA: "Tunísia", teamB: "Holanda", date: "25/06 (Qui) - 20:00" }, { teamA: "Japão", teamB: "Suécia", date: "25/06 (Qui) - 20:00" }, { teamA: "Turquia", teamB: "Estados Unidos", date: "25/06 (Qui) - 23:00" }, { teamA: "Paraguai", teamB: "Austrália", date: "25/06 (Qui) - 23:00" },
      { teamA: "Noruega", teamB: "França", date: "26/06 (Sex) - 16:00" }, { teamA: "Senegal", teamB: "Iraque", date: "26/06 (Sex) - 16:00" }, { teamA: "Uruguai", teamB: "Espanha", date: "26/06 (Sex) - 21:00" }, { teamA: "Cabo Verde", teamB: "Arábia Saudita", date: "26/06 (Sex) - 21:00" },
      { teamA: "Egito", teamB: "Irã", date: "27/06 (Sáb) - 00:00" }, { teamA: "Nova Zelândia", teamB: "Bélgica", date: "27/06 (Sáb) - 00:00" },
      { teamA: "Panamá", teamB: "Inglaterra", date: "27/06 (Sáb) - 18:00" }, { teamA: "Croácia", teamB: "Gana", date: "27/06 (Sáb) - 18:00" }, { teamA: "Colômbia", teamB: "Portugal", date: "27/06 (Sáb) - 20:30" }, { teamA: "RD Congo", teamB: "Uzbequistão", date: "27/06 (Sáb) - 20:30" }, { teamA: "Jordânia", teamB: "Argentina", date: "27/06 (Sáb) - 23:00" }, { teamA: "Argélia", teamB: "Áustria", date: "27/06 (Sáb) - 23:00" }
    ];
    let novosJogos = [];
    SCHEDULE_OFICIAL.forEach(m => { novosJogos.push({ id: uid(), teamA: m.teamA, teamB: m.teamB, phase: "Fase de Grupos", date: m.date, result: null }); });
    
    // Passa pelo motor reativo na primeira vez para criar as 32 chaves do mata-mata
    novosJogos = processKnockout(novosJogos);
    onChange(novosJogos);
    alert("✅ Grade oficial de 104 partidas criada! O chaveamento agora é 100% automático.");
  };

  const startEdit = (m) => { setEditId(m.id); setTempR(m.result ? { a: String(m.result.a), b: String(m.result.b), etA: m.result.etA != null ? String(m.result.etA) : "", etB: m.result.etB != null ? String(m.result.etB) : "", pen: m.result.pen || "" } : { a: "", b: "", etA: "", etB: "", pen: "" }); };

  // ⚡ Salva o placar. live=true → parcial (ao vivo); live=false → resultado final oficial.
  const saveResult = async (id, live) => {
    const a = parseInt(tempR.a), b = parseInt(tempR.b);
    if (!isNaN(a) && !isNaN(b) && a >= 0 && b >= 0) {
      const match = matches.find(m => m.id === id);
      const isKO = match && MATA_MATA.includes(match.phase);
      let resultObj = { a, b };
      if (isKO) {
        // carrega prorrogação/pênalti se informados
        const etA = tempR.etA, etB = tempR.etB;
        if (etA != null && etA !== "" && etB != null && etB !== "") { resultObj.etA = parseInt(etA); resultObj.etB = parseInt(etB); }
        if (tempR.pen) resultObj.pen = tempR.pen;
      }
      let nextMatches = matches.map((m) => (m.id === id ? { ...m, result: resultObj, live: !!live } : m));
      nextMatches = processKnockout(nextMatches);
      setSaving(true);
      await onChange(nextMatches);
      setSaving(false);
    }
    setEditId(null);
  };

  const clearResult = (id) => {
    if (!window.confirm("Confirma limpar o resultado deste jogo?")) return;
    let nextMatches = matches.map((m) => (m.id === id ? { ...m, result: null, live: false } : m));
    nextMatches = processKnockout(nextMatches);
    onChange(nextMatches);
    setEditId(null);
  };

  const filtered = applyFilter(matches, filter);
  const grouped = PHASES.map((ph) => ({ ph, ms: filtered.filter((m) => m.phase === ph).sort((a, b) => { const da = parseMatchDate(a.date), db = parseMatchDate(b.date); if (!da && !db) return 0; if (!da) return 1; if (!db) return -1; return da - db; }) })).filter((g) => g.ms.length);

  // Jogos de hoje + em andamento (ao vivo) → acesso rápido pro admin lançar placar sem rolar
  const todayMatches = matches
    .filter(m => (getDayKey(m.date) === todayDDMM()) || (m.live && m.result) || (isLocked(m.date) && !m.result && parseMatchDate(m.date)))
    .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
    .sort((a, b) => { const da = parseMatchDate(a.date), db = parseMatchDate(b.date); if (!da && !db) return 0; if (!da) return 1; if (!db) return -1; return da - db; });

  const renderMatchCard = (m) => (
    <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
      {m.date && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11, color: isLocked(m.date) ? C.red : C.greenDim, fontWeight: 700 }}>{m.date}{isLocked(m.date) ? " (Encerrado)" : ""}</span>{m.live && m.result && <span style={{ fontSize: 10, fontWeight: 900, color: C.red, background: `${C.red}1a`, border: `1px solid ${C.red}55`, borderRadius: 10, padding: "1px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, animation: "livePulse 1.2s ease-in-out infinite" }} />AO VIVO</span>}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {editId === m.id ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
            {m.result && (
              <div style={{ fontSize: 11, fontWeight: 700, textAlign: "center", color: m.live ? C.red : C.green, background: m.live ? `${C.red}14` : `${C.green}14`, border: `1px solid ${m.live ? C.red : C.greenDim}44`, borderRadius: 6, padding: "4px 8px" }}>
                {m.live ? "🔴 Estado atual: PARCIAL (ao vivo, não conta como oficial)" : "✓ Estado atual: FINALIZADO (resultado oficial)"}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: C.text }}>{m.teamA}</span><ScoreIn value={tempR.a} onChange={(v) => setTempR((t) => ({ ...t, a: v }))} onKeyDown={(e) => e.key === "Enter" && !saving && saveResult(m.id, true)} autoFocus /><span style={{ color: C.muted }}>×</span><ScoreIn value={tempR.b} onChange={(v) => setTempR((t) => ({ ...t, b: v }))} onKeyDown={(e) => e.key === "Enter" && !saving && saveResult(m.id, true)} /><span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "right", color: C.text }}>{m.teamB}</span></div>
            {MATA_MATA.includes(m.phase) && <KnockoutInputs pred={tempR} teamA={m.teamA} teamB={m.teamB} disabled={false} onChange={(fields) => setTempR((t) => ({ ...t, ...fields }))} />}
            {MATA_MATA.includes(m.phase) && (parseInt(tempR.a) === parseInt(tempR.b)) && (tempR.a !== "" && tempR.b !== "") && (
              <div style={{ fontSize: 10, color: C.muted, textAlign: "center", fontStyle: "italic" }}>Empate: preencha a prorrogação/pênaltis só quando o jogo realmente chegar nessa fase. Pra parcial ao vivo no 1º tempo, pode deixar em branco.</div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => !saving && saveResult(m.id, true)} style={BTN({ flex: 1, fontSize: 13, background: C.red, opacity: saving ? 0.7 : 1 })}>{saving ? "⏳" : (m.result && !m.live ? "🔴 Voltar p/ Parcial" : "🔴 Salvar Parcial")}</button>
              <button onClick={() => { if (saving) return; if (window.confirm("Finalizar este resultado como OFICIAL?\n\nIsso passa a contar cravadas, bônus e resumo da rodada. Use só quando o jogo tiver acabado.")) saveResult(m.id, false); }} style={BTN({ flex: 1, fontSize: 13, opacity: saving ? 0.7 : 1 })}>{saving ? "⏳" : "✓ Finalizar"}</button>
            </div>
            <button onClick={() => clearResult(m.id)} disabled={saving} style={GHOST_BTN({ fontSize: 12, color: C.red, borderColor: `${C.red}66`, opacity: saving ? 0.5 : 1 })}>Limpar Jogo</button>
            <div style={{ fontSize: 10, color: C.muted, textAlign: "center" }}>🔴 Parcial = tabela mexe ao vivo, mas não conta como oficial · ✓ Finalizar = resultado definitivo</div>
          </div>
        ) : (
          <>
            {(() => {
              const ds = m.result ? displayScore(m) : null;
              const isKO = isKnockoutMatch(m);
              const decided = m.result && !m.live;
              const koInfo = (isKO && m.result) ? resolveKO(m.result, m.teamA, m.teamB) : null;
              const adv = koInfo ? koInfo.advancer : null;
              const aWin = decided && isKO && adv === m.teamA;
              const bWin = decided && isKO && adv === m.teamB;
              const tag = koInfo && koInfo.hadPK ? "PÊN" : koInfo && koInfo.hadET ? "PRO" : null;
              const nameStyle = (win, lose) => ({ flex: 1, fontWeight: win ? 900 : 700, fontSize: 14, color: win ? C.green : C.text, opacity: lose ? 0.5 : 1, textDecoration: lose ? "line-through" : "none", textDecorationColor: `${C.muted}99`, display: "inline-flex", alignItems: "center", gap: 5 });
              return <>
                <span style={nameStyle(aWin, bWin)}>{aWin && <span style={{ fontSize: 8.5, fontWeight: 900, color: "#06090a", background: C.green, borderRadius: 4, padding: "2px 5px", flexShrink: 0 }}>✓{tag ? " " + tag : ""}</span>}{m.teamA}</span>
                {m.result
                  ? <button onClick={() => isAdmin && startEdit(m)} style={{ background: m.live ? `${C.red}12` : `${C.green}12`, border: `1px solid ${m.live ? C.red : C.greenDim}`, borderRadius: 8, color: m.live ? C.red : C.green, cursor: isAdmin ? "pointer" : "default", padding: "5px 18px", fontFamily: "'Bebas Neue', cursive", fontSize: 20, position: "relative", flexShrink: 0 }}>{ds.a} × {ds.b}{ds.isET && <span style={{ position: "absolute", top: -7, right: -7, fontSize: 8, fontFamily: "system-ui", fontWeight: 900, background: C.gold, color: "#000", borderRadius: 4, padding: "1px 3px" }}>{m.result.pen ? "PEN" : "PROR"}</span>}</button>
                  : <button onClick={() => isAdmin && startEdit(m)} style={GHOST_BTN({ padding: "6px 14px", visibility: isAdmin ? "visible" : "hidden", flexShrink: 0 })}>+ Inserir Placar</button>}
                <span style={{ ...nameStyle(bWin, aWin), justifyContent: "flex-end", textAlign: "right" }}>{m.teamB}{bWin && <span style={{ fontSize: 8.5, fontWeight: 900, color: "#06090a", background: C.green, borderRadius: 4, padding: "2px 5px", flexShrink: 0 }}>✓{tag ? " " + tag : ""}</span>}</span>
              </>;
            })()}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {isAdmin && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 14, color: C.text }}>Mecanismo de Grade de Jogos</h3>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
              <button onClick={gerarCopaCompleta} style={BTN({ background: C.gold, color: "#000", border: `1px solid ${C.border}`, fontSize: 12, padding: "6px 12px", minHeight: 32 })}>⚡ Gerar Tabela Completa (104 Jogos)</button>
              <button onClick={onExport} style={GHOST_BTN({ fontSize: 12, padding: "6px 12px", minHeight: 32 })}>💾 Backup (JSON)</button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>Dica: Nos jogos de mata-mata, ao inserir um placar empatado aparecem as opções de prorrogação e pênaltis (igual ao palpite). Escolha quem marca na prorrogação ou quem passa nos pênaltis — o sistema empurra automaticamente a seleção correta para a próxima fase.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="Mandante" style={INP()} /><div style={{ textAlign: "center", color: C.muted, fontWeight: 900 }}>×</div><input value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="Visitante" style={INP()} />
          </div>
          <input value={dateStr} onChange={(e) => setDateStr(e.target.value)} placeholder="Data e Horário" style={INP({ marginBottom: 10 })} />
          <div style={{ display: "flex", gap: 8 }}><select value={phase} onChange={(e) => setPhase(e.target.value)} style={INP({ flex: 1 })}>{PHASES.map((p) => <option key={p} value={p}>{p}</option>)}</select><button onClick={add} style={BTN()}>+ Adicionar</button></div>
        </div>
      )}
      {!isAdmin && <div style={{ marginBottom: 16, color: C.gold, fontSize: 13 }}>⚠️ Painel restrito. Apenas o administrador atualiza os resultados de campo.</div>}

      {isAdmin && todayMatches.length > 0 && (
        <div style={{ background: `linear-gradient(135deg, ${C.gold}10, ${C.card})`, border: `1px solid ${C.gold}55`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <span style={{ fontWeight: 900, color: C.gold, fontSize: 14 }}>Jogos de Hoje / Ao Vivo ({todayMatches.length})</span>
          </div>
          {todayMatches.map(renderMatchCard)}
        </div>
      )}

      <FilterBar active={filter} onChange={setFilter} matches={matches} />
      {grouped.length === 0 && <Empty icon="📅" msg="Nenhum jogo localizado." />}
      {grouped.map(({ ph, ms }) => (
        <div key={ph} style={{ marginBottom: 24 }}>
          <Divider label={`${ph} (${ms.length})`} />
          {ms.map(renderMatchCard)}
        </div>
      ))}
    </div>
  );
}

// Fluxo guiado de palpite/resultado do mata-mata: normal → (empate) prorrogação → (empate) pênaltis
function KnockoutInputs({ pred, teamA, teamB, disabled, onChange }) {
  const a = pred.a, b = pred.b;
  const hasScore = a !== "" && a != null && b !== "" && b != null;
  const isDraw = hasScore && parseInt(a) === parseInt(b);
  const teamDefined = (t) => t && !/Definir|Vencedor|Perdedor|Grupo|3º/i.test(t);
  const named = teamDefined(teamA) && teamDefined(teamB);

  const set = (fields) => onChange(fields);
  const btn = (active) => ({ flex: 1, padding: "8px 6px", borderRadius: 8, border: `1px solid ${active ? C.green : C.border}`, background: active ? `${C.green}1a` : C.surface, color: active ? C.green : C.muted, fontWeight: 700, fontSize: 12, cursor: disabled ? "default" : "pointer", fontFamily: "inherit" });

  const na = parseInt(a), nb = parseInt(b);
  const hasETScore = pred.etA != null && pred.etA !== "" && pred.etB != null && pred.etB !== "";
  const sameAsNormal = hasETScore && String(pred.etA) === String(pred.a) && String(pred.etB) === String(pred.b);
  const mode = pred.etMode || (hasETScore ? (sameAsNormal ? "mantem" : "gol") : "");
  const isMantem = mode === "mantem";
  const isGol = mode === "gol";
  const etDraw = isGol && hasETScore && parseInt(pred.etA) === parseInt(pred.etB);
  const showPen = isMantem || etDraw;

  // Rascunho local do placar da prorrogação: steppers mexem aqui (instantâneo, sem salvar);
  // só o botão "Confirmar" envia ao servidor. Evita lag ao clicar rápido.
  const savedEa = hasETScore ? parseInt(pred.etA) : null, savedEb = hasETScore ? parseInt(pred.etB) : null;
  const savedWho = !hasETScore ? "" : (savedEa > na && savedEb > nb ? "both" : savedEa > na ? "A" : savedEb > nb ? "B" : "");
  const [draft, setDraft] = useState(null); // { who, ea, eb } enquanto edita; null = sem edição pendente
  const active = draft || (hasETScore ? { who: savedWho, ea: savedEa, eb: savedEb } : null);
  // Há mudança não-confirmada?
  const dirty = draft && (String(draft.ea) !== String(savedEa) || String(draft.eb) !== String(savedEb));

  if (!isDraw) return null;

  const onGol = () => { setDraft(null); set({ etMode: "gol", etA: "", etB: "", pen: "" }); };
  const onMantem = () => { setDraft(null); set({ etMode: "mantem", etA: String(a), etB: String(b) }); };

  // Escolhe quem marca → inicia o rascunho no mínimo válido (não salva ainda)
  const pickWho = (who) => {
    if (who === "A") setDraft({ who, ea: na + 1, eb: nb });
    else if (who === "B") setDraft({ who, ea: na, eb: nb + 1 });
    else setDraft({ who: "both", ea: na + 1, eb: nb + 1 });
  };
  const curWho = draft ? draft.who : savedWho;
  const curEa = active ? active.ea : na, curEb = active ? active.eb : nb;
  // Steppers mexem só no rascunho
  const stepA = (d) => { const base = draft || { who: savedWho, ea: savedEa ?? na, eb: savedEb ?? nb }; const v = Math.max(base.who === "B" ? na : na + 1, base.ea + d); setDraft({ ...base, ea: v }); };
  const stepB = (d) => { const base = draft || { who: savedWho, ea: savedEa ?? na, eb: savedEb ?? nb }; const v = Math.max(base.who === "A" ? nb : nb + 1, base.eb + d); setDraft({ ...base, eb: v }); };
  // Confirma: envia o rascunho ao servidor de uma vez
  const confirmET = () => { if (!draft) return; set({ etMode: "gol", etA: String(draft.ea), etB: String(draft.eb), pen: "" }); setDraft(null); };

  const whoBtn = (act) => ({ flex: 1, padding: "9px 6px", borderRadius: 8, border: `1px solid ${act ? C.green : C.border}`, background: act ? `${C.green}1a` : C.surface, color: act ? C.green : C.muted, fontWeight: 700, fontSize: 12, cursor: disabled ? "default" : "pointer", fontFamily: "inherit" });
  const stepBtn = { width: 32, height: 32, borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontWeight: 900, fontSize: 18, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" };

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>⏱️ Empatou! E na prorrogação?</div>
      <div style={{ display: "flex", gap: 6 }}>
        <button disabled={disabled} onClick={onMantem} style={btn(isMantem)}>Mantém {a}×{b} → pênaltis</button>
        <button disabled={disabled} onClick={onGol} style={btn(isGol)}>Sai gol na prorrogação</button>
      </div>

      {isGol && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Etapa 1: quem faz o gol na prorrogação? */}
          <div style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>Quem faz o gol na prorrogação?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={disabled} onClick={() => pickWho("A")} style={whoBtn(curWho === "A")}>{teamFlag(teamA)} {named ? teamA : "Time 1"}</button>
            <button disabled={disabled} onClick={() => pickWho("both")} style={whoBtn(curWho === "both")}>Os dois</button>
            <button disabled={disabled} onClick={() => pickWho("B")} style={whoBtn(curWho === "B")}>{teamFlag(teamB)} {named ? teamB : "Time 2"}</button>
          </div>

          {/* Etapa 2: ajusta o placar com steppers (rascunho local) + Confirmar */}
          {curWho && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: C.surface, borderRadius: 8, padding: "8px 6px", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text, maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{teamFlag(teamA)} {named ? teamA : "T1"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <button disabled={disabled || curWho === "B"} onClick={() => stepA(-1)} style={{ ...stepBtn, opacity: curWho === "B" ? 0.3 : 1 }}>−</button>
                  <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, minWidth: 24, textAlign: "center", color: C.green }}>{curEa}</span>
                  <button disabled={disabled || curWho === "B"} onClick={() => stepA(1)} style={{ ...stepBtn, opacity: curWho === "B" ? 0.3 : 1 }}>+</button>
                </div>
                <span style={{ color: C.muted, fontWeight: 900 }}>×</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <button disabled={disabled || curWho === "A"} onClick={() => stepB(-1)} style={{ ...stepBtn, opacity: curWho === "A" ? 0.3 : 1 }}>−</button>
                  <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, minWidth: 24, textAlign: "center", color: C.green }}>{curEb}</span>
                  <button disabled={disabled || curWho === "A"} onClick={() => stepB(1)} style={{ ...stepBtn, opacity: curWho === "A" ? 0.3 : 1 }}>+</button>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text, maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{teamFlag(teamB)} {named ? teamB : "T2"}</span>
              </div>
              {dirty ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <button disabled={disabled} onClick={confirmET} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: C.green, color: "#06090a", fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit", animation: "confirmPulse 1.4s ease-in-out infinite", boxShadow: `0 0 0 0 ${C.green}` }}>✓ CONFIRMAR PLACAR {curEa}×{curEb}</button>
                  <div style={{ fontSize: 10.5, color: C.gold, textAlign: "center", fontWeight: 700 }}>
                    ⚠️ Toque em CONFIRMAR para salvar — sem isso o placar da prorrogação não conta{curEa === curEb ? " e os pênaltis não abrem" : ""}.
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: curEa === curEb ? C.gold : C.green, textAlign: "center", fontWeight: 700 }}>{curEa === curEb ? "✓ Placar " + curEa + "×" + curEb + " salvo → agora escolha quem passa nos pênaltis 👇" : "✓ Placar confirmado: " + curEa + "×" + curEb}</div>
              )}
            </>
          )}
        </div>
      )}

      {showPen && !dirty && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, textAlign: "center" }}>🎯 Quem passa nos pênaltis?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={disabled} onClick={() => set({ pen: "A" })} style={btn(pred.pen === "A")}>{teamFlag(teamA)} {named ? teamA : "Time 1"}</button>
            <button disabled={disabled} onClick={() => set({ pen: "B" })} style={btn(pred.pen === "B")}>{teamFlag(teamB)} {named ? teamB : "Time 2"}</button>
          </div>
        </div>
      )}
      {/* Empate na prorrogação ainda não confirmado: explica que os pênaltis abrem após confirmar */}
      {isGol && dirty && curWho && curEa === curEb && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: 0.55 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textAlign: "center" }}>🎯 Quem passa nos pênaltis?</div>
          <div style={{ fontSize: 10, color: C.gold, textAlign: "center" }}>🔒 Confirme o placar acima para liberar a escolha dos pênaltis</div>
        </div>
      )}
    </div>
  );
}

function TabPalpites({ participants, matches, preds, onChange, savePin, sessionUnlocked, setSessionUnlocked, onSaved, isAdmin, onPickSpecial }) {
  const isMobile = useIsMobile(); const [selPid, setSelPid] = useState(""); const [pinInput, setPinInput] = useState(""); const [filter, setFilter] = useState("hoje");
  const sortedParticipants = [...participants].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const activePid = participants.find((p) => p.id === selPid)?.id || participants[0]?.id || "";
  const activeUser = participants.find((p) => p.id === activePid);

  const setPred = (matchId, side, val) => {
    if (!activePid) return;
    const next = { ...preds, [activePid]: { ...preds[activePid], [matchId]: { ...(preds[activePid]?.[matchId] || {}), [side]: val } } };
    onChange(next); onSaved();
  };
  // Atualiza vários campos do palpite de uma vez (placar, etA, etB, pen)
  const setPredFields = (matchId, fields) => {
    if (!activePid) return;
    const next = { ...preds, [activePid]: { ...preds[activePid], [matchId]: { ...(preds[activePid]?.[matchId] || {}), ...fields } } };
    onChange(next); onSaved();
  };
  // Limpa completamente o palpite de um jogo (placar + prorrogação + pênalti) → deleta no servidor
  const clearPred = (matchId) => {
    if (!activePid) return;
    const next = { ...preds, [activePid]: { ...preds[activePid], [matchId]: { a: "", b: "", etA: "", etB: "", pen: "", etMode: "" } } };
    onChange(next); onSaved();
  };

  const handleUnlock = () => {
    if (!activeUser.pin) { if (pinInput.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!"); savePin(activeUser.id, pinInput); setSessionUnlocked({ ...sessionUnlocked, [activeUser.id]: true }); } else { if (activeUser.pin === pinInput) setSessionUnlocked({ ...sessionUnlocked, [activeUser.id]: true }); else alert("Senha de acesso incorreta!"); }
  };

  if (participants.length === 0) return <Empty icon="👥" msg="Aguardando cadastros na aba de participantes." />;
  if (matches.length === 0) return <Empty icon="⚽" msg="Nenhum jogo disponível na grade." />;

  const stats = activePid ? getStats(activePid, matches, preds) : null;
  const fullRanked = getRanked(participants, matches, preds);
  const activeUserPaid = participants.find(p => p.id === activePid)?.paid;
  const myRank = (activePid && activeUserPaid) ? fullRanked.filter(p => p.paid).findIndex(p => p.id === activePid) + 1 : 0;
  const hasResults = matches.some(m => m.result);
  const isUnlocked = sessionUnlocked[activePid];
  const pendingCount = matches.filter(m => { if (isLocked(m.date)) return false; const p = preds[activePid]?.[m.id]; return !(p && p.a !== "" && p.b !== "" && p.a != null && p.b != null); }).length;
  const todayFiltered = applyFilter(matches, filter);
  const filteredMatches = (filter === "hoje" && todayFiltered.length === 0)
    ? matches.filter(m => !isLocked(m.date) && parseMatchDate(m.date)).sort((a, b) => parseMatchDate(a.date) - parseMatchDate(b.date)).slice(0, 8)
    : todayFiltered;
  const isFallback = filter === "hoje" && todayFiltered.length === 0 && filteredMatches.length > 0;
  const grouped = PHASES.map((ph) => ({ ph, ms: filteredMatches.filter((m) => m.phase === ph).sort((a, b) => { const da = parseMatchDate(a.date), db = parseMatchDate(b.date); if (!da && !db) return 0; if (!da) return 1; if (!db) return -1; return da - db; }) })).filter((g) => g.ms.length);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {isMobile ? <select value={activePid} onChange={e => { setSelPid(e.target.value); setPinInput(""); }} style={INP({ fontSize: 15, fontWeight: 700 })}>{sortedParticipants.map((p) => (<option key={p.id} value={p.id}>{p.name} {sessionUnlocked[p.id] ? "🔓" : "🔒"}</option>))}</select> : <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{sortedParticipants.map((p) => (<button key={p.id} className="pill-hover" onClick={() => { setSelPid(p.id); setPinInput(""); }} style={{ border: `1px solid ${activePid === p.id ? C.green : C.border}`, background: activePid === p.id ? `${C.green}1a` : C.card, color: activePid === p.id ? C.green : C.muted, borderRadius: 24, padding: "6px 16px 6px 8px", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit", minHeight: 40, display: "inline-flex", alignItems: "center", gap: 8 }}><Avatar participant={p} size={30} />{p.name} {sessionUnlocked[p.id] ? "🔓" : "🔒"}</button>))}</div>}
      </div>
      {!isUnlocked ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 20px", textAlign: "center", marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div><h3 style={{ marginBottom: 8, color: C.text }}>{activeUser?.pin ? "Identidade Protegida" : "Criar Senha de Validação"}</h3><p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>{activeUser?.pin ? `Digite a senha secreta do(a) ${activeUser.name} para abrir os inputs.` : "Este é o primeiro acesso deste perfil. Cadastre uma senha agora para travar suas alterações."}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", maxWidth: 300, margin: "0 auto" }}><input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleUnlock()} placeholder="PIN" style={INP({ textAlign: "center", letterSpacing: 3 })} /><button onClick={handleUnlock} style={BTN()}>{activeUser?.pin ? "Desbloquear" : "Salvar Senha"}</button></div>
        </div>
      ) : (
        <>
          {stats && <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}><Avatar participant={activeUser} size={48} />{myRank > 0 && hasResults && <span style={{ background: myRank <= 3 ? `${C.gold}1a` : C.surface, color: myRank <= 3 ? C.gold : C.muted, border: `1px solid ${myRank <= 3 ? C.gold + "44" : C.border}`, borderRadius: 10, padding: "3px 10px", fontSize: 13, fontWeight: 900 }}>{myRank === 1 ? "🥇" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : "#"}{myRank <= 3 ? "" : myRank}º lugar</span>}<span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 30, color: C.gold }}>{stats.total}</span><span style={{ color: C.muted, fontSize: 13 }}>pontos</span><span style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>🎯 {stats.c10}</span><span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>⭐ {stats.c7}</span><span style={{ color: C.blue, fontWeight: 700, fontSize: 13 }}>✅ {stats.c5}</span>{(!activeUser?.paid || pendingCount > 0) && <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>{!activeUser?.paid && <span style={{ background: `${C.red}1a`, color: C.red, border: `1px solid ${C.red}44`, borderRadius: 10, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>⚠️ Pix pendente</span>}{pendingCount > 0 && <span style={{ background: `${C.gold}1a`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>⚠️ {pendingCount} pendentes de palpite</span>}</div>}</div>}
          <NextMatchHighlight matches={matches} activePid={activePid} preds={preds} />
          {!activeUser?.paid && <PixSection />}
          <SpecialPicksSection activePid={activePid} participants={participants} matches={matches} isAdmin={isAdmin} onPickSpecial={onPickSpecial} />
          <FilterBar active={filter} onChange={setFilter} matches={matches} />
          {grouped.length === 0 && <Empty icon="📅" msg="Nenhuma partida agendada neste filtro." />}
          {isFallback && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, padding: "8px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>📅 Sem jogos hoje — mostrando os próximos a acontecer</div>}
          {grouped.map(({ ph, ms }) => (
            <div key={ph} style={{ marginBottom: 24 }}>
              <Divider label={ph} />
              {ms.map((m) => {
                const pred = preds[activePid]?.[m.id] || {};
                const pts = m.result ? scoreMatch(pred, m) : null;
                const locked = isLocked(m.date);
                const closingSoon = !locked && isClosingSoon(m.date);
                return (
                  <div key={m.id} className="match-card" style={{ background: C.card, border: `1px solid ${closingSoon ? C.gold + "66" : locked ? C.border : C.greenDim + "33"}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                    {m.date && <span style={{ fontSize: 11, color: locked ? C.red : closingSoon ? C.gold : C.greenDim, fontWeight: 700 }}>{m.date}{locked ? " (Tempo Esgotado)" : closingSoon ? " ⚠️ Fecha em breve!" : ""}</span>}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{m.teamA}</span>
                      <ScoreIn value={pred.a ?? ""} onChange={(v) => setPred(m.id, "a", v)} disabled={locked} />
                      <span style={{ color: C.muted, fontSize: 12 }}>×</span>
                      <ScoreIn value={pred.b ?? ""} onChange={(v) => setPred(m.id, "b", v)} disabled={locked} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{m.teamB}</span>
                      {!locked && (pred.a !== "" && pred.a != null || pred.b !== "" && pred.b != null) && (
                        <button onClick={() => clearPred(m.id)} title="Limpar palpite deste jogo" aria-label="Limpar palpite" style={{ background: "transparent", border: `1px solid ${C.red}55`, color: C.red, borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 13, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>✕</button>
                      )}
                      <PtsBadge pts={pts} />
                    </div>
                    {isKnockoutMatch(m) && <KnockoutInputs pred={pred} teamA={m.teamA} teamB={m.teamB} disabled={locked} onChange={(fields) => setPredFields(m.id, fields)} />}
                    {(locked || m.result) && <PostGameMural match={m} participants={participants} preds={preds} />}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function PendingPicksPanel({ participants, matches, preds, isAdmin }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState({});
  // Jogos que ainda aceitam palpite (não começaram)
  const openMatches = matches.filter(m => !isLocked(m.date) && parseMatchDate(m.date)).sort((a, b) => parseMatchDate(a.date) - parseMatchDate(b.date));
  if (openMatches.length === 0) return null;

  const hasPick = (pid, mid) => { const p = preds[pid]?.[mid]; return p && p.a !== "" && p.b !== "" && p.a != null && p.b != null; };

  const rows = participants.map(p => {
    const missing = openMatches.filter(m => !hasPick(p.id, m.id));
    return { id: p.id, name: p.name, missing, missingCount: missing.length, total: openMatches.length };
  }).sort((a, b) => b.missingCount - a.missingCount || a.name.localeCompare(b.name, "pt-BR"));

  const semNada = rows.filter(r => r.missingCount === r.total && r.total > 0);
  const incompletos = rows.filter(r => r.missingCount > 0 && r.missingCount < r.total);
  const emDia = rows.filter(r => r.missingCount === 0);
  const devendo = [...semNada, ...incompletos];

  const exportCobranca = () => {
    const lines = ["⚠️ *PALPITES PENDENTES* ⚠️", `_${openMatches.length} jogo(s) ainda aberto(s) pra palpitar_`, ""];
    if (devendo.length === 0) lines.push("✅ Todo mundo já palpitou em tudo!");
    else devendo.forEach(r => {
      lines.push(`• *${r.name}* — faltam ${r.missingCount} de ${r.total}`);
      r.missing.forEach(m => lines.push(`     ▫️ ${m.teamA} × ${m.teamB}`));
    });
    lines.push("", "🔗 Entra no app e completa os palpites! ⚽");
    shareText(lines.join("\n"));
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.gold}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", color: C.gold, fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
          <span style={{ fontSize: 10, transform: open ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block", transition: "transform .15s" }}>▶</span>
          📣 Pendências de Palpite ({openMatches.length} jogo{openMatches.length > 1 ? "s" : ""} aberto{openMatches.length > 1 ? "s" : ""})
        </button>
        {isAdmin && <button onClick={exportCobranca} className="pill-hover" style={{ background: `${C.green}1a`, border: `1px solid ${C.green}55`, color: C.green, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>📤 Cobrar no zap</button>}
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.green, background: `${C.green}1a`, borderRadius: 10, padding: "3px 10px", fontWeight: 700 }}>✅ {emDia.length} em dia</span>
            <span style={{ fontSize: 12, color: C.gold, background: `${C.gold}1a`, borderRadius: 10, padding: "3px 10px", fontWeight: 700 }}>⏳ {incompletos.length} incompletos</span>
            <span style={{ fontSize: 12, color: C.red, background: `${C.red}1a`, borderRadius: 10, padding: "3px 10px", fontWeight: 700 }}>❌ {semNada.length} sem nenhum</span>
          </div>
          {devendo.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {devendo.map(r => {
                const isOpen = expanded[r.id];
                return (
                  <div key={r.id} style={{ borderRadius: 6, background: C.surface, overflow: "hidden" }}>
                    <button onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      <span style={{ fontSize: 9, color: C.muted, transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block", transition: "transform .15s" }}>▶</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text, textAlign: "left" }}>{r.name}</span>
                      <div style={{ width: 80, height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${((r.total - r.missingCount) / r.total) * 100}%`, height: "100%", background: r.missingCount === r.total ? C.red : C.gold, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, color: r.missingCount === r.total ? C.red : C.gold, fontWeight: 700, minWidth: 64, textAlign: "right" }}>faltam {r.missingCount}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "0 10px 10px 27px", display: "flex", flexDirection: "column", gap: 3 }}>
                        {r.missing.map(m => (
                          <div key={m.id} style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: C.red }}>▫️</span>
                            <span style={{ color: C.text }}>{m.teamA} × {m.teamB}</span>
                            <span style={{ color: C.muted, fontSize: 11 }}>· {m.date?.split(" - ")[0] || m.date}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.green, fontWeight: 700, textAlign: "center", padding: "8px 0" }}>🎉 Todo mundo palpitou em todos os jogos abertos!</div>
          )}
        </div>
      )}
    </div>
  );
}

function TabVisao({ participants, matches, preds, isAdmin }) {
  if (participants.length === 0) return <Empty icon="👥" msg="Aguardando participantes." />;
  const ranked = getRanked(participants, matches, preds);
  const played = matches
    .filter((m) => m.result)
    .sort((a, b) => { const da = parseMatchDate(a.date), db = parseMatchDate(b.date); return (da ? da.getTime() : Infinity) - (db ? db.getTime() : Infinity); });

  return (
    <div>
      <PendingPicksPanel participants={participants} matches={matches} preds={preds} isAdmin={isAdmin} />
      {played.length === 0 ? <Empty icon="⏳" msg="Nenhum jogo finalizado para auditoria de pontos." /> : (
      <div style={{ overflow: "auto", scrollbarWidth: "thin", maxHeight: "calc(100vh - 220px)", border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, left: 0, zIndex: 3, padding: "10px 12px", textAlign: "left", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}`, background: C.surface }}>Partida</th><th style={{ position: "sticky", top: 0, zIndex: 2, padding: "10px 8px", textAlign: "center", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}`, width: 80, background: C.surface }}>Oficial</th>
              {ranked.map((p) => <th key={p.id} style={{ position: "sticky", top: 0, zIndex: 2, padding: "10px 6px", textAlign: "center", color: C.text, fontWeight: 700, borderBottom: `1px solid ${C.border}`, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", background: C.surface }}>{p.name.split(" ")[0]}</th>)}
            </tr>
          </thead>
          <tbody>
            {played.map((m) => (
              <tr key={m.id}>
                <td style={{ position: "sticky", left: 0, zIndex: 1, padding: "10px 12px", color: C.text, fontWeight: 600, background: C.bg, borderBottom: `1px solid ${C.border}44` }}>{m.teamA} × {m.teamB}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", fontFamily: "'Bebas Neue', cursive", fontSize: 16, color: C.green, letterSpacing: 1, background: "#0002", borderBottom: `1px solid ${C.border}44` }}>{(() => { const ds = displayScore(m); return ds ? `${ds.a}×${ds.b}${ds.isET ? (m.result.pen ? " (pen)" : " (pr)") : ""}` : ""; })()}</td>
                {ranked.map((p) => {
                  const pred = preds[p.id]?.[m.id];
                  const pts = scoreMatch(pred, m);
                  const hasPred = pred && pred.a !== "" && pred.b !== "" && pred.a != null && pred.b != null;
                  return (
                    <td key={p.id} style={{ padding: "6px", textAlign: "center", borderBottom: `1px solid ${C.border}44` }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><span style={{ fontSize: 11, color: hasPred ? C.text : C.border }}>{hasPred ? `${pred.a}×${pred.b}` : "—"}</span><PtsBadge pts={pts} /></div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

export default function BolaoApp() {
  const isMobile = useIsMobile();
  const safeTop = useSafeAreaTop();
  const [tab, setTab] = useState("placar");
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [preds, setPreds] = useState({});
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionUnlocked, setSessionUnlocked] = useState({});
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const stateRef = useRef({ matches: [], participants: [], preds: {} });
  useEffect(() => { stateRef.current = { matches, participants, preds }; });
  // Protege palpites em edição: guarda o timestamp da última edição local por (pid:matchId).
  // Enquanto "fresca" (< 60s), a edição local não é sobrescrita pelo refreshData.
  const localEditsRef = useRef({});
  const markLocalEdit = (pid, matchId) => { localEditsRef.current[`${pid}:${matchId}`] = Date.now(); };
  useEffect(() => { document.title = "⚽ Bolão Copa 2026"; }, []);
  useEffect(() => { setupPWA(); }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [tab]);

  const refreshData = async (showSpinner = false) => {
    if (showSpinner) setSyncing(true);
    try {
      const [{ data: dbParticipants }, { data: dbJogos }, { data: dbPalpites }] = await Promise.all([
        supabase.from('participantes').select('*'),
        supabase.from('jogos').select('*'),
        supabase.from('palpites').select('*'),
      ]);
      if (dbParticipants) setParticipants(dbParticipants);
      if (dbJogos && dbJogos.length > 0) {
        setMatches(dbJogos.map(j => ({ id: j.id, teamA: j.team_a, teamB: j.team_b, phase: j.phase, date: j.match_date, result: (j.result_a !== null && j.result_b !== null) ? { a: j.result_a, b: j.result_b, etA: j.result_et_a, etB: j.result_et_b, pen: j.result_pen || "" } : null, live: j.is_live === true })));
      }
      if (dbPalpites) {
        const objPreds = {};
        dbPalpites.forEach(p => { if (!objPreds[p.participante_id]) objPreds[p.participante_id] = {}; objPreds[p.participante_id][p.jogo_id] = { a: p.palpite_a, b: p.palpite_b, etA: p.palpite_et_a, etB: p.palpite_et_b, pen: p.palpite_pen || "" }; });
        // Preserva edições locais "frescas" (< 60s) que ainda podem não ter ido ao banco,
        // evitando que o polling apague o palpite que o usuário está preenchendo agora.
        const now = Date.now();
        const localPreds = stateRef.current.preds || {};
        Object.keys(localEditsRef.current).forEach(key => {
          if (now - localEditsRef.current[key] > 60000) { delete localEditsRef.current[key]; return; }
          const [pid, matchId] = key.split(":");
          const localVal = localPreds[pid]?.[matchId];
          if (localVal) { if (!objPreds[pid]) objPreds[pid] = {}; objPreds[pid][matchId] = localVal; }
        });
        setPreds(objPreds);
      }
      setLastSync(new Date());
    } catch (err) { console.error("Erro ao sincronizar com o Supabase:", err); }
    finally { if (showSpinner) setSyncing(false); }
  };

  // Carga inicial
  useEffect(() => {
    (async () => { await refreshData(); setReady(true); })();
  }, []);

  // Atualiza ao voltar o foco / reconectar rede (resolve app em 2º plano, troca 4G↔WiFi)
  useEffect(() => {
    if (!ready) return;
    const onFocus = () => { if (document.visibilityState === "visible") refreshData(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [ready]);

  // Polling de segurança a cada 20s, só com a aba visível (cobre WebSocket caído)
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") refreshData(); }, 20000);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const channel = supabase.channel('bolao-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participantes' }, async () => {
        const { data } = await supabase.from('participantes').select('*');
        if (data) setParticipants(data);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jogos' }, async () => {
        const { data } = await supabase.from('jogos').select('*');
        if (data) {
          setMatches(data.map(j => ({ id: j.id, teamA: j.team_a, teamB: j.team_b, phase: j.phase, date: j.match_date, result: (j.result_a !== null && j.result_b !== null) ? { a: j.result_a, b: j.result_b, etA: j.result_et_a, etB: j.result_et_b, pen: j.result_pen || "" } : null, live: j.is_live === true })));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'palpites' }, async () => {
        const { data } = await supabase.from('palpites').select('*');
        if (data) { const objPreds = {}; data.forEach(p => { if (!objPreds[p.participante_id]) objPreds[p.participante_id] = {}; objPreds[p.participante_id][p.jogo_id] = { a: p.palpite_a, b: p.palpite_b, etA: p.palpite_et_a, etB: p.palpite_et_b, pen: p.palpite_pen || "" }; }); setPreds(objPreds); }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [ready]);

  const sp = async (d) => {
    setParticipants(d);
    let { error } = await supabase.from('participantes').upsert(d);
    if (error && /avatar/.test(error.message || "")) {
      const stripped = d.map(({ avatar, ...rest }) => rest);
      ({ error } = await supabase.from('participantes').upsert(stripped));
      if (!error) showToast("⚠️ Salvo, mas rode a migração 'avatar' p/ as fotos sincronizarem", "error");
    }
    if (error) { console.error("❌ Erro ao salvar participante:", error); showToast("❌ Erro ao salvar no servidor!", "error"); }
  };
  const removeP = async (id) => { setParticipants(p => p.filter(x => x.id !== id)); await supabase.from('participantes').delete().eq('id', id); };
  const sm = async (d) => {
    const changed = d.filter(j => { const old = matches.find(m => m.id === j.id); if (!old) return true; return old.teamA !== j.teamA || old.teamB !== j.teamB || old.date !== j.date || JSON.stringify(old.result) !== JSON.stringify(j.result) || (old.live === true) !== (j.live === true); });
    setMatches(d);
    if (changed.length === 0) { console.warn("sm: nenhuma mudança detectada, upsert ignorado"); return; }
    const rows = changed.map(j => ({ id: j.id, team_a: j.teamA, team_b: j.teamB, phase: j.phase, match_date: j.date || "TBD", result_a: j.result ? j.result.a : null, result_b: j.result ? j.result.b : null, result_et_a: j.result && j.result.etA != null && j.result.etA !== "" ? parseInt(j.result.etA) : null, result_et_b: j.result && j.result.etB != null && j.result.etB !== "" ? parseInt(j.result.etB) : null, result_pen: j.result && j.result.pen ? j.result.pen : null, is_live: j.live === true }));
    let { error } = await supabase.from('jogos').upsert(rows);
    // Se as colunas de prorrogação/pênalti ainda não existirem, tenta sem elas (degradação suave)
    if (error && /result_et|result_pen/.test(error.message || "")) {
      const rowsNoKO = rows.map(({ result_et_a, result_et_b, result_pen, ...rest }) => rest);
      ({ error } = await supabase.from('jogos').upsert(rowsNoKO));
      if (!error) showToast("⚠️ Salvo, mas rode a migração de prorrogação/pênalti p/ o mata-mata sincronizar", "error");
    }
    // Se a coluna is_live ainda não existir, tenta de novo sem ela (degradação suave)
    if (error && /is_live/.test(error.message || "")) {
      const rowsNoLive = rows.map(({ is_live, result_et_a, result_et_b, result_pen, ...rest }) => rest);
      ({ error } = await supabase.from('jogos').upsert(rowsNoLive));
      if (!error) showToast("⚠️ Salvo, mas rode a migração 'is_live' p/ o modo AO VIVO sincronizar", "error");
    }
    if (error) { console.error("❌ Supabase jogos upsert error:", error); showToast("❌ Erro ao salvar jogo no servidor!", "error"); }
    else { console.log(`✅ ${changed.length} jogo(s) salvo(s) no Supabase`); setToast({ message: "✅ Placar salvo no servidor!", type: "success" }); }
  };

  // ⚽ Auto-início: quando um jogo trava (começa) sem resultado, lança 0×0 ao vivo automaticamente.
  // Roda só no dispositivo do admin (evita vários celulares escrevendo ao mesmo tempo).
  const smRef = useRef(sm);
  useEffect(() => { smRef.current = sm; });
  useEffect(() => {
    if (!ready || !isAdmin) return;
    const autoStart = () => {
      const ms = stateRef.current.matches || [];
      const now = Date.now();
      const toStart = ms.filter(m => {
        if (m.result) return false;
        const d = parseMatchDate(m.date);
        if (!d) return false;
        const start = d.getTime();
        return start <= now && (now - start) < 150 * 60 * 1000; // começou e ainda está dentro de ~2h30
      });
      if (toStart.length === 0) return;
      const ids = new Set(toStart.map(m => m.id));
      const updated = ms.map(m => ids.has(m.id) ? { ...m, result: { a: 0, b: 0 }, live: true } : m);
      smRef.current(processKnockout(updated));
    };
    autoStart(); // verifica na hora
    const id = setInterval(autoStart, 30000); // e a cada 30s
    return () => clearInterval(id);
  }, [ready, isAdmin]);

  const spr = async (d) => {
    const toSave = [];
    const toDelete = [];
    Object.keys(d).forEach(participante_id => { Object.keys(d[participante_id]).forEach(jogo_id => {
      const p = d[participante_id][jogo_id];
      const old = preds[participante_id]?.[jogo_id];
      // marca qualquer mudança de campo como edição local fresca (protege do polling),
      // mesmo que o palpite ainda esteja incompleto (ex: prorrogação sendo preenchida).
      const anyChange = !old || String(old.a ?? "") !== String(p.a ?? "") || String(old.b ?? "") !== String(p.b ?? "") || String(old.etA ?? "") !== String(p.etA ?? "") || String(old.etB ?? "") !== String(p.etB ?? "") || String(old.pen ?? "") !== String(p.pen ?? "") || String(old.etMode ?? "") !== String(p.etMode ?? "");
      if (anyChange) markLocalEdit(participante_id, jogo_id);
      const isEmpty = p.a === "" || p.b === "" || p.a == null || p.b == null;
      if (isEmpty) {
        // Palpite apagado: se havia algo salvo no banco, marca p/ deletar
        const wasSaved = old && old.a != null && old.a !== "" && old.b != null && old.b !== "";
        if (wasSaved) toDelete.push({ participante_id, jogo_id });
        return;
      }
      const changed = !old || String(old.a) !== String(p.a) || String(old.b) !== String(p.b) || String(old.etA ?? "") !== String(p.etA ?? "") || String(old.etB ?? "") !== String(p.etB ?? "") || String(old.pen ?? "") !== String(p.pen ?? "");
      if (changed) toSave.push({ participante_id, jogo_id, palpite_a: parseInt(p.a), palpite_b: parseInt(p.b), palpite_et_a: p.etA != null && p.etA !== "" ? parseInt(p.etA) : null, palpite_et_b: p.etB != null && p.etB !== "" ? parseInt(p.etB) : null, palpite_pen: p.pen || null });
    }); });
    setPreds(d);
    // Deleta palpites apagados
    for (const del of toDelete) {
      const { error } = await supabase.from('palpites').delete().eq('participante_id', del.participante_id).eq('jogo_id', del.jogo_id);
      if (error) showToast("❌ Não foi possível apagar o palpite no servidor.", "error");
    }
    if (toSave.length === 0) return;
    let { error } = await supabase.from('palpites').upsert(toSave, { onConflict: 'participante_id, jogo_id' });
    if (error && /palpite_et|palpite_pen/.test(error.message || "")) {
      const stripped = toSave.map(({ palpite_et_a, palpite_et_b, palpite_pen, ...rest }) => rest);
      ({ error } = await supabase.from('palpites').upsert(stripped, { onConflict: 'participante_id, jogo_id' }));
      if (!error) showToast("⚠️ Palpite salvo, mas rode a migração de prorrogação/pênalti", "error");
    }
    if (error) showToast("❌ Palpite não foi salvo! Verifique a conexão.", "error");
  };

  const savePin = async (userId, pin) => { setParticipants(p => p.map(x => x.id === userId ? { ...x, pin } : x)); await supabase.from('participantes').update({ pin }).eq('id', userId); };
  const onPickSpecial = async (pid, field, value) => { const updated = participants.map(p => p.id === pid ? { ...p, [field]: value } : p); setParticipants(updated); const { error } = await supabase.from('participantes').update({ [field]: value }).eq('id', pid); if (error) showToast("❌ Erro ao salvar — rode o SQL de migração no Supabase!", "error"); };

  const exportBackup = () => {
    try {
      const data = { exportedAt: new Date().toISOString(), participants, matches, preds };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `bolao-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      showToast("💾 Backup exportado!");
    } catch (e) { console.warn(e); showToast("❌ Falha ao exportar backup", "error"); }
  };

  const tapRef = useRef({ count: 0, timer: null });
  const handleAdminTap = () => {
    if (isAdmin) return;
    tapRef.current.count += 1;
    clearTimeout(tapRef.current.timer);
    if (tapRef.current.count >= 5) { tapRef.current.count = 0; promptAdmin(); return; }
    tapRef.current.timer = setTimeout(() => { tapRef.current.count = 0; }, 1500);
  };
  const promptAdmin = () => {
    const pwd = prompt("Área restrita. Chave do Administrador:");
    if (pwd === "bruno2026") setIsAdmin(true); else if (pwd !== null) alert("Acesso negado: credencial incorreta.");
  };
  const handleAdminLogin = () => {
    if (isAdmin) { setIsAdmin(false); return; }
    promptAdmin();
  };

  const showToast = (msg = "✓ Palpite gravado na nuvem!", type = "success") => {
    if (type === "success" && toast) return;
    setToast({ message: msg, type });
  };

  // Ranking anterior (sem o último resultado) → base das setinhas de movimentação.
  const prevPositions = getStandingsMap(participants, getPreviousMatches(matches), preds);

  const TABS = [
    { id: "placar", label: "🏆 Placar" },
    { id: "palpites", label: "📋 Palpites" },
    { id: "tabelas", label: "📊 Tabelas" },
    { id: "chaveamento", label: "🌳 Chaveamento" },
    { id: "visao", label: "👁️ Auditoria" },
    { id: "participantes", label: "👥 Jogadores" },
    ...(isAdmin ? [{ id: "jogos", label: "⚽ Painel Jogos" }] : []),
  ];

  if (!ready) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontFamily: "sans-serif", fontSize: 18, fontWeight: 700 }}>⚽ Sincronizando tabelas com o Supabase...</div>;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Nunito', system-ui, sans-serif", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;600;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; } input, select, button, textarea { font-family: 'Nunito', system-ui, sans-serif; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; } input[type=number] { -moz-appearance: textfield; } select { -webkit-appearance: none; appearance: none; }
        ::-webkit-scrollbar { width: 4px; height: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        @keyframes badgePop { 0% { transform: scale(0.3) rotate(-10deg); opacity: 0; } 65% { transform: scale(1.18) rotate(3deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes livePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }
        @keyframes confirmPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); } 50% { box-shadow: 0 0 0 6px rgba(74,222,128,0); } }
        @keyframes badgeGlow { 0%,100% { box-shadow: 0 0 0px transparent; } 50% { box-shadow: 0 0 16px #ffca2866, 0 0 6px #ffca2844; } }
        .row-hover:hover { background: ${C.surface} !important; cursor: pointer; }
        .card-hover:hover { border-color: ${C.border} !important; }
        .tab-btn:hover { color: ${C.green} !important; }
        .match-card:hover { border-color: ${C.greenDim}88 !important; }
        input:focus, select:focus { border-color: #00a152 !important; box-shadow: 0 0 0 2px #00a15222 !important; outline: none; }
        button, a, select, input { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
        select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%234a6a5a' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E") !important; background-repeat: no-repeat !important; background-position: right 12px center !important; padding-right: 36px !important; }
        button { transition: opacity 0.15s, filter 0.15s; }
        .btn-primary:hover { filter: brightness(1.1); }
        .pill-hover:hover { opacity: 0.85; }
      `}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.surface, borderBottom: `1px solid ${C.border}`, paddingTop: isMobile ? Math.max(safeTop, 8) : safeTop }}>
        <div style={{ padding: isMobile ? "10px 14px" : "14px 20px", paddingLeft: "max(14px, env(safe-area-inset-left))", paddingRight: "max(14px, env(safe-area-inset-right))", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <div onClick={handleAdminTap} onDoubleClick={handleAdminLogin} style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 20 : 26, letterSpacing: isMobile ? 1.5 : 3, color: isAdmin ? C.red : C.gold, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", userSelect: "none", WebkitUserSelect: "none" }} title="Toque 5x para Admin">⚽ BOLÃO DA COPA{isAdmin ? " <ADMIN>" : ""}</div>
            {matches.length > 0 && <NextMatchCountdown matches={matches} />}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={() => refreshData(true)} title="Atualizar agora" aria-label="Atualizar" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, width: 36, height: 36, cursor: "pointer", color: syncing ? C.green : C.muted, fontSize: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "inherit" }}>
              <span style={{ display: "inline-block", animation: syncing ? "spin 0.8s linear infinite" : "none" }}>↻</span>
            </button>
            <span style={{ background: `${C.gold}1a`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 20, padding: "4px 12px", fontWeight: 700, fontSize: isMobile ? 12 : 14, whiteSpace: "nowrap" }}>{isMobile ? `R$ ${(participants.filter(p => p.paid).length * 50).toLocaleString("pt-BR")}` : `Caixa: R$ ${(participants.filter(p => p.paid).length * 50).toLocaleString("pt-BR")}`}</span>
          </div>
        </div>
        <div style={{ display: "flex", background: C.surface, overflowX: "auto", scrollbarWidth: "none", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
          {TABS.map((t) => <button key={t.id} className="tab-btn" onClick={() => setTab(t.id)} style={{ border: "none", cursor: "pointer", padding: isMobile ? "10px 12px" : "12px 18px", whiteSpace: "nowrap", background: "transparent", color: tab === t.id ? C.green : C.muted, borderBottom: `2px solid ${tab === t.id ? C.green : "transparent"}`, fontWeight: 700, fontSize: isMobile ? 12 : 13, fontFamily: "inherit", transition: "color .15s", flex: isMobile ? "1 0 auto" : undefined }}>{isMobile ? t.label.split(" ")[0] : t.label}</button>)}
        </div>
      </div>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "16px 12px" : "20px 16px", paddingLeft: "max(12px, env(safe-area-inset-left))", paddingRight: "max(12px, env(safe-area-inset-right))", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
        {tab === "placar"        && <TabPlacar participants={participants} matches={matches} preds={preds} prevPositions={prevPositions} />}
        {tab === "tabelas"       && <TabTabelas matches={matches} />}
        {tab === "chaveamento"   && <TabChaveamento matches={matches} />}
        {tab === "participantes" && <TabParticipantes participants={participants} onChange={sp} onDelete={removeP} isAdmin={isAdmin} onAdminAccess={promptAdmin} onAdminLogout={() => setIsAdmin(false)} />}
        {tab === "jogos"         && <TabJogos matches={matches} onChange={sm} isAdmin={isAdmin} onExport={exportBackup} />}
        {tab === "palpites"      && <TabPalpites participants={participants} matches={matches} preds={preds} onChange={spr} savePin={savePin} sessionUnlocked={sessionUnlocked} setSessionUnlocked={setSessionUnlocked} onSaved={showToast} isAdmin={isAdmin} onPickSpecial={onPickSpecial} />}
        {tab === "visao"         && <TabVisao participants={participants} matches={matches} preds={preds} isAdmin={isAdmin} />}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
