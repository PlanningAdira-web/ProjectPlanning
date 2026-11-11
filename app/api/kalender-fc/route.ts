import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type FCSlot = { jk: number; buyer: string; qty: number }

export type KalenderFCData = {
  factories    : string[]
  lines        : Record<string, string[]>                                   // factory -> daftar line (urut sesuai sheet)
  weeks        : string[]                                                   // nomor minggu (urut sesuai sheet)
  cells        : Record<string, Record<string, Record<string, (FCSlot | null)[]>>> // factory -> line -> week -> 3 slot
  overflow     : number                                                     // jumlah baris pekerjaan di luar 3 slot (diabaikan)
  fetched_at   : string
  fetched_epoch: number
}

const SHEET_NAME = "Kalender FC"
const MAX_SLOTS  = 3
const TTL_MS     = 30 * 1000

// Cache memori khusus route ini (data forecast bisa > batas 50.000 karakter per sel di AI_Cache)
let memCache: { data: KalenderFCData; at: number } | null = null

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

// UNFORMATTED_VALUE: angka datang sebagai number asli, jadi tidak terpengaruh format titik/koma lokal sheet.
// String hanya dijaga-jaga (misal sel berisi teks angka).
function toNum(v: any): number {
  if (typeof v === "number") return v
  const s = String(v ?? "").trim()
  if (!s) return 0
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0
  return parseFloat(s) || 0
}

function clean(v: any): string {
  return String(v ?? "").trim()
}

async function fetchKalenderFC(): Promise<KalenderFCData> {
  const sheets        = google.sheets({ version:"v4", auth:getAuth() })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "'" + SHEET_NAME + "'",
    valueRenderOption: "UNFORMATTED_VALUE",
  })

  const raw = res.data.values ?? []
  if (raw.length < 4) throw new Error(`Sheet '${SHEET_NAME}' kosong atau tidak ditemukan`)

  // Baris header = baris pertama (dari 8 baris teratas) yang punya sel "Buyer" selain di kolom awal.
  // Baris nomor minggu = tepat di atasnya.
  let headerRow = -1
  for (let r = 0; r < Math.min(8, raw.length); r++) {
    const vals = (raw[r] ?? []).map(function(v: any) { return clean(v).toLowerCase() })
    if (vals.indexOf("buyer", 3) >= 0) { headerRow = r; break }
  }
  if (headerRow < 1) throw new Error(`Baris header (JK / Buyer / Qty Plan) tidak ditemukan di sheet '${SHEET_NAME}'`)

  const header  = (raw[headerRow]     ?? []).map(function(v: any) { return clean(v).toLowerCase() })
  const weekRow =  raw[headerRow - 1] ?? []

  // Cari grup kolom per minggu: tiap grup = JK, Buyer, Qty Plan berurutan.
  // Nomor minggu diambil dari baris atas; kalau sel ke-merge, nilainya hanya ada di kolom pertama grup.
  const groups: { week: string; jk: number; buyer: number; qty: number }[] = []
  let lastWeekNum = 0
  for (let c = 2; c < header.length; c++) {
    // Grup minggu = 3 kolom berurutan rapat: JK, Buyer, Qty Plan.
    // (Kolom Total JK / Total Qty Plan di C-D tidak punya kolom Buyer di antaranya, jadi otomatis terlewati.)
    if (header[c] !== "jk") continue
    if (header[c + 1] !== "buyer") continue
    if ((header[c + 2] ?? "").indexOf("qty") < 0) continue
    const b = c + 1, q = c + 2

    let weekStr = ""
    for (let k = c; k <= Math.max(c, b, q); k++) {
      const v = weekRow[k]
      if (v !== undefined && v !== null && clean(v) !== "") { weekStr = clean(v); break }
    }
    const asNum = parseFloat(weekStr)
    if (!isNaN(asNum)) { lastWeekNum = Math.round(asNum); weekStr = String(lastWeekNum) }
    else if (!weekStr) { lastWeekNum += 1; weekStr = String(lastWeekNum) }
    groups.push({ week: weekStr, jk: c, buyer: b, qty: q })
  }
  if (groups.length === 0) throw new Error(`Kolom JK / Buyer / Qty Plan per minggu tidak ditemukan di sheet '${SHEET_NAME}'`)

  const factories: string[] = []
  const lines: Record<string, string[]> = {}
  const cells: KalenderFCData["cells"] = {}
  const slotCount: Record<string, number> = {} // "factory||line" -> jumlah baris pekerjaan yang sudah dipakai
  let overflow = 0
  let lastFactory = ""

  for (let r = headerRow + 1; r < raw.length; r++) {
    const row = raw[r]
    if (!row || row.length === 0) continue

    let factory = clean(row[0])
    const line  = clean(row[1])
    if (factory) lastFactory = factory; else factory = lastFactory   // jaga-jaga kalau masih ada merge
    if (!line || !factory) continue
    if (/^(total|grand)/i.test(line) || /^(total|grand)/i.test(factory)) continue

    const key = factory + "||" + line
    const slotIdx = slotCount[key] ?? 0
    slotCount[key] = slotIdx + 1

    if (factories.indexOf(factory) < 0) { factories.push(factory); lines[factory] = []; cells[factory] = {} }
    if (lines[factory].indexOf(line) < 0) { lines[factory].push(line); cells[factory][line] = {} }

    // Baris pekerjaan ke-4 dan seterusnya: di luar 3 slot, dihitung saja supaya bisa diberi catatan di tampilan
    let hasOverflowData = false

    for (const g of groups) {
      const jk    = toNum(row[g.jk])
      const buyer = clean(row[g.buyer])
      const qty   = Math.round(toNum(row[g.qty]))
      if (!jk && !buyer && !qty) continue

      if (slotIdx >= MAX_SLOTS) { hasOverflowData = true; continue }

      if (!cells[factory][line][g.week]) cells[factory][line][g.week] = new Array(MAX_SLOTS).fill(null)
      cells[factory][line][g.week][slotIdx] = { jk, buyer, qty }
    }
    if (hasOverflowData) overflow++
  }

  const weeks: string[] = []
  for (const g of groups) if (weeks.indexOf(g.week) < 0) weeks.push(g.week)

  const now    = Date.now()
  const wibStr = new Date(now + 7 * 60 * 60 * 1000).toLocaleString("id-ID", { timeZone:"UTC" })
  return { factories, lines, weeks, cells, overflow, fetched_at:wibStr, fetched_epoch:now }
}

export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"
  if (!forceRefresh && memCache && (Date.now() - memCache.at) < TTL_MS) {
    return NextResponse.json({ ok:true, data:memCache.data })
  }
  try {
    const data = await fetchKalenderFC()
    memCache = { data, at: Date.now() }
    return NextResponse.json({ ok:true, data })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
