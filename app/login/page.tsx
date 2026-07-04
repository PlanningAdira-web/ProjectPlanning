"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState<"login"|"guest"|null>(null)

  async function doLogin(guest = false) {
    setError(""); setLoading(guest ? "guest" : "login")
    try {
      const res  = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guest ? { guest: true } : { username, password }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error); return }
      router.push("/dashboard"); router.refresh()
    } catch { setError("Gagal terhubung ke server.") }
    finally  { setLoading(null) }
  }

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f4f9f4", fontFamily:"system-ui,sans-serif" }}>
      <div style={{ width:400, background:"#fff", borderRadius:16, border:"0.5px solid #c8e6c9", padding:"36px 32px 28px", boxShadow:"0 4px 40px rgba(0,0,0,.08)" }}>

        {/* Logo + Tulisan */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          {/* Logo bulat */}
          <div style={{ width:72, height:72, borderRadius:16, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px", overflow:"hidden", border:"0.5px solid #c8e6c9", boxShadow:"0 2px 12px rgba(0,0,0,.08)" }}>
            <Image src="/Logo.svg" alt="Logo PT Adira Semesta Industry" width={64} height={64} style={{ objectFit:"contain" }} priority/>
          </div>
          {/* Tulisan */}
          <div style={{ display:"flex", justifyContent:"center", marginBottom:4 }}>
            <Image src="/Tulisan.svg" alt="Production Planning PT Adira Semesta Industry" width={260} height={79} style={{ objectFit:"contain" }} priority/>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={e => { e.preventDefault(); doLogin() }}>
          <div style={{ marginBottom:12 }}>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Username" autoFocus
              style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"0.5px solid #c8e6c9", fontSize:13, background:"#f4f9f4", outline:"none", boxSizing:"border-box" as const }}
              onFocus={e => e.target.style.borderColor="#2e7d32"}
              onBlur={e  => e.target.style.borderColor="#c8e6c9"}
            />
          </div>
          <div style={{ marginBottom:18 }}>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"0.5px solid #c8e6c9", fontSize:13, background:"#f4f9f4", outline:"none", boxSizing:"border-box" as const }}
              onFocus={e => e.target.style.borderColor="#2e7d32"}
              onBlur={e  => e.target.style.borderColor="#c8e6c9"}
            />
          </div>
          {error && (
            <div style={{ background:"#ffebee", border:"0.5px solid #ef9a9a", borderRadius:8, padding:"9px 13px", fontSize:12, color:"#c62828", marginBottom:14, display:"flex", alignItems:"center", gap:7 }}>
              ⚠ {error}
            </div>
          )}
          <button type="submit" disabled={loading !== null}
            style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:loading ? "#a5d6a7" : "#2e7d32", color:"#fff", fontSize:13, fontWeight:600, cursor:loading ? "not-allowed" : "pointer", marginBottom:10 }}>
            {loading === "login" ? "Masuk..." : "Masuk"}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <div style={{ flex:1, height:"0.5px", background:"#c8e6c9" }}/><span style={{ fontSize:11, color:"#6b8f72" }}>atau</span><div style={{ flex:1, height:"0.5px", background:"#c8e6c9" }}/>
        </div>

        {/* Guest */}
        <button type="button" onClick={() => doLogin(true)} disabled={loading !== null}
          style={{ width:"100%", padding:"11px", borderRadius:10, border:"0.5px solid #c8e6c9", background:"#f4f9f4", color:"#3d5a42", fontSize:13, fontWeight:500, cursor:loading ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          {loading === "guest" ? "Masuk..." : "Login as Guest"}
        </button>

        {/* Info role */}
        <div style={{ marginTop:20, padding:"12px 14px", background:"#f4f9f4", borderRadius:10, fontSize:11, color:"#6b8f72", lineHeight:1.8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#2e7d32", display:"inline-block" }}></span>
            <span><strong style={{ color:"#1a5c2a" }}>Analyst</strong> — refresh analisis AI + chat + balancing</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#00897b", display:"inline-block" }}></span>
            <span><strong style={{ color:"#1a5c2a" }}>Planning</strong> — chat AI + balancing</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#aaa", display:"inline-block" }}></span>
            <span><strong style={{ color:"#1a5c2a" }}>Guest</strong> — lihat dashboard (read-only)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
