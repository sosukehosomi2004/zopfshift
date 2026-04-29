import { DayAssignment, DateInfo, EmployeeInput, StaffingRuleInput, SlotInput, DayOffInput, SkillInput } from './types'

// 工場メインスタッフ（小松ライン）の名字リスト
export const KOMATSU_LINE_LASTNAMES = ['上田', '篠原', '伊藤', '福永', '小松']
export const KOMATSU_LINE_MIN_WORKING = 3

/**
 * 連続勤務日数チェック
 * 有休日は連続勤務をリセットする
 */
export function checkConsecutiveWorkDays(
  employeeId: string,
  dateInfos: DateInfo[],
  workDays: Set<string>, // 出勤日セット
  dayOffs: DayOffInput[],
  maxConsecutive: number,
): string[] {
  const violations: string[] = []
  const paidLeaveDates = new Set(
    dayOffs.filter((d) => d.employeeId === employeeId && d.type === 'PAID_LEAVE').map((d) => d.date)
  )

  let consecutive = 0
  for (const di of dateInfos) {
    if (paidLeaveDates.has(di.date)) {
      // 有休 → リセット
      consecutive = 0
    } else if (workDays.has(di.date)) {
      consecutive++
      if (consecutive > maxConsecutive) {
        violations.push(`${employeeId}: ${di.date}時点で${consecutive}連勤（上限${maxConsecutive}日）`)
      }
    } else {
      // 公休 → リセット
      consecutive = 0
    }
  }
  return violations
}

/**
 * 公休数チェック
 * 有休は公休にカウントしない
 */
export function checkHolidayCount(
  employeeId: string,
  dateInfos: DateInfo[],
  workDays: Set<string>,
  dayOffs: DayOffInput[],
  requiredHolidayCount: number,
): string[] {
  const paidLeaveDates = new Set(
    dayOffs.filter((d) => d.employeeId === employeeId && d.type === 'PAID_LEAVE').map((d) => d.date)
  )

  let actualHolidayCount = 0
  for (const di of dateInfos) {
    if (!workDays.has(di.date) && !paidLeaveDates.has(di.date)) {
      actualHolidayCount++
    }
  }

  if (actualHolidayCount < requiredHolidayCount) {
    return [`${employeeId}: 公休${actualHolidayCount}日（必要${requiredHolidayCount}日）`]
  }
  return []
}

/**
 * 勤務場所ごとの稼働人数チェック
 */
export function checkStaffingCounts(
  date: string,
  dayType: DateInfo['dayType'],
  assignments: DayAssignment[],
  employees: EmployeeInput[],
  staffingRules: StaffingRuleInput[],
): string[] {
  const violations: string[] = []
  const empMap = new Map(employees.map((e) => [e.id, e]))

  // 勤務場所ごとに集計
  const countByWorkplace = new Map<string, { total: number; fullTime: number }>()
  for (const a of assignments) {
    if (a.date !== date) continue
    const current = countByWorkplace.get(a.workplace) ?? { total: 0, fullTime: 0 }
    current.total++
    const emp = empMap.get(a.employeeId)
    if (emp?.employmentType === 'FULL_TIME') current.fullTime++
    countByWorkplace.set(a.workplace, current)
  }

  for (const rule of staffingRules) {
    if (rule.dayType !== dayType) continue
    const counts = countByWorkplace.get(rule.workplace) ?? { total: 0, fullTime: 0 }

    if (counts.total < rule.requiredCount) {
      violations.push(`${date} ${rule.workplace}: ${counts.total}人（必要${rule.requiredCount}人）`)
    }
    if (rule.minFullTimeCount !== null && counts.fullTime < rule.minFullTimeCount) {
      violations.push(`${date} ${rule.workplace}: 正社員${counts.fullTime}人（最低${rule.minFullTimeCount}人）`)
    }
  }

  return violations
}

/**
 * ポジションスロット充足チェック
 */
