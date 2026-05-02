import { DateInfo, DayOffInput, EmployeeInput, StaffingRuleInput, SlotInput, PreAssignmentInput } from './types'
import { shuffle } from './utils'
import { KOMATSU_LINE_LASTNAMES, KOMATSU_LINE_MIN_WORKING } from './constraints'

/**
 * 公休割当（CSPソルバー）
 *
 * 全制約を同時に満たす休みパターンを構築する。
 *
 * 変数: schedule[empIdx][dayIdx] = 出勤(true) / 休み(false)
 *
 * 制約:
 * C1. 各日の出勤者数 = 定数（月〜木:9, 金・休日:10）
 * C2. 各日の出勤者でポジションスロットが全部埋まること
 * C3. 各従業員の公休日数 = requiredHolidayCount
 * C4. 各従業員の連続出勤 ≤ maxConsecutive
 *
 * アルゴリズム: 日ごとに「誰を休ませるか」を決めていく。
 * 各日で休む人の組合せを選ぶ際、C1〜C4を全て前方チェック(forward checking)する。
 */
export function allocateHolidays(
  employees: EmployeeInput[],
  dateInfos: DateInfo[],
  dayOffs: DayOffInput[],
  staffingRules: StaffingRuleInput[],
  requiredHolidayCount: number,
  maxConsecutive: number,
  slots?: SlotInput[],
  allowUnderstaffing = false,
  preAssignments?: PreAssignmentInput[],
): Map<string, Set<string>> {
  const totalDays = dateInfos.length
  const empCount = employees.length

  // 各日の休み人数を決定
  // - allowUnderstaffing=true（カフェ・フロア）: 公休8日優先で配分（定数割れOK、移動で補填）
  // - allowUnderstaffing=false（工場）: empCount - required で配分（定数ぴったり、公休は超過OK）
  const restPerDay = new Array(totalDays).fill(0)
  if (allowUnderstaffing) {
    const totalRestSlots = empCount * requiredHolidayCount
    const baseRest = Math.floor(totalRestSlots / totalDays)
    const extraRest = totalRestSlots - baseRest * totalDays
    for (let d = 0; d < totalDays; d++) {
      restPerDay[d] = baseRest + (d < extraRest ? 1 : 0)
    }
  } else {
    for (let d = 0; d < totalDays; d++) {
      const rule = staffingRules.find(
        (r) => r.workplace === employees[0]?.primaryWorkplace && r.dayType === dateInfos[d].dayType
      )
      restPerDay[d] = empCount - (rule?.requiredCount ?? empCount)
    }
  }

  // 状態: schedule[empIdx][dayIdx]
  const schedule: boolean[][] = Array.from({ length: empCount }, () =>
    new Array(totalDays).fill(true)
  )

  // 従業員IDからインデックス
  const empIdToIdx = new Map<string, number>()
  employees.forEach((e, i) => empIdToIdx.set(e.id, i))

  // 有休セット
  const paidLeaveSet = new Map<number, Set<number>>()

  // 各従業員の連続出勤カウンター
  const consecutiveWork = new Array(empCount).fill(0)
  // 各従業員の連続休みカウンター（2連休促進用）
  const consecutiveRest = new Array(empCount).fill(0)
  // 各従業員の残り必要公休数
  const remainingHolidays = new Array(empCount).fill(requiredHolidayCount)
  // 各従業員の残り出勤可能日数
  const remainingDays = new Array(empCount).fill(totalDays)

  // 申請済み反映（全日程を通して先に処理）
  for (const d of dayOffs) {
    const empIdx = empIdToIdx.get(d.employeeId)
    if (empIdx === undefined) continue
    const dayIdx = dateInfos.findIndex((di) => di.date === d.date)
    if (dayIdx === -1) continue
    schedule[empIdx][dayIdx] = false
    if (d.type === 'PAID_LEAVE') {
      if (!paidLeaveSet.has(empIdx)) paidLeaveSet.set(empIdx, new Set())
      paidLeaveSet.get(empIdx)!.add(dayIdx)
    } else {
      remainingHolidays[empIdx]--
    }
  }

  // 事前確定セル: ロックセットを作る（休み確定と出勤確定の両方）
  const lockedRestCells = new Set<string>() // `${empIdx}-${dayIdx}` 休み確定
  const lockedWorkCells = new Set<string>() // `${empIdx}-${dayIdx}` 出勤確定
  if (preAssignments) {
    for (const pa of preAssignments) {
      const empIdx = empIdToIdx.get(pa.employeeId)
      if (empIdx === undefined) continue
      const dayIdx = dateInfos.findIndex((di) => di.date === pa.date)
      if (dayIdx === -1) continue
      const key = `${empIdx}-${dayIdx}`
      if (pa.workplace === null) {
        // 休み確定
        schedule[empIdx][dayIdx] = false
        lockedRestCells.add(key)
        remainingHolidays[empIdx]--
      } else {
        // 出勤確定
        schedule[empIdx][dayIdx] = true
        lockedWorkCells.add(key)
      }
    }
  }

  // 小松ラインの最大休み数 = 5 - 3 = 2人まで
  const KOMATSU_MAX_REST = KOMATSU_LINE_LASTNAMES.length - KOMATSU_LINE_MIN_WORKING
  const isFactoryWorkplace = employees[0]?.primaryWorkplace === 'FACTORY'

  // 日ごとに休む人を決める
  for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
    // ============================================================
    // STEP 1: 5連勤達成者を強制休み (HARD制約優先, restPerDayを超過してもOK)
    // ============================================================
    for (let i = 0; i < empCount; i++) {
      if (
        consecutiveWork[i] >= maxConsecutive &&
        schedule[i][dayIdx] &&
        !lockedWorkCells.has(`${i}-${dayIdx}`)
      ) {
        schedule[i][dayIdx] = false
        remainingHolidays[i]--
      }
    }

    // この日に休みになっている人 (lockedRest + forced rest 含む)
    const alreadyResting: number[] = []
    for (let i = 0; i < empCount; i++) {
      if (!schedule[i][dayIdx]) alreadyResting.push(i)
    }

    const needed = restPerDay[dayIdx]
    const additionalNeeded = needed - alreadyResting.length
    if (additionalNeeded <= 0) {
      // 既に十分 → 連続カウンター更新
      updateConsecutive(schedule, dayIdx, empCount, consecutiveWork, paidLeaveSet, consecutiveRest)
      updateRemainingDays(remainingDays, dayIdx, totalDays)
      continue
    }

    // 候補: 出勤中の全従業員（出勤確定セルは候補から除外）
    const workingEmps = []
    for (let i = 0; i < empCount; i++) {
      if (schedule[i][dayIdx] && !lockedWorkCells.has(`${i}-${dayIdx}`)) workingEmps.push(i)
    }

    // この日に既に休んでいる小松ラインの人数（動的に更新）
    let mainStaffRestingToday = 0
    if (isFactoryWorkplace) {
      for (let i = 0; i < empCount; i++) {
        if (!schedule[i][dayIdx] && KOMATSU_LINE_LASTNAMES.includes(employees[i].lastName)) {
          mainStaffRestingToday++
        }
      }
    }

    // 各候補にスコアをつけてソート（休ませるべき人を上位に）
    const scored = workingEmps.map((empIdx) => {
      let score = 0

      // 5連勤に達している人は必ず休ませる
      if (consecutiveWork[empIdx] >= maxConsecutive) {
        score += 10000
      }

      // 連続出勤が長い人ほど優先
      score += consecutiveWork[empIdx] * 50

      // 公休が多く残っている人ほど優先
      score += remainingHolidays[empIdx] * 100

      // 残り日数に対して残り公休が多い人ほど緊急
      const futureDays = remainingDays[empIdx]
      if (futureDays > 0) {
        score += (remainingHolidays[empIdx] / futureDays) * 200
      }

      // スキルが少ない人を優先的に休ませる（替えが効かない人は残す）
      score -= employees[empIdx].skillIds.length * 30

      // パートは優先的に休ませる（カフェ・フロアの正社員優先のため）
      if (employees[empIdx].employmentType === 'PART_TIME') {
        score += 500
      }

      // 2連休促進（軽め: 他条件を邪魔しない範囲でタイブレーカー）
      if (consecutiveRest[empIdx] === 1) {
        score += 150
      }
      // 3連休以上は避ける
      if (consecutiveRest[empIdx] >= 2) {
        score -= 300
      }

      return { empIdx, score }
    }).sort((a, b) => b.score - a.score)

    // 上位から休ませる、ただしスキル制約をチェック
    const toRest: number[] = [...alreadyResting]

    // 残りの枠を埋める (5連勤強制休みは上の STEP 1 で処理済)
    const remainingSlots = needed - (toRest.length - alreadyResting.length)

    // 候補をシャッフル（同スコア帯でランダム性を入れる）
    const remaining = scored.filter(({ empIdx }) => !toRest.includes(empIdx))

    // グループ化: スコアを10の位で丸めて同スコア帯をシャッフル
    const groups = new Map<number, number[]>()
    for (const { empIdx, score } of remaining) {
      const key = Math.floor(score / 10)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(empIdx)
    }
    const orderedCandidates: number[] = []
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => b - a)
    for (const key of sortedKeys) {
      orderedCandidates.push(...shuffle(groups.get(key)!))
    }

    let filled = 0
    for (const empIdx of orderedCandidates) {
      if (filled >= remainingSlots) break

      const isMainStaff = isFactoryWorkplace && KOMATSU_LINE_LASTNAMES.includes(employees[empIdx].lastName)

      // 小松ライン: メインスタッフを休ませる前に、上限チェック
      if (isMainStaff && mainStaffRestingToday >= KOMATSU_MAX_REST) {
        continue
      }

      // 仮に休ませる
      schedule[empIdx][dayIdx] = false

      // スキル制約: 残りの出勤者でポジションが埋まるか（allowUnderstaffingではスキップ）
      if (!allowUnderstaffing && slots && !canCoverSlots(schedule, dayIdx, employees, dateInfos[dayIdx], slots)) {
        schedule[empIdx][dayIdx] = true // 戻す
        continue
      }

      toRest.push(empIdx)
      remainingHolidays[empIdx]--
      filled++
      if (isMainStaff) mainStaffRestingToday++
    }

    // 連続カウンター更新
    updateConsecutive(schedule, dayIdx, empCount, consecutiveWork, paidLeaveSet, consecutiveRest)
    updateRemainingDays(remainingDays, dayIdx, totalDays)
  }

  // 最終パス: 公休が足りない従業員を修正（交換）
  for (let empIdx = 0; empIdx < empCount; empIdx++) {
    let deficit = countDeficit(schedule[empIdx], paidLeaveSet.get(empIdx) ?? new Set(), requiredHolidayCount)

    while (deficit > 0) {
      let swapped = false
      // この従業員が出勤中の日で、公休が余っている別の従業員と交換
      for (let d = 0; d < totalDays; d++) {
        if (!schedule[empIdx][d]) continue

        for (let otherIdx = 0; otherIdx < empCount; otherIdx++) {
          if (otherIdx === empIdx) continue
          if (schedule[otherIdx][d]) continue // 出勤中
          if (paidLeaveSet.get(otherIdx)?.has(d)) continue

          const otherDeficit = countDeficit(schedule[otherIdx], paidLeaveSet.get(otherIdx) ?? new Set(), requiredHolidayCount)
          if (otherDeficit >= 0) continue // 余ってない

          // 交換: empを休み、otherを出勤
          schedule[empIdx][d] = false
          schedule[otherIdx][d] = true

          const plE = paidLeaveSet.get(empIdx) ?? new Set()
          const plO = paidLeaveSet.get(otherIdx) ?? new Set()

          // 小松ラインチェック（工場主勤務の場合）
          let komatsuOk = true
          if (isFactoryWorkplace) {
            let mainResting = 0
            for (let i = 0; i < empCount; i++) {
              if (!schedule[i][d] && KOMATSU_LINE_LASTNAMES.includes(employees[i].lastName)) {
                mainResting++
              }
            }
            if (mainResting > KOMATSU_MAX_REST) komatsuOk = false
          }

          if (komatsuOk &&
              checkConsecutive(schedule[empIdx], plE, maxConsecutive) &&
              checkConsecutive(schedule[otherIdx], plO, maxConsecutive) &&
              (allowUnderstaffing || !slots || canCoverSlots(schedule, d, employees, dateInfos[d], slots))) {
            swapped = true
            deficit--
            break
          }

          // 戻す
          schedule[empIdx][d] = true
          schedule[otherIdx][d] = false
        }
        if (swapped) break
      }
      if (!swapped) break
    }
  }

  // 結果をMapに変換
  const workDaysMap = new Map<string, Set<string>>()
  for (let i = 0; i < empCount; i++) {
    const workDays = new Set<string>()
    for (let d = 0; d < totalDays; d++) {
      if (schedule[i][d]) workDays.add(dateInfos[d].date)
    }
    workDaysMap.set(employees[i].id, workDays)
  }

  return workDaysMap
}

