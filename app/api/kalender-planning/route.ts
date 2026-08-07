import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type KalenderCell = {
  buyers    : string[]
  qtys      : number[]
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

// Untuk kolom Qty: titik dianggap pemisah ribuan (16.647 -> 16647)
function numThousands(v: any): number {
  const n = parseFloat(String(v ?? "0").replace(/\./g, "").replace(",", "."))
  return isNaN(n) ? 0 : n
}

// Untuk kolom Jam Kerja: titik dianggap titik desimal asli (9.5 -> 9.5 jam)
function numDecimal(v: any): number {
  const s = String(v ?? "0").trim().replace(",", ".")
  const n = parseFloat(s)
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
  const weekOrder: string[] = []
  const weekSeen = new Set<string>()

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r]
    if (!row || row.length === 0) continue

    const week = String(row[iWeek] ?? "").trim()
    const line = String(row[iLine] ?? "").trim()
    if (!week || !line) continue

    const fact  = String(row[iFactory] ?? "").trim().toUpperCase() || factoryOf(line)
    const buyer = String(row[iBuyer] ?? "").trim()
    const qty       = numThousands(row[iQty])
    const jk_total  = numDecimal(row[iJKT])
    const jk_normal = numDecimal(row[iJKN])
    const jk_lembur = numDecimal(row[iJKL])

    if (!cells[fact]) cells[fact] = {}
    if (!cells[fact][week]) cells[fact][week] = {}

    const existing = cells[fact][week][line]
    if (existing) {
      // Baris tambahan untuk Week+Line+Factory yang sama -> gabung buyer & qty,
      // JK Normal/Lembur/Total cukup diisi sekali (ambil nilai non-nol pertama)
      if (buyer) existing.buyers.push(buyer)
      existing.qtys.push(qty)
      if (!existing.jk_total  && jk_total)  existing.jk_total  = jk_total
      if (!existing.jk_normal && jk_normal) existing.jk_normal = jk_normal
      if (!existing.jk_lembur && jk_lembur) existing.jk_lembur = jk_lembur
    } else {
      cells[fact][week][line] = {
        buyers   : buyer ? [buyer] : [],
        qtys     : [qty],
        jk_total, jk_normal, jk_lembur,
      }
    }

    if (!linesByFactory[fact]) linesByFactory[fact] = new Set()
    linesByFactory[fact].add(line)
    if (!weekSeen.has(week)) { weekSeen.add(week); weekOrder.push(week) }
  }

  const factories = Object.keys(cells).sort()
  const lines: Record<string, string[]> = {}
  for (const f of factories) {
    lines[f] = Array.from(linesByFactory[f]).sort(function(a, b) {
      return a.localeCompare(b, undefined, { numeric:true })
    })
  }
  const weeks = weekOrder

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
