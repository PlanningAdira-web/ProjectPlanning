import { NextResponse } from "next/server"
import { getSession, PERMISSIONS } from "@/lib/auth"
export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ authenticated:false }, { status:401 })
  return NextResponse.json({ authenticated:true, user, permissions:PERMISSIONS[user.role] })
}
