import { NextRequest, NextResponse } from "next/server"
import { findUser, signToken, COOKIE_NAME, GUEST_USER } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const { username, password, guest } = await req.json()
    const user = guest ? GUEST_USER : findUser(username?.trim() ?? "", password ?? "")
    if (!user) return NextResponse.json({ ok:false, error:"Username atau password salah" }, { status:401 })
    const token = await signToken(user)
    const res   = NextResponse.json({ ok:true, user })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly:true, secure:process.env.NODE_ENV==="production",
      sameSite:"lax", maxAge:60*60*24, path:"/",
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
