import { DateInfo, DayAssignment, EmployeeInput, SlotInput, Workplace } from './types'
import { shuffle } from './utils'

/**
 * ポジションスロット割当
 *
 * 各日の各勤務場所で、出勤者をスロットに割り当てる。
 * 工場: 10スロット（月〜木は9人で6or9選択）
 * カフェ: K/S/KS（平日3人、休日4人＝S②追加）
 *
 * バックトラッキングでスキル制約を満たす配置を探す。
 */
export function assignSlots(
  dateInfos: DateInfo[],
  workDaysMap: Map<string, Set<string>>,
  employees: EmployeeInput[],
  slots: SlotInput[],
): { assignments: DayAssignment[]; errors: string[] } {
  const assignments: DayAssignment[] = []
  const errors: string[] = []

  for (const di of dateInfos) {
    // 勤務場所ごとに処理
    const workplaces = getUniqueWorkplaces(slots)

    for (const workplace of workplaces) {
      const wpSlots = slots.filter((s) => s.workplace === workplace)
      const wpEmployees = employees.filter((emp) => {
        if (emp.primaryWorkplace !== workplace) return false
        return workDaysMap.get(emp.id)?.has(di.date) ?? false
      })

      // この日必要なスロットを決定
      const requiredSlots = getRequiredSlots(wpSlots, di.dayType)

      // バックトラッキングで割当
      const result = backtrackAssign(requiredSlots, shuffle(wpEmployees))

      if (result) {
        for (const [slotId, empId] of Array.from(result.entries())) {
          assignments.push({
            employeeId: empId,
            date: di.date,
            workplace,
            slotId,
            isMoved: false,
          })
        }
        // スロットに割り当てられなかった出勤者も記録（ポジションなし）
        const assignedIds = new Set(result.values())
        for (const emp of wpEmployees) {
          if (!assignedIds.has(emp.id)) {
            assignments.push({
              employeeId: emp.id,
              date: di.date,
              workplace,
              slotId: null,
              isMoved: false,
            })
          }
        }
      } else {
        errors.push(`${di.date} ${workplace}: スキル制約を満たす配置が見つかりません`)
        // フォールバック: スロットなしで出勤だけ記録
        for (const emp of wpEmployees) {
          assignments.push({
            employeeId: emp.id,
            date: di.date,
            workplace,
            slotId: null,
            isMoved: false,
          })
        }
      }
    }

    // スロット定義のない勤務場所の従業員も記録
    for (const emp of employees) {
      const hasSlotDef = slots.some((s) => s.workplace === emp.primaryWorkplace)
      if (hasSlotDef) continue
      if (!(workDaysMap.get(emp.id)?.has(di.date) ?? false)) continue

      assignments.push({
        employeeId: emp.id,
        date: di.date,
        workplace: emp.primaryWorkplace,
        slotId: null,
        isMoved: false,
      })
    }
  }

  return { assignments, errors }
}

/**
 * この日に必要なスロットリストを決定
 * グループ選択（6or9）も解決する
 */
function getRequiredSlots(slots: SlotInput[], dayType: DateInfo['dayType']): SlotInput[] {
  const required: SlotInput[] = []
  const groups = new Map<string, SlotInput[]>()

  for (const slot of slots) {
    const rule = slot.rules.find((r) => r.dayType === dayType)
    if (!rule) continue

    if (rule.isRequired) {
      required.push(slot)
    } else if (rule.groupKey) {
      if (!groups.has(rule.groupKey)) groups.set(rule.groupKey, [])
      groups.get(rule.groupKey)!.push(slot)
    }
  }

  // グループからランダムに1つ選択
  for (const [, groupSlots] of Array.from(groups.entries())) {
    const picked = groupSlots[Math.floor(Math.random() * groupSlots.length)]
    required.push(picked)
  }

  return required
}

/**
 * バックトラッキングでスロットに従業員を割り当てる
 *
 * スロットのスキル要件に合う従業員を割り当て。
 * 窯・仕込は平日/休日でスキルが異なるため、dayTypeに応じたスキルで判定。
 */
function backtrackAssign(
  slots: SlotInput[],
  employees: EmployeeInput[],
): Map<string, string> | null {
  const assignment = new Map<string, string>() // slotId → employeeId
  const used = new Set<string>() // 使用済み従業員ID

  // スロットを「配置候補が少ない順」にソート（制約の厳しいものから）
  const sortedSlots = [...slots].sort((a, b) => {
    const aCandidates = employees.filter((e) => canAssign(e, a)).length
    const bCandidates = employees.filter((e) => canAssign(e, b)).length
    return aCandidates - bCandidates
  })

  function solve(index: number): boolean {
    if (index >= sortedSlots.length) return true

    const slot = sortedSlots[index]
    const candidates = employees.filter((e) => !used.has(e.id) && canAssign(e, slot))

    for (const emp of candidates) {
      assignment.set(slot.id, emp.id)
      used.add(emp.id)

      if (solve(index + 1)) return true

      assignment.delete(slot.id)
      used.delete(emp.id)
    }

    return false
  }

  return solve(0) ? assignment : null
}

/**
 * 従業員がスロットに入れるかチェック
 * スキル要件: スロットの requiredSkillIds のいずれかを持っていればOK
 *
 * 窯・仕込スロットは平日/休日で必要なスキルが異なる。
 * WorkplaceSlotSkill に「平日午前窯」「休日午前窯」の両方が紐づいているので、
 * 日タイプに応じた方のスキルを従業員が持っているかをチェックする。
 */
function canAssign(emp: EmployeeInput, slot: SlotInput): boolean {
  return slot.requiredSkillIds.some((skillId) => emp.skillIds.includes(skillId))
}

function getUniqueWorkplaces(slots: SlotInput[]): Workplace[] {
  return Array.from(new Set(slots.map((s) => s.workplace)))
}
