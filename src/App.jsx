import { useState, useEffect } from "react";
import { createClient } from '@supabase/supabase-js';

// ── CONEXÃO COM O BANCO DE DADOS ──
const supabaseUrl = 'https://sfpdbotvobdzuckpfcbv.supabase.co';
const supabaseKey = 'sb_publishable_FQaWYA6nqB1Fz9IS2O4klg_Eu1Q2mU4';
const supabase = createClient(supabaseUrl, supabaseKey);

/* ── HOOKS RESPONSIVOS ── */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 600);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 600);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

/* ── CONFIGURAÇÕES E GRUPOS OFICIAIS DA COPA 2026 ── */
const GRUPOS = {
  A: ["México", "África do Sul", "Coreia do Sul", "República Tcheca"],
  B: ["Canadá", "Bósnia", "Catar", "Suíça"],
  C: ["Brasil", "Marrocos", "Haiti", "Escócia"],
  D: ["Estados Unidos", "Paraguai", "Austrália", "Turquia"],
  E: ["Alemanha", "Curaçao", "Costa do Marfim", "Equador"],
  F: ["Holanda", "Japão", "Suécia", "Tunísia"],
  G: ["Bélgica", "Egito", "Irã", "Nova Zelândia"],
  H: ["Espanha", "Cabo Verde", "Arábia Saudita", "Uruguai"],
  I: ["França", "Senegal", "Noruega", "Bolívia/Iraque"],
  J: ["Argentina", "Argélia", "Áustria", "Jordânia"],
  K: ["Portugal", "RD Congo", "Uzbequistão", "Colômbia"],
  L: ["Inglaterra", "Croácia", "Gana", "Panamá"],
};
const ALL_TEAMS = Object.values(GRUPOS).flat().sort();
const TEAM_TO_GROUP = {};
Object.entries(GRUPOS).forEach(([letter, teams]) => {
  teams.forEach(team => { TEAM_TO_GROUP[team.toLowerCase()] = letter; });
});

const PHASES = ["Fase de Grupos", "32-avos de Final", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Final"];
const MATA_MATA = ["32-avos de Final", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Final"];

/* ── CONSTANTES DE SINALIZAÇÃO DE ID ── */
let _n = 0;
const uid = () => `${Date.now()}_${++_n}`;

/* ── MOTOR MATEMÁTICO DE REGRAS DE PONTUAÇÃO ── */
function calcPts(pred, result) {
  if (!result || !pred || pred.a == null || pred.b == null || pred.a === "" || pred.b === "") return null;
  const pa = parseInt(pred.a), pb = parseInt(pred.b), ra = parseInt(result.a), rb = parseInt(result.b);
  if ([pa, pb, ra, rb].some((v) => isNaN(v) || v < 0)) return null;
  
  if (pa === ra && pb === rb) return 10; // Placar Exato
  const pt = Math.sign(pa - pb), rt = Math.sign(ra - rb);
  const ok = pt === rt; // Acertou o vencedor ou empate
  if (ok && (pa === ra || pb === rb)) return 7; // Acertou tendência + gols de um time
  if (ok) return 5; // Acertou tendência simples
  if (pa === ra || pb === rb) return 2; // Errou tendência, mas acertou os gols de um time
  return 0;
}

/* ── MOTORES DE ESTATÍSTICA E DESEMPENHO DOS JOGADORES ── */
function getStats(pid, matches, preds) {
  let total = 0, c10 = 0, c7 = 0, c5 = 0, c2 = 0, c0 = 0;
  for (const m of matches) {
    if (!m.result) continue;
    const p = preds[pid]?.[m.id];
    if (!p || p.a === "" || p.b === "" || p.a == null || p.b == null) continue;
    const pts = calcPts(p, m.result);
    if (pts == null) continue;
    total += pts;
    if (pts === 10) c10++;
    else if (pts === 7) c7++;
    else if (pts === 5) c5++;
    else if (pts === 2) c2++;
    else c0++;
  }
  return { total, c10, c7, c5, c2, c0 };
}

function getDetailedStats(pid, matches, preds) {
  const base = getStats(pid, matches, preds);
  let bestPts = -1, bestMatch = null, worstPts = 11, worstMatch = null;
  let streak = 0, streakDone = false;
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
  return { ...base, bestPts, bestMatch, worstPts, worstMatch, streak, withPredCount: withPred.length, accuracy };
}

function getChampionWinner(matches) {
  const final = matches.find(m => m.phase === "Final" && m.result);
  if (!final) return null;
  if (final.result.a > final.result.b) return final.teamA;
  if (final.result.b > final.result.a) return final.teamB;
  return null;
}

function getRanked(participants, matches, preds, championPts = 20) {
  const winner = getChampionWinner(matches);
  return [...participants]
    .map(p => {
      const stats = getStats(p.id, matches, preds);
      const champBonus = (winner && p.champion_pick && p.champion_pick.toLowerCase().trim() === winner.toLowerCase().trim()) ? championPts : 0;
      return { ...p, ...stats, total: stats.total + champBonus, champBonus };
    })
    .sort((a, b) => b.total - a.total || b.c10 - a.c10 || b.c7 - a.c7 || b.c5 - a.c5);
}

/* ── MOTOR DE VERIFICAÇÃO DE HORÁRIO (TRAVA DE SEGURANÇA) ── */
function isLocked(dateStr) {
  if (!dateStr || dateStr.includes("TBD")) return false;
  try {
    const match = dateStr.match(/(\d{2})\/(\d{2}).*- (\d{2}):(\d{2})/);
    if (!match) return false;
    const [, day, month, hour, minute] = match;
    const matchDate = new Date(`2026-${month}-${day}T${hour}:${minute}:00-03:00`);
    return new Date() > matchDate;
  } catch { return false; }
}

/* ── MOTOR DE CÁLCULO DE CLASSIFICAÇÃO DOS GRUPO DA FIFA ── */
function getGroupStandings(matches) {
  const st = {};
  Object.keys(GRUPOS).forEach(g => {
    st[g] = GRUPOS[g].map(t => ({ team: t, pts: 0, gf: 0, ga: 0, gd: 0, pld: 0 }));
  });
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
  Object.keys(st).forEach(g => {
    st[g].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || 0);
  });
  return st;
}

/* ── TOKENS DE DESIGN VISUAL (ESTILOS COMPARTILHADOS) ── */
const C = {
  bg: "#06090a", surface: "#0b1015", card: "#10171d", cardHover: "#141e26", border: "#1b2c38",
  green: "#00e676", greenDim: "#00a152", gold: "#ffca28", silver: "#90a4ae", bronze: "#ff8f00",
  text: "#cce8d4", muted: "#4a6a5a", red: "#ff5252", blue: "#40c4ff", input: "#0c1820"
};

const INP = (extra = {}) => ({
  background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  padding: "10px 12px", fontSize: 16, fontFamily: "inherit", outline: "none",
  width: "100%", boxSizing: "border-box", ...extra
});

const BTN = (extra = {}) => ({
  background: C.greenDim, border: "none", borderRadius: 8, color: "#fff", padding: "10px 18px",
  fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", ...extra
});

const GHOST_BTN = (extra = {}) => ({
  background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted,
  padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", minHeight: 36,
  display: "inline-flex", alignItems: "center", justifyContent: "center", ...extra
});

const ptsColor = { 10: C.gold, 7: C.green, 5: C.blue, 2: C.bronze, 0: C.muted };
const ptsBg   = { 10: "#1a1200", 7: "#001a0d", 5: "#001428", 2: "#1a0a00", 0: "#101a17" };

/* ── SUBCOMPONENTES ATÔMICOS DA INTERFACE ── */
function Empty({ icon, msg }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15 }}>{msg}</div>
    </div>
  );
}

