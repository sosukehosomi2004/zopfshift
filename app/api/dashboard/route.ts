import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { format } from 'date-fns'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')

  const todayShifts = await prisma.shift.findMany({
    where: { storeId, date: new Date(todayStr), status: 'CONFIRMED' },
    include: {
      user: { select: { id: true, name: true } },
      position: { select: { name: true, color: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  const pendingRequests = await prisma.shiftRequest.count({
    where: { storeId, status: 'PENDING' },
  })

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const weekShiftsRaw = await prisma.shift.findMany({
    where: { storeId, date: { gte: weekStart, lte: weekEnd }, status: 'CONFIRMED' },
    select: { date: true },
  })

  const countByDate = new Map<string, number>()
  for (const s of weekShiftsRaw) {
    const key = format(s.date, 'yyyy-MM-dd')
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1)
  }
  const weekShifts = Array.from(countByDate.entries()).map(([date, count]) => ({ date, count }))

  return NextResponse.json({ todayShifts, pendingRequests, weekShifts })
}
