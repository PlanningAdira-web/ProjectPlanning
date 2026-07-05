import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

// ── Types ────────────────────────────────────────────────────────
export type PlanRow = {
  line    : string
  spo     : string
  style   : string
  note    : string
  priority: string
  dates   : Record<string, number | "F" | "">
}

export type PlanningData = {
  factories : string[]                        // ["A","F","K"]
  dateHeaders: string[]                       // ["01-Aug","02-Aug",...]
  rows       : Record<string, PlanRow[]>      // { A:[...], F:[...], K:[...] }
  cached_at  : string
  cached_by  : string
}

const VALID_FACTORIES = new Set(["A", "F", "K"])
const CACHE_KEY = "planning_dst"

// ── Google Sheets reader ─────────────────────────────────────────
async function readPlanningSheet(): Promise<PlanningData> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })

  const sheets        = google.sheets({ version: "v4", auth })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  // Baca seluruh sheet Data_Plan_DST
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "Data_Plan_DST",
    valueRenderOption: "FORMATTED_VALUE",
  })

  const raw = res.data.values ?? []
  if (raw.length < 2) throw new Error("Sheet Data_Plan_DST kosong atau tidak ditemukan")

  // ── Parse header row ──────────────────────────────────────────
  // Baris 1 = header: LINE, SPO, STYLE, Fact, Note, Priority, [tanggal...]
  const headerRow = raw[0].map((h: string) => String(h ?? "").trim())

  // Cari index kolom tetap
  const iLine  = headerRow.findIndex(h => h.toUpperCase() === "LINE" || h.toUpperCase() === "LINE E")
  const iSPO   = headerRow.findIndex(h => h.toUpperCase() === "SPO")
  const iStyle = headerRow.findIndex(h => h.toUpperCase() === "STYLE")
  const iFact  = headerRow.findIndex(h => h.toUpperCase() === "FACT" || h.toUpperCase() === "FACT I" || h.toUpperCase().startsWith("FACT"))
  const iNote  = headerRow.findIndex(h => h.toUpperCase() === "NOTE")
  const iPrio  = headerRow.findIndex(h => h.toUpperCase() === "PRIORITY")

  if (iLine === -1 || iSPO === -1 || iStyle === -1)
    throw new Error("Kolom wajib (LINE/SPO/STYLE) tidak ditemukan di header")

  // Kolom tanggal: semua kolom setelah Priority (atau setelah Note jika tidak ada Priority)
  const firstDateCol = Math.max(iLine, iSPO, iStyle, iFact, iNote, iPrio) + 1

  // Kumpulkan semua label tanggal yang valid (format: DD-MMM atau DD-MMM-YYYY)
  const dateHeaders: string[] = []
  const dateColMap: Record<number, string> = {}  // colIndex -> label tanggal

  for (let c = firstDateCol; c < headerRow.length; c++) {
    const h = headerRow[c].trim()
    if (!h) continue
    // Deteksi apakah ini kolom tanggal
    // Format yang didukung: "05-Aug-2026", "05-Aug", "5-Aug-2026", "5/8/2026"
    const isDate =
      /^\d{1,2}-[A-Za-z]{3}(-\d{2,4})?$/.test(h) ||
      /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(h)
    if (!isDate) continue

    // Normalize ke format DD-MMM
    let label = h
    if (/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(h)) {
      label = h.split("-").slice(0, 2).join("-")  // "05-Aug-2026" → "05-Aug"
    } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(h)) {
      // Konversi DD/MM/YYYY → DD-MMM
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      const parts  = h.split("/")
      const d      = String(parts[0]).padStart(2, "0")
      const m      = months[parseInt(parts[1]) - 1] ?? "?"
      label = `${d}-${m}`
    } else if (/^\d{1,2}-[A-Za-z]{3}$/.test(h)) {
      // Pastikan hari 2 digit
      const parts = h.split("-")
      label = `${String(parts[0]).padStart(2, "0")}-${parts[1]}`
    }

    if (!dateHeaders.includes(label)) dateHeaders.push(label)
    dateColMap[c] = label
  }

  if (dateHeaders.length === 0)
    throw new Error("Tidak ada kolom tanggal ditemukan di header sheet")

  // ── Parse data rows ───────────────────────────────────────────
  const factoryRows: Record<string, PlanRow[]> = {}
  let   reachedHistory = false

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r]
    if (!row || row.length === 0) continue

    const fact  = String(row[iFact]  ?? "").trim()
    const line  = String(row[iLine]  ?? "").trim()
    const spo   = String(row[iSPO]   ?? "").trim()
    const style = String(row[iStyle] ?? "").trim()

    // Stop saat menemukan baris "History"
    if (
      fact.toLowerCase() === "history" ||
      line.toLowerCase() === "history" ||
      spo.toLowerCase()  === "history" ||
      style.toLowerCase()=== "history"
    ) {
      reachedHistory = true
      break
    }

    // Skip baris tidak valid
    if (!line || !spo || !style) continue

    // Skip factory tidak valid (hanya A, F, K)
    if (!VALID_FACTORIES.has(fact)) continue

    const note  = String(row[iNote]  ?? "").trim()
    const prio  = String(row[iPrio]  ?? "").trim()

    // Parse nilai qty per tanggal
    const dates: Record<string, number | "F" | ""> = {}
    for (const [colIdx, dateLabel] of Object.entries(dateColMap)) {
      const idx = parseInt(colIdx)
      const raw_val = String(row[idx] ?? "").trim()

      if (raw_val === "" || raw_val === "0") {
        dates[dateLabel] = ""
      } else if (raw_val.toUpperCase() === "F") {
        dates[dateLabel] = "F"
      } else {
        // Hapus pemisah ribuan dan parse angka
        const num = parseFloat(raw_val.replace(/[.,\s]/g, ""))
        dates[dateLabel] = isNaN(num) ? "" : num
      }
    }

    const planRow: PlanRow = { line, spo, style, note, priority: prio, dates }

    if (!factoryRows[fact]) factoryRows[fact] = []
    factoryRows[fact].push(planRow)
  }

  // Sort setiap factory by Line
  const factories = Object.keys(factoryRows).sort()
  for (const f of factories) {
    factoryRows[f].sort((a, b) => a.line.localeCompare(b.line, undefined, { numeric: true }))
  }

  return {
    factories,
    dateHeaders,
    rows     : factoryRows,
    cached_at: new Date().toLocaleString("id-ID"),
    cached_by: "system",
  }
}

// ── Route handler ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Semua role bisa baca planning (termasuk viewer)
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 })

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  // Force refresh hanya bisa dilakukan saat refresh AI (dipanggil internal)
  // atau dari admin
  if (!forceRefresh) {
    // Coba baca dari cache dulu
    const cached = await cacheGet<PlanningData>(CACHE_KEY)
    if (cached) {
      return NextResponse.json({ ok: true, data: cached.data })
    }
  }

  // Baca langsung dari sheet
  try {
    const data = await readPlanningSheet()
    // Simpan ke cache
    await cacheSet(CACHE_KEY, data, user.username)
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message ?? "Gagal membaca sheet" },
      { status: 500 }
    )
  }
}
