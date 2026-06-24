import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.secret !== process.env.REVALIDATE_SECRET)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    revalidatePath("/dashboard")
    return NextResponse.json({ ok: true, revalidated: true, sheet: body.sheet })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
