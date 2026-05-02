// クライアント側でリアルタイムにSOFT違反を計算するためのモジュール

export type DayType = 'WEEKDAY_MON_THU' | 'FRIDAY' | 'HOLIDAY'

export type SlotRule = {
  dayType: DayType
  isRequired: boolean
  groupKey: string | null
}

export type SlotDef = {
  id: string
  workplace: string
  name: string
  sortOrder: number
  requiredSkillIds: string[]
  rules: SlotRule[]
}

export type StaffingRule = {
  workplace: string
  dayType: DayType
  requiredCount: number
  minFullTimeCount: number | null
  baseFullTimeCount: number | null
}

export type SkillInfo = { id: string; workplace: string; name: string }

export type EmployeeLite = {
  id: string
  lastName: string
  firstName: string
  employmentType: 'FULL_TIME' | 'PART_TIME'
  primaryWorkplace: string
  secondaryWorkplaces: { workplace: string }[]
  floorProficiency?: 'LOW' | 'MID' | 'HIGH' | null
  skills: { skillId: string; proficiency?: 'LOW' | 'MID' | 'HIGH' | null }[]
}

export type AssignmentLite = {
  employeeId: string
  date: string
  workplace: string
  workplaceSlotId?: string | null
}

export type SoftViolation =
  | {
      kind: 'staffing'
      date: string
      workplace: string
      current: number
      required: number
      short: number
    }
  | {
      kind: 'position'
      date: string
      workplace: string
      slotId: string // 代表スロットID
      slotIds: string[] // グループの場合は複数
      label: string // 表示用 (例: "K" / "後麺① or 焼込①")
      requiredSkillIds: string[] // 候補絞り込み用 (グループは union)
    }
  | {
      kind: 'fullTime'
      date: string
      workplace: string
      current: number
      required: number
    }

export function getDayType(date: string, holidaySet: Set<string>): DayType {
  const dow = new Date(date + 'T00:00:00').getDay()
  if (holidaySet.has(date) || dow === 0 || dow === 6) return 'HOLIDAY'
  if (dow === 5) return 'FRIDAY'
  return 'WEEKDAY_MON_THU'
}

// 二部マッチング: スロット → 従業員 (Hopcroft-Karp スタイルの増加路)
function maxMatch(
  slotIds: string[],
  slotEligible: Map<string, string[]>,
): Map<string, string> {
  const slotMatch = new Map<string, string>() // slotId -> empId
  const empMatch = new Map<string, string>() // empId -> slotId

  const tryAugment = (slotId: string, visited: Set<string>): boolean => {
    for (const empId of slotEligible.get(slotId) ?? []) {
      if (visited.has(empId)) continue
      visited.add(empId)
      const cur = empMatch.get(empId)
      if (cur === undefined || tryAugment(cur, visited)) {
        slotMatch.set(slotId, empId)
        empMatch.set(empId, slotId)
        return true
      }
    }
    return false
  }

  for (const sid of slotIds) {
    tryAugment(sid, new Set())
  }
  return slotMatch
}

const TARGET_WORKPLACES = ['FACTORY', 'CAFE', 'FLOOR'] as const

