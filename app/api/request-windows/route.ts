import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

// GET /api/request-windows - 申請受付ウィンドウ一覧
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const windows = await prisma.requestWindow.findMany({
    orderBy: [{ fiscalYear: 'desc' }, { month: 'desc' }],
  })
  return NextResponse.json(windows)
}

const createSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  deadline: z.string(), // ISO datetime string
})

// POST /api/request-windows - 受付ウィンドウ作成
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data
  const deadline = new Date(data.deadline)
  if (isNaN(deadline.getTime())) {
    return NextResponse.json({ error: 'deadline が正しくありません' }, { status: 400 })
  }
  const existing = await prisma.requestWindow.findUnique({
    where: { fiscalYear_month: { fiscalYear: data.fiscalYear, month: data.month } },
  })
  if (existing) {
    return NextResponse.json({ error: 'この月の受付ウィンドウは既に存在します' }, { status: 409 })
  }
  const window = await prisma.requestWindow.create({
    data: { fiscalYear: data.fiscalYear, month: data.month, deadline },
  })
  return NextResponse.json(window, { status: 201 })
}