function PtsBadge({ pts }) {
  if (pts === null) return <span style={{ width: 34, display: "inline-block" }} />;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 34, height: 26, background: ptsBg[pts] ?? ptsBg[0], color: ptsColor[pts] ?? C.muted, border: `1px solid ${ptsColor[pts] ?? C.border}`, borderRadius: 6, fontWeight: 900, fontSize: 13 }}>
      {pts}
    </span>
  );
}

function ScoreIn({ value, onChange, disabled }) {
  if (disabled) {
    return <span style={{ width: 52, textAlign: "center", padding: "8px 4px", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, fontWeight: 700 }}>{value !== "" ? value : "-"}</span>;
  }
  return <input type="number" min="0" max="99" value={value} onChange={(e) => onChange(e.target.value)} style={INP({ width: 52, textAlign: "center", padding: "8px 4px", fontSize: 16 })} />;
}

function Divider({ label }) {
  return <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 17, letterSpacing: 1, color: C.muted, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 10 }}>{label}</div>;
}

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: C.greenDim, color: "#fff", borderRadius: 20, padding: "12px 24px", fontWeight: 700, fontSize: 14, zIndex: 999, boxShadow: "0 4px 20px #000c", whiteSpace: "nowrap", pointerEvents: "none" }}>
      {message}
    </div>
  );
}

