"use client"
import { useEffect, useRef, useState } from "react"

type Page = "viz" | "chat" | "alert" | "fore"
type Msg  = { role: "user" | "assistant"; content: string }
type KPI  = { model1?: any; model2?: any; model3?: any; sheet_names?: string[]; updated_at?: string }
type Alert = { level: string; model: string; title: string; body: string; po: string | null }

const QUICK = [
  { label: "Status produksi hari ini", text: "Berikan ringkasan status produksi hari ini." },
  { label: "PO berisiko",              text: "PO mana yang paling berisiko terlambat?" },
  { label: "Checklist belum siap",     text: "Item pre-production apa yang belum siap?" },
  { label: "Forecast shipment",        text: "Prediksi volume shipment bulan depan." },
]

const PAGE_META: Record<Page, { title: string; badge: string }> = {
  viz:   { title: "Visualisasi Produksi",  badge: "Live"     },
  chat:  { title: "Chat Room AI",          badge: "AI Ready" },
  alert: { title: "Alert Otomatis",        badge: "Aktif"    },
  fore:  { title: "Forecasting",           badge: "Model 3"  },
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#f4f3ef", borderRadius: 8, padding: "12px 14px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: color ?? "#111", lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const [page,    setPage]    = useState<Page>("viz")
  const [kpi,     setKpi]     = useState<KPI>({})
  const [alerts,  setAlerts]  = useState<Alert[]>([])
  const [acked,   setAcked]   = useState<Set<number>>(new Set())
  const [msgs,    setMsgs]    = useState<Msg[]>([
    { role: "assistant", content: "Halo! Saya AI Planning Assistant Anda.\nSaya sudah terhubung ke spreadsheet Anda. Silakan tanya apa saja tentang status produksi, checklist, atau forecast." }
  ])
  const [input,   setInput]   = useState("")
  const [typing,  setTyping]  = useState(false)
  const [kpiLoad, setKpiLoad] = useState(true)
  const [altLoad, setAltLoad] = useState(false)
  const [clock,   setClock]   = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB")
    tick(); const id = setInterval(tick, 10000); return () => clearInterval(id)
  }, [])

  // Fetch KPI
  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => { setKpi(d); setKpiLoad(false) })
      .catch(() => setKpiLoad(false))
  }, [])

  // Fetch alerts when page = alert
  useEffect(() => {
    if (page !== "alert" || alerts.length > 0) return
    setAltLoad(true)
    fetch("/api/alerts")
      .then(r => r.json())
      .then(d => { setAlerts(d.alerts ?? []); setAltLoad(false) })
      .catch(() => setAltLoad(false))
  }, [page])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs, typing])

  async function sendChat(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || typing) return
    setInput("")
    const next: Msg[] = [...msgs, { role: "user", content: userText }]
    setMsgs(next)
    setTyping(true)
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history: msgs }),
      })
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let full = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += dec.decode(value, { stream: true })
        setMsgs([...next, { role: "assistant", content: full }])
      }
    } catch {
      setMsgs([...next, { role: "assistant", content: "❌ Gagal terhubung ke AI. Cek koneksi dan coba lagi." }])
    } finally {
      setTyping(false)
    }
  }

  const navIcons: Record<Page, string> = {
    viz: "ti-layout-dashboard", chat: "ti-message-2",
    alert: "ti-bell-ringing", fore: "ti-trending-up",
  }
  const alertColor = (level: string) =>
    level === "danger" ? "#fde8e8" : level === "warn" ? "#fef3c7" : "#dbeafe"
  const alertTextColor = (level: string) =>
    level === "danger" ? "#b91c1c" : level === "warn" ? "#92400e" : "#1e40af"

  const val = (v: any, suffix = "") => v !== undefined && v !== null && v !== "" ? `${v}${suffix}` : "—"

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui,sans-serif" }}>

      {/* Sidebar */}
      <nav style={{ width: 52, background: "#f4f3ef", borderRight: "0.5px solid rgba(0,0,0,.1)", display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", gap: 4 }}>
        {(["viz","chat","alert","fore"] as Page[]).map(p => (
          <button key={p} onClick={() => setPage(p)}
            title={PAGE_META[p].title}
            style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, border: "none",
              background: page === p ? "rgba(55,138,221,.15)" : "transparent",
              color: page === p ? "#185FA5" : "#aaa" }}>
            <i className={`ti ${navIcons[p]}`}/>
          </button>
        ))}
        <div style={{ flex: 1 }}/>
        <button style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, border: "none", background: "transparent", color: "#aaa", cursor: "pointer" }}>
          <i className="ti ti-settings"/>
        </button>
      </nav>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Topbar */}
        <div style={{ height: 44, borderBottom: "0.5px solid rgba(0,0,0,.1)", display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0, background: "#fff" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{PAGE_META[page].title}</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#d1fae5", color: "#065f46", fontWeight: 500 }}>{PAGE_META[page].badge}</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {kpi.sheet_names && (
              <span style={{ fontSize: 10, color: "#aaa" }}>{kpi.sheet_names.length} sheets terhubung</span>
            )}
            <span style={{ fontSize: 11, color: "#aaa" }}>{clock}</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

          {/* ── VIZ ── */}
          {page === "viz" && (
            <div>
              <div style={{ fontSize: 12, color: "#aaa", marginBottom: 12 }}>
                {kpiLoad ? "Memuat data dari spreadsheet..." : kpi.updated_at ? `Diperbarui: ${new Date(kpi.updated_at).toLocaleString("id-ID")}` : ""}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 16 }}>
                <MetricCard label="Total PO Aktif"    value={val(kpi.model1?.total_po)}    color="#185FA5" />
                <MetricCard label="PO Berisiko"       value={val(kpi.model1?.at_risk)}      color="#b91c1c" />
                <MetricCard label="Deviasi Output"    value={val(kpi.model1?.avg_deviation_pct, "%")} sub="aktual vs plan" color="#92400e" />
                <MetricCard label="OTD Rate"          value={val(kpi.model3?.otd_rate_pct, "%")} color="#065f46" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginBottom: 16 }}>
                <MetricCard label="PO Siap"           value={val(kpi.model2?.siap)}         color="#065f46" />
                <MetricCard label="PO Berisiko"       value={val(kpi.model2?.berisiko)}      color="#92400e" />
                <MetricCard label="PO Terlambat"      value={val(kpi.model2?.terlambat)}     color="#b91c1c" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
                <MetricCard label="Root Cause Utama"      value={val(kpi.model3?.top_root_cause)} />
                <MetricCard label="Forecast Bulan Depan"  value={val(kpi.model3?.next_month_forecast_pcs, " pcs")} color="#92400e" />
                <MetricCard label="WIP Status"            value={val(kpi.model1?.wip_status)} />
              </div>
              {kpi.model2?.critical_po && (
                <div style={{ marginTop: 12, background: "#fde8e8", border: "0.5px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#b91c1c" }}>
                  <strong>⚠ PO Paling Kritis:</strong> {kpi.model2.critical_po} — {kpi.model2.critical_days_left} hari lagi mulai produksi. Item belum siap: {kpi.model2.most_missing_item}
                </div>
              )}
            </div>
          )}

          {/* ── CHAT ── */}
          {page === "chat" && (
            <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
              <div style={{ fontSize: 11, color: "#aaa", marginBottom: 10 }}>
                Terhubung ke spreadsheet: {kpi.sheet_names?.join(", ") || "memuat..."}
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {msgs.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    background: m.role === "user" ? "rgba(55,138,221,.12)" : "#f4f3ef",
                    border: `0.5px solid ${m.role === "user" ? "rgba(55,138,221,.3)" : "rgba(0,0,0,.08)"}`,
                    borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    padding: "9px 13px", fontSize: 13,
                    color: m.role === "user" ? "#185FA5" : "#111",
                    lineHeight: 1.6, whiteSpace: "pre-wrap",
                  }}>{m.content}{typing && i === msgs.length - 1 && m.role === "assistant" ? "▍" : ""}</div>
                ))}
                {typing && msgs[msgs.length-1]?.role !== "assistant" && (
                  <div style={{ alignSelf: "flex-start", fontSize: 12, color: "#aaa" }}>AI sedang menganalisis data...</div>
                )}
                <div ref={bottomRef}/>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 8px" }}>
                {QUICK.map(q => (
                  <button key={q.label} onClick={() => sendChat(q.text)} disabled={typing}
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "0.5px solid rgba(0,0,0,.12)", background: "#f4f3ef", color: "#555" }}>
                    {q.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                  placeholder="Tanya tentang data produksi Anda..."
                  disabled={typing}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "0.5px solid rgba(0,0,0,.15)", background: "#f9f9f8" }}/>
                <button onClick={() => sendChat()} disabled={typing || !input.trim()}
                  style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, border: "0.5px solid rgba(55,138,221,.4)", background: "rgba(55,138,221,.12)", color: "#185FA5", cursor: "pointer", fontWeight: 500 }}>
                  {typing ? "..." : "Kirim"}
                </button>
              </div>
            </div>
          )}

          {/* ── ALERT ── */}
          {page === "alert" && (
            <div>
              {altLoad && <div style={{ color: "#aaa", fontSize: 12, marginBottom: 12 }}>Claude sedang menganalisis data untuk membuat alert...</div>}
              {!altLoad && alerts.length === 0 && (
                <div style={{ color: "#aaa", fontSize: 12, textAlign: "center", padding: 40 }}>Tidak ada alert aktif saat ini ✓</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{ border: "0.5px solid rgba(0,0,0,.1)", borderRadius: 8, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start", opacity: acked.has(i) ? 0.4 : 1, transition: "opacity .3s" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: alertColor(a.level), color: alertTextColor(a.level), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                      <i className={a.level === "danger" ? "ti ti-alert-triangle" : a.level === "warn" ? "ti ti-clock-exclamation" : "ti ti-info-circle"}/>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{a.title}</div>
                      <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{a.body}</div>
                      <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{a.model}{a.po ? ` · ${a.po}` : ""}</div>
                    </div>
                    <button onClick={() => setAcked(prev => new Set([...prev, i]))} disabled={acked.has(i)}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "0.5px solid rgba(0,0,0,.12)", background: "#f4f3ef", color: "#555", flexShrink: 0 }}>
                      {acked.has(i) ? "Dibaca" : "Tandai dibaca"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── FORECAST ── */}
          {page === "fore" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginBottom: 16 }}>
                <MetricCard label="OTD Rate"              value={val(kpi.model3?.otd_rate_pct, "%")}            color="#065f46" />
                <MetricCard label="Rata-rata Delay"       value={val(kpi.model3?.avg_delay_days, " hari")}      color="#92400e" />
                <MetricCard label="Root Cause #1"         value={val(kpi.model3?.top_root_cause)} />
                <MetricCard label="Forecast Bulan Depan"  value={val(kpi.model3?.next_month_forecast_pcs, " pcs")} color="#92400e" />
              </div>
              <div style={{ border: "0.5px solid rgba(0,0,0,.1)", borderRadius: 8, padding: "14px 16px", background: "#f9f9f8" }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Analisis Mendalam via Chat</div>
                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.7, marginBottom: 10 }}>
                  Untuk chart dan analisis forecasting yang lebih mendalam, gunakan Chat Room AI dan tanyakan langsung ke Claude:
                </div>
                {["Tampilkan pola seasonal volume order per bulan dari history","Buyer mana yang paling sering terlambat shipment?","Berapa kapasitas produksi yang dibutuhkan untuk 3 bulan ke depan?"].map(q => (
                  <button key={q} onClick={() => { setPage("chat"); setTimeout(() => sendChat(q), 100) }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", marginBottom: 6, borderRadius: 6, border: "0.5px solid rgba(0,0,0,.1)", background: "#fff", cursor: "pointer", fontSize: 12, color: "#185FA5" }}>
                    → {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
    </div>
  )
}
