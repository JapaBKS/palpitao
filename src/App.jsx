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

function getStats(pid, matches, preds) {
  let total = 0, c10 = 0, c7 = 0, c5 = 0, c2 = 0, c0 = 0;
  for (const m of matches) {
    if (!m.result) continue;
    const p = preds[pid]?.[m.id];
    if (!p || p.a === "" || p.b === "" || p.a == null || p.b == null) continue;
    const pts = calcPts(p, m.result);
    if (pts == null) continue;
    total += pts;
    if (pts === 10) c10++; else if (pts === 7) c7++; else if (pts === 5) c5++; else if (pts === 2) c2++; else c0++;
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
    const pts = calcPts(p, m.result);
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
    const pts = calcPts(p, m.result);
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
  const final = matches.find(m => m.phase === "Final" && m.result);
  if (!final) return null;
  if (final.result.a > final.result.b) return final.teamA;
  if (final.result.b > final.result.a) return final.teamB;
  return null;
}

function getViceWinner(matches) {
  const final = matches.find(m => m.phase === "Final" && m.result);
  if (!final) return null;
  if (final.result.a > final.result.b) return final.teamB;
  if (final.result.b > final.result.a) return final.teamA;
  return null;
}

function getThirdWinner(matches) {
  const m = matches.find(mm => mm.phase === "3º Lugar" && mm.result);
  if (!m) return null;
  return m.result.a >= m.result.b ? m.teamA : m.teamB;
}

const BRAZIL_PHASES = ["Fase de Grupos", "32-avos de Final", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Vice", "Campeão"];

function getBrazilPhase(matches) {
  const champion = getChampionWinner(matches);
  if (champion === "Brasil") return "Campeão";
  const finalM = matches.find(m => m.phase === "Final" && m.result);
  if (finalM && (finalM.teamA === "Brasil" || finalM.teamB === "Brasil")) return "Vice";
  for (const phase of ["3º Lugar", "Semifinal", "Quartas de Final", "Oitavas de Final", "32-avos de Final"]) {
    if (matches.find(m => m.phase === phase && m.result && (m.teamA === "Brasil" || m.teamB === "Brasil"))) return phase;
  }
  return "Fase de Grupos";
}

function getRanked(participants, matches, preds, championPts = 20) {
  const winner = getChampionWinner(matches);
  const vice = getViceWinner(matches);
  const third = getThirdWinner(matches);
  const actualBrazilPhase = getBrazilPhase(matches);
  const brazilKnockoutPlayed = matches.some(m => m.phase !== "Fase de Grupos" && m.result && (m.teamA === "Brasil" || m.teamB === "Brasil"));
  return [...participants]
    .map(p => {
      const stats = getStats(p.id, matches, preds);
      const champBonus = (winner && p.champion_pick && p.champion_pick.toLowerCase().trim() === winner.toLowerCase().trim()) ? championPts : 0;
      const viceBonus = (vice && p.vice_pick && p.vice_pick.toLowerCase().trim() === vice.toLowerCase().trim()) ? 10 : 0;
      const thirdBonus = (third && p.third_pick && p.third_pick.toLowerCase().trim() === third.toLowerCase().trim()) ? 10 : 0;
      const brazilBonus = (brazilKnockoutPlayed && p.brazil_pick && p.brazil_pick === actualBrazilPhase) ? 15 : 0;
      return { ...p, ...stats, total: stats.total + champBonus + viceBonus + thirdBonus + brazilBonus, champBonus, viceBonus, thirdBonus, brazilBonus };
    })
    .sort((a, b) => b.total - a.total || b.c10 - a.c10 || b.c7 - a.c7 || b.c5 - a.c5);
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

function getGroupStandings(matches) {
  const st = {};
  Object.keys(GRUPOS).forEach(g => { st[g] = GRUPOS[g].map(t => ({ team: t, pts: 0, gf: 0, ga: 0, gd: 0, pld: 0 })); });
  const groupMatches = matches.filter(m => m.phase === "Fase de Grupos" && m.result);
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
  Object.keys(st).forEach(g => { st[g].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || 0); });
  return st;
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
function StatsModal({ participant, matches, preds, onClose, championPts }) {
  const stats = getDetailedStats(participant.id, matches, preds);
  const winner = getChampionWinner(matches);
  const vice = getViceWinner(matches);
  const third = getThirdWinner(matches);
  const actualBrazilPhase = getBrazilPhase(matches);
  const brazilKnockoutPlayed = matches.some(m => m.phase !== "Fase de Grupos" && m.result && (m.teamA === "Brasil" || m.teamB === "Brasil"));
  const champPick = participant.champion_pick || "";
  const champBonus = (winner && champPick && champPick.toLowerCase().trim() === winner.toLowerCase().trim()) ? championPts : 0;
  const viceBonus = (vice && participant.vice_pick && participant.vice_pick.toLowerCase().trim() === vice.toLowerCase().trim()) ? 10 : 0;
  const thirdBonus = (third && participant.third_pick && participant.third_pick.toLowerCase().trim() === third.toLowerCase().trim()) ? 10 : 0;
  const brazilBonus = (brazilKnockoutPlayed && participant.brazil_pick && participant.brazil_pick === actualBrazilPhase) ? 15 : 0;
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
  if (stats.c10 >= 3)            badges.push({ icon: "🎯", name: "Sniper",           desc: "3+ placares exatos" });
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
          <div><div style={{ fontWeight: 900, fontSize: 18 }}>{participant.name}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{stats.withPredCount} palpites · {stats.accuracy}% acerto · 🔥 série de {stats.streak}</div></div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22 }}>×</button>
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
          {bars.map(b => (
            <div key={b.pts} style={{ display: "grid", gridTemplateColumns: "90px 1fr 24px", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><PtsBadge pts={b.pts} /><span style={{ fontSize: 11, color: b.color, fontWeight: 700 }}>{b.label}</span></div>
              <div style={{ background: C.card, borderRadius: 4, height: 8, overflow: "hidden" }}><div style={{ width: `${(b.count / maxCount) * 100}%`, height: "100%", background: b.color, borderRadius: 4 }} /></div>
              <div style={{ fontSize: 13, color: b.color, fontWeight: 900, textAlign: "right" }}>{b.count}</div>
            </div>
          ))}
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

function SpecialPicksSection({ activePid, participants, isAdmin, onPickSpecial, championPts, onSetChampionPts, matches }) {
  const activeUser = participants.find(p => p.id === activePid);
  const winner = getChampionWinner(matches);
  const vice = getViceWinner(matches);
  const third = getThirdWinner(matches);
  const actualBrazilPhase = getBrazilPhase(matches);
  const brazilKnockoutPlayed = matches.some(m => m.phase !== "Fase de Grupos" && m.result && (m.teamA === "Brasil" || m.teamB === "Brasil"));

  const locked = isAdmin ? false : matches.some(m => m.phase === "Fase de Grupos" && m.result != null);

  const picks = [
    { icon: "🏆", label: "Campeão", pts: championPts, value: activeUser?.champion_pick || "", field: "champion_pick", options: ALL_TEAMS, result: winner, hasResult: !!winner },
    { icon: "🥈", label: "Vice-Campeão", pts: 10, value: activeUser?.vice_pick || "", field: "vice_pick", options: ALL_TEAMS, result: vice, hasResult: !!vice },
    { icon: "🥉", label: "3º Lugar", pts: 10, value: activeUser?.third_pick || "", field: "third_pick", options: ALL_TEAMS, result: third, hasResult: !!third },
    { icon: "🇧🇷", label: "Até onde o Brasil vai?", pts: 15, value: activeUser?.brazil_pick || "", field: "brazil_pick", options: BRAZIL_PHASES, result: brazilKnockoutPlayed ? actualBrazilPhase : null, hasResult: brazilKnockoutPlayed },
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
        {isAdmin && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[15, 20, 30].map(v => (
              <button key={v} onClick={() => onSetChampionPts(v)}
                style={{ ...GHOST_BTN({}), background: championPts === v ? `${C.gold}22` : "none", color: championPts === v ? C.gold : C.muted, borderColor: championPts === v ? `${C.gold}66` : C.border, minHeight: 28, padding: "3px 10px", fontSize: 11 }}>
                {v}pts 🏆
              </button>
            ))}
          </div>
        )}
      </div>
      {picks.map(pk => {
        const isCorrect = pk.hasResult && pk.value && pk.result && pk.value.toLowerCase().trim() === pk.result.toLowerCase().trim();
        const isWrong = pk.hasResult && pk.value && pk.result && !isCorrect;
        return (
          <div key={pk.field} style={{ background: C.card, border: `1px solid ${isCorrect ? C.gold : isWrong ? C.red : C.border}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
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
  );
}

function PostGameMural({ match, participants, preds }) {
  const [open, setOpen] = useState(false);
  const sorted = [...participants].sort((a, b) => {
    const pa = calcPts(preds[a.id]?.[match.id], match.result) ?? -1;
    const pb = calcPts(preds[b.id]?.[match.id], match.result) ?? -1;
    return pb - pa;
  });
  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
        <span style={{ fontSize: 9, display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}>▶</span>
        {open ? "Ocultar lista de palpites" : "Ver palpites de todos os participantes"}
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
          {sorted.map(p => {
            const pred = preds[p.id]?.[match.id];
            const pts = match.result ? calcPts(pred, match.result) : null;
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
  if (filter === "hoje") return matches.filter(m => m.date && m.date.startsWith(todayDDMM()));
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

const FILTERS_MAIN = [ { id: "todos", label: "Ver Todos" }, { id: "hoje", label: "Hoje" }, { id: "grupos", label: "Grupos" }, { id: "mata", label: "Mata-Mata" } ];
const PILL = (isActive, color = C.green) => ({ border: `1px solid ${isActive ? color : C.border}`, background: isActive ? `${color}1a` : C.card, color: isActive ? color : C.muted, borderRadius: 20, padding: "6px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4, transition: "all .15s", flexShrink: 0 });

function FilterBar({ active, onChange, matches }) {
  const isGrupoActive = active === "grupos" || active.startsWith("grupo-");
  const count = (f) => applyFilter(matches, f).length;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
        {FILTERS_MAIN.map(f => {
          const isActive = f.id === "grupos" ? isGrupoActive : active === f.id;
          const n = f.id === "grupos" ? count("grupos") : count(f.id);
          return <button key={f.id} onClick={() => onChange(f.id)} style={PILL(isActive)}>{f.label}<span style={{ fontSize: 10, background: isActive ? `${C.green}33` : C.surface, borderRadius: 10, padding: "1px 6px" }}>{n}</span></button>;
        })}
      </div>
      {isGrupoActive && (
        <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingTop: 8, paddingBottom: 2, scrollbarWidth: "none" }}>
          <button onClick={() => onChange("grupos")} style={PILL(active === "grupos", C.blue)}>Todos <span style={{ fontSize: 10, background: active === "grupos" ? `${C.blue}33` : C.surface, borderRadius: 10, padding: "1px 6px" }}>{count("grupos")}</span></button>
          {Object.keys(GRUPOS).map(letter => {
            const filterId = `grupo-${letter}`;
            const isAct = active === filterId;
            return <button key={letter} onClick={() => onChange(filterId)} style={PILL(isAct, C.blue)}>Grupo {letter} <span style={{ fontSize: 10, background: isAct ? `${C.blue}33` : C.surface, borderRadius: 10, padding: "1px 6px" }}>{count(filterId)}</span></button>;
          })}
        </div>
      )}
    </div>
  );
}

/* ── Abas Principais ── */
function TabPlacar({ participants, matches, preds, championPts, prevPositions }) {
  const isMobile = useIsMobile();
  const [statsFor, setStatsFor] = useState(null);
  const ranked = getRanked(participants, matches, preds, championPts);
  const total = participants.length * 50;
  const played = matches.filter(m => m.result).length;
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
        <span>💰 Caixa Arrecadado: R$ {total.toLocaleString("pt-BR")}</span>
        <span>👥 Jogadores ativos: {participants.length}</span>
        {winner && <span style={{ color: C.gold }}>🏆 Vencedor: {winner}</span>}
      </div>
      {participants.length === 0 && <Empty icon="👥" msg="Nenhum participante cadastrado." />}
      <ScoringLegend />
      {ranked.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 52px" : "44px 1fr 64px 40px 40px 40px", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 10, color: C.muted }}>POS</span><span style={{ fontSize: 10, color: C.muted }}>NOME (Clique para abrir estatísticas)</span><span style={{ fontSize: 10, color: C.muted, textAlign: "right" }}>PONTOS</span>
            {!isMobile && <><span style={{ fontSize: 10, color: C.gold, textAlign: "center" }}>10</span><span style={{ fontSize: 10, color: C.green, textAlign: "center" }}>7</span><span style={{ fontSize: 10, color: C.blue, textAlign: "center" }}>5</span></>}
          </div>
          {ranked.map((p, i) => (
            <div key={p.id} onClick={() => setStatsFor(p)} style={{ display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 52px" : "44px 1fr 64px 40px 40px 40px", gap: 6, padding: isMobile ? "12px 12px" : "14px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none", background: i === 0 ? `${C.gold}0a` : i === 1 ? `${C.silver}0a` : i === 2 ? `${C.bronze}0a` : "transparent", cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", fontSize: i < 3 ? (isMobile ? 17 : 20) : 13, color: i >= 3 ? C.muted : undefined }}>{i < 3 ? medals[i] : `${i + 1}º`}</span>
              <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: isMobile ? 13 : 14 }}>{p.name}</span>
                {(() => { const prev = prevPositions[p.id]; const delta = prev ? prev - (i + 1) : 0; return delta !== 0 ? <span style={{ fontSize: 10, fontWeight: 900, color: delta > 0 ? C.green : C.red, flexShrink: 0 }}>{delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}</span> : null; })()}
                {!p.paid && <span style={{ fontSize: 9, background: `${C.red}22`, color: C.red, padding: "1px 5px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>Pix Pendente ⚠️</span>}
                {(p.champBonus + p.viceBonus + p.thirdBonus + p.brazilBonus) > 0 && <span style={{ fontSize: 9, background: `${C.gold}22`, color: C.gold, padding: "1px 5px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>🎁 +{p.champBonus + p.viceBonus + p.thirdBonus + p.brazilBonus}</span>}
                {isMobile && <span style={{ marginLeft: "auto", display: "flex", gap: 5, flexShrink: 0 }}>{p.c10 > 0 && <span style={{ fontSize: 10, color: C.gold }}>🎯×{p.c10}</span>}{p.c7 > 0 && <span style={{ fontSize: 10, color: C.green }}>⭐×{p.c7}</span>}</span>}
              </span>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 22 : 26, display: "flex", alignItems: "center", justifyContent: "flex-end", color: i === 0 ? C.gold : i === 1 ? C.silver : i === 2 ? C.bronze : C.text }}>{p.total}</span>
              {!isMobile && <><span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontWeight: 900 }}>{p.c10 || "—"}</span><span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontWeight: 900 }}>{p.c7 || "—"}</span><span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, fontWeight: 900 }}>{p.c5 || "—"}</span></>}
            </div>
          ))}
        </div>
      )}
      {statsFor && <StatsModal participant={statsFor} matches={matches} preds={preds} onClose={() => setStatsFor(null)} championPts={championPts} />}
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
      <Divider label="Classificação Oficial dos Grupos" />
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
function TabChaveamento({ matches }) {
  // A correção foi adicionar o "3º Lugar" antes da "Final" neste array:
  const columns = ["32-avos de Final", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Final"];
  
  return (
    <div style={{ overflowX: "auto", paddingBottom: 20, scrollbarWidth: "thin" }}>
      <div style={{ display: "flex", gap: 24, minWidth: "max-content", padding: "10px 0" }}>
        {columns.map(ph => {
          const ms = matches.filter(m => m.phase === ph);
          return (
            <div key={ph} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 240, justifyContent: "space-around" }}>
              <div style={{ textAlign: "center", color: C.gold, fontWeight: 900, marginBottom: 8, fontSize: 13, background: C.surface, padding: "8px 0", borderRadius: 8, border: `1px solid ${C.border}` }}>
                {ph.toUpperCase()}
              </div>
              {ms.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 12, textAlign: "center", fontStyle: "italic", padding: "30px 10px", border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                  Aguardando definições...
                </div>
              ) : (
                ms.map(m => (
                  <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {m.date && <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: -2 }}>{m.date}</div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: m.result && m.result.a > m.result.b ? C.green : C.text }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{m.teamA}</span>
                      <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, color: m.result && m.result.a > m.result.b ? C.green : C.gold }}>{m.result ? m.result.a : "-"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: m.result && m.result.b > m.result.a ? C.green : C.text }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{m.teamB}</span>
                      <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, color: m.result && m.result.b > m.result.a ? C.green : C.gold }}>{m.result ? m.result.b : "-"}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabParticipantes({ participants, onChange, onDelete, isAdmin }) {
  const [name, setName] = useState(""); const [pin, setPin] = useState(""); const [editingId, setEditingId] = useState(null); const [editName, setEditName] = useState(""); const [editPin, setEditPin] = useState("");

  const add = () => {
    if (!name.trim()) return alert("Por favor, digite seu nome!");
    if (pin.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!");
    onChange([...participants, { id: uid(), name: name.trim(), paid: false, pin: pin }]);
    setName(""); setPin("");
    if (!isAdmin) alert("Conta criada com sucesso! Vá na aba Palpites para fazer seu login e jogar.");
  };

  const startEdit = (p) => {
    if (!isAdmin) {
      const authPin = window.prompt(`🔒 Digite a senha atual de ${p.name} para liberar a edição de cadastro:`);
      if (authPin === null) return;
      if (authPin !== p.pin) return alert("❌ Senha incorreta!");
    }
    setEditingId(p.id); setEditName(p.name); setEditPin(p.pin);
  };

  const saveEdit = (id) => {
    if (!editName.trim()) return alert("O nome não pode ficar vazio!");
    if (editPin.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!");
    onChange(participants.map(p => p.id === id ? { ...p, name: editName.trim(), pin: editPin } : p));
    setEditingId(null);
  };

  return (
    <div>
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
          {editingId === p.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={editName} onChange={e => setEditName(e.target.value)} style={INP({ padding: "8px 10px" })} />
              <input type="password" value={editPin} onChange={e => setEditPin(e.target.value)} placeholder="Definir nova senha" style={INP({ padding: "8px 10px", textAlign: "center" })} />
              <div style={{ display: "flex", gap: 8 }}><button onClick={() => saveEdit(p.id)} style={BTN({ flex: 1 })}>Salvar Alterações</button><button onClick={() => setEditingId(null)} style={GHOST_BTN({ flex: 1 })}>Cancelar</button></div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
          )}
        </div>
      ))}
    </div>
  );
}

/* ── MOTOR INTELIGENTE DE CHAVEAMENTO AUTOMÁTICO (REATIVO) ── */
function processKnockout(currentMatches) {
  // 1. Calcula a Fase de Grupos
  const st = getGroupStandings(currentMatches);
  const firsts = {}, seconds = {};
  let thirdsList = [];
  Object.keys(st).forEach(g => {
    firsts[g] = st[g][0] || { team: `1º Grupo ${g}` };
    seconds[g] = st[g][1] || { team: `2º Grupo ${g}` };
    if (st[g][2]) thirdsList.push({ ...st[g][2], group: g });
  });
  thirdsList = thirdsList.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || 0).slice(0, 8);

  const targets = ["A", "B", "D", "E", "G", "I", "K", "L"];
  const allowed = { "A": ["C","E","F","H","I"], "B": ["E","F","G","I","J"], "D": ["B","E","F","I","J"], "E": ["A","B","C","D","F"], "G": ["A","E","H","I","J"], "I": ["C","D","F","G","H"], "K": ["D","E","I","J","L"], "L": ["E","H","I","J","K"] };
  
  let bestAssign = null;
  function solve(idx, current) {
    if (bestAssign) return;
    if (idx === targets.length) { bestAssign = { ...current }; return; }
    const t = targets[idx];
    for (let i = 0; i < thirdsList.length; i++) {
      const th = thirdsList[i];
      if (!Object.values(current).find(x => x.team === th.team) && (allowed[t].includes(th.group) || th.group !== t)) { current[t] = th; solve(idx + 1, current); delete current[t]; }
    }
  }
  solve(0, {});
  if (!bestAssign) {
    bestAssign = {}; let available = [...thirdsList];
    targets.forEach(t => { 
        const foundIdx = available.findIndex(x => x.group !== t); 
        if (foundIdx > -1) { bestAssign[t] = available[foundIdx] || {team: "3º a definir"}; available.splice(foundIdx, 1); } 
        else { bestAssign[t] = available[0] || {team: "3º a definir"}; available.splice(0, 1); } 
    });
  }

  const r32 = [
    { tA: firsts["A"].team, tB: bestAssign["A"].team }, { tA: firsts["B"].team, tB: bestAssign["B"].team }, { tA: firsts["C"].team, tB: seconds["F"].team }, { tA: firsts["D"].team, tB: bestAssign["D"].team },
    { tA: firsts["E"].team, tB: bestAssign["E"].team }, { tA: firsts["F"].team, tB: seconds["C"].team }, { tA: firsts["G"].team, tB: bestAssign["G"].team }, { tA: firsts["H"].team, tB: seconds["J"].team },
    { tA: firsts["I"].team, tB: bestAssign["I"].team }, { tA: firsts["J"].team, tB: seconds["H"].team }, { tA: firsts["K"].team, tB: bestAssign["K"].team }, { tA: firsts["L"].team, tB: bestAssign["L"].team },
    { tA: seconds["A"].team, tB: seconds["B"].team }, { tA: seconds["D"].team, tB: seconds["E"].team }, { tA: seconds["G"].team, tB: seconds["I"].team }, { tA: seconds["K"].team, tB: seconds["L"].team }
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
  const getW = (id) => { const m = getM(id); return m && m.result ? (m.result.a > m.result.b ? m.teamA : (m.result.b > m.result.a ? m.teamB : m.teamA)) : null; };
  const getL = (id) => { const m = getM(id); return m && m.result ? (m.result.a > m.result.b ? m.teamB : (m.result.b > m.result.a ? m.teamA : m.teamB)) : null; };

  // 3. Garante que todos os 104 jogos existam na tela
  K_DEF.forEach(def => {
    if (!getM(def.id)) nextMatches.push({ id: def.id, teamA: "A Definir", teamB: "A Definir", phase: def.phase, date: def.date, result: null });
  });

  // 4. Injeta os times em tempo real, fase a fase (imutável — não muta objetos do estado)
  const update = (id, fields) => { const idx = nextMatches.findIndex(x => x.id === id); if (idx > -1) nextMatches[idx] = { ...nextMatches[idx], ...fields }; };

  for(let i=0; i<16; i++) { update(`m_${73+i}`, { teamA: r32[i].tA, teamB: r32[i].tB }); }
  for(let i=0; i<8; i++)  { update(`m_${89+i}`, { teamA: getW(`m_${73 + i*2}`) || `Vencedor J${73 + i*2}`, teamB: getW(`m_${74 + i*2}`) || `Vencedor J${74 + i*2}` }); }
  for(let i=0; i<4; i++)  { update(`m_${97+i}`, { teamA: getW(`m_${89 + i*2}`) || `Vencedor J${89 + i*2}`, teamB: getW(`m_${90 + i*2}`) || `Vencedor J${90 + i*2}` }); }
  for(let i=0; i<2; i++)  { update(`m_${101+i}`, { teamA: getW(`m_${97 + i*2}`) || `Vencedor J${97 + i*2}`, teamB: getW(`m_${98 + i*2}`) || `Vencedor J${98 + i*2}` }); }
  update("m_103", { teamA: getL("m_101") || "Perdedor J101", teamB: getL("m_102") || "Perdedor J102" });
  update("m_104", { teamA: getW("m_101") || "Vencedor J101", teamB: getW("m_102") || "Vencedor J102" });

  return nextMatches;
}

/* ── ABA 5: CONTROLE DE JOGOS E GERADORES AUTOMÁTICOS DA FIFA ── */
function TabJogos({ matches, onChange, isAdmin }) {
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

  const startEdit = (m) => { setEditId(m.id); setTempR(m.result ? { a: String(m.result.a), b: String(m.result.b) } : { a: "", b: "" }); };
  
  // ⚡ A MÁGICA ACONTECE AQUI: Toda vez que salva um placar, ele recalcula a árvore!
  const saveResult = async (id) => {
    const a = parseInt(tempR.a), b = parseInt(tempR.b);
    if (!isNaN(a) && !isNaN(b) && a >= 0 && b >= 0) {
      let nextMatches = matches.map((m) => (m.id === id ? { ...m, result: { a, b } } : m));
      nextMatches = processKnockout(nextMatches);
      setSaving(true);
      await onChange(nextMatches);
      setSaving(false);
    }
    setEditId(null);
  };

  const clearResult = (id) => {
    if (!window.confirm("Confirma limpar o resultado deste jogo?")) return;
    let nextMatches = matches.map((m) => (m.id === id ? { ...m, result: null } : m));
    nextMatches = processKnockout(nextMatches);
    onChange(nextMatches);
    setEditId(null);
  };

  const filtered = applyFilter(matches, filter);
  const grouped = PHASES.map((ph) => ({ ph, ms: filtered.filter((m) => m.phase === ph) })).filter((g) => g.ms.length);

  return (
    <div>
      {isAdmin && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 14, color: C.text }}>Mecanismo de Grade de Jogos</h3>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button onClick={gerarCopaCompleta} style={BTN({ background: C.gold, color: "#000", border: `1px solid ${C.border}`, fontSize: 12, padding: "6px 12px", minHeight: 32 })}>⚡ Gerar Tabela Completa (104 Jogos)</button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>Dica: Se um jogo de mata-mata empatar, declare o placar final com 1 gol a mais para quem venceu nos pênaltis para que o Motor Reativo empurre a seleção correta para a próxima fase.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="Mandante" style={INP()} /><div style={{ textAlign: "center", color: C.muted, fontWeight: 900 }}>×</div><input value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="Visitante" style={INP()} />
          </div>
          <input value={dateStr} onChange={(e) => setDateStr(e.target.value)} placeholder="Data e Horário" style={INP({ marginBottom: 10 })} />
          <div style={{ display: "flex", gap: 8 }}><select value={phase} onChange={(e) => setPhase(e.target.value)} style={INP({ flex: 1 })}>{PHASES.map((p) => <option key={p} value={p}>{p}</option>)}</select><button onClick={add} style={BTN()}>+ Adicionar</button></div>
        </div>
      )}
      {!isAdmin && <div style={{ marginBottom: 16, color: C.gold, fontSize: 13 }}>⚠️ Painel restrito. Apenas o administrador atualiza os resultados de campo.</div>}
      <FilterBar active={filter} onChange={setFilter} matches={matches} />
      {grouped.length === 0 && <Empty icon="📅" msg="Nenhum jogo localizado." />}
      {grouped.map(({ ph, ms }) => (
        <div key={ph} style={{ marginBottom: 24 }}>
          <Divider label={`${ph} (${ms.length})`} />
          {ms.map((m) => (
            <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              {m.date && <span style={{ fontSize: 11, color: isLocked(m.date) ? C.red : C.greenDim, fontWeight: 700 }}>{m.date}{isLocked(m.date) ? " (Encerrado)" : ""}</span>}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {editId === m.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: C.text }}>{m.teamA}</span><ScoreIn value={tempR.a} onChange={(v) => setTempR((t) => ({ ...t, a: v }))} onKeyDown={(e) => e.key === "Enter" && !saving && saveResult(m.id)} autoFocus /><span style={{ color: C.muted }}>×</span><ScoreIn value={tempR.b} onChange={(v) => setTempR((t) => ({ ...t, b: v }))} onKeyDown={(e) => e.key === "Enter" && !saving && saveResult(m.id)} /><span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "right", color: C.text }}>{m.teamB}</span></div>
                    <div style={{ display: "flex", gap: 8 }}><button onClick={() => !saving && saveResult(m.id)} style={BTN({ flex: 1, fontSize: 13, opacity: saving ? 0.7 : 1 })}>{saving ? "⏳ Salvando..." : "✓ Salvar Placar"}</button><button onClick={() => clearResult(m.id)} disabled={saving} style={GHOST_BTN({ flex: 1, color: C.red, borderColor: `${C.red}66`, opacity: saving ? 0.5 : 1 })}>Limpar Jogo</button></div>
                  </div>
                ) : (
                  <><span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: C.text }}>{m.teamA}</span>{m.result ? <button onClick={() => isAdmin && startEdit(m)} style={{ background: `${C.green}12`, border: `1px solid ${C.greenDim}`, borderRadius: 8, color: C.green, cursor: isAdmin ? "pointer" : "default", padding: "5px 18px", fontFamily: "'Bebas Neue', cursive", fontSize: 20 }}>{m.result.a} × {m.result.b}</button> : <button onClick={() => isAdmin && startEdit(m)} style={GHOST_BTN({ padding: "6px 14px", visibility: isAdmin ? "visible" : "hidden" })}>+ Inserir Placar</button>}<span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "right", color: C.text }}>{m.teamB}</span></>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TabPalpites({ participants, matches, preds, onChange, savePin, sessionUnlocked, setSessionUnlocked, onSaved, isAdmin, onPickSpecial, championPts, onSetChampionPts }) {
  const isMobile = useIsMobile(); const [selPid, setSelPid] = useState(""); const [pinInput, setPinInput] = useState(""); const [filter, setFilter] = useState("hoje");
  const activePid = participants.find((p) => p.id === selPid)?.id || participants[0]?.id || "";
  const activeUser = participants.find((p) => p.id === activePid);

  const setPred = (matchId, side, val) => {
    if (!activePid) return;
    const next = { ...preds, [activePid]: { ...preds[activePid], [matchId]: { ...(preds[activePid]?.[matchId] || {}), [side]: val } } };
    onChange(next); onSaved();
  };

  const handleUnlock = () => {
    if (!activeUser.pin) { if (pinInput.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!"); savePin(activeUser.id, pinInput); setSessionUnlocked({ ...sessionUnlocked, [activeUser.id]: true }); } else { if (activeUser.pin === pinInput) setSessionUnlocked({ ...sessionUnlocked, [activeUser.id]: true }); else alert("Senha de acesso incorreta!"); }
  };

  if (participants.length === 0) return <Empty icon="👥" msg="Aguardando cadastros na aba de participantes." />;
  if (matches.length === 0) return <Empty icon="⚽" msg="Nenhum jogo disponível na grade." />;

  const stats = activePid ? getStats(activePid, matches, preds) : null;
  const isUnlocked = sessionUnlocked[activePid];
  const pendingCount = matches.filter(m => { if (isLocked(m.date)) return false; const p = preds[activePid]?.[m.id]; return !(p && p.a !== "" && p.b !== "" && p.a != null && p.b != null); }).length;
  const todayFiltered = applyFilter(matches, filter);
  const filteredMatches = (filter === "hoje" && todayFiltered.length === 0)
    ? matches.filter(m => !isLocked(m.date) && parseMatchDate(m.date)).sort((a, b) => parseMatchDate(a.date) - parseMatchDate(b.date)).slice(0, 8)
    : todayFiltered;
  const isFallback = filter === "hoje" && todayFiltered.length === 0 && filteredMatches.length > 0;
  const grouped = PHASES.map((ph) => ({ ph, ms: filteredMatches.filter((m) => m.phase === ph) })).filter((g) => g.ms.length);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {isMobile ? <select value={activePid} onChange={e => { setSelPid(e.target.value); setPinInput(""); }} style={INP({ fontSize: 15, fontWeight: 700 })}>{participants.map((p) => (<option key={p.id} value={p.id}>{p.name} {sessionUnlocked[p.id] ? "🔓" : "🔒"}</option>))}</select> : <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{participants.map((p) => (<button key={p.id} onClick={() => { setSelPid(p.id); setPinInput(""); }} style={{ border: `1px solid ${activePid === p.id ? C.green : C.border}`, background: activePid === p.id ? `${C.green}1a` : C.card, color: activePid === p.id ? C.green : C.muted, borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>{p.name} {sessionUnlocked[p.id] ? "🔓" : "🔒"}</button>))}</div>}
      </div>
      {!isUnlocked ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 20px", textAlign: "center", marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div><h3 style={{ marginBottom: 8, color: C.text }}>{activeUser?.pin ? "Identidade Protegida" : "Criar Senha de Validação"}</h3><p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>{activeUser?.pin ? `Digite a senha secreta do(a) ${activeUser.name} para abrir os inputs.` : "Este é o primeiro acesso deste perfil. Cadastre uma senha agora para travar suas alterações."}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", maxWidth: 300, margin: "0 auto" }}><input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleUnlock()} placeholder="PIN" style={INP({ textAlign: "center", letterSpacing: 3 })} /><button onClick={handleUnlock} style={BTN()}>{activeUser?.pin ? "Desbloquear" : "Salvar Senha"}</button></div>
        </div>
      ) : (
        <>
          {stats && <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}><span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 30, color: C.gold }}>{stats.total}</span><span style={{ color: C.muted, fontSize: 13 }}>pontos</span><span style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>🎯 {stats.c10}</span><span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>⭐ {stats.c7}</span><span style={{ color: C.blue, fontWeight: 700, fontSize: 13 }}>✅ {stats.c5}</span>{pendingCount > 0 && <span style={{ marginLeft: "auto", background: `${C.gold}1a`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>⚠️ {pendingCount} pendentes de palpite</span>}</div>}
          <SpecialPicksSection activePid={activePid} participants={participants} matches={matches} isAdmin={isAdmin} onPickSpecial={onPickSpecial} championPts={championPts} onSetChampionPts={onSetChampionPts} />
          <FilterBar active={filter} onChange={setFilter} matches={matches} />
          {grouped.length === 0 && <Empty icon="📅" msg="Nenhuma partida agendada neste filtro." />}
          {isFallback && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, padding: "8px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>📅 Sem jogos hoje — mostrando os próximos a acontecer</div>}
          {grouped.map(({ ph, ms }) => (
            <div key={ph} style={{ marginBottom: 24 }}>
              <Divider label={ph} />
              {ms.map((m) => {
                const pred = preds[activePid]?.[m.id] || {};
                const pts = m.result ? calcPts(pred, m.result) : null;
                const locked = isLocked(m.date);
                const closingSoon = !locked && isClosingSoon(m.date);
                return (
                  <div key={m.id} style={{ background: C.card, border: `1px solid ${closingSoon ? C.gold + "66" : locked ? C.border : C.greenDim + "33"}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                    {m.date && <span style={{ fontSize: 11, color: locked ? C.red : closingSoon ? C.gold : C.greenDim, fontWeight: 700 }}>{m.date}{locked ? " (Tempo Esgotado)" : closingSoon ? " ⚠️ Fecha em breve!" : ""}</span>}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{m.teamA}</span>
                      <ScoreIn value={pred.a ?? ""} onChange={(v) => setPred(m.id, "a", v)} disabled={locked} />
                      <span style={{ color: C.muted, fontSize: 12 }}>×</span>
                      <ScoreIn value={pred.b ?? ""} onChange={(v) => setPred(m.id, "b", v)} disabled={locked} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{m.teamB}</span>
                      <PtsBadge pts={pts} />
                    </div>
                    {m.result && <PostGameMural match={m} participants={participants} preds={preds} />}
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

function TabVisao({ participants, matches, preds, championPts }) {
  if (participants.length === 0) return <Empty icon="👥" msg="Aguardando participantes." />;
  const ranked = getRanked(participants, matches, preds, championPts);
  const played = matches.filter((m) => m.result);
  if (played.length === 0) return <Empty icon="⏳" msg="Nenhum jogo finalizado para auditoria geral." />;

  return (
    <div style={{ overflowX: "auto", scrollbarWidth: "thin" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 600 }}>
        <thead>
          <tr style={{ background: C.surface }}>
            <th style={{ padding: "10px 12px", textAlign: "left", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>Partida</th><th style={{ padding: "10px 8px", textAlign: "center", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}`, width: 80 }}>Oficial</th>
            {ranked.map((p) => <th key={p.id} style={{ padding: "10px 6px", textAlign: "center", color: C.text, fontWeight: 700, borderBottom: `1px solid ${C.border}`, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis" }}>{p.name.split(" ")[0]}</th>)}
          </tr>
        </thead>
        <tbody>
          {played.map((m) => (
            <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}44` }}>
              <td style={{ padding: "10px 12px", color: C.text, fontWeight: 600 }}>{m.teamA} × {m.teamB}</td>
              <td style={{ padding: "10px 8px", textAlign: "center", fontFamily: "'Bebas Neue', cursive", fontSize: 16, color: C.green, letterSpacing: 1, background: "#0002" }}>{m.result.a}×{m.result.b}</td>
              {ranked.map((p) => {
                const pred = preds[p.id]?.[m.id];
                const pts = calcPts(pred, m.result);
                const hasPred = pred && pred.a !== "" && pred.b !== "" && pred.a != null && pred.b != null;
                return (
                  <td key={p.id} style={{ padding: "6px", textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><span style={{ fontSize: 11, color: hasPred ? C.text : C.border }}>{hasPred ? `${pred.a}×${pred.b}` : "—"}</span><PtsBadge pts={pts} /></div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BolaoApp() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("placar");
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [preds, setPreds] = useState({});
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionUnlocked, setSessionUnlocked] = useState({});
  const [championPts, setChampionPts] = useState(20);
  const [toast, setToast] = useState(null);
  const [prevPositions, setPrevPositions] = useState({});
  const stateRef = useRef({ matches: [], participants: [], preds: {}, championPts: 20 });
  useEffect(() => { stateRef.current = { matches, participants, preds, championPts }; });
  useEffect(() => { document.title = "⚽ Bolão Copa 2026"; }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [tab]);

  useEffect(() => {
    (async () => {
      try {
        const { data: dbParticipants } = await supabase.from('participantes').select('*');
        if (dbParticipants) setParticipants(dbParticipants);
        const { data: dbJogos } = await supabase.from('jogos').select('*');
        if (dbJogos && dbJogos.length > 0) {
          setMatches(dbJogos.map(j => ({ id: j.id, teamA: j.team_a, teamB: j.team_b, phase: j.phase, date: j.match_date, result: (j.result_a !== null && j.result_b !== null) ? { a: j.result_a, b: j.result_b } : null })));
        }
        const { data: dbPalpites } = await supabase.from('palpites').select('*');
        if (dbPalpites) {
          const objPreds = {};
          dbPalpites.forEach(p => { if (!objPreds[p.participante_id]) objPreds[p.participante_id] = {}; objPreds[p.participante_id][p.jogo_id] = { a: p.palpite_a, b: p.palpite_b }; });
          setPreds(objPreds);
        }
        const { data: cfg } = await supabase.from('config').select('valor').eq('chave', 'champion_pts').single();
        if (cfg?.valor) setChampionPts(parseInt(cfg.valor));
      } catch (err) { console.error("Erro na leitura das tabelas do Supabase:", err); }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const channel = supabase.channel('bolao-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participantes' }, async () => {
        const { data } = await supabase.from('participantes').select('*');
        if (data) setParticipants(data);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jogos' }, async () => {
        const { participants: p, preds: pr, championPts: cp, matches: prevM } = stateRef.current;
        const { data } = await supabase.from('jogos').select('*');
        if (data) {
          setPrevPositions(getRanked(p, prevM, pr, cp).reduce((acc, pl, i) => ({ ...acc, [pl.id]: i + 1 }), {}));
          setMatches(data.map(j => ({ id: j.id, teamA: j.team_a, teamB: j.team_b, phase: j.phase, date: j.match_date, result: (j.result_a !== null && j.result_b !== null) ? { a: j.result_a, b: j.result_b } : null })));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'palpites' }, async () => {
        const { data } = await supabase.from('palpites').select('*');
        if (data) { const objPreds = {}; data.forEach(p => { if (!objPreds[p.participante_id]) objPreds[p.participante_id] = {}; objPreds[p.participante_id][p.jogo_id] = { a: p.palpite_a, b: p.palpite_b }; }); setPreds(objPreds); }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [ready]);

  const sp = async (d) => { setParticipants(d); await supabase.from('participantes').upsert(d); };
  const removeP = async (id) => { setParticipants(p => p.filter(x => x.id !== id)); await supabase.from('participantes').delete().eq('id', id); };
  const sm = async (d) => {
    const changed = d.filter(j => { const old = matches.find(m => m.id === j.id); if (!old) return true; return old.teamA !== j.teamA || old.teamB !== j.teamB || old.date !== j.date || JSON.stringify(old.result) !== JSON.stringify(j.result); });
    if (changed.length > 0) setPrevPositions(getRanked(participants, matches, preds, championPts).reduce((acc, pl, i) => ({ ...acc, [pl.id]: i + 1 }), {}));
    setMatches(d);
    if (changed.length === 0) { console.warn("sm: nenhuma mudança detectada, upsert ignorado"); return; }
    const { error } = await supabase.from('jogos').upsert(changed.map(j => ({ id: j.id, team_a: j.teamA, team_b: j.teamB, phase: j.phase, match_date: j.date || "TBD", result_a: j.result ? j.result.a : null, result_b: j.result ? j.result.b : null })));
    if (error) { console.error("❌ Supabase jogos upsert error:", error); showToast("❌ Erro ao salvar jogo no servidor!", "error"); }
    else { console.log(`✅ ${changed.length} jogo(s) salvo(s) no Supabase`); setToast({ message: "✅ Placar salvo no servidor!", type: "success" }); }
  };

  const spr = async (d) => {
    const toSave = [];
    Object.keys(d).forEach(participante_id => { Object.keys(d[participante_id]).forEach(jogo_id => { const p = d[participante_id][jogo_id]; if (p.a === "" || p.b === "" || p.a == null || p.b == null) return; const old = preds[participante_id]?.[jogo_id]; if (!old || String(old.a) !== String(p.a) || String(old.b) !== String(p.b)) toSave.push({ participante_id, jogo_id, palpite_a: parseInt(p.a), palpite_b: parseInt(p.b) }); }); });
    setPreds(d);
    if (toSave.length === 0) return;
    const { error } = await supabase.from('palpites').upsert(toSave, { onConflict: 'participante_id, jogo_id' });
    if (error) showToast("❌ Palpite não foi salvo! Verifique a conexão.", "error");
  };

  const savePin = async (userId, pin) => { setParticipants(p => p.map(x => x.id === userId ? { ...x, pin } : x)); await supabase.from('participantes').update({ pin }).eq('id', userId); };
  const onPickSpecial = async (pid, field, value) => { const updated = participants.map(p => p.id === pid ? { ...p, [field]: value } : p); setParticipants(updated); const { error } = await supabase.from('participantes').update({ [field]: value }).eq('id', pid); if (error) showToast("❌ Erro ao salvar — rode o SQL de migração no Supabase!", "error"); };
  const onSetChampionPts = async (pts) => { setChampionPts(pts); await supabase.from('config').upsert({ chave: 'champion_pts', valor: String(pts) }); };

  const handleAdminLogin = () => {
    if (isAdmin) { setIsAdmin(false); return; }
    const pwd = prompt("Área técnica restrita. Chave do Administrador:");
    if (pwd === "bruno2026") setIsAdmin(true); else if (pwd !== null) alert("Acesso negado: Credencial incorreta.");
  };

  const showToast = (msg = "✓ Palpite gravado na nuvem!", type = "success") => {
    if (type === "success" && toast) return;
    setToast({ message: msg, type });
  };

  const TABS = [ { id: "placar", label: "🏆 Placar" }, { id: "palpites", label: "📋 Palpites" }, { id: "tabelas", label: "📊 Tabelas" }, { id: "chaveamento", label: "🌳 Chaveamento" }, { id: "visao", label: "👁️ Auditoria" }, { id: "jogos", label: "⚽ Painel Jogos" }, { id: "participantes", label: "👥 Jogadores" } ];

  if (!ready) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontFamily: "sans-serif", fontSize: 18, fontWeight: 700 }}>⚽ Sincronizando tabelas com o Supabase...</div>;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Nunito', system-ui, sans-serif", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;600;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; } input, select, button, textarea { font-family: 'Nunito', system-ui, sans-serif; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; } input[type=number] { -moz-appearance: textfield; } select { -webkit-appearance: none; appearance: none; }
        ::-webkit-scrollbar { width: 4px; height: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        @keyframes badgePop { 0% { transform: scale(0.3) rotate(-10deg); opacity: 0; } 65% { transform: scale(1.18) rotate(3deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes badgeGlow { 0%,100% { box-shadow: 0 0 0px transparent; } 50% { box-shadow: 0 0 16px #ffca2866, 0 0 6px #ffca2844; } }
      `}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ padding: isMobile ? "10px 14px" : "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div onDoubleClick={handleAdminLogin} style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 22 : 26, letterSpacing: 3, color: isAdmin ? C.red : C.gold, cursor: "pointer" }} title="Duplo clique para Admin">⚽ BOLÃO DA COPA 2026 {isAdmin && "<ADMIN>"}</div>
            {matches.length > 0 && <NextMatchCountdown matches={matches} />}
          </div>
          <div style={{ marginLeft: "auto" }}><span style={{ background: `${C.gold}1a`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 20, padding: "4px 12px", fontWeight: 700, fontSize: isMobile ? 11 : 13 }}>Caixa: R$ {(participants.length * 50).toLocaleString("pt-BR")}</span></div>
        </div>
        <div style={{ display: "flex", background: C.surface, overflowX: "auto", scrollbarWidth: "none" }}>
          {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={{ border: "none", cursor: "pointer", padding: isMobile ? "10px 12px" : "12px 18px", whiteSpace: "nowrap", background: "transparent", color: tab === t.id ? C.green : C.muted, borderBottom: `2px solid ${tab === t.id ? C.green : "transparent"}`, fontWeight: 700, fontSize: isMobile ? 12 : 13, fontFamily: "inherit", transition: "color .15s", flex: isMobile ? "1 0 auto" : undefined }}>{isMobile ? t.label.split(" ")[0] : t.label}</button>)}
        </div>
      </div>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "16px 12px" : "20px 16px", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
        {tab === "placar"        && <TabPlacar participants={participants} matches={matches} preds={preds} championPts={championPts} prevPositions={prevPositions} />}
        {tab === "tabelas"       && <TabTabelas matches={matches} />}
        {tab === "chaveamento"   && <TabChaveamento matches={matches} />}
        {tab === "participantes" && <TabParticipantes participants={participants} onChange={sp} onDelete={removeP} isAdmin={isAdmin} />}
        {tab === "jogos"         && <TabJogos matches={matches} onChange={sm} isAdmin={isAdmin} />}
        {tab === "palpites"      && <TabPalpites participants={participants} matches={matches} preds={preds} onChange={spr} savePin={savePin} sessionUnlocked={sessionUnlocked} setSessionUnlocked={setSessionUnlocked} onSaved={showToast} isAdmin={isAdmin} onPickSpecial={onPickSpecial} championPts={championPts} onSetChampionPts={onSetChampionPts} />}
        {tab === "visao"         && <TabVisao participants={participants} matches={matches} preds={preds} championPts={championPts} />}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
