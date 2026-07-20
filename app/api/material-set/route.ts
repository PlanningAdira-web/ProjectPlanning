import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

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
  dates      : Record<string, {
    plan_dst   : number | ""
    actual_dst : number | ""
    saldo_kulit: number | ""
    saldo_synth: number | ""
    saldo_accs : number | ""
  }>
}

export type MaterialData = {
  update_info  : string
  date_headers : string[]
  rows         : MaterialRow[]
  facts        : string[]
  fetched_at   : string
  fetched_epoch: number
}

const CACHE_KEY       = "material_set_data"
const VALID_FACTS     = new Set(["A","F","K"])
const DATE_SUB_COLS   = ["Plan Dst","Actual Dst","Saldo Kulit","Saldo Synth","Saldo Accs"]

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
  const s = String(v ?? "").trim().replace(/[,\s]/g,"")
  if (!s) return ""
  const n = parseFloat(s)
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
  if (raw.length < 3) throw new Error("Sheet 'IN Material Produksi' kosong atau tidak ditemukan")

  // Baris 0 = A1:B1 update info
  const update_info = String(raw[0]?.[0] ?? "").trim() + " " + String(raw[0]?.[1] ?? "").trim()

  // Baris 1 (index 1) = baris tanggal (S1:HF1) — diabaikan untuk identifikasi tanggal
  // Kita pakai baris ini untuk ambil tanggal di kolom S ke kanan
  const dateRow = raw[1] ?? []

  // Baris 2 (index 2) = Header tabel A2:HF2
  const header = raw[2].map(function(h: any) { return String(h ?? "").trim() })

  // Kolom tetap A-R (index 0-17)
  const iSPO    = 0   // A
  const iStyle  = 1   // B
  const iQty    = 2   // C
  const iFPRC   = 3   // D
  const iFact   = 4   // E
  const iKat    = 5   // F
  const iUnit   = 6   // G
  const iKulit  = 7   // H
  const iSynth  = 8   // I
  const iAccs   = 9   // J
  const iPCS    = 10  // K
  const iTekor  = 11  // L
  const iCutoff = 12  // M
  const iSalKul = 13  // N
  const iSalSyn = 14  // O
  const iSalSet = 15  // P
  const iSalAcs = 16  // Q
  const iPcsIn  = 17  // R

  // Kolom S (index 18) ke kanan = kolom tanggal berulang
  // Setiap tanggal punya beberapa sub-kolom, kita ambil yang namanya sesuai DATE_SUB_COLS
  // Struktur: baris 1 = tanggal, baris 2 = nama sub-kolom

  const dateHeaders: string[] = []
  const dateColMap: Record<string, Record<string, number>> = {}
  // dateColMap[tanggal][sub-kolom] = index kolom

  let currentDate = ""
  for (let c = 18; c < header.length; c++) {
    // Tanggal ada di dateRow (baris index 1), sub-kolom di header (baris index 2)
    const dateVal = String(dateRow[c] ?? "").trim()
    const subCol  = header[c]

    if (dateVal) currentDate = dateVal

    if (!currentDate) continue
    if (!DATE_SUB_COLS.includes(subCol)) continue

    if (!dateColMap[currentDate]) {
      dateColMap[currentDate] = {}
      dateHeaders.push(currentDate)
    }
    dateColMap[currentDate][subCol] = c
  }

  // Parse data rows — mulai dari baris index 3 (baris ke-4)
  const rows: MaterialRow[] = []

  // Baris 2 dan 3 dan 4 (index 2,3,4) = total kumulatif per Fact (A, K, F)
  // Baris 5+ = data per SPO

  for (let r = 3; r < raw.length; r++) {
    const row  = raw[r]
    if (!row || row.length === 0) continue

    const spo  = String(row[iSPO]   ?? "").trim()
    const fact = String(row[iFact]  ?? "").trim()

    if (!spo) continue

    // Deteksi baris total kumulatif
    const isTotal = spo.toUpperCase().startsWith("TOTAL") ||
                    (r <= 5 && (fact === "A" || fact === "F" || fact === "K") && !spo.includes("/"))

    // Skip baris yang fact-nya tidak valid dan bukan total
    if (!isTotal && !VALID_FACTS.has(fact)) continue

    // Parse kolom tanggal
    const dates: MaterialRow["dates"] = {}
    for (const [dt, subMap] of Object.entries(dateColMap)) {
      dates[dt] = {
        plan_dst   : parseNum(row[subMap["Plan Dst"]]),
        actual_dst : parseNum(row[subMap["Actual Dst"]]),
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

  return { update_info:update_info.trim(), date_headers:dateHeaders, rows, facts, fetched_at:wibStr, fetched_epoch:now }
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
