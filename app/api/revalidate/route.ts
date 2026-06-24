import { NextRequest, NextResponse } from "next/server"
import { revalidatePath, revalidateTag } from "next/cache"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.secret !== process.env.REVALIDATE_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const sheetName: string = body.sheet ?? "all"
    const timestamp: string = body.timestamp ?? new Date().toISOString()
    console.log(`[Revalidate] sheet=${sheetName} at ${timestamp}`)

    revalidatePath("/dashboard")
    revalidateTag("sheets-data")

    return NextResponse.json({ ok: true, revalidated: true, sheet: sheetName, timestamp })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
