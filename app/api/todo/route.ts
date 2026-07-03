import { NextRequest, NextResponse } from "next/server"
import { getSession, can } from "@/lib/auth"
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/cache"

export const runtime = "nodejs"
const KEY = CACHE_KEYS.TODO

type TodoItem = {
  id       : string
  text     : string
  priority : "urgent" | "normal"
  source   : "ai" | "manual"
  done     : boolean
  done_by  : string | null
  done_at  : string | null
  created_by: string
  created_at: string
}

export async function GET() {
  const entry = cacheGet<TodoItem[]>(KEY)
  return NextResponse.json({ items: entry?.data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const body = await req.json()

  // Sync todo dari AI refresh
  if (body.action === "sync_ai" && can(user.role, "canRefreshAI")) {
    const aiItems: TodoItem[] = (body.items ?? []).map((t: any, i: number) => ({
      id        : `ai_${Date.now()}_${i}`,
      text      : t.text,
      priority  : t.priority ?? "normal",
      source    : "ai",
      done      : false,
      done_by   : null,
      done_at   : null,
      created_by: "AI",
      created_at: new Date().toISOString(),
    }))
    // Gabung dengan manual todo yang belum done
    const existing = (cacheGet<TodoItem[]>(KEY)?.data ?? [])
      .filter(t => t.source === "manual" && !t.done)
    cacheSet(KEY, [...aiItems, ...existing], user.username)
    return NextResponse.json({ ok:true })
  }

  // Tambah manual todo (admin + planning)
  if (body.action === "add" && can(user.role, "canTodo")) {
    const existing = cacheGet<TodoItem[]>(KEY)?.data ?? []
    const newItem: TodoItem = {
      id        : `manual_${Date.now()}`,
      text      : body.text,
      priority  : body.priority ?? "normal",
      source    : "manual",
      done      : false,
      done_by   : null,
      done_at   : null,
      created_by: user.name,
      created_at: new Date().toISOString(),
    }
    cacheSet(KEY, [...existing, newItem], user.username)
    return NextResponse.json({ ok:true, item:newItem })
  }

  // Toggle done (semua role yang bisa todo)
  if (body.action === "toggle" && can(user.role, "canTodo")) {
    const existing = cacheGet<TodoItem[]>(KEY)?.data ?? []
    const updated  = existing.map(t =>
      t.id === body.id
        ? { ...t, done: !t.done, done_by: !t.done ? user.name : null, done_at: !t.done ? new Date().toISOString() : null }
        : t
    )
    cacheSet(KEY, updated, user.username)
    return NextResponse.json({ ok:true })
  }

  return NextResponse.json({ error:"Aksi tidak valid atau tidak memiliki izin" }, { status:403 })
}
