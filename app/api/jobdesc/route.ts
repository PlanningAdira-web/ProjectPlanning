import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"

export const runtime = "nodejs"

const CACHE_KEY = "jobdesc_status"

type JobdescStatus = Record<string, {
  done        : boolean
  done_by     : string | null
  done_at     : string | null
  created_date: string
}>

function toYMD(d: Date): string {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0")
}

function getWeekNumber(d: Date): number {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
  return Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function getMondayOfWeek(d: Date): Date {
  const dt = new Date(d)
  const day = dt.getDay() || 7
  dt.setDate(dt.getDate() - day + 1)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function addDays(d: Date, n: number): Date {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + n)
  return dt
}

const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni",
                   "Juli","Agustus","September","Oktober","November","Desember"]
const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun",
                   "Jul","Aug","Sep","Oct","Nov","Dec"]
const DAYS_ID   = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"]

function fmtDate(d: Date): string {
  return String(d.getDate()).padStart(2, "0") + "-" +
    MONTHS_EN[d.getMonth()] + "-" + d.getFullYear()
}

function fmtDayDate(d: Date): string {
  return DAYS_ID[d.getDay()] + ", " + fmtDate(d)
}

type JobdescItem = {
  id          : string
  text        : string
  type        : "monthly" | "weekly" | "daily"
}

function generateJobdescs(today: Date): JobdescItem[] {
  const dow     = today.getDay()
  const w       = getWeekNumber(today)
  const prevW   = w - 1
  const nextW   = w + 1
  const monday  = getMondayOfWeek(today)
  const prevMon = addDays(monday, -7)
  const nextMon = addDays(monday, 7)
  const nextSat = addDays(nextMon, 5)
  const month   = MONTHS_ID[today.getMonth()]
  const todayLabel = fmtDayDate(today)
  const yyyyMM  = toYMD(today).slice(0, 7)
  const monFmt  = fmtDate(monday)
  const prevMonFmt = fmtDate(prevMon)
  const items: JobdescItem[] = []

  // MONTHLY: Senin pertama tiap bulan
  if (dow === 1) {
    const firstMon = getMondayOfWeek(new Date(today.getFullYear(), today.getMonth(), 7))
    if (toYMD(today) === toYMD(firstMon)) {
      items.push({
        id  : "monthly_strongpoint_" + yyyyMM,
        text: "Update Strong Point Line " + month,
        type: "monthly",
      })
    }
  }

  // WEEKLY Senin: WIP Weekly + JK Planning (A, F, K)
  if (dow === 1) {
    const wk = "W" + prevW + "_" + toYMD(prevMon)
    for (const f of ["A","F","K"]) {
      items.push({ id:"weekly_wip_"+wk+"_"+f, text:"Update WIP Weekly Produksi W"+prevW+" ("+prevMonFmt+") Fact "+f, type:"weekly" })
      items.push({ id:"weekly_jk_"+wk+"_"+f,  text:"Input JK Planning W"+prevW+" ("+prevMonFmt+") Fact "+f,          type:"weekly" })
    }
  }

  // WEEKLY Rabu: Sheet1, Planning DST, Input Sistem
  if (dow === 3) {
    const wk = "W" + w + "_" + toYMD(monday)
    items.push({ id:"weekly_sheet1_"+wk, text:"Update Sheet 1 Planning W"+w+" ("+monFmt+")", type:"weekly" })
    items.push({ id:"weekly_dst_"+wk,    text:"Update Planning DST W"+w+" ("+monFmt+")",     type:"weekly" })
    items.push({ id:"weekly_sistem_"+wk, text:"Update Input Sistem W"+w+" ("+monFmt+")",     type:"weekly" })
  }

  // WEEKLY Jumat: Planning SEW (A, F, K)
  if (dow === 5) {
    const wk = "W" + w + "_" + toYMD(monday)
    for (const f of ["A","F","K"]) {
      items.push({ id:"weekly_sew_"+wk+"_"+f, text:"Update Planning SEW W"+w+" ("+monFmt+") Fact "+f, type:"weekly" })
    }
  }

  // WEEKLY Sabtu: Data Preprod + Data Export
  if (dow === 6) {
    const wk = "W" + nextW + "_" + toYMD(nextMon)
    items.push({ id:"weekly_preprod_"+wk, text:"Update Data Preprod W"+nextW+" ("+fmtDate(nextMon)+" s/d "+fmtDate(nextSat)+")", type:"weekly" })
    items.push({ id:"weekly_export_W"+prevW, text:"Update Data Export W"+prevW, type:"weekly" })
  }

  // DAILY: setiap hari
  const dk = toYMD(today)
  for (const f of ["A","F","K"]) {
    items.push({ id:"daily_wipcut_"+dk+"_"+f, text:"Update WIP Cutting Produksi per "+todayLabel+" Fact "+f, type:"daily" })
  }
  items.push({ id:"daily_fifo_"+dk, text:"Update SPO FIFO per "+todayLabel, type:"daily" })

  return items
}

