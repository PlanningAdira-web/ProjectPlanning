"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router  = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState<"login"|"guest"|null>(null)

  async function doLogin(guest = false) {
    setError("")
    setLoading(guest ? "guest" : "login")
    try {
      const body = guest
        ? { guest: true }
        : { username, password }

      const res  = await fetch("/api/auth/login", {
        method  : "POST",
        headers : { "Content-Type": "application/json" },
        body    : JSON.stringify(body),
      })
      const data = await res.json()

      if (!data.ok) { setError(data.error); return }
      router.push("/dashboard")
      router.refresh()
    } catch {
      setError("Gagal terhubung ke server. Coba lagi.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{
      minHeight     : "100vh",
      display       : "flex",
      alignItems    : "center",
      justifyContent: "center",
      background    : "#f7f7f5",
      fontFamily    : "system-ui, sans-serif",
    }}>
      <div style={{
        width     : 380,
        background: "#fff",
        borderRadius: 16,
        border    : "0.5px solid rgba(0,0,0,.09)",
        padding   : "36px 32px 28px",
        boxShadow : "0 4px 40px rgba(0,0,0,.08)",
      }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{
            width:52, height:52, borderRadius:14,
            background:"#2a78d6", display:"flex",
            alignItems:"center", justifyContent:"center", margin:"0 auto 14px",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
            </svg>
          </div>
          <div style={{ fontSize:20, fontWeight:700, color:"#111", letterSpacing:"-.3px" }}>Planning AI</div>
          <div style={{ fontSize:12, color:"#aaa", marginTop:4 }}>PT Adira Semesta Industry</div>
        </div>

        {/* Form */}
        <form onSubmit={e => { e.preventDefault(); doLogin() }}>

          {/* Username */}
          <div style={{ marginBottom:14 }}>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              autoFocus
              style={{
                width:"100%", padding:"11px 14px", borderRadius:10,
                border:"0.5px solid rgba(0,0,0,.15)", fontSize:13,
                background:"#f7f7f5", outline:"none", boxSizing:"border-box",
                transition:"border-color .15s",
              }}
              onFocus={e  => e.target.style.borderColor="#2a78d6"}
              onBlur={e   => e.target.style.borderColor="rgba(0,0,0,.15)"}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom:20 }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              style={{
                width:"100%", padding:"11px 14px", borderRadius:10,
                border:"0.5px solid rgba(0,0,0,.15)", fontSize:13,
                background:"#f7f7f5", outline:"none", boxSizing:"border-box",
                transition:"border-color .15s",
              }}
              onFocus={e  => e.target.style.borderColor="#2a78d6"}
              onBlur={e   => e.target.style.borderColor="rgba(0,0,0,.15)"}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background:"#fde8e8", border:"0.5px solid #fca5a5",
              borderRadius:8, padding:"9px 13px", fontSize:12,
              color:"#b91c1c", marginBottom:14,
              display:"flex", alignItems:"center", gap:7,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          {/* Tombol Masuk */}
          <button
            type="submit"
            disabled={loading !== null}
            style={{
              width:"100%", padding:"11px", borderRadius:10, border:"none",
              background: loading ? "#94a3b8" : "#2a78d6",
              color:"#fff", fontSize:13, fontWeight:600,
              cursor: loading ? "not-allowed" : "pointer",
              transition:"background .15s", marginBottom:10,
            }}
          >
            {loading === "login" ? "Masuk..." : "Masuk"}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <div style={{ flex:1, height:"0.5px", background:"rgba(0,0,0,.1)" }}/>
          <span style={{ fontSize:11, color:"#bbb" }}>atau</span>
          <div style={{ flex:1, height:"0.5px", background:"rgba(0,0,0,.1)" }}/>
        </div>

        {/* Tombol Guest */}
        <button
          type="button"
          onClick={() => doLogin(true)}
          disabled={loading !== null}
          style={{
            width:"100%", padding:"11px", borderRadius:10,
            border:"0.5px solid rgba(0,0,0,.12)",
            background: loading === "guest" ? "#f0f0f0" : "#f7f7f5",
            color: "#555", fontSize:13, fontWeight:500,
            cursor: loading ? "not-allowed" : "pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            transition:"background .15s",
          }}
          onMouseEnter={e => { if(!loading)(e.currentTarget.style.background="#eee") }}
          onMouseLeave={e => { e.currentTarget.style.background = loading==="guest"?"#f0f0f0":"#f7f7f5" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          {loading === "guest" ? "Masuk..." : "Login as Guest"}
        </button>

        {/* Info hak akses */}
        <div style={{
          marginTop:24, padding:"12px 14px",
          background:"#f7f7f5", borderRadius:10,
          fontSize:11, color:"#999", lineHeight:1.8,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#2a78d6", flexShrink:0, display:"inline-block" }}/>
            <span><strong style={{color:"#555"}}>Analyst</strong> — refresh analisis AI + chat</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#1baf7a", flexShrink:0, display:"inline-block" }}/>
            <span><strong style={{color:"#555"}}>Planning</strong> — chat AI saja</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#aaa", flexShrink:0, display:"inline-block" }}/>
            <span><strong style={{color:"#555"}}>Guest</strong> — lihat dashboard (read-only)</span>
          </div>
        </div>

      </div>
    </div>
  )
}
