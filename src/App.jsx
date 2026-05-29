import { useState, useEffect } from "react";
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
      const champBonus = (winner && p.champion_pick &&
        p.champion_pick.toLowerCase().trim() === winner.toLowerCase().trim()) ? championPts : 0;
      return { ...p, ...stats, total: stats.total + champBonus, champBonus };
    })
    .sort((a, b) => b.total - a.total || b.c10 - a.c10 || b.c7 - a.c7 || b.c5 - a.c5);
}

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

const PHASES = ["Fase de Grupos", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Final"];

/* ── Design tokens ── */
const C = {
  bg: "#06090a", surface: "#0b1015", card: "#10171d", cardHover: "#141e26",
  border: "#1b2c38", green: "#00e676", greenDim: "#00a152", gold: "#ffca28",
  silver: "#90a4ae", bronze: "#ff8f00", text: "#cce8d4", muted: "#4a6a5a",
  red: "#ff5252", blue: "#40c4ff", input: "#0c1820",
};

/* ── Shared styles ── */
const INP = (extra = {}) => ({
  background: C.input, border: `1px solid ${C.border}`, borderRadius: 8,
  color: C.text, padding: "10px 12px", fontSize: 16, fontFamily: "inherit",
  outline: "none", width: "100%", boxSizing: "border-box", ...extra,
});
const BTN = (extra = {}) => ({
  background: C.greenDim, border: "none", borderRadius: 8, color: "#fff",
  padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  fontFamily: "inherit", whiteSpace: "nowrap", minHeight: 44, display: "inline-flex",
  alignItems: "center", justifyContent: "center", ...extra,
});
const GHOST_BTN = (extra = {}) => ({
  background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted,
  padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", ...extra,
});

const ptsColor = { 10: C.gold, 7: C.green, 5: C.blue, 2: C.bronze, 0: C.muted };
const ptsBg   = { 10: "#1a1200", 7: "#001a0d", 5: "#001428", 2: "#1a0a00", 0: "#101a17" };

/* ── Sub-components ── */
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

/* ── Toast ── */
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

/* ── Stats Modal (Atualizado com Conquistas) ── */
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

  // 🏆 LÓGICA DO SISTEMA DE CONQUISTAS
  const badges = [];
  if (stats.c10 >= 3) badges.push({ icon: "🎯", name: "Sniper", desc: "3+ placares exatos" });
  if (stats.streak >= 4) badges.push({ icon: "🔥", name: "On Fire", desc: "Série de 4+ acertos" });
  if (stats.c0 >= 5) badges.push({ icon: "🥶", name: "Pé Frio", desc: "5+ palpites zerados" });
  if (stats.accuracy >= 60 && stats.withPredCount >= 5) badges.push({ icon: "🔮", name: "Mãe Dináh", desc: "+60% de precisão" });
  if (stats.withPredCount >= 20) badges.push({ icon: "🎖️", name: "Veterano", desc: "20+ palpites" });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
        
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: C.text }}>{participant.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {stats.withPredCount} palpites · {stats.accuracy}% acerto · 🔥 série de {stats.streak}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Total pts */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 48, color: C.gold, lineHeight: 1 }}>{totalWithChamp}</span>
          <span style={{ color: C.muted, fontSize: 13 }}>pontos</span>
          {champBonus > 0 && <span style={{ fontSize: 12, background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "2px 8px" }}>+{champBonus} campeão 🏆</span>}
        </div>

        {/* 🏅 Galeria de Conquistas */}
        {badges.length > 0 && (
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, background: `${C.surface}` }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Conquistas Desbloqueadas</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {badges.map(badge => (
                <div key={badge.name} style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, padding: "6px 10px", borderRadius: 20 }}>
                  <span style={{ fontSize: 16 }}>{badge.icon}</span>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{badge.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Breakdown bars */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Breakdown</div>
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

        {/* Best / Worst / Champion */}
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

/* ── Champion Section ── */
const GRUPOS = {
  A: ["México", "África do Sul", "Coreia do Sul", "República Tcheca"],
  B: ["Canadá", "Bósnia", "Catar", "Suíça"],
  C: ["Brasil", "Marrocos", "Haiti", "Escócia"],
  D: ["Estados Unidos", "Paraguai", "Austrália", "Turquia"],
  E: ["Alemanha", "Curaçao", "Costa do Marfim", "Equador"],
  F: ["Holanda", "Japão", "Suécia", "Tunísia"],
  G: ["Bélgica", "Egito", "Irã", "Nova Zelândia"],
  H: ["Espanha", "Cabo Verde", "Arábia Saudita", "Uruguai"],
  I: ["França", "Senegal", "Noruega", "Repescagem Intercontinental 2"],
  J: ["Argentina", "Argélia", "Áustria", "Jordânia"],
  K: ["Portugal", "RD Congo", "Uzbequistão", "Colômbia"],
  L: ["Inglaterra", "Croácia", "Gana", "Panamá"],
};
const ALL_TEAMS = Object.values(GRUPOS).flat().sort();

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
            <div style={{ fontWeight: 900, color: C.gold, fontSize: 14 }}>Palpite do Campeão</div>
            <div style={{ fontSize: 11, color: C.muted }}>Vale {championPts} pontos bônus</div>
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
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>🏆 Campeão da Copa</div>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, color: C.gold }}>{winner}</div>
        </div>
      )}

      {!champLocked ? (
        <select value={myPick} onChange={e => onPickChampion(activePid, e.target.value)} style={INP({ fontSize: 15 })}>
          <option value="">— Escolha o campeão —</option>
          {ALL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      ) : (
        <div style={{ fontSize: 14, color: C.text, fontWeight: 700, padding: "4px 0" }}>
          Seu palpite: {myPick || <span style={{ color: C.muted, fontStyle: "italic", fontWeight: 400 }}>Não registrado</span>}
          {winner && myPick && (myPick.toLowerCase().trim() === winner.toLowerCase().trim()
            ? <span style={{ color: C.gold, marginLeft: 8 }}>✅ +{championPts}pts!</span>
            : <span style={{ color: C.red, marginLeft: 8 }}>❌</span>)}
        </div>
      )}
    </div>
  );
}

