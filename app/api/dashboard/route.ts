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

const PROMPT = `Analisa semua data dari spreadsheet (Data_Plan_DST, Data Export, SPO Stock) dan kembalikan HANYA JSON ini:
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
    {"text":"tindakan spesifik yang harus dilakukan hari ini","priority":"urgent|normal"}
  ]
}
Gunakan data aktual. Maksimal 5 item per array.`

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  if (forceRefresh) {
    const user = await getSession()
    if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })
    if (!can(user.role, "canRefreshAI"))
      return NextResponse.json({ error:`Role "${user.role}" tidak dapat refresh analisis` }, { status:403 })
    try {
      const data  = await getAllSheetsData()
      const raw   = await askClaude(PROMPT, data)
      const kpi   = safeJSON(raw)
      const entry = cacheSet(KEY, { ...kpi, sheet_names: Object.keys(data) }, user.username)
      const info  = cacheInfo(KEY)
      return NextResponse.json({ ...(entry.data as object), _cache:{ fresh:true, ...info } })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status:500 })
    }
  }

  // Baca cache — semua role
  const entry = cacheGet<any>(KEY)
  if (!entry) {
    return NextResponse.json({
      _cache:{ has_cache:false, message:"Belum ada analisis. Admin/Analyst perlu klik Refresh Analisis AI pagi ini." }
    })
  }
  const info = cacheInfo(KEY)
  return NextResponse.json({ ...(entry.data as object), _cache:{ fresh:true, ...info } })
}
