import { NextRequest, NextResponse } from "next/server"
import { getSession, can } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })
  if (!can(user.role, "canRefreshAI") && user.role !== "planning")
    return NextResponse.json({ error:"Akses ditolak" }, { status:403 })

  // URL Web App Google Apps Script (dari env variable)
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL

  if (!APPS_SCRIPT_URL) {
    return NextResponse.json({
      ok: false,
      error: "APPS_SCRIPT_URL belum dikonfigurasi di environment variable Vercel."
    }, { status:500 })
  }

  try {
    // Panggil Apps Script Web App dengan ?action=send
    const url = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + "action=send"

    const res = await fetch(url, {
      method : "GET",
      headers: { "Content-Type": "application/json" },
      // Timeout 30 detik (Apps Script bisa lambat karena export + upload Drive)
      signal : AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    })

    const contentType = res.headers.get("content-type") ?? ""

    if (!contentType.includes("application/json")) {
      const text = await res.text()
      return NextResponse.json({
        ok: false,
        error: "Apps Script response bukan JSON: " + text.slice(0, 200)
      }, { status:500 })
    }

    const data = await res.json()

    if (data.ok) {
      return NextResponse.json({
        ok     : true,
        message: data.message ?? "Berhasil mengirim gambar ke WhatsApp.",
      })
    } else {
      return NextResponse.json({
        ok   : false,
        error: data.error ?? "Apps Script gagal."
      }, { status:500 })
    }

  } catch (e: any) {
    return NextResponse.json({
      ok   : false,
      error: "Gagal menghubungi Apps Script: " + (e.message ?? "Network error")
    }, { status:500 })
  }
}
