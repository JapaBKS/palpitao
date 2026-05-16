import { useState, useEffect } from "react";
import { createClient } from '@supabase/supabase-js';

// ⚠️ ATENÇÃO: Substitua pelas suas chaves do Supabase!
const supabaseUrl = 'https://sfpdbotvobdzuckpfcbv.supabase.co';
const supabaseKey = 'sb_publishable_FQaWYA6nqB1Fz9IS2O4klg_Eu1Q2mU4';
const supabase = createClient(supabaseUrl, supabaseKey);

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
  let total = 0, c10 = 0, c7 = 0, c5 = 0, c2 = 0;
  for (const m of matches) {
    if (!m.result) continue;
    const p = preds[pid]?.[m.id];
    if (!p) continue;
    const pts = calcPts(p, m.result);
    if (pts == null) continue;
    total += pts;
    if (pts === 10) c10++;
    else if (pts === 7) c7++;
    else if (pts === 5) c5++;
    else if (pts === 2) c2++;
  }
  return { total, c10, c7, c5, c2 };
}

function getRanked(participants, matches, preds) {
  return [...participants]
    .map((p) => ({ ...p, ...getStats(p.id, matches, preds) }))
    .sort((a, b) => b.total - a.total || b.c10 - a.c10 || b.c7 - a.c7 || b.c5 - a.c5);
}

const PHASES = ["Fase de Grupos", "Oitavas de Final", "Quartas de Final", "Semifinal", "3º Lugar", "Final"];

/* ── Design tokens ── */
const C = {
  bg: "#06090a",
  surface: "#0b1015",
  card: "#10171d",
  cardHover: "#141e26",
  border: "#1b2c38",
  green: "#00e676",
  greenDim: "#00a152",
  gold: "#ffca28",
  silver: "#90a4ae",
  bronze: "#ff8f00",
  text: "#cce8d4",
  muted: "#4a6a5a",
  red: "#ff5252",
  blue: "#40c4ff",
  input: "#0c1820",
};

/* ── Shared styles ── */
const INP = (extra = {}) => ({
  background: C.input,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  ...extra,
});

const BTN = (extra = {}) => ({
  background: C.greenDim,
  border: "none",
  borderRadius: 8,
  color: "#fff",
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  ...extra,
});

const GHOST_BTN = (extra = {}) => ({
  background: "none",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.muted,
  padding: "6px 14px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  ...extra,
});

const ptsColor = { 10: C.gold, 7: C.green, 5: C.blue, 2: C.bronze, 0: C.muted };
const ptsBg = { 10: "#1a1200", 7: "#001a0d", 5: "#001428", 2: "#1a0a00", 0: "#101a17" };

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
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 34,
        height: 26,
        background: ptsBg[pts] ?? ptsBg[0],
        color: ptsColor[pts] ?? C.muted,
        border: `1px solid ${ptsColor[pts] ?? C.border}`,
        borderRadius: 6,
        fontWeight: 900,
        fontSize: 13,
      }}
    >
      {pts}
    </span>
  );
}

function ScoreIn({ value, onChange }) {
  return (
    <input
      type="number"
      min="0"
      max="99"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={INP({ width: 52, textAlign: "center", padding: "8px 4px" })}
    />
  );
}

function Divider({ label }) {
  return (
    <div
      style={{
        fontFamily: "'Bebas Neue', cursive",
        fontSize: 17,
        letterSpacing: 1,
        color: C.muted,
        borderBottom: `1px solid ${C.border}`,
        paddingBottom: 8,
        marginBottom: 10,
      }}
    >
      {label}
    </div>
  );
}

