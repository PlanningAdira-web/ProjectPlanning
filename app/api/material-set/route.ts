import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type MatDateVal = {
  plan_dst   : number | ""
  saldo_kulit: number | ""
  saldo_synth: number | ""
  saldo_accs : number | ""
}

export type MaterialRow = {
  spo        : string
  style      : string
  qty_plan   : number | ""
  fprc       : string
  fact       : string
  kategori   : string
  unit       : string
  in_kulit   : number | ""
  in_synth   : number | ""
  in_accs    : number | ""
  pcs_set    : number | ""
  start_tekor: string
  cutoff_dst : number | ""
  saldo_kulit: number | ""
  saldo_synth: number | ""
  saldo_set  : number | ""
  saldo_accs : number | ""
  pcs_in_set : number | ""
  is_total   : boolean
  dates      : Record<string, MatDateVal>
}

export type MaterialData = {
  update_info  : string
  date_headers : string[]
  rows         : MaterialRow[]
  facts        : string[]
  fetched_at   : string
  fetched_epoch: number
}

const CACHE_KEY   = "material_set_data"
const VALID_FACTS = new Set(["A","F","K"])

// Sub-kolom yang dicari per tanggal (baris 2)
const SUB_COLS = ["Plan Dst","Saldo Kulit","Saldo Synth","Saldo Accs"]

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

function parseNum(v: any): number | "" {
  const s = String(v ?? "").trim()
  if (!s) return ""
  // Handle format (angka) = negatif dari Google Sheets
  if (/^\(.*\)$/.test(s)) {
    const n = parseFloat(s.slice(1,-1).replace(/,/g,""))
    return isNaN(n) ? "" : -n
  }
  const n = parseFloat(s.replace(/,/g,""))
  return isNaN(n) ? "" : n
}