/* ── Post-Game Mural ── */
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
        {open ? "Fechar palpites" : "Ver palpites de todos"}
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

/* ── Scoring Legend ── */
const RULES = [
  { pts: 10, icon: "🎯", label: "Placar Exato",      desc: "Acertou o resultado completo" },
  { pts:  7, icon: "⭐", label: "Tendência + Gols",  desc: "Acertou o vencedor e gols de um time" },
  { pts:  5, icon: "✅", label: "Tendência Simples", desc: "Acertou só o vencedor (ou empate)" },
  { pts:  2, icon: "〰️", label: "Gols de um time",   desc: "Errou o vencedor, mas acertou gols de um" },
  { pts:  0, icon: "❌", label: "Erro Total",        desc: "Não acertou nada" },
];

function ScoringLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>📖 Como funciona a pontuação?</span>
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

/* ── Filter bar ── */
const MATA_MATA = ["Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Final"];

const TEAM_TO_GROUP = {};
Object.entries(GRUPOS).forEach(([letter, teams]) => {
  teams.forEach(team => { TEAM_TO_GROUP[team.toLowerCase()] = letter; });
});

function getMatchGroup(match) {
  if (match.phase !== "Fase de Grupos") return null;
  const a = (match.teamA || "").toLowerCase(), b = (match.teamB || "").toLowerCase();
  if (TEAM_TO_GROUP[a]) return TEAM_TO_GROUP[a];
  if (TEAM_TO_GROUP[b]) return TEAM_TO_GROUP[b];
  for (const [key, letter] of Object.entries(TEAM_TO_GROUP)) {
    if (a.includes(key) || key.includes(a) || b.includes(key) || key.includes(b)) return letter;
  }
  return null;
}

function todayDDMM() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}