/* ── Tabs ── */
function TabPlacar({ participants, matches, preds }) {
  const ranked = getRanked(participants, matches, preds);
  const n = participants.length;
  const total = n * 100;
  const played = matches.filter((m) => m.result).length;
  const medals = ["🥇", "🥈", "🥉"];
  const prizes = [
    { color: C.gold, pct: "70%", val: Math.round(total * 0.7) },
    { color: C.silver, pct: "20%", val: Math.round(total * 0.2) },
    { color: C.bronze, pct: "10%", val: Math.round(total * 0.1) },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {prizes.map((pr, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${pr.color}44`, borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>{medals[i]}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{i === 0 ? "1º" : i === 1 ? "2º" : "3º"} ({pr.pct})</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1, color: pr.color, marginTop: 4 }}>
              R$ {pr.val.toLocaleString("pt-BR")}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>⚽ {played}/{matches.length} jogos com resultado</span>
        <span>💰 Total: R$ {total.toLocaleString("pt-BR")}</span>
        <span>👥 {n} participante{n !== 1 ? "s" : ""}</span>
      </div>

      {participants.length === 0 && <Empty icon="👥" msg="Adicione participantes para ver o placar." />}

      {ranked.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 64px 40px 40px 40px", gap: 8, padding: "10px 16px", background: C.surface, fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
            <span>#</span><span>Nome</span><span style={{ textAlign: "right" }}>Pts</span><span style={{ textAlign: "center", color: C.gold }}>10</span><span style={{ textAlign: "center", color: C.green }}>7</span><span style={{ textAlign: "center", color: C.blue }}>5</span>
          </div>

          {ranked.map((p, i) => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr 64px 40px 40px 40px", gap: 8, padding: "14px 16px", borderTop: `1px solid ${C.border}`, background: i === 0 ? `${C.gold}0a` : i === 1 ? `${C.silver}0a` : i === 2 ? `${C.bronze}0a` : "transparent" }}>
              <span style={{ display: "flex", alignItems: "center", fontSize: i < 3 ? 20 : 14, color: i >= 3 ? C.muted : undefined }}>
                {i < 3 ? medals[i] : `${i + 1}º`}
              </span>
              <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                {!p.paid && <span style={{ fontSize: 10, background: `${C.red}22`, color: C.red, padding: "1px 6px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>Pix ⚠️</span>}
              </span>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", color: i === 0 ? C.gold : i === 1 ? C.silver : i === 2 ? C.bronze : C.text }}>
                {p.total}
              </span>
              <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontWeight: 900 }}>{p.c10 || "—"}</span>
              <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontWeight: 900 }}>{p.c7 || "—"}</span>
              <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, fontWeight: 900 }}>{p.c5 || "—"}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 16, fontSize: 12, color: C.muted }}>
        <span><b style={{ color: C.gold }}>10</b> Placar Exato</span>
        <span><b style={{ color: C.green }}>7</b> Tend. + Gols</span>
        <span><b style={{ color: C.blue }}>5</b> Tendência</span>
        <span><b style={{ color: C.bronze }}>2</b> Consolação</span>
        <span style={{ color: C.border }}>|</span>
        <span>Desempate: 10→7→5</span>
      </div>
    </div>
  );
}

function TabParticipantes({ participants, onChange }) {
  const [name, setName] = useState("");

  const add = () => {
    const n = name.trim();
    if (!n) return;
    onChange([...participants, { id: uid(), name: n, paid: false }]);
    setName("");
  };

  const togglePaid = (id) => onChange(participants.map((p) => (p.id === id ? { ...p, paid: !p.paid } : p)));
  const remove = (id) => onChange(participants.filter((p) => p.id !== id));
  const t = participants.length * 100;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Nome do participante..." style={INP()} />
        <button onClick={add} style={BTN()}>+ Adicionar</button>
      </div>

      {participants.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: C.muted, display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "center" }}>
          <span><b style={{ color: C.text }}>{participants.length} jogadores</b> — R$ {t.toLocaleString("pt-BR")} total</span>
          <span style={{ color: C.gold }}>🥇 R$ {Math.round(t * 0.7).toLocaleString("pt-BR")}</span>
          <span style={{ color: C.silver }}>🥈 R$ {Math.round(t * 0.2).toLocaleString("pt-BR")}</span>
          <span style={{ color: C.bronze }}>🥉 R$ {Math.round(t * 0.1).toLocaleString("pt-BR")}</span>
        </div>
      )}

      {participants.length > 0 && (() => {
        const paid = participants.filter((p) => p.paid).length;
        const pending = participants.length - paid;
        return (
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
            ✅ {paid} pago{paid !== 1 ? "s" : ""} &nbsp;·&nbsp; ❌ {pending} pendente{pending !== 1 ? "s" : ""}
          </div>
        );
      })()}

      {participants.length === 0 && <Empty icon="👥" msg="Nenhum participante ainda. Adicione acima!" />}

      {participants.map((p) => (
        <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ flex: 1, fontWeight: 700 }}>{p.name}</span>
          <button onClick={() => togglePaid(p.id)} style={{ border: `1px solid ${p.paid ? C.green : C.red}`, background: p.paid ? `${C.green}18` : `${C.red}18`, color: p.paid ? C.green : C.red, borderRadius: 20, padding: "4px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
            {p.paid ? "✅ Pago" : "❌ Pix Pendente"}
          </button>
          <button onClick={() => remove(p.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>
      ))}
    </div>
  );
}

function TabJogos({ matches, onChange }) {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [phase, setPhase] = useState("Fase de Grupos");
  const [editId, setEditId] = useState(null);
  const [tempR, setTempR] = useState({ a: "", b: "" });

  const add = () => {
    if (!teamA.trim() || !teamB.trim()) return;
    onChange([...matches, { id: uid(), teamA: teamA.trim(), teamB: teamB.trim(), phase, date: dateStr, result: null }]);
    setTeamA(""); setTeamB(""); setDateStr("");
  };

  const startEdit = (m) => {
    setEditId(m.id);
    setTempR(m.result ? { a: String(m.result.a), b: String(m.result.b) } : { a: "", b: "" });
  };

  const saveResult = (id) => {
    const a = parseInt(tempR.a), b = parseInt(tempR.b);
    if (!isNaN(a) && !isNaN(b) && a >= 0 && b >= 0) {
      onChange(matches.map((m) => (m.id === id ? { ...m, result: { a, b } } : m)));
    }
    setEditId(null);
  };

  const clearResult = (id) => {
    onChange(matches.map((m) => (m.id === id ? { ...m, result: null } : m)));
    setEditId(null);
  };

  const grouped = PHASES.map((ph) => ({ ph, ms: matches.filter((m) => m.phase === ph) })).filter((g) => g.ms.length);

  return (
    <div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="Time A" style={INP()} />
          <div style={{ textAlign: "center", color: C.muted, fontWeight: 900, fontSize: 16 }}>×</div>
          <input value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="Time B" style={INP()} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
           <input value={dateStr} onChange={(e) => setDateStr(e.target.value)} placeholder="Data e Horário (ex: 11/06 - 16:00)" style={INP()} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={phase} onChange={(e) => setPhase(e.target.value)} style={INP({ flex: 1, width: "auto" })}>
            {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={add} style={BTN()}>+ Jogo</button>
        </div>
      </div>

      {matches.length === 0 && <Empty icon="⚽" msg="Nenhum jogo cadastrado." />}

      {grouped.map(({ ph, ms }) => (
        <div key={ph} style={{ marginBottom: 24 }}>
          <Divider label={`${ph} (${ms.length})`} />
          {ms.map((m) => (
            <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              {m.date && <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>{m.date}</span>}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {editId === m.id ? (
                  <>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{m.teamA}</span>
                    <ScoreIn value={tempR.a} onChange={(v) => setTempR((t) => ({ ...t, a: v }))} />
                    <span style={{ color: C.muted }}>×</span>
                    <ScoreIn value={tempR.b} onChange={(v) => setTempR((t) => ({ ...t, b: v }))} />
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "right" }}>{m.teamB}</span>
                    <button onClick={() => saveResult(m.id)} style={BTN({ padding: "6px 12px", fontSize: 12 })}>✓ Salvar</button>
                    <button onClick={() => clearResult(m.id)} style={GHOST_BTN({ color: C.red, borderColor: `${C.red}66` })}>Limpar</button>
                    <button onClick={() => setEditId(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, padding: "0 2px" }}>×</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{m.teamA}</span>
                    {m.result ? (
                      <button onClick={() => startEdit(m)} style={{ background: `${C.green}12`, border: `1px solid ${C.greenDim}`, borderRadius: 8, color: C.green, cursor: "pointer", padding: "5px 18px", fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 2 }}>
                        {m.result.a} × {m.result.b}
                      </button>
                    ) : (
                      <button onClick={() => startEdit(m)} style={GHOST_BTN({ padding: "6px 14px" })}>+ Resultado</button>
                    )}
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "right" }}>{m.teamB}</span>
                    <button onClick={() => onChange(matches.filter((x) => x.id !== m.id))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 2px" }}>×</button>
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

function TabPalpites({ participants, matches, preds, onChange }) {
  const [selPid, setSelPid] = useState("");

  // ✨ A MÁGICA AQUI: Lógica derivada no render!
  // Em vez do useEffect, calculamos quem é o ativo na hora.
  // Se o selecionado sumir ou não existir, pegamos o primeiro.
  const activePid = participants.find((p) => p.id === selPid)?.id || participants[0]?.id || "";

  const setPred = (matchId, side, val) => {
    if (!activePid) return;
    const next = {
      ...preds,
      [activePid]: {
        ...preds[activePid],
        [matchId]: { ...(preds[activePid]?.[matchId] || {}), [side]: val },
      },
    };
    onChange(next);
  };

  if (participants.length === 0) return <Empty icon="👥" msg="Adicione participantes primeiro." />;
  if (matches.length === 0) return <Empty icon="⚽" msg="Adicione jogos primeiro." />;

  const stats = activePid ? getStats(activePid, matches, preds) : null;
  const grouped = PHASES.map((ph) => ({ ph, ms: matches.filter((m) => m.phase === ph) })).filter((g) => g.ms.length);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {participants.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelPid(p.id)}
            style={{
              border: `1px solid ${activePid === p.id ? C.green : C.border}`,
              background: activePid === p.id ? `${C.green}1a` : C.card,
              color: activePid === p.id ? C.green : C.muted,
              borderRadius: 20,
              padding: "6px 16px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {stats && activePid && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 30, color: C.gold, letterSpacing: 1 }}>{stats.total}</span>
          <span style={{ color: C.muted, fontSize: 13 }}>pontos</span>
          <span style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>10 × {stats.c10}</span>
          <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>7 × {stats.c7}</span>
          <span style={{ color: C.blue, fontWeight: 700, fontSize: 13 }}>5 × {stats.c5}</span>
          <span style={{ color: C.bronze, fontWeight: 700, fontSize: 13 }}>2 × {stats.c2}</span>
        </div>
      )}

      {grouped.map(({ ph, ms }) => (
        <div key={ph} style={{ marginBottom: 24 }}>
          <Divider label={ph} />
          {ms.map((m) => {
            const pred = activePid ? preds[activePid]?.[m.id] || {} : {};
            const pts = m.result ? calcPts(pred, m.result) : null;
            return (
              <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                {m.date && <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{m.date}</span>}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                  <ScoreIn value={pred.a ?? ""} onChange={(v) => setPred(m.id, "a", v)} />
                  <span style={{ color: C.muted, fontSize: 12 }}>×</span>
                  <ScoreIn value={pred.b ?? ""} onChange={(v) => setPred(m.id, "b", v)} />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 13, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                  {m.result && <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>({m.result.a}×{m.result.b})</span>}
                  <PtsBadge pts={pts} />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TabVisao({ participants, matches, preds }) {
  if (participants.length === 0) return <Empty icon="👥" msg="Adicione participantes primeiro." />;
  if (matches.length === 0) return <Empty icon="⚽" msg="Adicione jogos primeiro." />;

  const ranked = getRanked(participants, matches, preds);
  const played = matches.filter((m) => m.result);

  if (played.length === 0) return <Empty icon="⏳" msg="Nenhum resultado cadastrado ainda." />;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 400 }}>
        <thead>
          <tr style={{ background: C.surface }}>
            <th style={{ padding: "8px 12px", textAlign: "left", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>Jogo</th>
            <th style={{ padding: "8px 8px", textAlign: "center", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>Resultado</th>
            {ranked.map((p) => (
              <th key={p.id} style={{ padding: "8px 6px", textAlign: "center", color: C.text, fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.name.split(" ")[0]}
              </th>
            ))}
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
          <tr style={{ background: C.surface, borderTop: `2px solid ${C.border}` }}>
            <td colSpan={2} style={{ padding: "10px 12px", fontWeight: 700, color: C.muted, fontSize: 12 }}>TOTAL</td>
            {ranked.map((p) => (
              <td key={p.id} style={{ padding: "10px 6px", textAlign: "center" }}>
                <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: C.gold, letterSpacing: 1 }}>{p.total}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── App Shell Principal ── */
export default function BolaoApp() {
  const [tab, setTab] = useState("placar");
  const [participants, setParticipants] = useState([]);
  
  // Lista inicial de jogos para popular o banco de dados
  const [matches, setMatches] = useState([
    { id: "1_mex_rsa", teamA: "México", teamB: "África do Sul", phase: "Fase de Grupos", date: "11/06 (Qui) - 16:00", result: null },
    { id: "1_kor_cze", teamA: "República da Coreia", teamB: "República Tcheca", phase: "Fase de Grupos", date: "11/06 (Qui) - 23:00", result: null },
    { id: "1_can_bih", teamA: "Canadá", teamB: "Bósnia e Herzegovina", phase: "Fase de Grupos", date: "12/06 (Sex) - 16:00", result: null },
    { id: "1_usa_par", teamA: "Estados Unidos", teamB: "Paraguai", phase: "Fase de Grupos", date: "12/06 (Sex) - 22:00", result: null },
    { id: "1_qat_sui", teamA: "Catar", teamB: "Suíça", phase: "Fase de Grupos", date: "13/06 (Sáb) - 16:00", result: null },
    { id: "1_bra_mar", teamA: "Brasil", teamB: "Marrocos", phase: "Fase de Grupos", date: "13/06 (Sáb) - 19:00", result: null },
    { id: "1_hai_sco", teamA: "Haiti", teamB: "Escócia", phase: "Fase de Grupos", date: "13/06 (Sáb) - 22:00", result: null },
    { id: "1_aus_tur", teamA: "Austrália", teamB: "Turquia", phase: "Fase de Grupos", date: "14/06 (Dom) - 01:00", result: null },
    { id: "1_ger_cuw", teamA: "Alemanha", teamB: "Curaçau", phase: "Fase de Grupos", date: "14/06 (Dom) - 14:00", result: null },
    { id: "1_civ_ecu", teamA: "Costa do Marfim", teamB: "Equador", phase: "Fase de Grupos", date: "14/06 (Dom) - 20:00", result: null },
    { id: "1_ned_jpn", teamA: "Holanda", teamB: "Japão", phase: "Fase de Grupos", date: "14/06 (Dom) - 17:00", result: null },
    { id: "1_swe_tun", teamA: "Suécia", teamB: "Tunísia", phase: "Fase de Grupos", date: "14/06 (Dom) - 23:00", result: null },
    { id: "1_esp_cpv", teamA: "Espanha", teamB: "Cabo Verde", phase: "Fase de Grupos", date: "15/06 (Seg) - 13:00", result: null },
    { id: "1_ksa_uru", teamA: "Arábia Saudita", teamB: "Uruguai", phase: "Fase de Grupos", date: "15/06 (Seg) - 19:00", result: null },
    { id: "1_bel_egy", teamA: "Bélgica", teamB: "Egito", phase: "Fase de Grupos", date: "15/06 (Seg) - 16:00", result: null },
    { id: "1_irn_nzl", teamA: "Irã", teamB: "Nova Zelândia", phase: "Fase de Grupos", date: "15/06 (Seg) - 22:00", result: null },
    { id: "1_fra_sen", teamA: "França", teamB: "Senegal", phase: "Fase de Grupos", date: "16/06 (Ter) - 16:00", result: null },
    { id: "1_irq_nor", teamA: "Iraque", teamB: "Noruega", phase: "Fase de Grupos", date: "16/06 (Ter) - 19:00", result: null },
    { id: "1_arg_alg", teamA: "Argentina", teamB: "Argélia", phase: "Fase de Grupos", date: "16/06 (Ter) - 22:00", result: null },
    { id: "1_aut_jor", teamA: "Áustria", teamB: "Jordânia", phase: "Fase de Grupos", date: "17/06 (Qua) - 01:00", result: null },
    { id: "1_por_cod", teamA: "Portugal", teamB: "R. D. do Congo", phase: "Fase de Grupos", date: "17/06 (Qua) - 14:00", result: null },
    { id: "1_eng_cro", teamA: "Inglaterra", teamB: "Croácia", phase: "Fase de Grupos", date: "17/06 (Qua) - 17:00", result: null },
    { id: "1_gha_pan", teamA: "Gana", teamB: "Panamá", phase: "Fase de Grupos", date: "17/06 (Qua) - 20:00", result: null },
    { id: "1_uzb_col", teamA: "Uzbequistão", teamB: "Colômbia", phase: "Fase de Grupos", date: "17/06 (Qua) - 21:00", result: null },
    { id: "2_cze_rsa", teamA: "República Tcheca", teamB: "África do Sul", phase: "Fase de Grupos", date: "18/06 (Qui) - 13:00", result: null },
    { id: "2_sui_bih", teamA: "Suíça", teamB: "Bósnia e Herzegovina", phase: "Fase de Grupos", date: "18/06 (Qui) - 16:00", result: null },
    { id: "2_can_qat", teamA: "Canadá", teamB: "Catar", phase: "Fase de Grupos", date: "18/06 (Qui) - 19:00", result: null },
    { id: "2_mex_kor", teamA: "México", teamB: "República da Coreia", phase: "Fase de Grupos", date: "18/06 (Qui) - 22:00", result: null },
    { id: "2_usa_aus", teamA: "Estados Unidos", teamB: "Austrália", phase: "Fase de Grupos", date: "19/06 (Sex) - 16:00", result: null },
    { id: "2_sco_mar", teamA: "Escócia", teamB: "Marrocos", phase: "Fase de Grupos", date: "19/06 (Sex) - 19:00", result: null },
    { id: "2_bra_hai", teamA: "Brasil", teamB: "Haiti", phase: "Fase de Grupos", date: "19/06 (Sex) - 21:30", result: null },
    { id: "2_tur_par", teamA: "Turquia", teamB: "Paraguai", phase: "Fase de Grupos", date: "20/06 (Sáb) - 00:00", result: null },
    { id: "2_ger_civ", teamA: "Alemanha", teamB: "Costa do Marfim", phase: "Fase de Grupos", date: "20/06 (Sáb) - 17:00", result: null },
    { id: "2_ecu_cuw", teamA: "Equador", teamB: "Curaçau", phase: "Fase de Grupos", date: "20/06 (Sáb) - 21:00", result: null },
    { id: "2_ned_swe", teamA: "Holanda", teamB: "Suécia", phase: "Fase de Grupos", date: "20/06 (Sáb) - 14:00", result: null },
    { id: "2_tun_jpn", teamA: "Tunísia", teamB: "Japão", phase: "Fase de Grupos", date: "20/06 (Sáb) - 23:00", result: null },
    { id: "2_esp_ksa", teamA: "Espanha", teamB: "Arábia Saudita", phase: "Fase de Grupos", date: "21/06 (Dom) - 13:00", result: null },
    { id: "2_bel_irn", teamA: "Bélgica", teamB: "Irã", phase: "Fase de Grupos", date: "21/06 (Dom) - 16:00", result: null },
    { id: "2_uru_cpv", teamA: "Uruguai", teamB: "Cabo Verde", phase: "Fase de Grupos", date: "21/06 (Dom) - 19:00", result: null },
    { id: "2_nzl_egy", teamA: "Nova Zelândia", teamB: "Egito", phase: "Fase de Grupos", date: "21/06 (Dom) - 22:00", result: null },
    { id: "2_arg_aut", teamA: "Argentina", teamB: "Áustria", phase: "Fase de Grupos", date: "22/06 (Seg) - 14:00", result: null },
    { id: "2_fra_irq", teamA: "França", teamB: "Iraque", phase: "Fase de Grupos", date: "22/06 (Seg) - 18:00", result: null },
    { id: "2_nor_sen", teamA: "Noruega", teamB: "Senegal", phase: "Fase de Grupos", date: "22/06 (Seg) - 21:00", result: null },
    { id: "2_jor_alg", teamA: "Jordânia", teamB: "Argélia", phase: "Fase de Grupos", date: "23/06 (Ter) - 00:00", result: null },
    { id: "2_por_uzb", teamA: "Portugal", teamB: "Uzbequistão", phase: "Fase de Grupos", date: "23/06 (Ter) - 14:00", result: null },
    { id: "2_eng_gha", teamA: "Inglaterra", teamB: "Gana", phase: "Fase de Grupos", date: "23/06 (Ter) - 17:00", result: null },
    { id: "2_pan_cro", teamA: "Panamá", teamB: "Croácia", phase: "Fase de Grupos", date: "23/06 (Ter) - 20:00", result: null },
    { id: "2_col_cod", teamA: "Colômbia", teamB: "R. D. do Congo", phase: "Fase de Grupos", date: "23/06 (Ter) - 23:00", result: null },
    { id: "3_sui_can", teamA: "Suíça", teamB: "Canadá", phase: "Fase de Grupos", date: "24/06 (Qua) - 16:00", result: null },
    { id: "3_bih_qat", teamA: "Bósnia e Herzegovina", teamB: "Catar", phase: "Fase de Grupos", date: "24/06 (Qua) - 16:00", result: null },
    { id: "3_sco_bra", teamA: "Escócia", teamB: "Brasil", phase: "Fase de Grupos", date: "24/06 (Qua) - 19:00", result: null },
    { id: "3_mar_hai", teamA: "Marrocos", teamB: "Haiti", phase: "Fase de Grupos", date: "24/06 (Qua) - 19:00", result: null },
    { id: "3_cze_mex", teamA: "República Tcheca", teamB: "México", phase: "Fase de Grupos", date: "24/06 (Qua) - 22:00", result: null },
    { id: "3_rsa_kor", teamA: "África do Sul", teamB: "República da Coreia", phase: "Fase de Grupos", date: "24/06 (Qua) - 22:00", result: null },
    { id: "3_ecu_ger", teamA: "Equador", teamB: "Alemanha", phase: "Fase de Grupos", date: "25/06 (Qui) - 17:00", result: null },
    { id: "3_cuw_civ", teamA: "Curaçau", teamB: "Costa do Marfim", phase: "Fase de Grupos", date: "25/06 (Qui) - 17:00", result: null },
    { id: "3_jpn_swe", teamA: "Japão", teamB: "Suécia", phase: "Fase de Grupos", date: "25/06 (Qui) - 20:00", result: null },
    { id: "3_tun_ned", teamA: "Tunísia", teamB: "Holanda", phase: "Fase de Grupos", date: "25/06 (Qui) - 20:00", result: null },
    { id: "3_tur_usa", teamA: "Turquia", teamB: "Estados Unidos", phase: "Fase de Grupos", date: "25/06 (Qui) - 23:00", result: null },
    { id: "3_par_aus", teamA: "Paraguai", teamB: "Austrália", phase: "Fase de Grupos", date: "25/06 (Qui) - 23:00", result: null },
    { id: "3_nor_fra", teamA: "Noruega", teamB: "França", phase: "Fase de Grupos", date: "26/06 (Sex) - 16:00", result: null },
    { id: "3_sen_irq", teamA: "Senegal", teamB: "Iraque", phase: "Fase de Grupos", date: "26/06 (Sex) - 16:00", result: null },
    { id: "3_cbv_ksa", teamA: "Cabo Verde", teamB: "Arábia Saudita", phase: "Fase de Grupos", date: "26/06 (Sex) - 21:00", result: null },
    { id: "3_uru_esp", teamA: "Uruguai", teamB: "Espanha", phase: "Fase de Grupos", date: "26/06 (Sex) - 21:00", result: null },
    { id: "3_egy_irn", teamA: "Egito", teamB: "Irã", phase: "Fase de Grupos", date: "27/06 (Sáb) - 00:00", result: null },
    { id: "3_nzl_bel", teamA: "Nova Zelândia", teamB: "Bélgica", phase: "Fase de Grupos", date: "27/06 (Sáb) - 00:00", result: null },
    { id: "3_pan_eng", teamA: "Panamá", teamB: "Inglaterra", phase: "Fase de Grupos", date: "27/06 (Sáb) - 18:00", result: null },
    { id: "3_cro_gha", teamA: "Croácia", teamB: "Gana", phase: "Fase de Grupos", date: "27/06 (Sáb) - 18:00", result: null },
    { id: "3_col_por", teamA: "Colômbia", teamB: "Portugal", phase: "Fase de Grupos", date: "27/06 (Sáb) - 20:30", result: null },
    { id: "3_cod_uzb", teamA: "República Democrática do Congo", teamB: "Uzbequistão", phase: "Fase de Grupos", date: "27/06 (Sáb) - 20:30", result: null },
    { id: "3_alg_aut", teamA: "Argélia", teamB: "Áustria", phase: "Fase de Grupos", date: "27/06 (Sáb) - 23:00", result: null },
    { id: "3_jor_arg", teamA: "Jordânia", teamB: "Argentina", phase: "Fase de Grupos", date: "27/06 (Sáb) - 23:00", result: null }
  ]);
  const [preds, setPreds] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: dbParticipants } = await supabase.from('participantes').select('*');
        if (dbParticipants) setParticipants(dbParticipants);

        const { data: dbJogos } = await supabase.from('jogos').select('*');
        if (dbJogos && dbJogos.length > 0) {
          const formatados = dbJogos.map(j => ({
            id: j.id, teamA: j.team_a, teamB: j.team_b, phase: j.phase, date: j.match_date,
            result: (j.result_a !== null && j.result_b !== null) ? { a: j.result_a, b: j.result_b } : null
          }));
          setMatches(formatados);
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
      } catch (err) {
        console.error("Erro no Supabase:", err);
      }
      setReady(true);
    })();
  }, []);

 // 1. Salvar Participantes
  const sp = async (d) => {
    setParticipants(d);
    const { error } = await supabase.from('participantes').upsert(d);
    if (error) console.error("Erro ao salvar participante:", error.message);
  };

// 2. Salvar Jogos e Resultados Reais
  const sm = async (d) => {
    setMatches(d);
    const jogosFormatados = d.map(j => ({
      id: j.id, team_a: j.teamA, team_b: j.teamB, phase: j.phase, match_date: j.date || "TBD",
      result_a: j.result ? j.result.a : null, result_b: j.result ? j.result.b : null
    }));
    const { error } = await supabase.from('jogos').upsert(jogosFormatados);
    if (error) console.error("Erro ao salvar jogos:", error.message);
  };

// 3. Salvar Palpites da Galera
  const spr = async (d) => {
    setPreds(d);
    const palpitesParaSalvar = [];
    Object.keys(d).forEach(participante_id => {
      Object.keys(d[participante_id]).forEach(jogo_id => {
        const palpite = d[participante_id][jogo_id];
        if (palpite.a !== "" && palpite.b !== "" && palpite.a !== null && palpite.b !== null) {
          palpitesParaSalvar.push({
            participante_id: participante_id,
            jogo_id: jogo_id,
            palpite_a: parseInt(palpite.a),
            palpite_b: parseInt(palpite.b)
          });
        }
      });
    });
    if (palpitesParaSalvar.length > 0) {
      const { error } = await supabase.from('palpites').upsert(palpitesParaSalvar, { onConflict: 'participante_id, jogo_id' });
      if (error) console.error("Erro ao salvar palpites:", error.message);
    }
  };

  const TABS = [
    { id: "placar", label: "🏆 Placar" },
    { id: "participantes", label: "👥 Participantes" },
    { id: "jogos", label: "⚽ Jogos" },
    { id: "palpites", label: "📋 Palpites" },
    { id: "visao", label: "📊 Visão Geral" },
  ];

  if (!ready) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontFamily: "sans-serif", fontSize: 18 }}>
        ⚽ Conectando ao Banco de Dados...
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Nunito', system-ui, sans-serif", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;600;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, button, textarea { font-family: 'Nunito', system-ui, sans-serif; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        select option { background: #10171d; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 3, color: C.gold }}>
          ⚽ BOLÃO DA COPA
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: C.muted, fontSize: 13 }}>
            {participants.length} participante{participants.length !== 1 ? "s" : ""}
          </span>
          {participants.length > 0 && (
            <span style={{ background: `${C.gold}1a`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 20, padding: "3px 12px", fontWeight: 700, fontSize: 13 }}>
              R$ {(participants.length * 100).toLocaleString("pt-BR")}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ border: "none", cursor: "pointer", padding: "12px 18px", whiteSpace: "nowrap", background: "transparent", color: tab === t.id ? C.green : C.muted, borderBottom: `2px solid ${tab === t.id ? C.green : "transparent"}`, fontWeight: 700, fontSize: 13, fontFamily: "inherit", transition: "color .15s" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 16px" }}>
        {tab === "placar" && <TabPlacar participants={participants} matches={matches} preds={preds} />}
        {tab === "participantes" && <TabParticipantes participants={participants} onChange={sp} />}
        {tab === "jogos" && <TabJogos matches={matches} onChange={sm} />}
        {tab === "palpites" && <TabPalpites participants={participants} matches={matches} preds={preds} onChange={spr} />}
        {tab === "visao" && <TabVisao participants={participants} matches={matches} preds={preds} />}
      </div>
    </div>
  );
}