/** 連続出勤・連続休みカウンターを更新 */
function updateConsecutive(
  schedule: boolean[][],
  dayIdx: number,
  empCount: number,
  consecutiveWork: number[],
  paidLeaveSet: Map<number, Set<number>>,
  consecutiveRest?: number[],
): void {
  for (let i = 0; i < empCount; i++) {
    if (schedule[i][dayIdx] && !paidLeaveSet.get(i)?.has(dayIdx)) {
      consecutiveWork[i]++
      if (consecutiveRest) consecutiveRest[i] = 0
    } else {
      consecutiveWork[i] = 0
      if (consecutiveRest) consecutiveRest[i]++
    }
  }
}

/** 残り日数を更新 */
function updateRemainingDays(remainingDays: number[], dayIdx: number, totalDays: number): void {
  for (let i = 0; i < remainingDays.length; i++) {
    remainingDays[i] = totalDays - dayIdx - 1
  }
}

/** 公休の不足数（正=不足、負=余り） */
function countDeficit(empSchedule: boolean[], paidLeaves: Set<number>, required: number): number {
  let holidays = 0
  for (let d = 0; d < empSchedule.length; d++) {
    if (!empSchedule[d] && !paidLeaves.has(d)) holidays++
  }
  return required - holidays
}

/** 5連勤チェック */
function checkConsecutive(empSchedule: boolean[], paidLeaves: Set<number>, max: number): boolean {
  let c = 0
  for (let d = 0; d < empSchedule.length; d++) {
    if (!empSchedule[d] || paidLeaves.has(d)) {
      c = 0
    } else {
      c++
      if (c > max) return false
    }
  }
  return true
}

