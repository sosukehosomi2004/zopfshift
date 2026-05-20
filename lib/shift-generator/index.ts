import { GeneratorInput, GeneratorOutput, CandidateOutput } from './types'
import { buildDateInfos } from './utils'
import { allocateHolidays } from './holiday-allocator'
import { assignSlots } from './slot-assigner'
import { checkConsecutiveWorkDays, checkHolidayCount, checkStaffingCounts, checkSlotCoverage, checkCafeProficiency, checkFloorProficiency } from './constraints'
import { scoreConsecutiveOffDays } from './scorer'
import { checkFeasibility } from './feasibility'

export { checkFeasibility } from './feasibility'

const MAX_CONSECUTIVE = 5
const DEFAULT_MAX_ATTEMPTS = 1500
const DEFAULT_TARGET_VALID = 300

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

  // 構造的不能を事前検出（致命的なら即失敗）
  const feasibility = checkFeasibility(input)
  const fatal = feasibility.filter((f) => f.severity === 'fatal')
  if (fatal.length > 0) {
    return {
      candidates: [],
      errors: fatal.map((f) => `[構造的不能] ${f.message}`),
    }
  }

  const allValidCandidates: CandidateOutput[] = []
  let attempts = 0
  const t0 = Date.now()
  const targetValid = input.targetValid ?? DEFAULT_TARGET_VALID
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  // 失敗候補の HARD 違反集計 (デバッグ用): 違反パターン → 件数
  const violationCounter = new Map<string, number>()
  let bestFailedCandidate: CandidateOutput | null = null

  // HARD違反0件の候補を最大 targetValid 件まで集める
  while (allValidCandidates.length < targetValid && attempts < maxAttempts) {
    attempts++
    const candidate = generateOneCandidate(allValidCandidates.length + 1, input, dateInfos)
    if (candidate.hardViolations.length === 0) {
      allValidCandidates.push(candidate)
    } else {
      // 違反パターンをカウント (具体的な日付・名前は伏せて分類)
      for (const v of candidate.hardViolations) {
        const key = v.replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD')
        violationCounter.set(key, (violationCounter.get(key) ?? 0) + 1)
      }
      // 違反数が最少の候補を保持 (失敗時のサンプル表示用)
      if (!bestFailedCandidate || candidate.hardViolations.length < bestFailedCandidate.hardViolations.length) {
        bestFailedCandidate = candidate
      }
    }
  }

  const elapsedMs = Date.now() - t0
  console.log(
    `[generator] valid=${allValidCandidates.length} / attempts=${attempts} (rejection=${(((attempts - allValidCandidates.length) / attempts) * 100).toFixed(1)}%) elapsed=${elapsedMs}ms`,
  )

  if (allValidCandidates.length === 0) {
    errors.push(`${attempts}回試行: HARD違反のない候補が見つかりませんでした`)
    // 頻出 HARD 違反パターン Top 5
    const topPatterns = Array.from(violationCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    for (const [pattern, count] of topPatterns) {
      errors.push(`  頻出違反: ${pattern} (${count}回)`)
    }
    // 最も惜しかった候補の HARD 違反サンプル
    if (bestFailedCandidate) {
      errors.push(`  最少違反候補 (${bestFailedCandidate.hardViolations.length}件):`)
      for (const v of bestFailedCandidate.hardViolations.slice(0, 5)) {
        errors.push(`    ${v}`)
      }
    }
  } else if (allValidCandidates.length < input.candidateCount) {
    errors.push(`${attempts}回試行して${allValidCandidates.length}候補のみ生成（目標${input.candidateCount}）`)
  }

  // SOFT違反数 (少ない順) → 2連休スコア (多い順) でソート
  for (const c of allValidCandidates) {
    c.score = scoreConsecutiveOffDays(c, input.employees, dateInfos)
  }
  allValidCandidates.sort((a, b) => {
    const violationDiff = a.violations.length - b.violations.length
    if (violationDiff !== 0) return violationDiff
    return (b.score ?? 0) - (a.score ?? 0)
  })

  // SOFT違反の分布をログ出力 (実験用)
  if (allValidCandidates.length > 0) {
    const softCounts = allValidCandidates.map((c) => c.violations.length)
    const min = softCounts[0]
    const max = softCounts[softCounts.length - 1]
    const median = softCounts[Math.floor(softCounts.length / 2)]
    console.log(`[generator] SOFT violations: min=${min} median=${median} max=${max}`)
  }

  // 上位 candidateCount 件のみ返す
  const candidates = allValidCandidates.slice(0, input.candidateCount)
  candidates.forEach((c, i) => { c.candidateIndex = i + 1 })

  return { candidates, errors }
}

function generateOneCandidate(
  candidateIndex: number,
  input: GeneratorInput,
  dateInfos: ReturnType<typeof buildDateInfos>,
): CandidateOutput {
  const { employees, skills, slots, staffingRules, dayOffs, holidayCount } = input
  const violations: string[] = []      // SOFT
  const hardViolations: string[] = []  // HARD

  const workDaysMap = allocateHolidays(
    employees, dateInfos, dayOffs, staffingRules,
    holidayCount, MAX_CONSECUTIVE, slots, input.allowUnderstaffing, input.preAssignments,
    input.initialConsecutiveWork,
  )

  const { assignments, errors: slotErrors } = assignSlots(
    dateInfos, workDaysMap, employees, slots,
  )
  // ポジション未充足はSOFT
  violations.push(...slotErrors)

  // 連続勤務 + 公休数 はHARD
  for (const emp of employees) {
    const workDays = workDaysMap.get(emp.id) ?? new Set()
    const initialConsec = input.initialConsecutiveWork?.[emp.id] ?? 0
    const displayName = emp.lastName
    hardViolations.push(...checkConsecutiveWorkDays(emp.id, dateInfos, workDays, dayOffs, MAX_CONSECUTIVE, initialConsec, displayName))
    hardViolations.push(...checkHolidayCount(emp.id, dateInfos, workDays, dayOffs, holidayCount, displayName))
  }

  const workplace = employees[0]?.primaryWorkplace
  for (const di of dateInfos) {
    // 定数不足はSOFT
    violations.push(...checkStaffingCounts(di.date, di.dayType, assignments, employees, staffingRules))
    // ポジションスロット未充足はSOFT
    violations.push(...checkSlotCoverage(di.date, di.dayType, assignments, employees, slots))

    // 習熟度はHARD
    if (workplace === 'CAFE') {
      hardViolations.push(...checkCafeProficiency(di.date, assignments, employees, skills))
    }
    if (workplace === 'FLOOR') {
      hardViolations.push(...checkFloorProficiency(di.date, assignments, employees))
    }
  }

  return { candidateIndex, assignments, violations, hardViolations }
}
