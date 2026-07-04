import { NextRequest, NextResponse } from "next/server"
import { getSession, can } from "@/lib/auth"
import { cacheGet, cacheSet, cacheInfo, CACHE_KEYS } from "@/lib/cache"
import { getAllSheetsData } from "@/lib/sheets"
import { toClaudeCSV } from "@/lib/sheets-adapter"
import { askClaude } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60
const KEY = CACHE_KEYS.ALERTS

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  if (forceRefresh) {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 })
    if (!can(user.role, "canRefreshAI"))
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 })
    try {
      const sheetsData = await getAllSheetsData()
      const csv        = toClaudeCSV(sheetsData)
      const today      = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
      const raw        = await askClaude(
        `Hari ini: ${today}. Buat alert produksi dari data. Kembalikan HANYA JSON array maks 8 item tanpa teks lain:
[{"level":"danger|warn|info","title":"max 80 karakter","body":"max 150 karakter","po":"SPO atau null"}]`,
        csv
      )
      let alerts: any[] = []
      try { alerts = JSON.parse(raw.replace(/```json|```/g, "").trim()) } catch { alerts = [] }
      const entry = await cacheSet(KEY, alerts, user.username)
      return NextResponse.json({
        alerts,
        _cache: {
          fresh     : true,
          cached_by : entry.cached_by,
          cached_at : new Date(entry.cached_at).toLocaleString("id-ID"),
        },
      })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  const entry = await cacheGet<any[]>(KEY)
  if (!entry) return NextResponse.json({ alerts: [], _cache: { has_cache: false } })
  const info = await cacheInfo(KEY)
  return NextResponse.json({ alerts: entry.data, _cache: { ...info } })
}