export async function GET(_req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const today    = new Date()
  const todayYMD = toYMD(today)
  const cached   = await cacheGet<JobdescStatus>(CACHE_KEY)
  const status   = (cached?.data ?? {}) as JobdescStatus

  // Jobdesc hari ini
  const todayItems = generateJobdescs(today)
  const todayIds   = new Set(todayItems.map(function(i) { return i.id }))

  // Carry over: semua yang belum done dan bukan hari ini
  const carryIds = Object.keys(status).filter(function(id) {
    return !status[id].done && !todayIds.has(id)
  })

  // Rebuild carry over items dengan text dari cached status
  const carryItems: (JobdescItem & { created_date: string })[] = carryIds.map(function(id) {
    const s    = status[id]
    const type = id.startsWith("monthly") ? "monthly" : id.startsWith("weekly") ? "weekly" : "daily"
    // Text disimpan di cache? Tidak, ambil dari regenerasi generik
    // Kita simpan text di status agar bisa direstore
    return {
      id,
      text        : (s as any).text ?? id.replace(/_/g, " "),
      type        : type as "monthly"|"weekly"|"daily",
      created_date: s.created_date,
    }
  })

  const items = [
    ...todayItems.map(function(item) {
      const s = status[item.id]
      return {
        id          : item.id,
        text        : item.text,
        type        : item.type,
        done        : s?.done ?? false,
        done_by     : s?.done_by ?? null,
        done_at     : s?.done_at ?? null,
        created_date: s?.created_date ?? todayYMD,
      }
    }),
    ...carryItems.map(function(item) {
      const s = status[item.id]
      return {
        id          : item.id,
        text        : item.text,
        type        : item.type,
        done        : false,
        done_by     : null,
        done_at     : null,
        created_date: item.created_date,
      }
    }),
  ]

  return NextResponse.json({ ok:true, items })
}

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })
  if (user.role === "viewer") return NextResponse.json({ error:"Akses ditolak" }, { status:403 })

  const body   = await req.json()
  const cached = await cacheGet<JobdescStatus>(CACHE_KEY)
  const status = (cached?.data ?? {}) as JobdescStatus

  // Toggle done/undone
  if (body.action === "toggle" && body.id) {
    const todayYMD = toYMD(new Date())
    const cur      = status[body.id]
    const isDone   = cur?.done ?? false
    status[body.id] = {
      done        : !isDone,
      done_by     : !isDone ? user.name : null,
      done_at     : !isDone ? new Date().toISOString() : null,
      created_date: cur?.created_date ?? todayYMD,
      ...(body.text ? { text: body.text } : {}),
    } as any
    await cacheSet(CACHE_KEY, status, user.username)
    return NextResponse.json({ ok:true })
  }

  // Init: simpan text ke status agar bisa carry-over
  if (body.action === "init" && Array.isArray(body.items)) {
    const todayYMD = toYMD(new Date())
    let changed = false
    for (const item of body.items) {
      if (!status[item.id]) {
        status[item.id] = {
          done        : false,
          done_by     : null,
          done_at     : null,
          created_date: todayYMD,
          text        : item.text,
        } as any
        changed = true
      } else if (!(status[item.id] as any).text) {
        // Tambah text jika belum ada
        ;(status[item.id] as any).text = item.text
        changed = true
      }
    }
    if (changed) await cacheSet(CACHE_KEY, status, user.username)
    return NextResponse.json({ ok:true })
  }

  return NextResponse.json({ error:"Aksi tidak valid" }, { status:400 })
}
