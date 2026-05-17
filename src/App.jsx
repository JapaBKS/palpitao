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

// Verifica se a hora atual já passou da hora do jogo (Bloqueio Automático)
function isLocked(dateStr) {
  if (!dateStr || dateStr.includes("TBD")) return false;
  try {
    const match = dateStr.match(/(\d{2})\/(\d{2}).*- (\d{2}):(\d{2})/);
    if (!match) return false;
    const [, day, month, hour, minute] = match;
    // Formato ISO: Ano-Mês-DiaTHora:Minuto:00-03:00 (Fuso horário de Brasília)
    const matchDate = new Date(`2026-${month}-${day}T${hour}:${minute}:00-03:00`);
    return new Date() > matchDate;
  } catch {
    return false;
  }
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
  color: C.text, padding: "10px 12px", fontSize: 14, fontFamily: "inherit",
  outline: "none", width: "100%", ...extra,
});
const BTN = (extra = {}) => ({
  background: C.greenDim, border: "none", borderRadius: 8, color: "#fff",
  padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  fontFamily: "inherit", whiteSpace: "nowrap", ...extra,
});
const GHOST_BTN = (extra = {}) => ({
  background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted,
  padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", ...extra,
});

const ptsColor = { 10: C.gold, 7: C.green, 5: C.blue, 2: C.bronze, 0: C.muted };
const ptsBg = { 10: "#1a1200", 7: "#001a0d", 5: "#001428", 2: "#1a0a00", 0: "#101a17" };

/* ── Sub-components ── */
function Empty({ icon, msg }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div><div style={{ fontSize: 15 }}>{msg}</div>
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
  return <input type="number" min="0" max="99" value={value} onChange={(e) => onChange(e.target.value)} style={INP({ width: 52, textAlign: "center", padding: "8px 4px" })} />;
}

function Divider({ label }) {
  return <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 17, letterSpacing: 1, color: C.muted, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 10 }}>{label}</div>;
}