/* ── MODAL DETALHADO DE ESTATÍSTICAS E CONQUISTAS ── */
function StatsModal({ participant, matches, preds, onClose, championPts }) {
  const stats = getDetailedStats(participant.id, matches, preds);
  const winner = getChampionWinner(matches);
  const champPick = participant.champion_pick || "";
  const champBonus = (winner && champPick && champPick.toLowerCase().trim() === winner.toLowerCase().trim()) ? championPts : 0;
  const totalWithChamp = stats.total + champBonus;

  const bars = [
    { label: "Exato",     pts: 10, count: stats.c10, color: C.gold   },
    { label: "Tend+Gol",  pts:  7, count: stats.c7,  color: C.green  },
    { label: "Tendência", pts:  5, count: stats.c5,  color: C.blue   },
    { label: "1 Gol",     pts:  2, count: stats.c2,  color: C.bronze },
    { label: "Erro",      pts:  0, count: stats.c0,  color: C.muted  },
  ];
  const maxCount = Math.max(...bars.map(b => b.count), 1);

  const badges = [];
  if (stats.c10 >= 3) badges.push({ icon: "🎯", name: "Sniper", desc: "3+ exatos" });
  if (stats.streak >= 4) badges.push({ icon: "🔥", name: "On Fire", desc: "Série de 4+ acertos" });
  if (stats.c0 >= 5) badges.push({ icon: "🥶", name: "Pé Frio", desc: "5+ palpites zerados" });
  if (stats.accuracy >= 60 && stats.withPredCount >= 5) badges.push({ icon: "🔮", name: "Mãe Dináh", desc: "+60% de precisão" });
  if (stats.withPredCount >= 20) badges.push({ icon: "🎖️", name: "Veterano", desc: "20+ palpites" });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: C.text }}>{participant.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {stats.withPredCount} palpites · {stats.accuracy}% acerto · 🔥 série de {stats.streak}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 48, color: C.gold, lineHeight: 1 }}>{totalWithChamp}</span>
          <span style={{ color: C.muted, fontSize: 13 }}>pontos</span>
          {champBonus > 0 && <span style={{ fontSize: 12, background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "2px 8px" }}>+{champBonus} campeão 🏆</span>}
        </div>

        {badges.length > 0 && (
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Conquistas Desbloqueadas</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {badges.map(b => (
                <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, padding: "6px 10px", borderRadius: 20 }}>
                  <span style={{ fontSize: 16 }}>{b.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Breakdown de Pontos</div>
          {bars.map(b => (
            <div key={b.pts} style={{ display: "grid", gridTemplateColumns: "100px 1fr 24px", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <PtsBadge pts={b.pts} />
                <span style={{ fontSize: 11, color: b.color, fontWeight: 700 }}>{b.label}</span>
              </div>
              <div style={{ background: C.card, borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${(b.count / maxCount) * 100}%`, height: "100%", background: b.color, borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 13, color: b.color, fontWeight: 900, textAlign: "right" }}>{b.count}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {stats.bestMatch && (
            <div style={{ background: `${C.gold}0a`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, marginBottom: 4 }}>⭐ MELHOR JOGO</div>
              <div style={{ fontSize: 13, color: C.text }}>{stats.bestMatch.teamA} × {stats.bestMatch.teamB}</div>
              <div style={{ fontSize: 12, color: C.muted }}>Palpite: {preds[participant.id]?.[stats.bestMatch.id]?.a}×{preds[participant.id]?.[stats.bestMatch.id]?.b} · +{stats.bestPts}pts</div>
            </div>
          )}
          {stats.worstMatch && stats.worstPts === 0 && (
            <div style={{ background: `${C.red}0a`, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: C.red, fontWeight: 700, marginBottom: 4 }}>💔 PIOR JOGO</div>
              <div style={{ fontSize: 13, color: C.text }}>{stats.worstMatch.teamA} × {stats.worstMatch.teamB}</div>
              <div style={{ fontSize: 12, color: C.muted }}>Palpite: {preds[participant.id]?.[stats.worstMatch.id]?.a}×{preds[participant.id]?.[stats.worstMatch.id]?.b} · 0pts</div>
            </div>
          )}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🏆</span>
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Palpite de Campeão</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: champBonus > 0 ? C.gold : C.text }}>
                {champPick || <span style={{ color: C.muted, fontStyle: "italic" }}>Não definido</span>}
                {champBonus > 0 && " ✅"}
                {winner && champPick && champBonus === 0 && " ❌"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── SEÇÃO DE PALPITE DE CAMPEÃO ── */
function ChampionSection({ activePid, participants, isAdmin, onPickChampion, championPts, onSetChampionPts, matches }) {
  const activeUser = participants.find(p => p.id === activePid);
  const winner = getChampionWinner(matches);
  const finalMatch = matches.find(m => m.phase === "Final");
  const champLocked = finalMatch ? isLocked(finalMatch.date) : false;
  const myPick = activeUser?.champion_pick || "";

  return (
    <div style={{ background: C.card, border: `1px solid ${C.gold}55`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>🏆</span>
          <div>
            <div style={{ fontWeight: 900, color: C.gold, fontSize: 14 }}>Palpite do Campeão do Torneio</div>
            <div style={{ fontSize: 11, color: C.muted }}>Vale {championPts} pontos bônus no final</div>
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 5 }}>
            {[15, 20, 30].map(v => (
              <button key={v} onClick={() => onSetChampionPts(v)}
                style={{ ...GHOST_BTN({}), background: championPts === v ? `${C.gold}22` : "none", color: championPts === v ? C.gold : C.muted, borderColor: championPts === v ? `${C.gold}66` : C.border, minHeight: 28, padding: "3px 10px", fontSize: 11 }}>
                {v}pts
              </button>
            ))}
          </div>
        )}
      </div>

      {winner && (
        <div style={{ background: `${C.gold}11`, border: `1px solid ${C.gold}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>🏆 Campeão Confirmado:</div>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, color: C.gold }}>{winner}</div>
        </div>
      )}

      {!champLocked ? (
        <select value={myPick} onChange={e => onPickChampion(activePid, e.target.value)} style={INP({ fontSize: 15 })}>
          <option value="">— Escolha a seleção campeã —</option>
          {ALL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      ) : (
        <div style={{ fontSize: 14, color: C.text, fontWeight: 700, padding: "4px 0" }}>
          Seu palpite registrado: {myPick || <span style={{ color: C.muted, fontStyle: "italic", fontWeight: 400 }}>Não preenchido</span>}
          {winner && myPick && (myPick.toLowerCase().trim() === winner.toLowerCase().trim()
            ? <span style={{ color: C.gold, marginLeft: 8 }}>✅ +{championPts}pts!</span>
            : <span style={{ color: C.red, marginLeft: 8 }}>❌</span>)}
        </div>
      )}
    </div>
  );
}

/* ── MURAL DE PALPITES COMPARTILHADOS ── */
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

/* ── LEGENDA EXPLICATIVA DE REGRAS ── */
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

/* ── BARRA DE FILTRAGEM RÁPIDA DE JOGOS ── */
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

const FILTERS_MAIN = [
  { id: "todos",  label: "Ver Todos" },
  { id: "hoje",   label: "Hoje"      },
  { id: "grupos", label: "Grupos"    },
  { id: "mata",   label: "Mata-Mata" },
];

const PILL = (isActive, color = C.green) => ({
  border: `1px solid ${isActive ? color : C.border}`,
  background: isActive ? `${color}1a` : C.card,
  color: isActive ? color : C.muted,
  borderRadius: 20, padding: "6px 12px", cursor: "pointer",
  fontWeight: 700, fontSize: 12, fontFamily: "inherit",
  whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4,
  transition: "all .15s", flexShrink: 0,
});

function FilterBar({ active, onChange, matches }) {
  const isGrupoActive = active === "grupos" || active.startsWith("grupo-");
  const count = (f) => applyFilter(matches, f).length;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
        {FILTERS_MAIN.map(f => {
          const isActive = f.id === "grupos" ? isGrupoActive : active === f.id;
          const n = f.id === "grupos" ? count("grupos") : count(f.id);
          return (
            <button key={f.id} onClick={() => onChange(f.id)} style={PILL(isActive)}>
              {f.label}
              <span style={{ fontSize: 10, background: isActive ? `${C.green}33` : C.surface, borderRadius: 10, padding: "1px 6px" }}>{n}</span>
            </button>
          );
        })}
      </div>
      {isGrupoActive && (
        <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingTop: 8, paddingBottom: 2, scrollbarWidth: "none" }}>
          <button onClick={() => onChange("grupos")} style={PILL(active === "grupos", C.blue)}>
            Todos os Grupos <span style={{ fontSize: 10, background: active === "grupos" ? `${C.blue}33` : C.surface, borderRadius: 10, padding: "1px 6px" }}>{count("grupos")}</span>
          </button>
          {Object.keys(GRUPOS).map(letter => {
            const filterId = `grupo-${letter}`;
            const isAct = active === filterId;
            return (
              <button key={letter} onClick={() => onChange(filterId)} style={PILL(isAct, C.blue)}>
                Grupo {letter} <span style={{ fontSize: 10, background: isAct ? `${C.blue}33` : C.surface, borderRadius: 10, padding: "1px 6px" }}>{count(filterId)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── ABA 1: TABELA DE RANKING E PREMIAÇÃO GERAL ── */
function TabPlacar({ participants, matches, preds, championPts }) {
  const isMobile = useIsMobile();
  const [statsFor, setStatsFor] = useState(null);
  const ranked = getRanked(participants, matches, preds, championPts);
  const total = participants.length * 100;
  const played = matches.filter(m => m.result).length;
  const medals = ["🥇", "🥈", "🥉"];
  const prizes = [
    { color: C.gold,   pct: "70%", val: Math.round(total * 0.7) },
    { color: C.silver, pct: "20%", val: Math.round(total * 0.2) },
    { color: C.bronze, pct: "10%", val: Math.round(total * 0.1) },
  ];
  const winner = getChampionWinner(matches);
  const recentPlayed = matches.filter(m => m.result).slice(-5).reverse();

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
        {winner && <span style={{ color: C.gold }}>🏆 Vencedor da Copa: {winner}</span>}
      </div>

      {participants.length === 0 && <Empty icon="👥" msg="Nenhum participante cadastrado." />}
      <ScoringLegend />

      {ranked.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 52px" : "44px 1fr 64px 40px 40px 40px", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 10, color: C.muted }}>POS</span>
            <span style={{ fontSize: 10, color: C.muted }}>NOME (Clique para abrir estatísticas)</span>
            <span style={{ fontSize: 10, color: C.muted, textAlign: "right" }}>PONTOS</span>
            {!isMobile && (
              <>
                <span style={{ fontSize: 10, color: C.gold, textAlign: "center" }}>10</span>
                <span style={{ fontSize: 10, color: C.green, textAlign: "center" }}>7</span>
                <span style={{ fontSize: 10, color: C.blue, textAlign: "center" }}>5</span>
              </>
            )}
          </div>
          {ranked.map((p, i) => (
            <div key={p.id} onClick={() => setStatsFor(p)} style={{ display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 52px" : "44px 1fr 64px 40px 40px 40px", gap: 6, padding: isMobile ? "12px 12px" : "14px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none", background: i === 0 ? `${C.gold}0a` : i === 1 ? `${C.silver}0a` : i === 2 ? `${C.bronze}0a` : "transparent", cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", fontSize: i < 3 ? (isMobile ? 17 : 20) : 13, color: i >= 3 ? C.muted : undefined }}>{i < 3 ? medals[i] : `${i + 1}º`}</span>
              <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: isMobile ? 13 : 14 }}>{p.name}</span>
                {!p.paid && <span style={{ fontSize: 9, background: `${C.red}22`, color: C.red, padding: "1px 5px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>Pix Pendente ⚠️</span>}
                {p.champBonus > 0 && <span style={{ fontSize: 9, background: `${C.gold}22`, color: C.gold, padding: "1px 5px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>🏆 +{p.champBonus}</span>}
                {isMobile && (
                  <span style={{ marginLeft: "auto", display: "flex", gap: 5, flexShrink: 0 }}>
                    {p.c10 > 0 && <span style={{ fontSize: 10, color: C.gold }}>🎯×{p.c10}</span>}
                    {p.c7 > 0 && <span style={{ fontSize: 10, color: C.green }}>⭐×{p.c7}</span>}
                  </span>
                )}
              </span>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 22 : 26, display: "flex", alignItems: "center", justifyContent: "flex-end", color: i === 0 ? C.gold : i === 1 ? C.silver : i === 2 ? C.bronze : C.text }}>{p.total}</span>
              {!isMobile && (
                <>
                  <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontWeight: 900 }}>{p.c10 || "—"}</span>
                  <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontWeight: 900 }}>{p.c7 || "—"}</span>
                  <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, fontWeight: 900 }}>{p.c5 || "—"}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {statsFor && (
        <StatsModal participant={statsFor} matches={matches} preds={preds} onClose={() => setStatsFor(null)} championPts={championPts} />
      )}
    </div>
  );
}

/* ── ABA 2: VISUALIZAÇÃO DAS 12 TABELAS DA COPA E RANKING DE 3ºS ── */
function TabTabelas({ matches }) {
  const st = getGroupStandings(matches);
  let thirds = [];
  Object.keys(st).forEach(g => {
    if (st[g][2]) thirds.push({ ...st[g][2], group: g });
  });
  thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || 0);

  return (
    <div>
      <Divider label="Classificação Oficial dos Grupos" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {Object.keys(st).map(g => (
          <div key={g} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ background: C.surface, padding: "8px 12px", fontWeight: 900, color: C.gold, borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
              GRUPO {g}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}`, background: "#0003" }}>
                  <th style={{ padding: "8px", textAlign: "center", width: 30 }}>#</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>Seleção</th>
                  <th style={{ padding: "8px", textAlign: "center", width: 40 }}>Pts</th>
                  <th style={{ padding: "8px", textAlign: "center", width: 30 }}>J</th>
                  <th style={{ padding: "8px", textAlign: "center", width: 40 }}>SG</th>
                </tr>
              </thead>
              <tbody>
                {st[g].map((t, i) => (
                  <tr key={t.team} style={{ borderBottom: `1px solid ${C.border}44` }}>
                    <td style={{ padding: "8px", textAlign: "center", fontWeight: 700, color: i < 2 ? C.green : (i === 2 ? C.blue : C.muted) }}>{i + 1}</td>
                    <td style={{ padding: "8px", fontWeight: 700, color: C.text }}>{t.team}</td>
                    <td style={{ padding: "8px", textAlign: "center", fontWeight: 900, color: C.text }}>{t.pts}</td>
                    <td style={{ padding: "8px", textAlign: "center", color: C.muted }}>{t.pld}</td>
                    <td style={{ padding: "8px", textAlign: "center", color: t.gd > 0 ? C.green : (t.gd < 0 ? C.red : C.muted) }}>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
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
                <th style={{ padding: "10px", textAlign: "center", width: 40 }}>#</th>
                <th style={{ padding: "10px", textAlign: "center", width: 50 }}>Grupo</th>
                <th style={{ padding: "10px", textAlign: "left" }}>Seleção</th>
                <th style={{ padding: "10px", textAlign: "center", width: 60 }}>Pts</th>
                <th style={{ padding: "10px", textAlign: "center", width: 60 }}>SG</th>
                <th style={{ padding: "10px", textAlign: "center", width: 60 }}>GP</th>
              </tr>
            </thead>
            <tbody>
              {thirds.map((t, i) => (
                <tr key={t.team} style={{ borderBottom: `1px solid ${C.border}44`, background: i < 8 ? `${C.blue}08` : "transparent" }}>
                  <td style={{ padding: "10px", textAlign: "center", fontWeight: 900, color: i < 8 ? C.blue : C.muted }}>{i + 1}º</td>
                  <td style={{ padding: "10px", textAlign: "center", color: C.muted, fontWeight: 700 }}>{t.group}</td>
                  <td style={{ padding: "10px", fontWeight: 700, color: i < 8 ? C.text : C.muted }}>{t.team}</td>
                  <td style={{ padding: "10px", textAlign: "center", fontWeight: 900, color: i < 8 ? C.blue : C.muted }}>{t.pts}</td>
                  <td style={{ padding: "10px", textAlign: "center", color: C.text }}>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                  <td style={{ padding: "10px", textAlign: "center", color: C.text }}>{t.gf}</td>
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
  const columns = ["32-avos de Final", "Oitavas de Final", "Quartas de Final", "Semifinal", "Final"];
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

/* ── ABA 4: GERENCIAMENTO DE PERFIS E CADASTROS ── */
function TabParticipantes({ participants, onChange, onDelete, isAdmin }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPin, setEditPin] = useState("");

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

  const togglePaid = (id) => onChange(participants.map((p) => (p.id === id ? { ...p, paid: !p.paid } : p)));

  return (
    <div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12, color: C.text, fontSize: 16 }}>
          {isAdmin ? "⚙️ Adicionar Jogador Manualmente (Admin)" : "👋 Novo por aqui? Cadastre-se no Bolão"}
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu Nome Completo" style={INP({ flex: 1, minWidth: 140 })} />
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Senha (mín. 4)" style={INP({ width: 140, textAlign: "center", letterSpacing: 2 })} />
          <button onClick={add} style={BTN()}>{isAdmin ? "+ Adicionar" : "Me Cadastrar"}</button>
        </div>
        {!isAdmin && <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Guarde sua senha para registrar e alterar seus palpites com segurança. Inscrições pendentes necessitam de validação do Pix.</p>}
      </div>

      {participants.map((p) => (
        <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 8 }}>
          {editingId === p.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={editName} onChange={e => setEditName(e.target.value)} style={INP({ padding: "8px 10px" })} />
              <input type="password" value={editPin} onChange={e => setEditPin(e.target.value)} placeholder="Definir nova senha" style={INP({ padding: "8px 10px", textAlign: "center" })} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => saveEdit(p.id)} style={BTN({ flex: 1 })}>Salvar Alterações</button>
                <button onClick={() => setEditingId(null)} style={GHOST_BTN({ flex: 1 })}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ flex: 1, fontWeight: 700, minWidth: 80, color: C.text }}>{p.name}</span>
              <span style={{ fontSize: 12, color: p.paid ? C.green : C.red, fontWeight: 700 }}>{p.paid ? "✅ Inscrição Paga" : "❌ Pix Pendente"}</span>
              <button onClick={() => startEdit(p)} style={GHOST_BTN({ padding: "6px 12px", minHeight: 36 })}>✏️ Editar</button>
              {isAdmin && (
                <>
                  <button onClick={() => togglePaid(p.id)} style={GHOST_BTN({ padding: "6px 12px", minHeight: 36, borderColor: C.gold, color: C.gold })}>Aprovar Pix</button>
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

/* ── ABA 5: CONTROLE DE JOGOS E GERADORES AUTOMÁTICOS DA FIFA ── */
function TabJogos({ matches, onChange, isAdmin }) {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [phase, setPhase] = useState("Fase de Grupos");
  const [editId, setEditId] = useState(null);
  const [tempR, setTempR] = useState({ a: "", b: "" });
  const [filter, setFilter] = useState("todos");

  const add = () => {
    if (!teamA.trim() || !teamB.trim()) return;
    onChange([...matches, { id: uid(), teamA: teamA.trim(), teamB: teamB.trim(), phase, date: dateStr, result: null }]);
    setTeamA(""); setTeamB(""); setDateStr("");
  };

  const gerarCopaFaseDeGrupos = () => {
    const jaTemGrupos = matches.some(m => m.phase === "Fase de Grupos");
    if (jaTemGrupos) {
      return alert("⚠️ Os jogos da Fase de Grupos já foram gerados! Ação bloqueada para evitar duplicações.");
    }

    if (!window.confirm("Deseja gerar a grade oficial da Copa de 2026 com os horários de Brasília?")) return;

    // 🗓️ CALENDÁRIO OFICIAL 100% MAPEADO
    const SCHEDULE_OFICIAL = [
      { teamA: "México", teamB: "África do Sul", date: "11/06 (Qui) - 16:00" },
      { teamA: "Coreia do Sul", teamB: "República Tcheca", date: "11/06 (Qui) - 23:00" },
      { teamA: "Canadá", teamB: "Bósnia", date: "12/06 (Sex) - 16:00" },
      { teamA: "Estados Unidos", teamB: "Paraguai", date: "12/06 (Sex) - 22:00" },
      { teamA: "Austrália", teamB: "Turquia", date: "13/06 (Sáb) - 01:00" },
      { teamA: "Catar", teamB: "Suíça", date: "13/06 (Sáb) - 16:00" },
      { teamA: "Brasil", teamB: "Marrocos", date: "13/06 (Sáb) - 19:00" },
      { teamA: "Haiti", teamB: "Escócia", date: "13/06 (Sáb) - 22:00" },
      { teamA: "Alemanha", teamB: "Curaçao", date: "14/06 (Dom) - 14:00" },
      { teamA: "Holanda", teamB: "Japão", date: "14/06 (Dom) - 17:00" },
      { teamA: "Costa do Marfim", teamB: "Equador", date: "14/06 (Dom) - 20:00" },
      { teamA: "Suécia", teamB: "Tunísia", date: "14/06 (Dom) - 23:00" },
      { teamA: "Espanha", teamB: "Cabo Verde", date: "15/06 (Seg) - 13:00" },
      { teamA: "Bélgica", teamB: "Egito", date: "15/06 (Seg) - 16:00" },
      { teamA: "Arábia Saudita", teamB: "Uruguai", date: "15/06 (Seg) - 19:00" },
      { teamA: "Irã", teamB: "Nova Zelândia", date: "15/06 (Seg) - 22:00" },
      { teamA: "França", teamB: "Senegal", date: "16/06 (Ter) - 16:00" },
      { teamA: "Bolívia/Iraque", teamB: "Noruega", date: "16/06 (Ter) - 19:00" },
      { teamA: "Argentina", teamB: "Argélia", date: "16/06 (Ter) - 22:00" },
      { teamA: "Áustria", teamB: "Jordânia", date: "17/06 (Qua) - 01:00" },
      { teamA: "Portugal", teamB: "RD Congo", date: "17/06 (Qua) - 14:00" },
      { teamA: "Inglaterra", teamB: "Croácia", date: "17/06 (Qua) - 17:00" },
      { teamA: "Gana", teamB: "Panamá", date: "17/06 (Qua) - 20:00" },
      { teamA: "Uzbequistão", teamB: "Colômbia", date: "17/06 (Qua) - 23:00" },
      { teamA: "República Tcheca", teamB: "África do Sul", date: "18/06 (Qui) - 13:00" },
      { teamA: "Suíça", teamB: "Bósnia", date: "18/06 (Qui) - 16:00" },
      { teamA: "Canadá", teamB: "Catar", date: "18/06 (Qui) - 19:00" },
      { teamA: "México", teamB: "Coreia do Sul", date: "18/06 (Qui) - 22:00" },
      { teamA: "Turquia", teamB: "Paraguai", date: "19/06 (Sex) - 01:00" },
      { teamA: "Estados Unidos", teamB: "Austrália", date: "19/06 (Sex) - 16:00" },
      { teamA: "Escócia", teamB: "Marrocos", date: "19/06 (Sex) - 19:00" },
      { teamA: "Brasil", teamB: "Haiti", date: "19/06 (Sex) - 22:00" },
      { teamA: "Holanda", teamB: "Suécia", date: "20/06 (Sáb) - 14:00" },
      { teamA: "Alemanha", teamB: "Costa do Marfim", date: "20/06 (Sáb) - 17:00" },
      { teamA: "Equador", teamB: "Curaçao", date: "20/06 (Sáb) - 21:00" },
      { teamA: "Tunísia", teamB: "Japão", date: "21/06 (Dom) - 01:00" },
      { teamA: "Espanha", teamB: "Arábia Saudita", date: "21/06 (Dom) - 13:00" },
      { teamA: "Bélgica", teamB: "Irã", date: "21/06 (Dom) - 16:00" },
      { teamA: "Uruguai", teamB: "Cabo Verde", date: "21/06 (Dom) - 19:00" },
      { teamA: "Nova Zelândia", teamB: "Egito", date: "21/06 (Dom) - 22:00" },
      { teamA: "Argentina", teamB: "Áustria", date: "22/06 (Seg) - 14:00" },
      { teamA: "França", teamB: "Bolívia/Iraque", date: "22/06 (Seg) - 18:00" },
      { teamA: "Noruega", teamB: "Senegal", date: "22/06 (Seg) - 21:00" },
      { teamA: "Jordânia", teamB: "Argélia", date: "23/06 (Ter) - 00:00" },
      { teamA: "Portugal", teamB: "Uzbequistão", date: "23/06 (Ter) - 14:00" },
      { teamA: "Inglaterra", teamB: "Gana", date: "23/06 (Ter) - 17:00" },
      { teamA: "Panamá", teamB: "Croácia", date: "23/06 (Ter) - 20:00" },
      { teamA: "Colômbia", teamB: "RD Congo", date: "23/06 (Ter) - 23:00" },
      { teamA: "Suíça", teamB: "Canadá", date: "24/06 (Qua) - 16:00" },
      { teamA: "Bósnia", teamB: "Catar", date: "24/06 (Qua) - 16:00" },
      { teamA: "Escócia", teamB: "Brasil", date: "24/06 (Qua) - 19:00" },
      { teamA: "Marrocos", teamB: "Haiti", date: "24/06 (Qua) - 19:00" },
      { teamA: "República Tcheca", teamB: "México", date: "24/06 (Qua) - 22:00" },
      { teamA: "África do Sul", teamB: "Coreia do Sul", date: "24/06 (Qua) - 22:00" },
      { teamA: "Equador", teamB: "Alemanha", date: "25/06 (Qui) - 17:00" },
      { teamA: "Curaçao", teamB: "Costa do Marfim", date: "25/06 (Qui) - 17:00" },
      { teamA: "Tunísia", teamB: "Holanda", date: "25/06 (Qui) - 20:00" },
      { teamA: "Japão", teamB: "Suécia", date: "25/06 (Qui) - 20:00" },
      { teamA: "Turquia", teamB: "Estados Unidos", date: "25/06 (Qui) - 23:00" },
      { teamA: "Paraguai", teamB: "Austrália", date: "25/06 (Qui) - 23:00" },
      { teamA: "Noruega", teamB: "França", date: "26/06 (Sex) - 16:00" },
      { teamA: "Senegal", teamB: "Bolívia/Iraque", date: "26/06 (Sex) - 16:00" },
      { teamA: "Uruguai", teamB: "Espanha", date: "26/06 (Sex) - 21:00" },
      { teamA: "Cabo Verde", teamB: "Arábia Saudita", date: "26/06 (Sex) - 21:00" },
      { teamA: "Egito", teamB: "Irã", date: "27/06 (Sáb) - 00:00" },
      { teamA: "Nova Zelândia", teamB: "Bélgica", date: "27/06 (Sáb) - 00:00" },
      { teamA: "Panamá", teamB: "Inglaterra", date: "27/06 (Sáb) - 18:00" },
      { teamA: "Croácia", teamB: "Gana", date: "27/06 (Sáb) - 18:00" },
      { teamA: "Colômbia", teamB: "Portugal", date: "27/06 (Sáb) - 20:30" },
      { teamA: "RD Congo", teamB: "Uzbequistão", date: "27/06 (Sáb) - 20:30" },
      { teamA: "Jordânia", teamB: "Argentina", date: "27/06 (Sáb) - 23:00" },
      { teamA: "Argélia", teamB: "Áustria", date: "27/06 (Sáb) - 23:00" }
    ];

    const novosJogos = [...matches];
    SCHEDULE_OFICIAL.forEach(m => {
      novosJogos.push({ id: uid(), teamA: m.teamA, teamB: m.teamB, phase: "Fase de Grupos", date: m.date, result: null });
    });
    
    onChange(novosJogos);
    alert("✅ Grade oficial de 72 partidas injetada no banco de dados!");
  };

  const gerarMataMata = () => {
    const groupMatches = matches.filter(m => m.phase === "Fase de Grupos" && m.result);
    if (groupMatches.length < 72) {
      if(!window.confirm("Atenção: Nem todos os 72 confrontos dos grupos terminaram. O motor vai gerar a chave com os classificados atuais. Avançar?")) return;
    }

    const st = getGroupStandings(matches);
    const firsts = {}, seconds = {};
    let thirdsList = [];
    Object.keys(st).forEach(g => {
      firsts[g] = st[g][0];
      seconds[g] = st[g][1];
      if(st[g][2]) thirdsList.push({ ...st[g][2], group: g });
    });
    thirdsList = thirdsList.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || 0).slice(0, 8);

    const targets = ["A", "B", "D", "E", "G", "I", "K", "L"];
    const allowed = { 
      "A": ["C","E","F","H","I"], "B": ["E","F","G","I","J"], "D": ["B","E","F","I","J"], 
      "E": ["A","B","C","D","F"], "G": ["A","E","H","I","J"], "I": ["C","D","F","G","H"], 
      "K": ["D","E","I","J","L"], "L": ["E","H","I","J","K"] 
    };

    let bestAssign = null;
    function solve(idx, current) {
      if (bestAssign) return;
      if (idx === targets.length) { bestAssign = { ...current }; return; }
      const t = targets[idx];
      for (let i = 0; i < thirdsList.length; i++) {
        const th = thirdsList[i];
        if (!Object.values(current).find(x => x.team === th.team) && (allowed[t].includes(th.group) || th.group !== t)) {
          current[t] = th; solve(idx + 1, current); delete current[t];
        }
      }
    }
    solve(0, {});
    
    if (!bestAssign) {
      bestAssign = {}; let available = [...thirdsList];
      targets.forEach(t => { 
        const foundIdx = available.findIndex(x => x.group !== t); 
        if (foundIdx > -1) { bestAssign[t] = available[foundIdx]; available.splice(foundIdx, 1); } 
        else { bestAssign[t] = available[0]; available.splice(0, 1); } 
      });
    }

    const r32 = [
      { tA: firsts["A"].team, tB: bestAssign["A"].team }, { tA: firsts["B"].team, tB: bestAssign["B"].team },
      { tA: firsts["C"].team, tB: seconds["F"].team }, { tA: firsts["D"].team, tB: bestAssign["D"].team },
      { tA: firsts["E"].team, tB: bestAssign["E"].team }, { tA: firsts["F"].team, tB: seconds["C"].team },
      { tA: firsts["G"].team, tB: bestAssign["G"].team }, { tA: firsts["H"].team, tB: seconds["J"].team },
      { tA: firsts["I"].team, tB: bestAssign["I"].team }, { tA: firsts["J"].team, tB: seconds["H"].team },
      { tA: firsts["K"].team, tB: bestAssign["K"].team }, { tA: firsts["L"].team, tB: bestAssign["L"].team },
      { tA: seconds["A"].team, tB: seconds["B"].team }, { tA: seconds["D"].team, tB: seconds["E"].team },
      { tA: seconds["G"].team, tB: seconds["I"].team }, { tA: seconds["K"].team, tB: seconds["L"].team }
    ];

    // 🗓️ DATAS OFICIAIS DOS 32-AVOS 
    const R32_DATES = [
      "28/06 (Dom) - 16:00", "29/06 (Seg) - 14:00", "29/06 (Seg) - 17:30", "29/06 (Seg) - 22:00",
      "30/06 (Ter) - 14:00", "30/06 (Ter) - 18:00", "30/06 (Ter) - 22:00", "01/07 (Qua) - 13:00",
      "01/07 (Qua) - 17:00", "01/07 (Qua) - 21:00", "02/07 (Qui) - 16:00", "02/07 (Qui) - 20:00",
      "03/07 (Sex) - 00:00", "03/07 (Sex) - 15:00", "03/07 (Sex) - 19:00", "03/07 (Sex) - 22:30"
    ];

    const novos = [...matches];
    r32.forEach((m, index) => { 
      novos.push({ id: uid(), teamA: m.tA, teamB: m.tB, phase: "32-avos de Final", date: R32_DATES[index], result: null }); 
    });
    onChange(novos);
    alert("🔥 Confrontos de eliminação direta (32-avos) mapeados com sucesso nos horários de Brasília!");
  };

  const startEdit = (m) => { setEditId(m.id); setTempR(m.result ? { a: String(m.result.a), b: String(m.result.b) } : { a: "", b: "" }); };
  const saveResult = (id) => { 
    const a = parseInt(tempR.a), b = parseInt(tempR.b); 
    if (!isNaN(a) && !isNaN(b) && a >= 0 && b >= 0) onChange(matches.map((m) => (m.id === id ? { ...m, result: { a, b } } : m))); 
    setEditId(null); 
  };
  const clearResult = (id) => { onChange(matches.map((m) => (m.id === id ? { ...m, result: null } : m))); setEditId(null); };

  const filtered = applyFilter(matches, filter);
  const grouped = PHASES.map((ph) => ({ ph, ms: filtered.filter((m) => m.phase === ph) })).filter((g) => g.ms.length);

  return (
    <div>
      {isAdmin && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 14, color: C.text }}>Mecanismo de Grade de Jogos</h3>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button onClick={gerarCopaFaseDeGrupos} style={BTN({ background: C.surface, color: C.text, border: `1px solid ${C.border}`, fontSize: 12, padding: "6px 12px", minHeight: 32 })}>1️⃣ Montar Grupos</button>
              <button onClick={gerarMataMata} style={BTN({ background: C.gold, color: "#000", fontSize: 12, padding: "6px 12px", minHeight: 32 })}>⚡ Cruzar Chaves</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="Mandante" style={INP()} />
            <div style={{ textAlign: "center", color: C.muted, fontWeight: 900 }}>×</div>
            <input value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="Visitante" style={INP()} />
          </div>
          <input value={dateStr} onChange={(e) => setDateStr(e.target.value)} placeholder="Data e Horário (ex: 11/06 (Qui) - 16:00)" style={INP({ marginBottom: 10 })} />
          <div style={{ display: "flex", gap: 8 }}>
            <select value={phase} onChange={(e) => setPhase(e.target.value)} style={INP({ flex: 1 })}>{PHASES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            <button onClick={add} style={BTN()}>+ Jogo Manual</button>
          </div>
        </div>
      )}
      {!isAdmin && <div style={{ marginBottom: 16, color: C.gold, fontSize: 13 }}>⚠️ Painel restrito. Apenas o administrador atualiza os resultados de campo.</div>}
      
      <FilterBar active={filter} onChange={setFilter} matches={matches} />
      {grouped.length === 0 && <Empty icon="📅" msg="Nenhum jogo localizado sob este escopo de filtro." />}
      
      {grouped.map(({ ph, ms }) => (
        <div key={ph} style={{ marginBottom: 24 }}>
          <Divider label={`${ph} (${ms.length})`} />
          {ms.map((m) => (
            <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              {m.date && <span style={{ fontSize: 11, color: isLocked(m.date) ? C.red : C.greenDim, fontWeight: 700 }}>{m.date}{isLocked(m.date) ? " (Encerrado)" : ""}</span>}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {editId === m.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: C.text }}>{m.teamA}</span>
                      <ScoreIn value={tempR.a} onChange={(v) => setTempR((t) => ({ ...t, a: v }))} />
                      <span style={{ color: C.muted }}>×</span>
                      <ScoreIn value={tempR.b} onChange={(v) => setTempR((t) => ({ ...t, b: v }))} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "right", color: C.text }}>{m.teamB}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => saveResult(m.id)} style={BTN({ flex: 1, fontSize: 13 })}>✓ Salvar Placar</button>
                      <button onClick={() => clearResult(m.id)} style={GHOST_BTN({ flex: 1, color: C.red, borderColor: `${C.red}66` })}>Limpar Jogo</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: C.text }}>{m.teamA}</span>
                    {m.result ? (
                      <button onClick={() => isAdmin && startEdit(m)} style={{ background: `${C.green}12`, border: `1px solid ${C.greenDim}`, borderRadius: 8, color: C.green, cursor: isAdmin ? "pointer" : "default", padding: "5px 18px", fontFamily: "'Bebas Neue', cursive", fontSize: 20 }}>
                        {m.result.a} × {m.result.b}
                      </button>
                    ) : (
                      <button onClick={() => isAdmin && startEdit(m)} style={GHOST_BTN({ padding: "6px 14px", visibility: isAdmin ? "visible" : "hidden" })}>+ Inserir Placar</button>
                    )}
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "right", color: C.text }}>{m.teamB}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── ABA 6: PORTAL DE PALPITES (PROTEÇÃO POR PIN DA SESSÃO) ── */
function TabPalpites({ participants, matches, preds, onChange, savePin, sessionUnlocked, setSessionUnlocked, onSaved, isAdmin, onPickChampion, championPts, onSetChampionPts }) {
  const isMobile = useIsMobile();
  const [selPid, setSelPid] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [filter, setFilter] = useState("hoje");

  const activePid = participants.find((p) => p.id === selPid)?.id || participants[0]?.id || "";
  const activeUser = participants.find((p) => p.id === activePid);

  const setPred = (matchId, side, val) => {
    if (!activePid) return;
    const next = { ...preds, [activePid]: { ...preds[activePid], [matchId]: { ...(preds[activePid]?.[matchId] || {}), [side]: val } } };
    onChange(next);
    onSaved();
  };

  const handleUnlock = () => {
    if (!activeUser.pin) {
      if (pinInput.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!");
      savePin(activeUser.id, pinInput);
      setSessionUnlocked({ ...sessionUnlocked, [activeUser.id]: true });
    } else {
      if (activeUser.pin === pinInput) setSessionUnlocked({ ...sessionUnlocked, [activeUser.id]: true });
      else alert("Senha de acesso incorreta!");
    }
  };

  if (participants.length === 0) return <Empty icon="👥" msg="Aguardando cadastros na aba de participantes." />;
  if (matches.length === 0) return <Empty icon="⚽" msg="Nenhum jogo disponível na grade." />;

  const stats = activePid ? getStats(activePid, matches, preds) : null;
  const isUnlocked = sessionUnlocked[activePid];

  const pendingCount = matches.filter(m => {
    if (isLocked(m.date)) return false;
    const p = preds[activePid]?.[m.id];
    return !(p && p.a !== "" && p.b !== "" && p.a != null && p.b != null);
  }).length;

  const filteredMatches = applyFilter(matches, filter);
  const grouped = PHASES.map((ph) => ({ ph, ms: filteredMatches.filter((m) => m.phase === ph) })).filter((g) => g.ms.length);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {isMobile ? (
          <select value={activePid} onChange={e => { setSelPid(e.target.value); setPinInput(""); }} style={INP({ fontSize: 15, fontWeight: 700 })}>
            {participants.map((p) => (<option key={p.id} value={p.id}>{p.name} {sessionUnlocked[p.id] ? "🔓" : "🔒"}</option>))}
          </select>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {participants.map((p) => (
              <button key={p.id} onClick={() => { setSelPid(p.id); setPinInput(""); }} style={{ border: `1px solid ${activePid === p.id ? C.green : C.border}`, background: activePid === p.id ? `${C.green}1a` : C.card, color: activePid === p.id ? C.green : C.muted, borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>
                {p.name} {sessionUnlocked[p.id] ? "🔓" : "🔒"}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isUnlocked ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 20px", textAlign: "center", marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
          <h3 style={{ marginBottom: 8, color: C.text }}>{activeUser?.pin ? "Identidade Protegida" : "Criar Senha de Validação"}</h3>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
            {activeUser?.pin ? `Digite a senha secreta do(a) ${activeUser.name} para abrir os inputs.` : "Este é o primeiro acesso deste perfil. Cadastre uma senha agora para travar suas alterações."}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", maxWidth: 300, margin: "0 auto" }}>
            <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleUnlock()} placeholder="PIN" style={INP({ textAlign: "center", letterSpacing: 3 })} />
            <button onClick={handleUnlock} style={BTN()}>{activeUser?.pin ? "Desbloquear" : "Salvar Senha"}</button>
          </div>
        </div>
      ) : (
        <>
          {stats && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 30, color: C.gold }}>{stats.total}</span>
              <span style={{ color: C.muted, fontSize: 13 }}>pontos</span>
              <span style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>🎯 {stats.c10}</span>
              <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>⭐ {stats.c7}</span>
              <span style={{ color: C.blue, fontWeight: 700, fontSize: 13 }}>✅ {stats.c5}</span>
              {pendingCount > 0 && (
                <span style={{ marginLeft: "auto", background: `${C.gold}1a`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                  ⚠️ {pendingCount} pendentes de palpite
                </span>
              )}
            </div>
          )}

          <ChampionSection activePid={activePid} participants={participants} matches={matches} isAdmin={isAdmin} onPickChampion={onPickChampion} championPts={championPts} onSetChampionPts={onSetChampionPts} />
          <FilterBar active={filter} onChange={setFilter} matches={matches} />

          {grouped.length === 0 && <Empty icon="📅" msg="Nenhuma partida agendada neste filtro." />}
          {grouped.map(({ ph, ms }) => (
            <div key={ph} style={{ marginBottom: 24 }}>
              <Divider label={ph} />
              {ms.map((m) => {
                const pred = preds[activePid]?.[m.id] || {};
                const pts = m.result ? calcPts(pred, m.result) : null;
                const locked = isLocked(m.date);
                return (
                  <div key={m.id} style={{ background: C.card, border: `1px solid ${locked ? C.border : C.greenDim + "33"}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                    {m.date && <span style={{ fontSize: 11, color: locked ? C.red : C.greenDim, fontWeight: 700 }}>{m.date}{locked ? " (Tempo Esgotado)" : ""}</span>}
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

/* ── ABA 7: VISÃO GERAL MATRIX (TABELA DE AUDITORIA CRUZADA) ── */
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
            <th style={{ padding: "10px 12px", textAlign: "left", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>Partida</th>
            <th style={{ padding: "10px 8px", textAlign: "center", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}`, width: 80 }}>Oficial</th>
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
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 11, color: hasPred ? C.text : C.border }}>{hasPred ? `${pred.a}×${pred.b}` : "—"}</span>
                      <PtsBadge pts={pts} />
                    </div>
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

/* ── NÚCLEO CENTRAL DA APLICAÇÃO (APP SHELL CONTAINER) ── */
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

  useEffect(() => {
    (async () => {
      try {
        const { data: dbParticipants } = await supabase.from('participantes').select('*');
        if (dbParticipants) setParticipants(dbParticipants);

        const { data: dbJogos } = await supabase.from('jogos').select('*');
        if (dbJogos && dbJogos.length > 0) {
          setMatches(dbJogos.map(j => ({
            id: j.id, teamA: j.team_a, teamB: j.team_b, phase: j.phase, date: j.match_date,
            result: (j.result_a !== null && j.result_b !== null) ? { a: j.result_a, b: j.result_b } : null,
          })));
        }

        const { data: dbPalpites } = await supabase.from('palpites').select('*');
        if (dbPalpites) {
          const objPreds = {};
          dbPalpites.forEach(p => {
            if (!objPreds[p.participante_id]) objPreds[p.participante_id] = {};
            objPreds[p.participante_id][p.jogo_id] = { a: p.palpite_a, b: p.palpite_b };
          });
          setPreds(objPreds);
        }

        const { data: cfg } = await supabase.from('config').select('valor').eq('chave', 'champion_pts').single();
        if (cfg?.valor) setChampionPts(parseInt(cfg.valor));
      } catch (err) { console.error("Erro na leitura das tabelas do Supabase:", err); }
      setReady(true);
    })();
  }, []);

  const sp = async (d) => { setParticipants(d); await supabase.from('participantes').upsert(d); };
  
  const removeP = async (id) => { 
    setParticipants(p => p.filter(x => x.id !== id)); 
    await supabase.from('participantes').delete().eq('id', id); 
  };
  
  const sm = async (d) => {
    setMatches(d);
    await supabase.from('jogos').upsert(d.map(j => ({ id: j.id, team_a: j.teamA, team_b: j.teamB, phase: j.phase, match_date: j.date || "TBD", result_a: j.result ? j.result.a : null, result_b: j.result ? j.result.b : null })));
  };

  const spr = async (d) => {
    setPreds(d);
    const toSave = [];
    Object.keys(d).forEach(participante_id => {
      Object.keys(d[participante_id]).forEach(jogo_id => {
        const p = d[participante_id][jogo_id];
        if (p.a !== "" && p.b !== "" && p.a != null && p.b != null)
          toSave.push({ participante_id, jogo_id, palpite_a: parseInt(p.a), palpite_b: parseInt(p.b) });
      });
    });
    if (toSave.length > 0) await supabase.from('palpites').upsert(toSave, { onConflict: 'participante_id, jogo_id' });
  };

  const savePin = async (userId, pin) => {
    setParticipants(p => p.map(x => x.id === userId ? { ...x, pin } : x));
    await supabase.from('participantes').update({ pin }).eq('id', userId);
  };

  const onPickChampion = async (pid, pick) => {
    const updated = participants.map(p => p.id === pid ? { ...p, champion_pick: pick } : p);
    setParticipants(updated);
    await supabase.from('participantes').update({ champion_pick: pick }).eq('id', pid);
  };

  const onSetChampionPts = async (pts) => {
    setChampionPts(pts);
    await supabase.from('config').upsert({ chave: 'champion_pts', valor: String(pts) });
  };

  const handleAdminLogin = () => {
    if (isAdmin) { setIsAdmin(false); return; }
    const pwd = prompt("Área técnica restrita. Chave do Administrador:");
    if (pwd === "bruno2026") setIsAdmin(true);
    else if (pwd !== null) alert("Acesso negado: Credencial incorreta.");
  };

  const showToast = () => {
    if (toast) return;
    setToast("✓ Palpite gravado na nuvem!");
  };

  const TABS = [
    { id: "placar",        label: "🏆 Placar" },
    { id: "palpites",      label: "📋 Palpites" },
    { id: "tabelas",       label: "📊 Tabelas" },
    { id: "chaveamento",   label: "🌳 Chaveamento" },
    { id: "visao",         label: "👁️ Auditoria" },
    { id: "jogos",         label: "⚽ Painel Jogos" },
    { id: "participantes", label: "👥 Jogadores" },
  ];

  if (!ready) {
    return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontFamily: "sans-serif", fontSize: 18, fontWeight: 700 }}>⚽ Sincronizando tabelas com o Supabase...</div>;
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Nunito', system-ui, sans-serif", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;600;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, button, textarea { font-family: 'Nunito', system-ui, sans-serif; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        select { -webkit-appearance: none; appearance: none; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ padding: isMobile ? "10px 14px" : "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div onDoubleClick={handleAdminLogin} style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 22 : 26, letterSpacing: 3, color: isAdmin ? C.red : C.gold, cursor: "pointer" }} title="Duplo clique para Admin">
            ⚽ BOLÃO DA COPA 2026 {isAdmin && "<ADMIN>"}
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={{ background: `${C.gold}1a`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 20, padding: "4px 12px", fontWeight: 700, fontSize: isMobile ? 11 : 13 }}>
              Caixa: R$ {(participants.length * 100).toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", background: C.surface, overflowX: "auto", scrollbarWidth: "none" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ border: "none", cursor: "pointer", padding: isMobile ? "10px 12px" : "12px 18px", whiteSpace: "nowrap", background: "transparent", color: tab === t.id ? C.green : C.muted, borderBottom: `2px solid ${tab === t.id ? C.green : "transparent"}`, fontWeight: 700, fontSize: isMobile ? 12 : 13, fontFamily: "inherit", transition: "color .15s", flex: isMobile ? "1 0 auto" : undefined }}>
              {isMobile ? t.label.split(" ")[0] : t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "16px 12px" : "20px 16px", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
        {tab === "placar"        && <TabPlacar participants={participants} matches={matches} preds={preds} championPts={championPts} />}
        {tab === "tabelas"       && <TabTabelas matches={matches} />}
        {tab === "chaveamento"   && <TabChaveamento matches={matches} />}
        {tab === "participantes" && <TabParticipantes participants={participants} onChange={sp} onDelete={removeP} isAdmin={isAdmin} />}
        {tab === "jogos"         && <TabJogos matches={matches} onChange={sm} isAdmin={isAdmin} />}
        {tab === "palpites"      && <TabPalpites participants={participants} matches={matches} preds={preds} onChange={spr} savePin={savePin} sessionUnlocked={sessionUnlocked} setSessionUnlocked={setSessionUnlocked} onSaved={showToast} isAdmin={isAdmin} onPickChampion={onPickChampion} championPts={championPts} onSetChampionPts={onSetChampionPts} />}
        {tab === "visao"         && <TabVisao participants={participants} matches={matches} preds={preds} championPts={championPts} />}
      </div>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
