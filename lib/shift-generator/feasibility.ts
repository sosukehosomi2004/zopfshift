import { GeneratorInput } from './types'
import { buildDateInfos } from './utils'

export type FeasibilityIssue = {
  severity: 'fatal' | 'warning'
  workplace?: string
  message: string
}

/**
 * 構造的に充足不能な制約を生成前に検出する。
 *
 * 致命的問題（fatal）が1つでもあると候補は0件になるので、ユーザーが事前に修正すべき。
 * 警告（warning）はSOFT違反として現れる可能性が高い。
 */
export function checkFeasibility(input: GeneratorInput): FeasibilityIssue[] {
  const issues: FeasibilityIssue[] = []
  const dateInfos = buildDateInfos(input.startDate, input.endDate, input.holidays)
  const totalDays = dateInfos.length
  if (totalDays === 0) return issues

  const workplace = input.employees[0]?.primaryWorkplace
  const empCount = input.employees.length

  // ============================================================
  // 1) 各日の必要稼働数 vs 利用可能従業員
  // ============================================================
  if (workplace) {
    const rule = input.staffingRules.find((r) => r.workplace === workplace)
    if (rule) {
      // 期間内の delta-min 集計
      let totalRequired = 0
      for (const di of dateInfos) {
        const r = input.staffingRules.find((r) => r.workplace === workplace && r.dayType === di.dayType)
        totalRequired += r?.requiredCount ?? 0
      }
      const totalAvailable = empCount * (totalDays - input.holidayCount)
      if (totalAvailable < totalRequired && !input.allowUnderstaffing) {
        issues.push({
          severity: 'fatal',
          workplace,
          message: `${workplace}: 必要稼働${totalRequired}人日 > 配置可能${totalAvailable}人日（従業員${empCount}名・各${input.holidayCount}日休み）`,
        })
      } else if (totalAvailable < totalRequired) {
        issues.push({
          severity: 'warning',
          workplace,
          message: `${workplace}: 必要稼働${totalRequired}人日 > 配置可能${totalAvailable}人日（${input.allowUnderstaffing ? '他勤務場所からの移動で補填' : '配置不能'}）`,
        })
      }
    }
  }

  // ============================================================
  // 2) 各必須スキルの保持者が存在するか
  // ============================================================
  if (workplace) {
    for (const slot of input.slots) {
      if (slot.workplace !== workplace) continue
      const holders = input.employees.filter((e) =>
        slot.requiredSkillIds.some((s) => e.skillIds.includes(s)),
      )
      if (holders.length === 0 && slot.rules.some((r) => r.isRequired)) {
        issues.push({
          severity: 'fatal',
          workplace,
          message: `${workplace}: 必須スロット「${slot.name}」を満たすスキル保持者がいません`,
        })
      }
    }
  }

  return issues
}
