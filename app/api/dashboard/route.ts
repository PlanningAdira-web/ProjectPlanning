import { NextRequest, NextResponse } from "next/server"
import { getSession, can } from "@/lib/auth"
import { cacheGet, cacheSet, cacheInfo, CACHE_KEYS } from "@/lib/cache"
import { getAllSheetsData } from "@/lib/sheets"
import { toClaudeCSV } from "@/lib/sheets-adapter"
import { askClaude } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60
const KEY = CACHE_KEYS.DASHBOARD

function parseClaudeJSON(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {}
  // Hapus backtick markdown (semua variasi)
  let s = raw
    .split("```json").join("")
    .split("```JSON").join("")
    .split("```").join("")
    .trim()
  // Ambil dari { pertama ke } terakhir
  const first = s.indexOf("{")
  const last  = s.lastIndexOf("}")
  if (first === -1 || last === -1 || last <= first) return {}
  try {
    const result = JSON.parse(s.slice(first, last + 1))
    if (typeof result === "object" && result !== null) return result
    return {}
  } catch { return {} }
}

const PROMPT = `Kamu adalah AI Production Planning Analyst untuk PT Adira Semesta Industry.

PENTING: Kembalikan HANYA objek JSON. TIDAK BOLEH ada backtick, markdown, atau teks lain.

Analisa data produksi dan kembalikan JSON dengan struktur ini:

{
  "kpi_score": 0.0,
  "scorecard_score": 0.0,
  "outstanding_spo_pcs": 0,
  "wip_over_1week_pcs": 0,
  "overall_capacity_pct": 0,
  "achievement_pct": 0,
  "lines_at_risk": 0,
  "planning_risk_level": "RENDAH",
  "mp_shortage": 0,
  "capacity_by_style": [
    {"style":"nama style","order_pcs":0,"produksi_pcs":0,"sisa_pcs":0,"pct":0,"status":"On Track"}
  ],
  "material_incomplete": [
    {"spo":"0000/26","style":"nama","kekurangan":"material","dst_date":"DD Mon"}
  ],
  "todo_ai": [
    {"text":"tindakan konkret hari ini","priority":"urgent"}
  ]
}

Gunakan data aktual. Maksimal 5 item per array. Tidak boleh ada field tambahan.`

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  if (forceRefresh) {
    const user = await getSession()
    if (!user)
      return NextResponse.json({ error: "Login diperlukan" }, { status: 401 })
    if (!can(user.role, "canRefreshAI"))
      return NextResponse.json(
        { error: `Role "${user.role}" tidak dapat refresh` },
        { status: 403 }
      )

    try {
      // 1. Baca spreadsheet
      const sheetsData = await getAllSheetsData()
      const sheetNames = Object.keys(sheetsData ?? {})

      if (!sheetsData || sheetNames.length === 0) {
        return NextResponse.json(
          { error: "Gagal membaca Google Sheets. Periksa GOOGLE_SHEET_ID dan service account." },
          { status: 500 }
        )
      }

      // 2. Konversi ke format Claude
      const csv = toClaudeCSV(sheetsData)

      // 3. Kirim ke Claude
      let raw = ""
      try {
        raw = await askClaude(PROMPT, csv)
      } catch (claudeErr: any) {
        return NextResponse.json(
          {
            error: `Gagal memanggil Claude API: ${claudeErr.message}`,
            hint : "Periksa ANTHROPIC_API_KEY di Vercel Environment Variables, dan pastikan kredit Anthropic tidak habis.",
          },
          { status: 500 }
        )
      }

      // 4. Parse JSON
      const kpi = parseClaudeJSON(raw)

      if (Object.keys(kpi).length === 0) {
        return NextResponse.json(
          {
            error: "Format respons AI tidak valid. Silakan coba refresh kembali.",
            debug: raw.slice(0, 500),
          },
          { status: 500 }
        )
      }

      // 5. Simpan cache
      const entry = await cacheSet(KEY, kpi, user.username)
      const info  = await cacheInfo(KEY)

      return NextResponse.json({ ...kpi, _cache: { fresh: true, ...info } })

    } catch (e: any) {
      return NextResponse.json(
        {
          error : e.message ?? "Unknown error",
          detail: e.stack?.split("\n").slice(0, 3).join(" | ") ?? "",
        },
        { status: 500 }
      )
    }
  }

  // Baca cache
  const entry = await cacheGet<any>(KEY)
  if (!entry) {
    return NextResponse.json({
      _cache: {
        has_cache: false,
        message  : "Belum ada analisis. Admin perlu klik Refresh Analisis AI.",
      },
    })
  }
  const info = await cacheInfo(KEY)
  return NextResponse.json({ ...(entry.data as object), _cache: { ...info } })
}
