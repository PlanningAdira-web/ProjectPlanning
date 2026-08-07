import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type KalenderCell = {
  buyer     : string
  qty       : number
  jk_total  : number
  jk_normal : number
  jk_lembur : number
}

export type KalenderData = {
  factories : string[]
  weeks     : string[]
  lines     : Record<string, string[]>                         // factory -> daftar line (kolom)
  cells     : Record<string, Record<string, Record<string, KalenderCell>>> // factory -> week -> line -> cell
  fetched_at   : string
  fetched_epoch: number
}

const CACHE_KEY  = "kalender_planning_data"
const SHEET_NAME = "Kalender Planning"

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

function num(v: any): number {
  const n = parseFloat(String(v ?? "0").replace(/\./g, "").replace(",", "."))
  return isNaN(n) ? 0 : n
}

// Ambil huruf awal Line (K01 -> K, A05 -> A) sebagai kode Factory
function factoryOf(line: string): string {
  const m = line.match(/^([A-Za-z]+)/)
  return m ? m[1].toUpperCase() : "?"
}

async function fetchKalenderPlanning(): Promise<KalenderData> {
  const sheets        = google.sheets({ version:"v4", auth:getAuth() })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : SHEET_NAME,
    valueRenderOption: "FORMATTED_VALUE",
  })

  const raw = res.data.values ?? []
  if (raw.length < 2) throw new Error(`Sheet '${SHEET_NAME}' kosong atau tidak ditemukan`)

  // Struktur: A=Week, B=Line, C=Factory, D=Buyer, E=Qty, F=Jam Kerja Total, G=Jam Kerja Normal, H=Jam Kerja Lembur
  const iWeek = 0, iLine = 1, iFactory = 2, iBuyer = 3, iQty = 4, iJKT = 5, iJKN = 6, iJKL = 7

  const cells: KalenderData["cells"] = {}
  const linesByFactory: Record<string, Set<string>> = {}
  const weekSet = new Set<string>()

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r]
    if (!row || row.length === 0) continue

    const week = String(row[iWeek] ?? "").trim()
    const line = String(row[iLine] ?? "").trim()
    if (!week || !line) continue

    const fact  = String(row[iFactory] ?? "").trim().toUpperCase() || factoryOf(line)
    const buyer = String(row[iBuyer] ?? "").trim()
    const cell: KalenderCell = {
      buyer,
      qty      : num(row[iQty]),
      jk_total : num(row[iJKT]),
      jk_normal: num(row[iJKN]),
      jk_lembur: num(row[iJKL]),
    }

    if (!cells[fact]) cells[fact] = {}
    if (!cells[fact][week]) cells[fact][week] = {}
    cells[fact][week][line] = cell

    if (!linesByFactory[fact]) linesByFactory[fact] = new Set()
    linesByFactory[fact].add(line)
    weekSet.add(week)
  }

  const factories = Object.keys(cells).sort()
  const lines: Record<string, string[]> = {}
  for (const f of factories) {
    lines[f] = Array.from(linesByFactory[f]).sort(function(a, b) {
      return a.localeCompare(b, undefined, { numeric:true })
    })
  }
  const weeks = Array.from(weekSet).sort(function(a, b) { return parseInt(a) - parseInt(b) })

  const now    = Date.now()
  const wibStr = new Date(now + 7 * 60 * 60 * 1000).toLocaleString("id-ID", { timeZone:"UTC" })
  return { factories, weeks, lines, cells, fetched_at:wibStr, fetched_epoch:now }
}

export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"
  if (!forceRefresh) {
    const cached = await cacheGet<KalenderData>(CACHE_KEY)
    if (cached) return NextResponse.json({ ok:true, data:cached.data })
  }
  try {
    const data = await fetchKalenderPlanning()
    await cacheSet(CACHE_KEY, data, user.username)
    return NextResponse.json({ ok:true, data })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
