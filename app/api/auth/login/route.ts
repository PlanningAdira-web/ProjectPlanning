import { NextRequest, NextResponse } from "next/server"
import { findUser, signToken, COOKIE_NAME } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username || !password)
      return NextResponse.json({ ok:false, error:"Username dan password wajib diisi" }, { status:400 })
    const user = findUser(username.trim(), password)
    if (!user)
      return NextResponse.json({ ok:false, error:"Username atau password salah" }, { status:401 })
    const token = await signToken(user)
    const res   = NextResponse.json({ ok:true, user })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly:true, secure:process.env.NODE_ENV==="production",
      sameSite:"lax", maxAge:60*60*8, path:"/",
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
