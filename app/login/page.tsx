"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true)
    try {
      const res  = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username,password}) })
      const data = await res.json()
      if (!data.ok) { setError(data.error); return }
      router.push("/dashboard"); router.refresh()
    } catch { setError("Gagal terhubung ke server") }
    finally  { setLoading(false) }
  }

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f7f7f5",fontFamily:"system-ui,sans-serif"}}>
      <div style={{width:360,background:"#fff",borderRadius:16,border:"0.5px solid rgba(0,0,0,.1)",padding:"32px 32px 28px",boxShadow:"0 4px 32px rgba(0,0,0,.07)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:48,height:48,borderRadius:12,background:"#2a78d6",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
            <i className="ti ti-chart-bar" style={{fontSize:24,color:"#fff"}}/>
          </div>
          <div style={{fontSize:18,fontWeight:600,color:"#111"}}>Planning AI</div>
          <div style={{fontSize:12,color:"#999",marginTop:4}}>PT Adira Semesta Industry</div>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:5}}>Username</label>
            <input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Masukkan username" autoFocus required
              style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"0.5px solid rgba(0,0,0,.15)",fontSize:13,background:"#f7f7f5",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:5}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Masukkan password" required
              style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"0.5px solid rgba(0,0,0,.15)",fontSize:13,background:"#f7f7f5",outline:"none",boxSizing:"border-box"}}/>
          </div>
          {error && (
            <div style={{background:"#fde8e8",border:"0.5px solid #fca5a5",borderRadius:8,padding:"9px 12px",fontSize:12,color:"#b91c1c",marginBottom:14,display:"flex",alignItems:"center",gap:7}}>
              <i className="ti ti-alert-circle" style={{fontSize:14,flexShrink:0}}/>{error}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:loading?"#94a3b8":"#2a78d6",color:"#fff",fontSize:13,fontWeight:600,cursor:loading?"not-allowed":"pointer"}}>
            {loading?"Masuk...":"Masuk →"}
          </button>
        </form>
        <div style={{marginTop:20,padding:"12px 14px",background:"#f7f7f5",borderRadius:8,fontSize:11,color:"#888",lineHeight:1.8}}>
          <div style={{fontWeight:500,color:"#666",marginBottom:4}}>Akses per role:</div>
          <div>👑 <strong>Admin / Analyst</strong> — refresh analisis + chat AI</div>
          <div>📋 <strong>Tim Planning</strong> — chat AI saja</div>
          <div>👁️ <strong>Viewer / Guest</strong> — lihat dashboard (data cache)</div>
        </div>
      </div>
    </div>
  )
}
