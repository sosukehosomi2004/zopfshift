import { CandidateOutput, EmployeeInput, DateInfo } from './types'

/**
 * 2連休スコア: 全従業員の2連休の合計数
 * 2連休 = 2日以上連続で休み（有休含む）
 */
export function scoreConsecutiveOffDays(
  candidate: CandidateOutput,
  employees: EmployeeInput[],
  dateInfos: DateInfo[],
): number {
  const dates = dateInfos.map((d) => d.date)
  const totalDays = dates.length

  // 出勤日セット: employeeId → Set<date>
  const workDaysByEmp = new Map<string, Set<string>>()
  for (const a of candidate.assignments) {
    if (!workDaysByEmp.has(a.employeeId)) workDaysByEmp.set(a.employeeId, new Set())
    workDaysByEmp.get(a.employeeId)!.add(a.date)
  }

  let totalConsecutiveOffs = 0

  for (const emp of employees) {
    const workDays = workDaysByEmp.get(emp.id) ?? new Set()

    let consecutiveOff = 0
    let twoOrMoreCount = 0

    for (let d = 0; d < totalDays; d++) {
      if (!workDays.has(dates[d])) {
        consecutiveOff++
      } else {
        if (consecutiveOff >= 2) {
          twoOrMoreCount++
        }
        consecutiveOff = 0
      }
    }
    // 末尾チェック
    if (consecutiveOff >= 2) {
      twoOrMoreCount++
    }

    totalConsecutiveOffs += twoOrMoreCount
  }

  return totalConsecutiveOffs
}