/* ── Tabs ── */
function TabPlacar({ participants, matches, preds }) {
  const ranked = getRanked(participants, matches, preds);
  const total = participants.length * 100;
  const played = matches.filter((m) => m.result).length;
  const medals = ["🥇", "🥈", "🥉"];
  const prizes = [ { color: C.gold, pct: "70%", val: Math.round(total * 0.7) }, { color: C.silver, pct: "20%", val: Math.round(total * 0.2) }, { color: C.bronze, pct: "10%", val: Math.round(total * 0.1) } ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {prizes.map((pr, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${pr.color}44`, borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>{medals[i]}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{i === 0 ? "1º" : i === 1 ? "2º" : "3º"} ({pr.pct})</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1, color: pr.color, marginTop: 4 }}>R$ {pr.val.toLocaleString("pt-BR")}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>⚽ {played}/{matches.length} jogos com resultado</span><span>💰 Total: R$ {total.toLocaleString("pt-BR")}</span><span>👥 {participants.length} jogadores</span>
      </div>
      {participants.length === 0 && <Empty icon="👥" msg="Nenhum participante." />}
      {ranked.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {ranked.map((p, i) => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr 64px 40px 40px 40px", gap: 8, padding: "14px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : 'none', background: i === 0 ? `${C.gold}0a` : i === 1 ? `${C.silver}0a` : i === 2 ? `${C.bronze}0a` : "transparent" }}>
              <span style={{ display: "flex", alignItems: "center", fontSize: i < 3 ? 20 : 14, color: i >= 3 ? C.muted : undefined }}>{i < 3 ? medals[i] : `${i + 1}º`}</span>
              <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                {!p.paid && <span style={{ fontSize: 10, background: `${C.red}22`, color: C.red, padding: "1px 6px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}>Pix ⚠️</span>}
              </span>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, display: "flex", alignItems: "center", justifyContent: "flex-end", color: i === 0 ? C.gold : i === 1 ? C.silver : i === 2 ? C.bronze : C.text }}>{p.total}</span>
              <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontWeight: 900 }}>{p.c10 || "—"}</span>
              <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontWeight: 900 }}>{p.c7 || "—"}</span>
              <span style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, fontWeight: 900 }}>{p.c5 || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabParticipantes({ participants, onChange, onDelete, isAdmin }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  // Estados para controlar a edição de um usuário existente
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPin, setEditPin] = useState("");

  const add = () => {
    if (!name.trim()) return alert("Por favor, digite seu nome!");
    if (pin.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!");

    onChange([...participants, { id: uid(), name: name.trim(), paid: false, pin: pin }]);
    setName("");
    setPin("");
    
    if (!isAdmin) alert("Conta criada com sucesso! Vá na aba Palpites para fazer login e jogar.");
  };

  const startEdit = (p) => {
    // Se não for o Admin, pede a senha atual para provar que é a própria pessoa
    if (!isAdmin) {
      const authPin = window.prompt(`🔒 Digite a senha atual de ${p.name} para liberar a edição:`);
      if (authPin === null) return; // Se a pessoa clicar em "Cancelar"
      if (authPin !== p.pin) return alert("❌ Senha incorreta!");
    }
    
    setEditingId(p.id);
    setEditName(p.name);
    setEditPin(p.pin);
  };

  const saveEdit = (id) => {
    if (!editName.trim()) return alert("O nome não pode ficar vazio!");
    if (editPin.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!");

    // Atualiza a lista com os novos dados
    const updated = participants.map(p => p.id === id ? { ...p, name: editName.trim(), pin: editPin } : p);
    onChange(updated);
    setEditingId(null);
  };

  const togglePaid = (id) => onChange(participants.map((p) => (p.id === id ? { ...p, paid: !p.paid } : p)));

  return (
    <div>
      {/* Formulário de Cadastro */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12, color: C.text, fontSize: 16 }}>
          {isAdmin ? "⚙️ Adicionar Jogador (Admin)" : "👋 Novo por aqui? Cadastre-se"}
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu Nome" style={INP({ flex: 1, minWidth: 140 })} />
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Senha (mín. 4)" style={INP({ width: 130, textAlign: "center", letterSpacing: 2 })} />
          <button onClick={add} style={BTN()}>{isAdmin ? "+ Adicionar" : "Me Cadastrar"}</button>
        </div>
        {!isAdmin && <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Crie sua conta e senha para registrar seus palpites com segurança. Apenas o administrador aprova o status do pagamento.</p>}
      </div>

      {/* Lista de Participantes */}
      {participants.map((p) => (
        <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          
          {/* Se este usuário for o que está sendo editado, mostra os inputs */}
          {editingId === p.id ? (
            <>
              <input value={editName} onChange={e => setEditName(e.target.value)} style={INP({ flex: 1, minWidth: 120, padding: "6px 10px" })} />
              <input type="password" value={editPin} onChange={e => setEditPin(e.target.value)} placeholder="Nova senha" style={INP({ width: 100, padding: "6px 10px", textAlign: "center" })} />
              <button onClick={() => saveEdit(p.id)} style={BTN({ padding: "6px 12px", fontSize: 12 })}>Salvar</button>
              <button onClick={() => setEditingId(null)} style={GHOST_BTN({ padding: "6px 10px" })}>Cancelar</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontWeight: 700 }}>{p.name}</span>
              <span style={{ fontSize: 12, color: p.paid ? C.green : C.red, fontWeight: 700 }}>{p.paid ? "✅ Pago" : "❌ Pendente"}</span>
              
              {/* Botão de editar liberado para qualquer um tentar (exige senha depois) */}
              <button onClick={() => startEdit(p)} style={GHOST_BTN({ padding: "4px 10px" })}>✏️ Editar</button>
              
              {/* Botões restritos ao Admin */}
              {isAdmin && (
                <>
                  <button onClick={() => togglePaid(p.id)} style={GHOST_BTN({ padding: "4px 10px" })}>Mudar Pix</button>
                  <button onClick={() => { if(window.confirm(`Tem certeza que deseja excluir ${p.name}?`)) onDelete(p.id) }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 22 }}>×</button>
                </>
              )}
            </>
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
      {isAdmin && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="Time A" style={INP()} />
            <div style={{ textAlign: "center", color: C.muted, fontWeight: 900, fontSize: 16 }}>×</div>
            <input value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="Time B" style={INP()} />
          </div>
          <input value={dateStr} onChange={(e) => setDateStr(e.target.value)} placeholder="Data e Horário (ex: 11/06 (Qui) - 16:00)" style={INP({ marginBottom: 10 })} />
          <div style={{ display: "flex", gap: 8 }}>
            <select value={phase} onChange={(e) => setPhase(e.target.value)} style={INP({ flex: 1 })}>{PHASES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            <button onClick={add} style={BTN()}>+ Jogo</button>
          </div>
        </div>
      )}

      {!isAdmin && <div style={{ marginBottom: 16, color: C.gold, fontSize: 13 }}>⚠️ Apenas o administrador insere os placares oficiais.</div>}

      {grouped.map(({ ph, ms }) => (
        <div key={ph} style={{ marginBottom: 24 }}>
          <Divider label={`${ph} (${ms.length})`} />
          {ms.map((m) => (
            <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              {m.date && <span style={{ fontSize: 11, color: isLocked(m.date) ? C.red : C.greenDim, fontWeight: 700 }}>{m.date} {isLocked(m.date) ? " (Encerrado)" : ""}</span>}
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
                    <button onClick={() => setEditId(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20 }}>×</button>
                  </>
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

function TabPalpites({ participants, matches, preds, onChange, savePin, sessionUnlocked, setSessionUnlocked }) {
  const [selPid, setSelPid] = useState("");
  const [pinInput, setPinInput] = useState("");

  const activePid = participants.find((p) => p.id === selPid)?.id || participants[0]?.id || "";
  const activeUser = participants.find((p) => p.id === activePid);

  const setPred = (matchId, side, val) => {
    if (!activePid) return;
    const next = { ...preds, [activePid]: { ...preds[activePid], [matchId]: { ...(preds[activePid]?.[matchId] || {}), [side]: val } } };
    onChange(next);
  };

  const handleUnlock = () => {
    if (!activeUser.pin) {
      if (pinInput.length < 4) return alert("A senha deve ter no mínimo 4 caracteres!");
      savePin(activeUser.id, pinInput);
      setSessionUnlocked({ ...sessionUnlocked, [activeUser.id]: true });
    } else {
      if (activeUser.pin === pinInput) {
        setSessionUnlocked({ ...sessionUnlocked, [activeUser.id]: true });
      } else {
        alert("Senha incorreta!");
      }
    }
  };

  if (participants.length === 0) return <Empty icon="👥" msg="Aguardando cadastros." />;
  if (matches.length === 0) return <Empty icon="⚽" msg="Nenhum jogo disponível." />;

  const stats = activePid ? getStats(activePid, matches, preds) : null;
  const isUnlocked = sessionUnlocked[activePid];
  const grouped = PHASES.map((ph) => ({ ph, ms: matches.filter((m) => m.phase === ph) })).filter((g) => g.ms.length);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {participants.map((p) => (
          <button key={p.id} onClick={() => { setSelPid(p.id); setPinInput(""); }} style={{ border: `1px solid ${activePid === p.id ? C.green : C.border}`, background: activePid === p.id ? `${C.green}1a` : C.card, color: activePid === p.id ? C.green : C.muted, borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>
            {p.name} {sessionUnlocked[p.id] ? "🔓" : "🔒"}
          </button>
        ))}
      </div>

      {!isUnlocked ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 20px", textAlign: "center", marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
          <h3 style={{ marginBottom: 8, color: C.text }}>{activeUser?.pin ? "Área Protegida" : "Crie sua Senha"}</h3>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
            {activeUser?.pin ? `Digite a senha do(a) ${activeUser.name} para editar os palpites.` : `Como é seu primeiro acesso, crie uma senha para proteger seus palpites.`}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", maxWidth: 300, margin: "0 auto" }}>
            <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleUnlock()} placeholder="Senha..." style={INP({ textAlign: "center", letterSpacing: 3 })} />
            <button onClick={handleUnlock} style={BTN()}>{activeUser?.pin ? "Entrar" : "Salvar"}</button>
          </div>
        </div>
      ) : (
        <>
          {stats && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 30, color: C.gold }}>{stats.total}</span>
              <span style={{ color: C.muted, fontSize: 13 }}>pontos</span>
              <span style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>10 × {stats.c10}</span>
            </div>
          )}

          {grouped.map(({ ph, ms }) => (
            <div key={ph} style={{ marginBottom: 24 }}>
              <Divider label={ph} />
              {ms.map((m) => {
                const pred = preds[activePid]?.[m.id] || {};
                const pts = m.result ? calcPts(pred, m.result) : null;
                const locked = isLocked(m.date);
                
                return (
                  <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, marginBottom: 6, opacity: locked ? 0.7 : 1 }}>
                    {m.date && <span style={{ fontSize: 11, color: locked ? C.red : C.greenDim, fontWeight: 700 }}>{m.date} {locked ? " (Tempo Esgotado)" : ""}</span>}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                      <ScoreIn value={pred.a ?? ""} onChange={(v) => setPred(m.id, "a", v)} disabled={locked} />
                      <span style={{ color: C.muted, fontSize: 12 }}>×</span>
                      <ScoreIn value={pred.b ?? ""} onChange={(v) => setPred(m.id, "b", v)} disabled={locked} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                      <PtsBadge pts={pts} />
                    </div>
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

function TabVisao({ participants, matches, preds }) {
  if (participants.length === 0) return <Empty icon="👥" msg="Adicione participantes primeiro." />;
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
            {ranked.map((p) => <th key={p.id} style={{ padding: "8px 6px", textAlign: "center", color: C.text, fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>{p.name.split(" ")[0]}</th>)}
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

/* ── App Shell Principal ── */
export default function BolaoApp() {
  const [tab, setTab] = useState("placar");
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [preds, setPreds] = useState({});
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionUnlocked, setSessionUnlocked] = useState({}); // Controla quem está logado nesta tela

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
      } catch (err) { console.error("Erro no Supabase:", err); }
      setReady(true);
    })();
  }, []);

  const sp = async (d) => {
    setParticipants(d);
    await supabase.from('participantes').upsert(d);
  };

  const removeP = async (id) => {
    // 1. Tira da tela na hora
    setParticipants(participants.filter(p => p.id !== id));
    // 2. Manda o Supabase apagar no banco
    await supabase.from('participantes').delete().eq('id', id);
  };

  const sm = async (d) => {
    setMatches(d);
    const jogosFormatados = d.map(j => ({
      id: j.id, team_a: j.teamA, team_b: j.teamB, phase: j.phase, match_date: j.date || "TBD",
      result_a: j.result ? j.result.a : null, result_b: j.result ? j.result.b : null
    }));
    await supabase.from('jogos').upsert(jogosFormatados);
  };

  const spr = async (d) => {
    setPreds(d);
    const palpitesParaSalvar = [];
    Object.keys(d).forEach(participante_id => {
      Object.keys(d[participante_id]).forEach(jogo_id => {
        const palpite = d[participante_id][jogo_id];
        if (palpite.a !== "" && palpite.b !== "" && palpite.a !== null && palpite.b !== null) {
          palpitesParaSalvar.push({ participante_id, jogo_id, palpite_a: parseInt(palpite.a), palpite_b: parseInt(palpite.b) });
        }
      });
    });
    if (palpitesParaSalvar.length > 0) {
      await supabase.from('palpites').upsert(palpitesParaSalvar, { onConflict: 'participante_id, jogo_id' });
    }
  };

  const savePin = async (userId, pin) => {
    const updated = participants.map(p => p.id === userId ? { ...p, pin } : p);
    setParticipants(updated);
    await supabase.from('participantes').update({ pin }).eq('id', userId);
  };

  const handleAdminLogin = () => {
    if (isAdmin) { setIsAdmin(false); return; }
    const pwd = prompt("Área Restrita. Digite a senha do Administrador:");
    if (pwd === "bruno2026") setIsAdmin(true); // <--- SENHA DO ADMIN AQUI
    else if (pwd !== null) alert("Senha incorreta!");
  };

  const TABS = [
    { id: "placar", label: "🏆 Placar" },
    { id: "participantes", label: "👥 Participantes" },
    { id: "jogos", label: "⚽ Jogos" },
    { id: "palpites", label: "📋 Palpites" },
    { id: "visao", label: "📊 Visão Geral" },
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
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div onDoubleClick={handleAdminLogin} style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 3, color: isAdmin ? C.red : C.gold, cursor: "pointer" }} title="Duplo clique para Admin">
          ⚽ BOLÃO DA COPA {isAdmin && "<ADMIN>"}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ background: `${C.gold}1a`, color: C.gold, border: `1px solid ${C.gold}44`, borderRadius: 20, padding: "3px 12px", fontWeight: 700, fontSize: 13 }}>
            Prêmio Total: R$ {(participants.length * 100).toLocaleString("pt-BR")}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ border: "none", cursor: "pointer", padding: "12px 18px", whiteSpace: "nowrap", background: "transparent", color: tab === t.id ? C.green : C.muted, borderBottom: `2px solid ${tab === t.id ? C.green : "transparent"}`, fontWeight: 700, fontSize: 13, fontFamily: "inherit", transition: "color .15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 16px" }}>
        {tab === "placar" && <TabPlacar participants={participants} matches={matches} preds={preds} />}
        {tab === "participantes" && <TabParticipantes participants={participants} onChange={sp} onDelete={removeP} isAdmin={isAdmin} />}
        {tab === "jogos" && <TabJogos matches={matches} onChange={sm} isAdmin={isAdmin} />}
        {tab === "palpites" && <TabPalpites participants={participants} matches={matches} preds={preds} onChange={spr} savePin={savePin} sessionUnlocked={sessionUnlocked} setSessionUnlocked={setSessionUnlocked} />}
        {tab === "visao" && <TabVisao participants={participants} matches={matches} preds={preds} />}
      </div>
    </div>
  );
}