function applyFilter(matches, filter) {
  if (filter === "hoje")           return matches.filter(m => m.date && m.date.startsWith(todayDDMM()));
  if (filter === "grupos")         return matches.filter(m => m.phase === "Fase de Grupos");
  if (filter === "mata")           return matches.filter(m => MATA_MATA.includes(m.phase));
  if (filter.startsWith("grupo-")) return matches.filter(m => getMatchGroup(m) === filter.split("-")[1]);
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
            Todos<span style={{ fontSize: 10, background: active === "grupos" ? `${C.blue}33` : C.surface, borderRadius: 10, padding: "1px 6px" }}>{count("grupos")}</span>
          </button>
          {Object.keys(GRUPOS).map(letter => {
            const filterId = `grupo-${letter}`;
            const isAct = active === filterId;
            return (
              <button key={letter} onClick={() => onChange(filterId)} style={PILL(isAct, C.blue)}>
                {letter}<span style={{ fontSize: 10, background: isAct ? `${C.blue}33` : C.surface, borderRadius: 10, padding: "1px 6px" }}>{count(filterId)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Tabs ── */
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
      {/* Prize cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: isMobile ? 8 : 12, marginBottom: 20 }}>
        {prizes.map((pr, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${pr.color}44`, borderRadius: 12, padding: isMobile ? "10px 6px" : "14px 10px", textAlign: "center" }}>
            <div style={{ fontSize: isMobile ? 20 : 26, marginBottom: 4 }}>{medals[i]}</div>
            <div style={{ fontSize: isMobile ? 10 : 11, color: C.muted }}>{i === 0 ? "1º" : i === 1 ? "2º" : "3º"} ({pr.pct})</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 16 : 22, letterSpacing: 1, color: pr.color, marginTop: 4 }}>R$ {pr.val.toLocaleString("pt-BR")}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>⚽ {played}/{matches.length} com resultado</span>
        <span>💰 R$ {total.toLocaleString("pt-BR")}</span>
        <span>👥 {participants.length}</span>
        {winner && <span style={{ color: C.gold }}>🏆 {winner}</span>}
      </div>

      {participants.length === 0 && <Empty icon="👥" msg="Nenhum participante." />}
      <ScoringLegend />

      {/* Ranking */}
      {ranked.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 52px" : "44px 1fr 64px 40px 40px 40px", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 10, color: C.muted }}>#</span>
            <span style={{ fontSize: 10, color: C.muted }}>Nome <span style={{ opacity: 0.4 }}>↗ ver stats</span></span>
            <span style={{ fontSize: 10, color: C.muted, textAlign: "right" }}>Pts</span>
            {!isMobile && <>
              <span style={{ fontSize: 10, color: C.gold, textAlign: "center" }}>10</span>
              <span style={{ fontSize: 10, color: C.green, textAlign: "center" }}>7</span>
              <span style={{ fontSize: 10, color: C.blue, textAlign: "center" }}>5</span>
            </>}
          </div>
          {ranked.map((p, i) => (
            <div key={p.id} onClick={() => setStatsFor(p)} style={{ display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 52px" : "44px 1fr 64px 40px 40px 40px", gap: 6, padding: isMobile ? "12px 12px" : "14px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none", background: i === 0 ? `${C.gold}0a` : i === 1 ? `${C.silver}0a` : i === 2 ? `${C.bronze}0a` : "transparent", cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", fontSize: i < 3 ? (isMobile ? 17 : 20) : 13, color: i >= 3 ? C.muted : undefined }}>{i < 3 ? medals[i] : `${i + 1}º`}</span>
              <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: isMobile ? 13 : 14 }}>{p.name}</span>
                {!p.paid && <span style={{ fontSize: 9, background: `${C.red}22`, color: C.red, padding: "1px 5px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>Pix⚠️</span>}
                {p.champBonus > 0 && <span style={{ fontSize: 9, background: `${C.gold}22`, color: C.gold, padding: "1px 5px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>🏆+{p.champBonus}</span>}
                {isMobile && (
                  <span style={{ marginLeft: "auto", display: "flex", gap: 5, flexShrink: 0 }}>
                    {p.c10 > 0 && <span style={{ fontSize: 10, color: C.gold }}>×{p.c10}</span>}
                    {p.c7 > 0 && <span style={{ fontSize: 10, color: C.green }}>×{p.c7}</span>}
                  </span>
                )}
              </span>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 22 : 26, display: "flex", alignItems: "center", justifyContent: "flex-end", color: i === 0 ? C.gold : i === 1 ? C.silver : i === 2 ? C.bronze : C.text }}>{p.total}</span>
              {!isMobile && <>
                <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontWeight: 900 }}>{p.c10 || "—"}</span>
                <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontWeight: 900 }}>{p.c7 || "—"}</span>
                <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, fontWeight: 900 }}>{p.c5 || "—"}</span>
              </>}
            </div>
          ))}
        </div>
      )}

      {/* Modo leitura — palpites recentes */}
      {recentPlayed.length > 0 && (
        <div>
          <Divider label="Palpites Recentes" />
          {recentPlayed.map(m => (
            <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: C.green, padding: "2px 14px", background: `${C.green}12`, border: `1px solid ${C.greenDim}`, borderRadius: 8 }}>{m.result.a} × {m.result.b}</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {ranked.map(p => {
                  const pred = preds[p.id]?.[m.id];
                  const pts = calcPts(pred, m.result);
                  const hasPred = pred && pred.a !== "" && pred.b !== "" && pred.a != null && pred.b != null;
                  return (
                    <div key={p.id} onClick={() => setStatsFor(p)} style={{ display: "flex", alignItems: "center", gap: 4, background: C.surface, borderRadius: 6, padding: "4px 8px", border: `1px solid ${pts != null ? (ptsColor[pts] + "55") : C.border}`, cursor: "pointer" }}>
                      <span style={{ fontSize: 11, color: C.muted }}>{p.name.split(" ")[0]}</span>
                      <span style={{ fontSize: 12, fontFamily: "'Bebas Neue', cursive", color: hasPred ? C.text : C.border, letterSpacing: 1 }}>{hasPred ? `${pred.a}×${pred.b}` : "—"}</span>
                      {pts != null && <PtsBadge pts={pts} />}
                    </div>
                  );
                })}
              </div>
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

function TabParticipantes({ participants, onChange, onDelete, isAdmin }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPin, setEditPin] = useState("");

  const add = () => {
    if (!name.trim()) return alert("Por favor, digite seu nome!");
    if (pin.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!");
    onChange([...participants, { id: uid(), name: name.trim(), paid: false, pin }]);
    setName(""); setPin("");
    if (!isAdmin) alert("Conta criada! Vá na aba Palpites para fazer login.");
  };

  const startEdit = (p) => {
    if (!isAdmin) {
      const authPin = window.prompt(`🔒 Digite a senha atual de ${p.name} para liberar a edição:`);
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
          {isAdmin ? "⚙️ Adicionar Jogador (Admin)" : "👋 Novo por aqui? Cadastre-se"}
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu Nome" style={INP({ flex: 1, minWidth: 140 })} />
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Senha (mín. 4)" style={INP({ width: 140, textAlign: "center", letterSpacing: 2 })} />
          <button onClick={add} style={BTN()}>{isAdmin ? "+ Adicionar" : "Me Cadastrar"}</button>
        </div>
        {!isAdmin && <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Crie sua conta e senha para registrar seus palpites. Apenas o admin aprova o pagamento.</p>}
      </div>

      {participants.map((p) => (
        <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 8 }}>
          {editingId === p.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={editName} onChange={e => setEditName(e.target.value)} style={INP({ padding: "8px 10px" })} />
              <input type="password" value={editPin} onChange={e => setEditPin(e.target.value)} placeholder="Nova senha" style={INP({ padding: "8px 10px", textAlign: "center" })} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => saveEdit(p.id)} style={BTN({ flex: 1 })}>Salvar</button>
                <button onClick={() => setEditingId(null)} style={GHOST_BTN({ flex: 1 })}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ flex: 1, fontWeight: 700, minWidth: 80 }}>{p.name}</span>
              <span style={{ fontSize: 12, color: p.paid ? C.green : C.red, fontWeight: 700 }}>{p.paid ? "✅ Pago" : "❌ Pendente"}</span>
              <button onClick={() => startEdit(p)} style={GHOST_BTN({ padding: "6px 12px", minHeight: 36 })}>✏️ Editar</button>
              {isAdmin && (
                <>
                  <button onClick={() => togglePaid(p.id)} style={GHOST_BTN({ padding: "6px 12px", minHeight: 36 })}>Mudar Pix</button>
                  <button onClick={() => { if(window.confirm(`Excluir ${p.name}?`)) onDelete(p.id); }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 24, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

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
    if (!window.confirm("Deseja gerar automaticamente todos os jogos da Fase de Grupos?")) return;
    let novosJogos = [...matches];
    let diaInicial = 11; 
    Object.entries(GRUPOS).forEach(([nome, t], gIdx) => {
      const confrontos = [[t[0], t[1]], [t[2], t[3]], [t[0], t[2]], [t[1], t[3]], [t[3], t[0]], [t[1], t[2]]];
      confrontos.forEach((c, cIdx) => {
        const diaJogo = diaInicial + Math.floor(gIdx / 2) + Math.floor(cIdx / 2);
        novosJogos.push({ id: uid(), teamA: c[0], teamB: c[1], phase: "Fase de Grupos", date: `${diaJogo}/06 (TBD) - 16:00`, result: null });
      });
    });
    onChange(novosJogos);
    alert("Fase de Grupos gerada com sucesso!");
  };

  // 🏆 O MOTOR DE CHAVEAMENTO DO MATA-MATA (Regra FIFA 48 Seleções)
  const gerarMataMata = () => {
    const groupMatches = matches.filter(m => m.phase === "Fase de Grupos" && m.result);
    if (groupMatches.length < 72) {
      if(!window.confirm("Atenção: Nem todos os 72 jogos da fase de grupos têm resultado ainda. O cálculo vai considerar 0 pontos para os jogos pendentes. Deseja continuar?")) return;
    }

    // 1. Calcula a Tabela de Classificação
    const st = {};
    Object.keys(GRUPOS).forEach(g => { st[g] = GRUPOS[g].map(t => ({ team: t, pts: 0, gf: 0, ga: 0, gd: 0 })); });

    groupMatches.forEach(m => {
      const gA = TEAM_TO_GROUP[m.teamA.toLowerCase()], gB = TEAM_TO_GROUP[m.teamB.toLowerCase()];
      const rA = m.result.a, rB = m.result.b;
      if (gA && st[gA]) {
        const t = st[gA].find(x => x.team === m.teamA);
        if (t) { t.gf += rA; t.ga += rB; t.gd += (rA - rB); if (rA > rB) t.pts += 3; else if (rA === rB) t.pts += 1; }
      }
      if (gB && st[gB]) {
        const t = st[gB].find(x => x.team === m.teamB);
        if (t) { t.gf += rB; t.ga += rA; t.gd += (rB - rA); if (rB > rA) t.pts += 3; else if (rA === rB) t.pts += 1; }
      }
    });

    // 2. Extrai 1º, 2º e a lista de 3ºs
    const firsts = {}, seconds = {};
    let thirdsList = [];
    Object.keys(st).forEach(g => {
      const sorted = st[g].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || 0);
      firsts[g] = sorted[0];
      seconds[g] = sorted[1];
      thirdsList.push({ ...sorted[2], group: g });
    });

    // 3. Pega os 8 melhores terceiros
    thirdsList = thirdsList.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || 0).slice(0, 8);

    // 4. Algoritmo de Combinação FIFA (Backtracking Seguro)
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
        const isUsed = Object.values(current).find(x => x.team === th.team);
        const isAllowed = allowed[t].includes(th.group);
        // Fallback flexível: Se a matriz cruzar, pelo menos evita times do mesmo grupo
        const isFallback = !isAllowed && th.group !== t; 

        if (!isUsed && (isAllowed || isFallback)) {
          current[t] = th; solve(idx + 1, current); delete current[t];
        }
      }
    }
    solve(0, {});

    // Salvaguarda extrema para evitar tela em branco
    if (!bestAssign) {
      bestAssign = {};
      let available = [...thirdsList];
      targets.forEach(t => {
        const foundIdx = available.findIndex(x => x.group !== t);
        if (foundIdx > -1) { bestAssign[t] = available[foundIdx]; available.splice(foundIdx, 1); } 
        else { bestAssign[t] = available[0]; available.splice(0, 1); }
      });
    }

    // 5. Monta a grade oficial de 32-avos
    const r32 = [
      { tA: firsts["A"].team, tB: bestAssign["A"].team },
      { tA: firsts["B"].team, tB: bestAssign["B"].team },
      { tA: firsts["C"].team, tB: seconds["F"].team },
      { tA: firsts["D"].team, tB: bestAssign["D"].team },
      { tA: firsts["E"].team, tB: bestAssign["E"].team },
      { tA: firsts["F"].team, tB: seconds["C"].team },
      { tA: firsts["G"].team, tB: bestAssign["G"].team },
      { tA: firsts["H"].team, tB: seconds["J"].team },
      { tA: firsts["I"].team, tB: bestAssign["I"].team },
      { tA: firsts["J"].team, tB: seconds["H"].team },
      { tA: firsts["K"].team, tB: bestAssign["K"].team },
      { tA: firsts["L"].team, tB: bestAssign["L"].team },
      { tA: seconds["A"].team, tB: seconds["B"].team },
      { tA: seconds["D"].team, tB: seconds["E"].team },
      { tA: seconds["G"].team, tB: seconds["I"].team },
      { tA: seconds["K"].team, tB: seconds["L"].team }
    ];

    const novos = [...matches];
    r32.forEach((m, idx) => {
      novos.push({ id: uid(), teamA: m.tA, teamB: m.tB, phase: "32-avos de Final", date: `28/06 (TBD) - 16:00`, result: null });
    });

    onChange(novos);
    alert("🔥 Confrontos dos 32-avos calculados e gerados com sucesso!");
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
            <h3 style={{ fontSize: 14, color: C.text }}>Painel de Criação</h3>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button onClick={gerarCopaFaseDeGrupos} style={BTN({ background: C.surface, color: C.text, border: `1px solid ${C.border}`, fontSize: 12, padding: "6px 12px", minHeight: 32 })}>1️⃣ Gerar Grupos</button>
              <button onClick={gerarMataMata} style={BTN({ background: C.gold, color: "#000", fontSize: 12, padding: "6px 12px", minHeight: 32 })}>⚡ Calcular 32-Avos (Mata-Mata)</button>
            </div>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="Time A" style={INP()} />
            <div style={{ textAlign: "center", color: C.muted, fontWeight: 900, fontSize: 16 }}>×</div>
            <input value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="Time B" style={INP()} />
          </div>
          <input value={dateStr} onChange={(e) => setDateStr(e.target.value)} placeholder="Data e Horário (ex: 11/06 (Qui) - 16:00)" style={INP({ marginBottom: 10 })} />
          <div style={{ display: "flex", gap: 8 }}>
            <select value={phase} onChange={(e) => setPhase(e.target.value)} style={INP({ flex: 1 })}>{PHASES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            <button onClick={add} style={BTN()}>+ Adicionar Jogo Manual</button>
          </div>
        </div>
      )}
      {!isAdmin && <div style={{ marginBottom: 16, color: C.gold, fontSize: 13 }}>⚠️ Apenas o administrador insere os placares oficiais.</div>}
      <FilterBar active={filter} onChange={setFilter} matches={matches} />
      {grouped.length === 0 && <Empty icon="📅" msg="Nenhum jogo neste filtro." />}
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
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{m.teamA}</span>
                      <ScoreIn value={tempR.a} onChange={(v) => setTempR((t) => ({ ...t, a: v }))} />
                      <span style={{ color: C.muted }}>×</span>
                      <ScoreIn value={tempR.b} onChange={(v) => setTempR((t) => ({ ...t, b: v }))} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "right" }}>{m.teamB}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => saveResult(m.id)} style={BTN({ flex: 1, fontSize: 13 })}>✓ Salvar</button>
                      <button onClick={() => clearResult(m.id)} style={GHOST_BTN({ flex: 1, color: C.red, borderColor: `${C.red}66` })}>Limpar</button>
                      <button onClick={() => setEditId(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, minWidth: 36 }}>×</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{m.teamA}</span>
                    {m.result ? (
                      <button onClick={() => isAdmin && startEdit(m)} style={{ background: `${C.green}12`, border: `1px solid ${C.greenDim}`, borderRadius: 8, color: C.green, cursor: isAdmin ? "pointer" : "default", padding: "5px 18px", fontFamily: "'Bebas Neue', cursive", fontSize: 20 }}>
                        {m.result.a} × {m.result.b}
                      </button>
                    ) : (
                      <button onClick={() => isAdmin && startEdit(m)} style={GHOST_BTN({ padding: "6px 14px", visibility: isAdmin ? "visible" : "hidden" })}>+ Resultado</button>
                    )}
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "right" }}>{m.teamB}</span>
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
      else alert("Senha incorreta!");
    }
  };

  if (participants.length === 0) return <Empty icon="👥" msg="Aguardando cadastros." />;
  if (matches.length === 0) return <Empty icon="⚽" msg="Nenhum jogo disponível." />;

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
      {/* Participant selector */}
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
          <h3 style={{ marginBottom: 8, color: C.text }}>{activeUser?.pin ? "Área Protegida" : "Crie sua Senha"}</h3>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
            {activeUser?.pin ? `Digite a senha do(a) ${activeUser.name} para editar os palpites.` : "Como é seu primeiro acesso, crie uma senha para proteger seus palpites."}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", maxWidth: 300, margin: "0 auto" }}>
            <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleUnlock()} placeholder="Senha..." style={INP({ textAlign: "center", letterSpacing: 3 })} />
            <button onClick={handleUnlock} style={BTN()}>{activeUser?.pin ? "Entrar" : "Salvar"}</button>
          </div>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          {stats && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 30, color: C.gold }}>{stats.total}</span>
              <span style={{ color: C.muted, fontSize: 13 }}>pts</span>
              <span style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>🎯 {stats.c10}</span>
              <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>⭐ {stats.c7}</span>
              <span style={{ color: C.blue, fontWeight: 700, fontSize: 13 }}>✅ {stats.c5}</span>
              {pendingCount > 0 && (
                <span style={{ marginLeft: "auto", background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 10, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                  ⚠️ {pendingCount} sem palpite
                </span>
              )}
            </div>
          )}

          {/* Champion pick */}
          <ChampionSection
            activePid={activePid}
            participants={participants}
            matches={matches}
            isAdmin={isAdmin}
            onPickChampion={onPickChampion}
            championPts={championPts}
            onSetChampionPts={onSetChampionPts}
          />

          <ScoringLegend />
          <FilterBar active={filter} onChange={setFilter} matches={matches} />

          {grouped.length === 0 && <Empty icon="📅" msg="Nenhum jogo neste filtro." />}
          {grouped.map(({ ph, ms }) => (
            <div key={ph} style={{ marginBottom: 24 }}>
              <Divider label={ph} />
              {ms.map((m) => {
                const pred = preds[activePid]?.[m.id] || {};
                const pts = m.result ? calcPts(pred, m.result) : null;
                const locked = isLocked(m.date);
                return (
                  <div key={m.id} style={{ background: C.card, border: `1px solid ${locked ? C.border : C.greenDim + "55"}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                    {m.date && <span style={{ fontSize: 11, color: locked ? C.red : C.greenDim, fontWeight: 700 }}>{m.date}{locked ? " (Encerrado)" : ""}</span>}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                      <ScoreIn value={pred.a ?? ""} onChange={(v) => setPred(m.id, "a", v)} disabled={locked} />
                      <span style={{ color: C.muted, fontSize: 12 }}>×</span>
                      <ScoreIn value={pred.b ?? ""} onChange={(v) => setPred(m.id, "b", v)} disabled={locked} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                      <PtsBadge pts={pts} />
                    </div>
                    {/* Mural: visible as soon as result is entered */}
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
  if (participants.length === 0) return <Empty icon="👥" msg="Adicione participantes primeiro." />;
  const ranked = getRanked(participants, matches, preds, championPts);
  const played = matches.filter((m) => m.result);
  if (played.length === 0) return <Empty icon="⏳" msg="Nenhum resultado cadastrado ainda." />;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 400 }}>
        <thead>
          <tr style={{ background: C.surface }}>
            <th style={{ padding: "8px 12px", textAlign: "left", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>Jogo</th>
            <th style={{ padding: "8px 8px", textAlign: "center", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>Resultado</th>
            {ranked.map((p) => <th key={p.id} style={{ padding: "8px 6px", textAlign: "center", color: C.text, fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", maxWidth: 80 }}>{p.name.split(" ")[0]}</th>)}
          </tr>
        </thead>
        <tbody>
          {played.map((m) => (
            <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "8px 12px", color: C.text, whiteSpace: "nowrap" }}>{m.teamA} × {m.teamB}</td>
              <td style={{ padding: "8px 8px", textAlign: "center", fontFamily: "'Bebas Neue', cursive", fontSize: 16, color: C.green, letterSpacing: 1 }}>{m.result.a}×{m.result.b}</td>
              {ranked.map((p) => {
                const pred = preds[p.id]?.[m.id];
                const pts = calcPts(pred, m.result);
                return (
                  <td key={p.id} style={{ padding: "6px", textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      {pred && (pred.a !== "" || pred.b !== "") ? <span style={{ fontSize: 11, color: C.muted }}>{pred.a ?? "?"}×{pred.b ?? "?"}</span> : <span style={{ fontSize: 11, color: C.border }}>—</span>}
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

/* ── App Shell ── */
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

        // Load champion_pts from config table
        const { data: cfg } = await supabase.from('config').select('valor').eq('chave', 'champion_pts').single();
        if (cfg?.valor) setChampionPts(parseInt(cfg.valor));
      } catch (err) { console.error("Erro no Supabase:", err); }
      setReady(true);
    })();
  }, []);

  const sp = async (d) => { setParticipants(d); await supabase.from('participantes').upsert(d); };
  const removeP = async (id) => { setParticipants(p => p.filter(x => x.id !== id)); await supabase.from('participantes').delete().eq('id', id); };
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
    const pwd = prompt("Área Restrita. Digite a senha do Administrador:");
    if (pwd === "bruno2026") setIsAdmin(true);
    else if (pwd !== null) alert("Senha incorreta!");
  };

  const showToast = () => setToast("✅ Palpite salvo!");

  const TABS = [
    { id: "placar",        label: "🏆 Placar"       },
    { id: "participantes", label: "👥 Participantes" },
    { id: "jogos",         label: "⚽ Jogos"         },
    { id: "palpites",      label: "📋 Palpites"      },
    { id: "visao",         label: "📊 Visão Geral"   },
  ];

  if (!ready) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontFamily: "sans-serif", fontSize: 18 }}>⚽ Conectando ao Banco de Dados...</div>;

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
          <div onDoubleClick={handleAdminLogin} style={{ fontFamily: "'Bebas Neue', cursive", fontSize: isMobile ? 20 : 26, letterSpacing: 3, color: isAdmin ? C.red : C.gold, cursor: "pointer" }} title="Duplo clique para Admin">
            ⚽ BOLÃO DA COPA {isAdmin && "<ADMIN>"}
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={{ background: `${C.gold}1a`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 20, padding: "3px 10px", fontWeight: 700, fontSize: isMobile ? 11 : 13 }}>
              💰 R$ {(participants.length * 100).toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", background: C.surface, overflowX: "auto", scrollbarWidth: "none" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ border: "none", cursor: "pointer", padding: isMobile ? "10px 12px" : "12px 18px", whiteSpace: "nowrap", background: "transparent", color: tab === t.id ? C.green : C.muted, borderBottom: `2px solid ${tab === t.id ? C.green : "transparent"}`, fontWeight: 700, fontSize: isMobile ? 11 : 13, fontFamily: "inherit", transition: "color .15s", flex: isMobile ? "1 0 auto" : undefined }}>
              {isMobile ? t.label.split(" ")[0] : t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "16px 12px" : "20px 16px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        {tab === "placar"        && <TabPlacar participants={participants} matches={matches} preds={preds} championPts={championPts} />}
        {tab === "participantes" && <TabParticipantes participants={participants} onChange={sp} onDelete={removeP} isAdmin={isAdmin} />}
        {tab === "jogos"         && <TabJogos matches={matches} onChange={sm} isAdmin={isAdmin} />}
        {tab === "palpites"      && <TabPalpites participants={participants} matches={matches} preds={preds} onChange={spr} savePin={savePin} sessionUnlocked={sessionUnlocked} setSessionUnlocked={setSessionUnlocked} onSaved={showToast} isAdmin={isAdmin} onPickChampion={onPickChampion} championPts={championPts} onSetChampionPts={onSetChampionPts} />}
        {tab === "visao"         && <TabVisao participants={participants} matches={matches} preds={preds} championPts={championPts} />}
      </div>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