export function calculateSoftViolations(input: {
  dates: string[]
  holidaySet: Set<string>
  assignments: AssignmentLite[]
  employees: EmployeeLite[]
  slots: SlotDef[]
  staffingRules: StaffingRule[]
}): SoftViolation[] {
  const { dates, holidaySet, assignments, employees, slots, staffingRules } = input
  const violations: SoftViolation[] = []
  const empMap = new Map(employees.map((e) => [e.id, e]))

  for (const date of dates) {
    const dayType = getDayType(date, holidaySet)
    const dayAssignments = assignments.filter((a) => a.date === date)

    for (const wp of TARGET_WORKPLACES) {
      const wpAssignments = dayAssignments.filter((a) => a.workplace === wp)
      const rule = staffingRules.find((r) => r.workplace === wp && r.dayType === dayType)

      // 1. 人数チェック
      if (rule && wpAssignments.length < rule.requiredCount) {
        violations.push({
          kind: 'staffing',
          date,
          workplace: wp,
          current: wpAssignments.length,
          required: rule.requiredCount,
          short: rule.requiredCount - wpAssignments.length,
        })
      }

      // 2. 正社員最低数チェック
      if (rule && rule.minFullTimeCount !== null) {
        const ftCount = wpAssignments.filter(
          (a) => empMap.get(a.employeeId)?.employmentType === 'FULL_TIME',
        ).length
        if (ftCount < rule.minFullTimeCount) {
          violations.push({
            kind: 'fullTime',
            date,
            workplace: wp,
            current: ftCount,
            required: rule.minFullTimeCount,
          })
        }
      }

      // 3. ポジションスロット未充足
      const wpSlots = slots.filter((s) => s.workplace === wp)
      const requiredSlots: SlotDef[] = []
      const groupMap = new Map<string, SlotDef[]>()

      for (const s of wpSlots) {
        const r = s.rules.find((rr) => rr.dayType === dayType)
        if (!r) continue
        if (r.isRequired) {
          requiredSlots.push(s)
        } else if (r.groupKey) {
          if (!groupMap.has(r.groupKey)) groupMap.set(r.groupKey, [])
          groupMap.get(r.groupKey)!.push(s)
        }
      }

      // 全マッチング対象のスロット (要求 + グループ全部)
      const allMatchSlots = [...requiredSlots, ...Array.from(groupMap.values()).flat()]
      const slotEligible = new Map<string, string[]>()
      for (const s of allMatchSlots) {
        const eligible = wpAssignments
          .filter((a) => {
            const emp = empMap.get(a.employeeId)
            if (!emp) return false
            return s.requiredSkillIds.some((sid) =>
              emp.skills.some((sk) => sk.skillId === sid),
            )
          })
          .map((a) => a.employeeId)
        slotEligible.set(s.id, eligible)
      }
      // 要求スロットを先に処理
      const matched = maxMatch(allMatchSlots.map((s) => s.id), slotEligible)

      // 要求スロットの未充足
      for (const s of requiredSlots) {
        if (!matched.has(s.id)) {
          violations.push({
            kind: 'position',
            date,
            workplace: wp,
            slotId: s.id,
            slotIds: [s.id],
            label: s.name,
            requiredSkillIds: s.requiredSkillIds,
          })
        }
      }
      // グループ未充足
      for (const groupSlots of Array.from(groupMap.values())) {
        const anyMatched = groupSlots.some((s) => matched.has(s.id))
        if (!anyMatched) {
          const skillUnion = Array.from(
            new Set(groupSlots.flatMap((s) => s.requiredSkillIds)),
          )
          violations.push({
            kind: 'position',
            date,
            workplace: wp,
            slotId: groupSlots[0].id,
            slotIds: groupSlots.map((s) => s.id),
            label: groupSlots.map((s) => s.name).join(' or '),
            requiredSkillIds: skillUnion,
          })
        }
      }
    }
  }

  return violations
}

// 配置シミュレーション: 既存assignmentsに対して指定の配置を加えた状態で違反計算
export function simulatePlacement(
  current: AssignmentLite[],
  placement: { employeeId: string; date: string; workplace: string },
): AssignmentLite[] {
  // 既に同じ日に存在するassignmentは置き換え
  const filtered = current.filter(
    (a) => !(a.employeeId === placement.employeeId && a.date === placement.date),
  )
  return [...filtered, placement]
}

// 違反の差分を計算 (解消されたもの / 新たに発生したもの)
export function diffViolations(
  before: SoftViolation[],
  after: SoftViolation[],
): { resolved: SoftViolation[]; created: SoftViolation[] } {
  const key = (v: SoftViolation): string => {
    if (v.kind === 'staffing') return `s|${v.date}|${v.workplace}`
    if (v.kind === 'position') return `p|${v.date}|${v.workplace}|${v.slotId}`
    return `f|${v.date}|${v.workplace}`
  }
  const beforeKeys = new Set(before.map(key))
  const afterKeys = new Set(after.map(key))
  const resolved = before.filter((v) => !afterKeys.has(key(v)))
  const created = after.filter((v) => !beforeKeys.has(key(v)))
  return { resolved, created }
}