async function fetchMaterialSet(): Promise<MaterialData> {
  const sheets        = google.sheets({ version:"v4", auth:getAuth() })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "IN Material Produksi",
    valueRenderOption: "FORMATTED_VALUE",
  })

  const raw = res.data.values ?? []
  if (raw.length < 3) throw new Error("Sheet 'IN Material Produksi' kosong")

  // Baris 0 = A1:B1 update info
  const update_info = (String(raw[0]?.[0] ?? "") + " " + String(raw[0]?.[1] ?? "")).trim()

  // Deteksi baris yang berisi tanggal (S1 ke kanan) dan baris header A2:R2
  // Strategi: scan baris 0-3, cari baris yang mengandung "Plan Dst" di kolom 18+
  // dan baris yang mengandung "SPO" di kolom 0

  let dateRowIdx  = -1  // baris tanggal (S1)
  let subRowIdx   = -1  // baris sub-kolom (Plan Dst, Saldo Kulit, dll)
  let headerRowIdx = -1 // baris header A-R (SPO, Style, dll)

  for (let i = 0; i < Math.min(4, raw.length); i++) {
    const row = raw[i] ?? []
    const col0 = String(row[0] ?? "").trim().toLowerCase()
    const col18 = String(row[18] ?? "").trim().toLowerCase()
    // Baris dengan SPO di kolom A = header utama
    if (col0 === "spo" && headerRowIdx < 0) { headerRowIdx = i; continue }
    // Baris dengan "plan dst" di kolom 18+ = baris sub-kolom
    const hasPlanDst = row.slice(18).some(function(c: any) {
      return String(c ?? "").trim().toLowerCase() === "plan dst"
    })
    if (hasPlanDst && subRowIdx < 0) { subRowIdx = i; continue }
    // Baris dengan tanggal di kolom 18+ (format DD-Mon)
    const hasDates = row.slice(18).some(function(c: any) {
      return /^\d{1,2}-[A-Za-z]{3}/.test(String(c ?? "").trim())
    })
    if (hasDates && dateRowIdx < 0) { dateRowIdx = i }
  }

  // Fallback ke posisi default jika tidak terdeteksi
  if (dateRowIdx  < 0) dateRowIdx  = 0  // baris 1 = tanggal di S
  if (subRowIdx   < 0) subRowIdx   = 1  // baris 2 = sub-kolom
  if (headerRowIdx < 0) headerRowIdx = 2 // baris 3 = header A-R

  const dateRow = raw[dateRowIdx]  ?? []
  const subRow  = raw[subRowIdx]   ?? []
  const header  = (raw[headerRowIdx] ?? []).map(function(h: any) { return String(h ?? "").trim() })

  // Kolom tetap A-R (index 0-17)
  const iSPO=0, iStyle=1, iQty=2, iFPRC=3, iFact=4, iKat=5, iUnit=6
  const iKulit=7, iSynth=8, iAccs=9, iPCS=10, iTekor=11, iCutoff=12
  const iSalKul=13, iSalSyn=14, iSalSet=15, iSalAcs=16, iPcsIn=17

  // Parse kolom tanggal mulai index 18 (kolom S)
  // Baris 1: tanggal (hanya kolom pertama tiap grup yang berisi, sisanya merge/kosong)
  // Baris 2: nama sub-kolom (Plan Dst, Saldo Kulit, Saldo Synth, Saldo Accs, ...)
  const dateHeaders: string[] = []
  const dateColMap: Record<string, Record<string, number>> = {}

  let curDate = ""
  const maxCols = Math.max(header.length, dateRow.length, subRow.length)
  for (let c = 18; c < maxCols; c++) {
    const dateVal = String(dateRow[c] ?? "").trim()
    const subName = String(subRow[c]  ?? "").trim()  // sub-kolom dari subRow

    // Update current date jika ada nilai baru di baris tanggal
    if (dateVal) curDate = dateVal

    if (!curDate) continue
    if (!SUB_COLS.includes(subName)) continue

    if (!dateColMap[curDate]) {
      dateColMap[curDate] = {}
      dateHeaders.push(curDate)
    }
    // Hanya simpan kolom pertama jika sub-kolom sama muncul dua kali
    if (dateColMap[curDate][subName] === undefined) {
      dateColMap[curDate][subName] = c
    }
  }

  // Parse data rows mulai baris index 3 (baris ke-4 = baris data pertama)
  const rows: MaterialRow[] = []

  for (let r = 3; r < raw.length; r++) {
    const row  = raw[r]
    if (!row || row.length === 0) continue

    const spo  = String(row[iSPO]  ?? "").trim()
    const fact = String(row[iFact] ?? "").trim()

    if (!spo) continue

    // Baris total kumulatif: baris 4,5,6 (r=3,4,5) biasanya berisi TOTAL per Fact
    const isTotal = r <= 5 && VALID_FACTS.has(fact) && !spo.includes("/")

    if (!isTotal && !VALID_FACTS.has(fact)) continue

    // Parse kolom tanggal
    const dates: Record<string, MatDateVal> = {}
    for (const [dt, subMap] of Object.entries(dateColMap)) {
      dates[dt] = {
        plan_dst   : parseNum(row[subMap["Plan Dst"]]),
        saldo_kulit: parseNum(row[subMap["Saldo Kulit"]]),
        saldo_synth: parseNum(row[subMap["Saldo Synth"]]),
        saldo_accs : parseNum(row[subMap["Saldo Accs"]]),
      }
    }

    rows.push({
      spo,
      style      : String(row[iStyle]  ?? "").trim(),
      qty_plan   : parseNum(row[iQty]),
      fprc       : String(row[iFPRC]   ?? "").trim(),
      fact,
      kategori   : String(row[iKat]    ?? "").trim(),
      unit       : String(row[iUnit]   ?? "").trim(),
      in_kulit   : parseNum(row[iKulit]),
      in_synth   : parseNum(row[iSynth]),
      in_accs    : parseNum(row[iAccs]),
      pcs_set    : parseNum(row[iPCS]),
      start_tekor: String(row[iTekor]  ?? "").trim(),
      cutoff_dst : parseNum(row[iCutoff]),
      saldo_kulit: parseNum(row[iSalKul]),
      saldo_synth: parseNum(row[iSalSyn]),
      saldo_set  : parseNum(row[iSalSet]),
      saldo_accs : parseNum(row[iSalAcs]),
      pcs_in_set : parseNum(row[iPcsIn]),
      is_total   : isTotal,
      dates,
    })
  }

  const facts = [...new Set(
    rows.filter(function(r) { return !r.is_total }).map(function(r) { return r.fact })
  )].filter(Boolean).sort()

  const now    = Date.now()
  const wibStr = new Date(now + 7 * 60 * 60 * 1000).toLocaleString("id-ID", { timeZone:"UTC" })

  return { update_info, date_headers:dateHeaders, rows, facts, fetched_at:wibStr, fetched_epoch:now }
}

export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"
  if (!forceRefresh) {
    const cached = await cacheGet<MaterialData>(CACHE_KEY)
    if (cached) return NextResponse.json({ ok:true, data:cached.data })
  }

  try {
    const data = await fetchMaterialSet()
    await cacheSet(CACHE_KEY, data, user.username)
    return NextResponse.json({ ok:true, data })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
