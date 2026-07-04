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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guest ? { guest: true } : { username, password }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error); return }
      router.push("/dashboard"); router.refresh()
    } catch { setError("Gagal terhubung ke server.") }
    finally  { setLoading(null) }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f4f9f4",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        width: 420,
        background: "#fff",
        borderRadius: 16,
        border: "0.5px solid #c8e6c9",
        padding: "44px 36px 32px",
        boxShadow: "0 4px 40px rgba(0,0,0,.08)",
      }}>

        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{
            width: 100, height: 100,
            borderRadius: 20,
            background: "#fff",
            border: "0.5px solid #c8e6c9",
            boxShadow: "0 2px 12px rgba(0,0,0,.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", padding: 9,
          }}>
            <Image src="/Logo.svg" alt="Logo PT Adira Semesta Industry" width={82} height={82} style={{ objectFit: "contain" }} priority/>
          </div>
        </div>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a5c2a", letterSpacing: "-.3px", lineHeight: 1.2 }}>
            Production Planning
          </div>
          <div style={{ fontSize: 11, color: "#6b8f72", marginTop: 3 }}>
            PT. Adira Semesta Industry
          </div>
        </div>

        {/* Motto — Opsi A: pill minimalis */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, margin: "16px 0 24px",
          padding: "9px 16px",
          background: "#f4f9f4",
          borderRadius: 30,
          border: "0.5px solid #c8e6c9",
        }}>
          <div style={{ width: 18, height: "0.5px", background: "#c8e6c9", flexShrink: 0 }}/>
          <span style={{ fontSize: 11, color: "#6b8f72", fontStyle: "italic", letterSpacing: ".01em", textAlign: "center" }}>
            "A Goal Without A Plan Is Just A Wish"
          </span>
          <div style={{ width: 18, height: "0.5px", background: "#c8e6c9", flexShrink: 0 }}/>
        </div>

        {/* Form */}
        <form onSubmit={e => { e.preventDefault(); doLogin() }}>
          <input
            type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="Username" autoFocus
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10,
              border: "0.5px solid #c8e6c9", fontSize: 13, background: "#f4f9f4",
              marginBottom: 10, outline: "none", fontFamily: "system-ui",
              boxSizing: "border-box" as const,
            }}
            onFocus={e => e.target.style.borderColor = "#2e7d32"}
            onBlur={e  => e.target.style.borderColor = "#c8e6c9"}
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10,
              border: "0.5px solid #c8e6c9", fontSize: 13, background: "#f4f9f4",
              marginBottom: 18, outline: "none", fontFamily: "system-ui",
              boxSizing: "border-box" as const,
            }}
            onFocus={e => e.target.style.borderColor = "#2e7d32"}
            onBlur={e  => e.target.style.borderColor = "#c8e6c9"}
          />

          {error && (
            <div style={{
              background: "#ffebee", border: "0.5px solid #ef9a9a",
              borderRadius: 8, padding: "9px 13px", fontSize: 12,
              color: "#c62828", marginBottom: 14,
              display: "flex", alignItems: "center", gap: 7,
            }}>
              ⚠ {error}
            </div>
          )}

          <button type="submit" disabled={loading !== null} style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none",
            background: loading ? "#a5d6a7" : "#2e7d32",
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer", marginBottom: 10,
          }}>
            {loading === "login" ? "Masuk..." : "Masuk"}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, height: "0.5px", background: "#c8e6c9" }}/>
          <span style={{ fontSize: 11, color: "#6b8f72" }}>atau</span>
          <div style={{ flex: 1, height: "0.5px", background: "#c8e6c9" }}/>
        </div>

        {/* Guest */}
        <button type="button" onClick={() => doLogin(true)} disabled={loading !== null} style={{
          width: "100%", padding: "11px", borderRadius: 10,
          border: "0.5px solid #c8e6c9", background: "#f4f9f4",
          color: "#3d5a42", fontSize: 13, fontWeight: 500,
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          {loading === "guest" ? "Masuk..." : "Login as Guest"}
        </button>

        {/* Role info */}
        <div style={{
          marginTop: 20, padding: "12px 14px",
          background: "#f4f9f4", borderRadius: 10,
          fontSize: 11, color: "#6b8f72", lineHeight: 1.9,
        }}>
          {[
            { color: "#2e7d32", label: "Analyst",  desc: "refresh analisis AI + chat + balancing" },
            { color: "#00897b", label: "Planning", desc: "chat AI + balancing" },
            { color: "#aaa",    label: "Guest",    desc: "lihat dashboard (read-only)" },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.color, display: "inline-block", flexShrink: 0 }}/>
              <span><strong style={{ color: "#1a5c2a" }}>{r.label}</strong> — {r.desc}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
