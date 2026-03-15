import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const COLORS = [
  '#1E6FFA', '#FF6B35', '#22C55E', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16',
]

const POSITIONS = [
  { name: 'ホール', color: '#1E6FFA' },
  { name: 'キッチン', color: '#FF6B35' },
  { name: 'レジ', color: '#22C55E' },
  { name: '社員', color: '#8B5CF6' },
]

const STAFF_NAMES = [
  { name: '田中 太郎',   nameKana: 'たなか たろう' },
  { name: '鈴木 花子',   nameKana: 'すずき はなこ' },
  { name: '佐藤 次郎',   nameKana: 'さとう じろう' },
  { name: '山田 三郎',   nameKana: 'やまだ さぶろう' },
  { name: '伊藤 美咲',   nameKana: 'いとう みさき' },
  { name: '渡辺 健太',   nameKana: 'わたなべ けんた' },
  { name: '中村 さくら', nameKana: 'なかむら さくら' },
  { name: '小林 大輔',   nameKana: 'こばやし だいすけ' },
  { name: '加藤 里奈',   nameKana: 'かとう りな' },
  { name: '吉田 翔太',   nameKana: 'よしだ しょうた' },
]

const SHIFT_PATTERNS = [
  { startTime: '09:00', endTime: '17:00', breakTime: 60 },
  { startTime: '10:00', endTime: '18:00', breakTime: 60 },
  { startTime: '11:00', endTime: '19:00', breakTime: 60 },
  { startTime: '12:00', endTime: '20:00', breakTime: 60 },
  { startTime: '17:00', endTime: '22:00', breakTime: 30 },
]

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// 時刻文字列を分に変換 / 分を時刻文字列に変換
function toMin(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function toTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// 確定時のセグメントを30分単位で生成
// 例: 10:00-17:00 → [10:00-12:30 ホール, 12:30-13:00 休憩, 13:00-16:00 キッチン]
//   （16:00-17:00は割り当てなし = 希望より短い確定）
function generateSegments(
  startTime: string, endTime: string, positionIds: string[]
): { startTime: string; endTime: string; positionId: string; isBreak: boolean }[] {
  const start = toMin(startTime)
  const end = toMin(endTime)
  const totalMin = end - start

  // 20% の確率で希望より短く確定（30〜120分カット）
  const cutMin = Math.random() < 0.2
    ? (Math.floor(Math.random() * 4) + 1) * 30
    : 0
  const confirmedEnd = Math.max(start + 60, end - cutMin) // 最低1時間

  const segments: { startTime: string; endTime: string; positionId: string; isBreak: boolean }[] = []
  let cursor = start

  // 長時間勤務（5h以上）は休憩を入れる
  const needsBreak = (confirmedEnd - start) >= 300
  // 休憩の位置: 勤務開始から3〜4時間後、30分or60分
  const breakAfter = needsBreak ? start + (Math.random() < 0.5 ? 180 : 210) : -1
  const breakDuration = needsBreak ? (Math.random() < 0.7 ? 60 : 30) : 0

  // 40% の確率で2ポジション（分割）、60% で1ポジション
  const numPositions = totalMin >= 240 && Math.random() < 0.4 ? 2 : 1
  const pos1 = randomItem(positionIds)
  const pos2 = numPositions === 2
    ? randomItem(positionIds.filter(p => p !== pos1))
    : pos1
  // ポジション切り替え地点: 休憩直後 or 中間
  const switchAt = needsBreak ? breakAfter + breakDuration : -1

  while (cursor < confirmedEnd) {
    // 休憩を挿入
    if (needsBreak && cursor === breakAfter) {
      const breakEnd = Math.min(cursor + breakDuration, confirmedEnd)
      segments.push({ startTime: toTime(cursor), endTime: toTime(breakEnd), positionId: pos1, isBreak: true })
      cursor = breakEnd
      continue
    }

    // 次の境界を決定
    let blockEnd = confirmedEnd
    if (needsBreak && cursor < breakAfter) blockEnd = Math.min(blockEnd, breakAfter)
    if (switchAt > 0 && cursor >= switchAt && cursor < confirmedEnd) blockEnd = confirmedEnd

    const currentPos = (switchAt > 0 && cursor >= switchAt) ? pos2 : pos1
    // 30分単位に丸める
    blockEnd = Math.min(blockEnd, confirmedEnd)
    blockEnd = start + Math.ceil((blockEnd - start) / 30) * 30
    blockEnd = Math.min(blockEnd, confirmedEnd)

    if (blockEnd > cursor) {
      segments.push({ startTime: toTime(cursor), endTime: toTime(blockEnd), positionId: currentPos, isBreak: false })
    }
    cursor = blockEnd
  }

  return segments
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const date = new Date(year, month, 1)
  while (date.getMonth() === month) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

async function main() {
  console.log('🌱 シードデータを投入中...')

  // リセット
  await prisma.shiftSegment.deleteMany()
  await prisma.shiftRequest.deleteMany()
  await prisma.shift.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.userStore.deleteMany()
  await prisma.position.deleteMany()
  await prisma.store.deleteMany()
  await prisma.user.deleteMany()
  await prisma.company.deleteMany()

  // 会社作成
  const company = await prisma.company.create({
    data: { name: 'サンプル飲食店株式会社', plan: 'STANDARD' },
  })
  console.log('✅ 会社作成:', company.name)

  // 店舗作成
  const store1 = await prisma.store.create({
    data: {
      id: 'store1',
      companyId: company.id,
      name: '渋谷店',
      openTime: '09:00',
      closeTime: '23:00',
    },
  })
  const store2 = await prisma.store.create({
    data: {
      companyId: company.id,
      name: '新宿店',
      openTime: '10:00',
      closeTime: '22:00',
    },
  })
  console.log('✅ 店舗作成:', store1.name, store2.name)

  // ポジション作成
  const positions = await Promise.all(
    POSITIONS.map((p) => prisma.position.create({ data: { storeId: store1.id, ...p } }))
  )
  console.log('✅ ポジション作成:', positions.map((p) => p.name).join(', '))

  const password = await bcrypt.hash('password123', 10)

  // オーナー作成
  const owner = await prisma.user.create({
    data: { email: 'owner@example.com', password, name: '店長 オーナー', role: 'OWNER' },
  })
  await prisma.userStore.create({
    data: { userId: owner.id, storeId: store1.id, role: 'ADMIN', color: '#8B5CF6' },
  })

  // マネージャー作成
  const managers = await Promise.all([
    prisma.user.create({ data: { email: 'manager1@example.com', password, name: '管理 一郎', role: 'MANAGER' } }),
    prisma.user.create({ data: { email: 'manager2@example.com', password, name: '管理 二郎', role: 'MANAGER' } }),
  ])
  for (const m of managers) {
    await prisma.userStore.create({
      data: { userId: m.id, storeId: store1.id, role: 'ADMIN', color: '#F59E0B' },
    })
  }

  // スタッフ作成
  const staffUsers = await Promise.all(
    STAFF_NAMES.map((s, i) =>
      prisma.user.create({
        data: { email: `staff${i + 1}@example.com`, password, name: s.name, nameKana: s.nameKana, role: 'STAFF' },
      })
    )
  )
  for (let i = 0; i < staffUsers.length; i++) {
    await prisma.userStore.create({
      data: {
        userId: staffUsers[i].id,
        storeId: store1.id,
        role: 'STAFF',
        color: COLORS[i % COLORS.length],
        maxHours: 120,
        minHours: 40,
      },
    })
  }
  console.log('✅ ユーザー作成:', 1 + managers.length + staffUsers.length, '名')

  // ─── シフト希望 → セグメント確定のワークフロー ────────────────────────
  // 1. スタッフがシフト希望を出す → ShiftRequest(PENDING)
  // 2. 管理者が承認 → ShiftRequest(APPROVED) + ShiftSegment[] 作成
  //    セグメント: 30分単位で役割・休憩を割り当て（希望より短くなることもある）
  // 3. 却下 → ShiftRequest(REJECTED)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const months = [
    { year: now.getFullYear(), month: now.getMonth() },
    { year: now.getFullYear(), month: now.getMonth() + 1 },
  ]

  let segmentCount = 0
  let requestCount = 0

  for (const { year, month } of months) {
    const days = getDaysInMonth(year, month)
    for (const day of days) {
      const dow = day.getDay()
      const isPast = day < today

      for (const staff of staffUsers) {
        const submitsRequest = dow !== 0 && Math.random() < 0.75
        if (!submitsRequest) continue

        const pattern = randomItem(SHIFT_PATTERNS)
        const requestDate = new Date(year, month, day.getDate())

        // ステータス決定
        const roll = Math.random()
        let status: 'PENDING' | 'APPROVED' | 'REJECTED'
        if (isPast) {
          status = roll < 0.7 ? 'APPROVED' : roll < 0.8 ? 'REJECTED' : 'PENDING'
        } else {
          status = roll < 0.2 ? 'APPROVED' : roll < 0.3 ? 'REJECTED' : 'PENDING'
        }

        if (status === 'APPROVED') {
          // ─── 確定: ShiftRequest(APPROVED) + ShiftSegment[] ───
          const segments = generateSegments(
            pattern.startTime, pattern.endTime, positions.map(p => p.id)
          )

          const request = await prisma.shiftRequest.create({
            data: {
              storeId: store1.id,
              userId: staff.id,
              date: requestDate,
              startTime: pattern.startTime,
              endTime: pattern.endTime,
              status: 'APPROVED',
            },
          })
          requestCount++

          for (const seg of segments) {
            await prisma.shiftSegment.create({
              data: {
                shiftRequestId: request.id,
                positionId: seg.isBreak ? undefined : seg.positionId,
                startTime: seg.startTime,
                endTime: seg.endTime,
                isBreak: seg.isBreak,
              },
            })
            segmentCount++
          }
        } else {
          // ─── 承認待ち or 却下: ShiftRequest のみ ───
          await prisma.shiftRequest.create({
            data: {
              storeId: store1.id,
              userId: staff.id,
              date: requestDate,
              startTime: pattern.startTime,
              endTime: pattern.endTime,
              status,
              memo: status === 'REJECTED' ? '他のスタッフと重複' : undefined,
            },
          })
          requestCount++
        }
      }
    }
  }
  console.log('✅ シフト希望:', requestCount, '件')
  console.log('✅ セグメント:', segmentCount, '件')

  console.log('\n🎉 完了！ログイン情報:')
  console.log('  オーナー: owner@example.com / password123')
  console.log('  スタッフ: staff1@example.com / password123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