export function checkSlotCoverage(
  date: string,
  dayType: DateInfo['dayType'],
  assignments: DayAssignment[],
  employees: EmployeeInput[],
  slots: SlotInput[],
): string[] {
  const violations: string[] = []
  const dayAssignments = assignments.filter((a) => a.date === date)

  for (const slot of slots) {
    const rule = slot.rules.find((r) => r.dayType === dayType)
    if (!rule) continue

    // 選択制スロット（groupKey あり、isRequired=false）はグループ単位でチェック
    if (!rule.isRequired && rule.groupKey) continue

    if (!rule.isRequired) continue

    // このスロットに割り当てられた人がいるか
    const assigned = dayAssignments.find((a) => a.slotId === slot.id)
    if (!assigned) {
      violations.push(`${date}: スロット「${slot.name}」に誰も割り当てられていません`)
      continue
    }

    // 割り当てられた人がスキルを持っているか
    const emp = employees.find((e) => e.id === assigned.employeeId)
    if (emp && !slot.requiredSkillIds.some((sid) => emp.skillIds.includes(sid))) {
      violations.push(`${date}: ${slot.name}に割り当てられた従業員がスキルを持っていません`)
    }
  }

  // グループ単位のチェック（工場の6or9）
  const groupKeys = new Set<string>()
  for (const slot of slots) {
    const rule = slot.rules.find((r) => r.dayType === dayType)
    if (rule && !rule.isRequired && rule.groupKey) {
      groupKeys.add(rule.groupKey)
    }
  }

  for (const groupKey of Array.from(groupKeys)) {
    const groupSlots = slots.filter((s) => {
      const rule = s.rules.find((r) => r.dayType === dayType)
      return rule && !rule.isRequired && rule.groupKey === groupKey
    })

    const assigned = groupSlots.some((s) =>
      dayAssignments.some((a) => a.slotId === s.id)
    )

    if (!assigned) {
      const names = groupSlots.map((s) => s.name).join(' or ')
      violations.push(`${date}: ${names} のいずれかに人を割り当てる必要があります`)
    }
  }

  return violations
}

/**
 * カフェ習熟度チェック
 * ▲(LOW)のスキルを持つ従業員が働く日は、◎(HIGH)のスキルを持つ従業員も働く必要がある
 */
export function checkCafeProficiency(
  date: string,
  assignments: DayAssignment[],
  employees: EmployeeInput[],
  skills: SkillInput[],
): string[] {
  const violations: string[] = []
  const cafeSkillIds = new Set(skills.filter((s) => s.workplace === 'CAFE').map((s) => s.id))

  // その日のカフェ出勤者
  const cafeAssignments = assignments.filter((a) => a.date === date && a.workplace === 'CAFE')
  if (cafeAssignments.length === 0) return violations

  const empMap = new Map(employees.map((e) => [e.id, e]))

  let hasLow = false
  let hasHigh = false

  for (const a of cafeAssignments) {
    const emp = empMap.get(a.employeeId)
    if (!emp?.skillsWithProficiency) continue
    for (const sk of emp.skillsWithProficiency) {
      if (!cafeSkillIds.has(sk.skillId)) continue
      if (sk.proficiency === 'LOW') hasLow = true
      if (sk.proficiency === 'HIGH') hasHigh = true
    }
  }

  if (hasLow && !hasHigh) {
    violations.push(`${date} CAFE: ▲の従業員がいる日は◎の従業員も必要`)
  }

  return violations
}

/**
 * フロア習熟度チェック
 * ▲(LOW)の従業員は同時に最大2人まで
 */
export function checkFloorProficiency(
  date: string,
  assignments: DayAssignment[],
  employees: EmployeeInput[],
  maxLow: number = 2,
): string[] {
  const violations: string[] = []
  const empMap = new Map(employees.map((e) => [e.id, e]))

  const floorAssignments = assignments.filter((a) => a.date === date && a.workplace === 'FLOOR')
  let lowCount = 0
  for (const a of floorAssignments) {
    const emp = empMap.get(a.employeeId)
    if (emp?.floorProficiency === 'LOW') lowCount++
  }

  if (lowCount > maxLow) {
    violations.push(`${date} FLOOR: ▲の従業員が${lowCount}名（上限${maxLow}名）`)
  }

  return violations
}

/**
 * 小松ラインチェック
 * 工場メインスタッフ5名（上田・篠原・伊藤・福永・小松）のうち、最低3名は工場で働く必要がある
 */
export function checkKomatsuLine(
  date: string,
  assignments: DayAssignment[],
  employees: EmployeeInput[],
): string[] {
  const violations: string[] = []
  const empMap = new Map(employees.map((e) => [e.id, e]))

  // 工場で働いているメインスタッフをカウント
  let mainCount = 0
  for (const a of assignments) {
    if (a.date !== date) continue
    if (a.workplace !== 'FACTORY') continue
    const emp = empMap.get(a.employeeId)
    if (!emp) continue
    if (KOMATSU_LINE_LASTNAMES.includes(emp.lastName)) {
      mainCount++
    }
  }

  if (mainCount < KOMATSU_LINE_MIN_WORKING) {
    violations.push(`${date} FACTORY: 小松ライン${mainCount}名（最低${KOMATSU_LINE_MIN_WORKING}名）`)
  }

  return violations
}
