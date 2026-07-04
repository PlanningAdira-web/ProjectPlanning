import { NextRequest, NextResponse } from "next/server"
import { getSession, can } from "@/lib/auth"
import { cacheGet, cacheSet, cacheInfo, CACHE_KEYS } from "@/lib/cache"
import { getAllSheetsData } from "@/lib/sheets"
import { toClaudeCSV } from "@/lib/sheets-adapter"
import { askClaude } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60
const KEY = CACHE_KEYS.DASHBOARD

function safeJSON(s: string) {
  try { return JSON.parse(s.replace(/```json|```/g, "").trim()) } catch { return {} }
}

const PROMPT = `Analisa semua data produksi dan kembalikan HANYA JSON ini tanpa teks lain:
{
  "kpi_score": 0,
  "scorecard_score": 0,
  "outstanding_spo_pcs": 0,
  "wip_over_1week_pcs": 0,
  "overall_capacity_pct": 0,
  "achievement_pct": 0,
  "lines_at_risk": 0,
  "planning_risk_level": "TINGGI|SEDANG|RENDAH",
  "mp_shortage": 0,
  "capacity_by_style": [
    {"style":"nama style","order_pcs":0,"produksi_pcs":0,"sisa_pcs":0,"pct":0,"status":"Selesai|On Track|Perlu Perhatian|Kritis"}
  ],
  "material_incomplete": [
    {"spo":"SPO/YY","style":"nama","kekurangan":"item material","dst_date":"tgl"}
  ],
  "todo_ai": [
    {"text":"tindakan spesifik hari ini","priority":"urgent|normal"}
  ]
}
Maksimal 5 item per array. Gunakan data aktual.`

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  if (forceRefresh) {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 })
    if (!can(user.role, "canRefreshAI"))
      return NextResponse.json({ error: `Role "${user.role}" tidak dapat refresh analisis` }, { status: 403 })
    try {
      const sheetsData = await getAllSheetsData()
      const csv        = toClaudeCSV(sheetsData)
      const raw        = await askClaude(PROMPT, csv)
      const kpi        = safeJSON(raw)
      const entry      = await cacheSet(KEY, kpi, user.username)
      const info       = await cacheInfo(KEY)
      return NextResponse.json({ ...kpi, _cache: { fresh: true, ...info } })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // Baca cache (memory dulu, lalu Sheets jika kosong)
  const entry = await cacheGet<any>(KEY)
  if (!entry) {
    return NextResponse.json({
      _cache: {
        has_cache: false,
        message: "Belum ada analisis. Admin/Analyst perlu klik Refresh Analisis AI.",
      },
    })
  }
  const info = await cacheInfo(KEY)
  return NextResponse.json({ ...(entry.data as object), _cache: { ...info } })
}
