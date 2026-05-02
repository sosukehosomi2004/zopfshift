import { prisma } from '@/lib/prisma'

/**
 * シフト期間に対して、各従業員の通年ルールを PreAssignment として展開する。
 *
 * 既に PreAssignment が存在する (employee, date) のペアは尊重し、上書きしない。
 * ルール由来であってもユーザーが明示的に削除/変更した可能性があるため。
 *
 * 戻り値: 新規作成されたPreAssignment件数
 */
export async function expandRecurringRules(shiftPeriodId: string): Promise<number> {
  const period = await prisma.shiftPeriod.findUnique({
    where: { id: shiftPeriodId },
  })
  if (!period) return 0

  const rules = await prisma.employeeRecurringRule.findMany({
    include: { employee: { select: { id: true, primaryWorkplace: true, isActive: true } } },
  })
  if (rules.length === 0) return 0

  // 期間内の祝日を取得
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: period.startDate, lte: period.endDate } },
  })
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().split('T')[0]))

  // 既存の PreAssignment (重複避け)
  const existing = await prisma.preAssignment.findMany({
    where: { shiftPeriodId },
    select: { employeeId: true, date: true },
  })
  const existingKeys = new Set(
    existing.map((p) => `${p.employeeId}|${p.date.toISOString().split('T')[0]}`),
  )

  // 承認済みの申請 — ルールより申請が優先 (承認時にPreAssignmentが作られているはずだが念のため)
  // PENDING は無視: ルールが適用されたUI表示を維持し、承認されたタイミングで上書きされる
  const dayOffRequests = await prisma.dayOffRequest.findMany({
    where: {
      date: { gte: period.startDate, lte: period.endDate },
      status: 'APPROVED',
    },
    select: { employeeId: true, date: true },
  })
  const requestKeys = new Set(
    dayOffRequests.map((d) => `${d.employeeId}|${d.date.toISOString().split('T')[0]}`),
  )

  // 期間内の全日付を生成
  const dates: Date[] = []
  const cur = new Date(period.startDate)
  const end = new Date(period.endDate)
  while (cur <= end) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }

  const toCreate: Array<{
    shiftPeriodId: string
    employeeId: string
    date: Date
    workplace: 'FACTORY' | 'CAFE' | 'FLOOR' | 'OFFICE' | 'OTHER' | null
    memo: string | null
  }> = []

  for (const rule of rules) {
    if (!rule.employee.isActive) continue
    for (const date of dates) {
      const dateStr = date.toISOString().split('T')[0]
      const key = `${rule.employeeId}|${dateStr}`
      if (existingKeys.has(key)) continue
      // 休み申請がある日はスキップ (申請優先)
      if (requestKeys.has(key)) continue

      // 条件マッチ
      let match = false
      if (rule.dayOfWeek !== null) {
        match = date.getDay() === rule.dayOfWeek
        // 祝日除外オプション
        if (match && rule.excludeHolidays && holidaySet.has(dateStr)) {
          match = false
        }
      } else if (rule.dayCategory) {
        const dow = date.getDay()
        const isHol = holidaySet.has(dateStr)
        switch (rule.dayCategory) {
          case 'HOLIDAY':
            match = isHol
            break
          case 'WEEKEND_OR_HOLIDAY':
            match = isHol || dow === 0 || dow === 6
            break
          case 'WEEKDAY':
            match = !isHol && dow >= 1 && dow <= 5
            break
        }
      }
      if (!match) continue

      // アクション展開
      const isOff = rule.ruleType === 'ALWAYS_OFF'
      const workplace = isOff
        ? null
        : (rule.workplace ?? rule.employee.primaryWorkplace) as
            | 'FACTORY'
            | 'CAFE'
            | 'FLOOR'
            | 'OFFICE'
            | 'OTHER'

      toCreate.push({
        shiftPeriodId,
        employeeId: rule.employeeId,
        date,
        workplace,
        memo: rule.memo,
      })
      // 同じ従業員×同じ日に複数ルールがあった場合、最初の1つだけ採用
      existingKeys.add(key)
    }
  }

  if (toCreate.length === 0) return 0
  await prisma.preAssignment.createMany({ data: toCreate })
  return toCreate.length
}
