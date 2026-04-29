import { GeneratorInput, GeneratorOutput, CandidateOutput } from './types'
import { buildDateInfos } from './utils'
import { allocateHolidays } from './holiday-allocator'
import { assignSlots } from './slot-assigner'
import { checkConsecutiveWorkDays, checkStaffingCounts, checkSlotCoverage, checkCafeProficiency, checkFloorProficiency, checkKomatsuLine } from './constraints'
import { scoreConsecutiveOffDays } from './scorer'

const MAX_CONSECUTIVE = 5
const MAX_ATTEMPTS = 2000 // 最大試行回数

/**
 * シフト生成エンジン
 *
 * 違反0件の候補をcandidateCount個見つかるまで生成を繰り返す。
 * MAX_ATTEMPTSに達したら見つかった分だけ返す。
 */
export function generateShiftCandidates(input: GeneratorInput): GeneratorOutput {
  const dateInfos = buildDateInfos(input.startDate, input.endDate, input.holidays)
  const errors: string[] = []

  if (input.employees.length === 0) {
    return { candidates: [], errors: ['従業員が登録されていません'] }
  }
  if (dateInfos.length === 0) {
    return { candidates: [], errors: ['シフト期間が不正です'] }
  }

  const candidates: CandidateOutput[] = []
  let attempts = 0

  while (candidates.length < input.candidateCount && attempts < MAX_ATTEMPTS) {
    attempts++
    const candidate = generateOneCandidate(candidates.length + 1, input, dateInfos)
    if (candidate.violations.length === 0) {
      candidate.candidateIndex = candidates.length + 1
      candidates.push(candidate)
    }
  }

  if (candidates.length < input.candidateCount) {
    errors.push(`${attempts}回試行して${candidates.length}候補のみ生成（目標${input.candidateCount}）`)
  }

  // スコアリング: 2連休の多さで順位付け
  for (const c of candidates) {
    c.score = scoreConsecutiveOffDays(c, input.employees, dateInfos)
  }

  // スコア降順でソート
  candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  // candidateIndexを振り直す
  candidates.forEach((c, i) => { c.candidateIndex = i + 1 })

  return { candidates, errors }
}

function generateOneCandidate(
  candidateIndex: number,
  input: GeneratorInput,
  dateInfos: ReturnType<typeof buildDateInfos>,
): CandidateOutput {
  const { employees, skills, slots, staffingRules, dayOffs, holidayCount } = input
  const violations: string[] = []

  const workDaysMap = allocateHolidays(
    employees, dateInfos, dayOffs, staffingRules,
    holidayCount, MAX_CONSECUTIVE, slots, input.allowUnderstaffing,
  )

  const { assignments, errors: slotErrors } = assignSlots(
    dateInfos, workDaysMap, employees, slots,
  )
  if (!input.allowUnderstaffing) {
    violations.push(...slotErrors)
  }

  for (const emp of employees) {
    const workDays = workDaysMap.get(emp.id) ?? new Set()
    violations.push(...checkConsecutiveWorkDays(emp.id, dateInfos, workDays, dayOffs, MAX_CONSECUTIVE))
  }

  const workplace = employees[0]?.primaryWorkplace
  for (const di of dateInfos) {
    if (!input.allowUnderstaffing) {
      violations.push(...checkStaffingCounts(di.date, di.dayType, assignments, employees, staffingRules))
      violations.push(...checkSlotCoverage(di.date, di.dayType, assignments, employees, slots))

      if (workplace === 'CAFE') {
        violations.push(...checkCafeProficiency(di.date, assignments, employees, skills))
      }
      if (workplace === 'FLOOR') {
        violations.push(...checkFloorProficiency(di.date, assignments, employees))
      }
    }

    // 工場の小松ラインチェック（必須）
    if (workplace === 'FACTORY') {
      violations.push(...checkKomatsuLine(di.date, assignments, employees))
    }
  }

  return { candidateIndex, assignments, violations }
}