/** 出勤者で全スロットを埋められるかチェック（バックトラッキング） */
function canCoverSlots(
  schedule: boolean[][],
  dayIdx: number,
  employees: EmployeeInput[],
  dateInfo: DateInfo,
  slots: SlotInput[],
): boolean {
  const working = employees.filter((_, i) => schedule[i][dayIdx])
  const wp = employees[0]?.primaryWorkplace
  const required = getRequiredSlots(slots, dateInfo.dayType, wp)
  if (required.length === 0) return true
  return backtrackSlots(required, working)
}

function getRequiredSlots(slots: SlotInput[], dayType: DateInfo['dayType'], workplace?: string): SlotInput[] {
  const wpSlots = slots.filter((s) => !workplace || s.workplace === workplace)
  const required: SlotInput[] = []
  const groups = new Map<string, SlotInput[]>()

  for (const slot of wpSlots) {
    const rule = slot.rules.find((r) => r.dayType === dayType)
    if (!rule) continue
    if (rule.isRequired) {
      required.push(slot)
    } else if (rule.groupKey) {
      if (!groups.has(rule.groupKey)) groups.set(rule.groupKey, [])
      groups.get(rule.groupKey)!.push(slot)
    }
  }

  // グループから1つ（どちらか1つ埋まればOK）
  for (const [, g] of Array.from(groups.entries())) {
    required.push(g[0])
  }

  return required
}

function backtrackSlots(requiredSlots: SlotInput[], workers: EmployeeInput[]): boolean {
  // 候補が少ないスロットから先に（MRV）
  const sorted = [...requiredSlots].sort((a, b) => {
    const ac = workers.filter((e) => a.requiredSkillIds.some((s) => e.skillIds.includes(s))).length
    const bc = workers.filter((e) => b.requiredSkillIds.some((s) => e.skillIds.includes(s))).length
    return ac - bc
  })

  const used = new Set<string>()
  function solve(idx: number): boolean {
    if (idx >= sorted.length) return true
    const slot = sorted[idx]
    for (const w of workers) {
      if (used.has(w.id)) continue
      if (!slot.requiredSkillIds.some((s) => w.skillIds.includes(s))) continue
      used.add(w.id)
      if (solve(idx + 1)) return true
      used.delete(w.id)
    }
    return false
  }
  return solve(0)
}
