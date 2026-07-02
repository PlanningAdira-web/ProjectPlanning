import { NextRequest, NextResponse } from "next/server"
import { getSession, can } from "@/lib/auth"
import { cacheGet, cacheSet, cacheInfo, CACHE_KEYS } from "@/lib/cache"
import { getAllSheetsData } from "@/lib/sheets"
import { askClaude } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60
const KEY = CACHE_KEYS.DASHBOARD

function safeJSON(s: string) {
  try { return JSON.parse(s.replace(/```json|```/g,"").trim()) } catch { return {} }
}

const PROMPT = `Analisa semua data dari spreadsheet dan kembalikan HANYA JSON ini tanpa teks lain:
{"overall_capacity_pct":0,"achievement_pct":0,"material_readiness_pct":0,"lines_at_risk":0,
"top_priority":"3 prioritas tindakan hari ini (pisahkan newline)",
"planning_risk_level":"TINGGI|SEDANG|RENDAH","mp_shortage":0,
"schedule_adjustment_needed":0,"forecast_demand_4w":0,
"forecast_capacity_gap":0,"material_risk_items":0,"risk_score_12w":"TINGGI|SEDANG|RENDAH"}`

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  if (forceRefresh) {
    const user = await getSession()
    if (!user) return NextResponse.json({ error:"Login diperlukan untuk refresh analisis" }, { status:401 })
    if (!can(user.role, "canRefreshAI"))
      return NextResponse.json({ error:`Role "${user.role}" tidak memiliki akses refresh analisis AI` }, { status:403 })
    try {
      const data  = await getAllSheetsData()
      const raw   = await askClaude(PROMPT, data)
      const kpi   = safeJSON(raw)
      const entry = cacheSet(KEY, { ...kpi, sheet_names: Object.keys(data) }, user.username)
      return NextResponse.json({
        ...(entry.data as object),
        _cache: { fresh:true, cached_at:new Date(entry.cached_at).toLocaleString("id-ID"), cached_by:entry.cached_by, expires_at:new Date(entry.expires_at).toLocaleString("id-ID") },
      })
    } catch (e: any) {
      return NextResponse.json({ error:e.message }, { status:500 })
    }
  }

  // Baca cache — semua role boleh
  const entry = cacheGet<any>(KEY)
  if (!entry) {
    return NextResponse.json({ _cache:{ fresh:false, has_cache:false, message:"Belum ada analisis. Admin atau Analyst perlu klik Refresh Analisis." } })
  }
  const info = cacheInfo(KEY)
  return NextResponse.json({
    ...(entry.data as object),
    _cache: { fresh:!info.is_expired, has_cache:true, is_expired:info.is_expired, cached_at:info.cached_at, cached_by:info.cached_by, expires_at:info.expires_at, minutes_ago:info.minutes_ago,
      message: info.is_expired
        ? `Data ${info.minutes_ago} menit lalu oleh ${info.cached_by}. Minta Admin/Analyst refresh.`
        : `Diperbarui ${info.minutes_ago} menit lalu oleh ${info.cached_by}` },
  })
}
