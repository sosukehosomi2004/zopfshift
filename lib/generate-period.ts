import { prisma } from '@/lib/prisma'
import { generateShiftCandidates } from '@/lib/shift-generator'
import {
  GeneratorInput,
  SlotInput,
  SlotRuleInput,
  CandidateOutput,
  DayAssignment,
  DayType,
  Workplace,
} from '@/lib/shift-generator/types'
import { formatDate } from '@/lib/shift-generator/utils'
import { expandRecurringRules } from '@/lib/expand-recurring-rules'

/**
 * 移動後の最終配置でスロット割当を再計算する。
 *
 * 既存の `assignSlots` は primaryWorkplace で従業員をフィルタするため、
 * 工場→カフェ/フロアに移動された人がスロットに入れない。
 * この関数は merged.assignments の workplace をそのまま使う。
 */
function reassignSlots(
  workplace: Workplace,
  assignments: DayAssignment[],
  allEmps: { id: string; skillIds: string[] }[],
  slots: SlotInput[],
  dateInfos: { date: string; dayType: DayType }[],
): { errors: string[]; assignments: DayAssignment[] } {
  const errors: string[] = []
  const wpSlots = slots.filter((s) => s.workplace === workplace)
  const empSkillMap = new Map(allEmps.map((e) => [e.id, new Set(e.skillIds)]))

  // 既存スロット割当をリセット (この勤務場所のみ)
  for (const a of assignments) {
    if (a.workplace === workplace) a.slotId = null
  }

  for (const di of dateInfos) {
    const dayAssignments = assignments.filter((a) => a.date === di.date && a.workplace === workplace)
    if (dayAssignments.length === 0) continue

    // この日に必要なスロットを決定
    const required: SlotInput[] = []
    const groups = new Map<string, SlotInput[]>()
    for (const slot of wpSlots) {
      const rule = slot.rules.find((r) => r.dayType === di.dayType)
      if (!rule) continue
      if (rule.isRequired) {
        required.push(slot)
      } else if (rule.groupKey) {
        if (!groups.has(rule.groupKey)) groups.set(rule.groupKey, [])
        groups.get(rule.groupKey)!.push(slot)
      }
    }
    // グループから1つ選択 (最も埋まりやすいものを選ぶ)
    for (const groupSlots of Array.from(groups.values())) {
      const best = [...groupSlots].sort((a, b) => {
        const aFit = dayAssignments.filter((da) => {
          const skills = empSkillMap.get(da.employeeId) ?? new Set()
          return a.requiredSkillIds.some((s) => skills.has(s))
        }).length
        const bFit = dayAssignments.filter((da) => {
          const skills = empSkillMap.get(da.employeeId) ?? new Set()
          return b.requiredSkillIds.some((s) => skills.has(s))
        }).length
        return bFit - aFit
      })
      required.push(best[0])
    }

    // バックトラッキング: スロット → 従業員
    const sortedSlots = [...required].sort((a, b) => {
      const aCands = dayAssignments.filter((da) => {
        const skills = empSkillMap.get(da.employeeId) ?? new Set()
        return a.requiredSkillIds.some((s) => skills.has(s))
      }).length
      const bCands = dayAssignments.filter((da) => {
        const skills = empSkillMap.get(da.employeeId) ?? new Set()
        return b.requiredSkillIds.some((s) => skills.has(s))
      }).length
      return aCands - bCands
    })

    const result = new Map<string, string>() // slotId → employeeId
    const used = new Set<string>()
    const solve = (idx: number): boolean => {
      if (idx >= sortedSlots.length) return true
      const slot = sortedSlots[idx]
      for (const da of dayAssignments) {
        if (used.has(da.employeeId)) continue
        const skills = empSkillMap.get(da.employeeId) ?? new Set()
        if (!slot.requiredSkillIds.some((s) => skills.has(s))) continue
        result.set(slot.id, da.employeeId)
        used.add(da.employeeId)
        if (solve(idx + 1)) return true
        result.delete(slot.id)
        used.delete(da.employeeId)
      }
      return false
    }

    if (sortedSlots.length > 0 && !solve(0)) {
      errors.push(`${di.date} ${workplace}: スキル制約を満たす配置が見つかりません`)
      continue
    }

    // 結果を assignments に反映
    for (const [slotId, empId] of Array.from(result.entries())) {
      const target = dayAssignments.find((a) => a.employeeId === empId)
      if (target) target.slotId = slotId
    }
  }

  return { errors, assignments }
}

const CANDIDATE_COUNT = 5
const WORKPLACES: Workplace[] = ['FACTORY', 'CAFE', 'FLOOR']

export type GeneratePeriodResult =
  | {
      ok: true
      candidateCount: number
      errors: string[]
      violations: { candidateIndex: number; violationCount: number; violations: string[] }[]
    }
  | {
      ok: false
      error: string
      detail: string[]
    }

/**
 * 1つのシフト期間の自動生成を実行する。
 * - status: GENERATING にしてから生成、成功で REVIEW、失敗で DRAFT に戻す
 * - 戻り値で成功/失敗を返す（throwしない）
 */
export async function generatePeriod(periodId: string): Promise<GeneratePeriodResult> {
  const period = await prisma.shiftPeriod.findUnique({ where: { id: periodId } })
  if (!period) {
    return { ok: false, error: 'Not found', detail: [] }
  }

  await prisma.shiftPeriod.update({ where: { id: periodId }, data: { status: 'GENERATING' } })

  try {
    // 生成のたびに最新の承認済み申請・通年ルールを PreAssignment に反映する。
    // 期間作成後に申請が増減・ルールが追加されたケースをカバーする。
    await expandRecurringRules(periodId)

    const startDate = formatDate(new Date(period.startDate))
    const endDate = formatDate(new Date(period.endDate))

    // 自動生成では PENDING (未処理) 申請も APPROVED と同様に休みとして扱う。
    // 承認/拒否は手動調整段階で確定する運用想定。
    const dayOffsRaw = await prisma.dayOffRequest.findMany({
      where: {
        status: { in: ['APPROVED', 'PENDING'] },
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
    })
    const dayOffInputs = dayOffsRaw.map((d) => ({
      employeeId: d.employeeId,
      date: formatDate(new Date(d.date)),
      type: d.type as 'DAY_OFF' | 'PAID_LEAVE',
    }))

    const preAssignmentsRaw = await prisma.preAssignment.findMany({
      where: { shiftPeriodId: periodId },
    })
    const preAssignmentInputs = preAssignmentsRaw.map((p) => ({
      employeeId: p.employeeId,
      date: formatDate(new Date(p.date)),
      workplace: p.workplace as Workplace | null,
      memo: p.memo,
    }))

    const retiringEmps = await prisma.employee.findMany({
      where: {
        isActive: true,
        retiredAt: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      select: { id: true, retiredAt: true },
    })
    for (const emp of retiringEmps) {
      if (!emp.retiredAt) continue
      const retired = new Date(emp.retiredAt)
      const cur = new Date(retired)
      cur.setDate(cur.getDate() + 1)
      const end = new Date(endDate)
      while (cur <= end) {
        const dStr = formatDate(cur)
        if (!preAssignmentInputs.some((p) => p.employeeId === emp.id && p.date === dStr)) {
          preAssignmentInputs.push({
            employeeId: emp.id,
            date: dStr,
            workplace: null,
            memo: '退職後',
          })
        }
        cur.setDate(cur.getDate() + 1)
      }
    }

    let holidaysRaw = await prisma.holiday.findMany({
      where: { date: { gte: new Date(startDate), lte: new Date(endDate) } },
    })

    if (holidaysRaw.length === 0) {
      try {
        const apiRes = await fetch('https://holidays-jp.github.io/api/v1/date.json', { cache: 'no-store' })
        if (apiRes.ok) {
          const data: Record<string, string> = await apiRes.json()
          for (const [dateStr, name] of Object.entries(data)) {
            const d = new Date(dateStr)
            await prisma.holiday.upsert({
              where: { date: d },
              update: { name },
              create: { date: d, name },
            })
          }
          holidaysRaw = await prisma.holiday.findMany({
            where: { date: { gte: new Date(startDate), lte: new Date(endDate) } },
          })
        }
      } catch (e) {
        console.error('[generate] Failed to fetch holidays:', e)
      }
    }

    const holidayInputs = holidaysRaw.map((h) => ({ date: formatDate(new Date(h.date)) }))

    const endDateObj = new Date(endDate)
    const holidayConfig = await prisma.monthlyHolidayConfig.findUnique({
      where: { fiscalYear_month: { fiscalYear: endDateObj.getFullYear(), month: endDateObj.getMonth() + 1 } },
    })
    const holidayCount = holidayConfig?.holidayCount ?? 8

    // 前月度が CONFIRMED の場合、月末からの連勤数を計算して引き継ぐ。
    // expand-recurring-rules.ts で 5連勤の人は当月初日が強制休みになるので
    // ここでは < 5 の人にも値を渡しておく（後続日が3連勤の場合の挙動を正しくするため）。
    const initialConsecutiveWork: Record<string, number> = {}
    const prevPeriod = await prisma.shiftPeriod.findFirst({
      where: { endDate: { lt: new Date(startDate) }, status: 'CONFIRMED' },
      orderBy: { endDate: 'desc' },
      include: {
        candidates: {
          where: { isSelected: true },
          take: 1,
          include: {
            assignments: { select: { employeeId: true, date: true, workplace: true } },
          },
        },
      },
    })
    if (prevPeriod && prevPeriod.candidates[0]) {
      const prevAssignments = prevPeriod.candidates[0].assignments
      const workDatesByEmp = new Map<string, Set<string>>()
      for (const a of prevAssignments) {
        if (!a.workplace) continue
        const dStr = formatDate(new Date(a.date))
        if (!workDatesByEmp.has(a.employeeId)) workDatesByEmp.set(a.employeeId, new Set())
        workDatesByEmp.get(a.employeeId)!.add(dStr)
      }
      const MAX_CONSECUTIVE = 5
      const lastDay = new Date(prevPeriod.endDate)
      const allActiveEmps = await prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true },
      })
      for (const emp of allActiveEmps) {
        const workSet = workDatesByEmp.get(emp.id) ?? new Set()
        let consecutive = 0
        const cursor = new Date(lastDay)
        for (let i = 0; i < MAX_CONSECUTIVE; i++) {
          const dStr = formatDate(cursor)
          if (workSet.has(dStr)) {
            consecutive++
          } else {
            break
          }
          cursor.setDate(cursor.getDate() - 1)
        }
        if (consecutive > 0) initialConsecutiveWork[emp.id] = consecutive
      }
    }

    const resultsByWorkplace: Record<Workplace, CandidateOutput[]> = {
      FACTORY: [],
      CAFE: [],
      FLOOR: [],
      L: [],
      OFFICE: [],
      OTHER: [],
    }
    const allErrors: string[] = []

    for (const workplace of WORKPLACES) {
      const employees = await prisma.employee.findMany({
        where: {
          isActive: true,
          primaryWorkplace: workplace,
          employmentType: 'FULL_TIME',
          OR: [{ retiredAt: null }, { retiredAt: { gte: new Date(startDate) } }],
        },
        include: { secondaryWorkplaces: true, skills: true },
      })

      if (employees.length === 0) continue

      const skills = await prisma.skill.findMany({ where: { workplace } })
      const slotsRaw = await prisma.workplaceSlot.findMany({
        where: { workplace },
        include: { skills: true, rules: true },
      })
      const staffingRules = await prisma.workplaceStaffingRule.findMany({ where: { workplace } })

      const input: GeneratorInput = {
        startDate,
        endDate,
        employees: employees.map((e) => ({
          id: e.id,
          employeeNumber: e.employeeNumber,
          lastName: e.lastName,
          firstName: e.firstName,
          employmentType: e.employmentType as 'FULL_TIME' | 'PART_TIME',
          primaryWorkplace: e.primaryWorkplace as Workplace,
          secondaryWorkplaces: e.secondaryWorkplaces.map((sw) => sw.workplace as Workplace),
          skillIds: e.skills.map((s) => s.skillId),
          skillsWithProficiency: e.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })),
          floorProficiency: e.floorProficiency,
        })),
        skills: skills.map((s) => ({ id: s.id, workplace: s.workplace as Workplace, name: s.name })),
        slots: slotsRaw.map(
          (s): SlotInput => ({
            id: s.id,
            workplace: s.workplace as Workplace,
            name: s.name,
            sortOrder: s.sortOrder,
            requiredSkillIds: s.skills.map((sk) => sk.skillId),
            rules: s.rules.map((r) => ({
              dayType: r.dayType as SlotRuleInput['dayType'],
              isRequired: r.isRequired,
              groupKey: r.groupKey,
            })),
          }),
        ),
        staffingRules: staffingRules.map((r) => ({
          workplace: r.workplace as Workplace,
          dayType: r.dayType as 'WEEKDAY_MON_THU' | 'FRIDAY' | 'HOLIDAY',
          requiredCount: r.requiredCount,
          minFullTimeCount: r.minFullTimeCount,
          baseFullTimeCount: r.baseFullTimeCount,
        })),
        dayOffs: dayOffInputs.filter((d) => employees.some((e) => e.id === d.employeeId)),
        holidays: holidayInputs,
        holidayCount,
        candidateCount: CANDIDATE_COUNT,
        allowUnderstaffing: workplace !== 'FACTORY',
        preAssignments: preAssignmentInputs.filter((p) => employees.some((e) => e.id === p.employeeId)),
        initialConsecutiveWork,
      }

      const result = generateShiftCandidates(input)
      resultsByWorkplace[workplace] = result.candidates
      if (result.errors.length > 0) {
        allErrors.push(...result.errors.map((e) => `${workplace}: ${e}`))
      }
    }

    // どこか1つでも勤務場所が0候補なら失敗とする (静かに空っぽの候補を出さない)
    const failedWorkplaces: Workplace[] = []
    for (const wp of WORKPLACES) {
      const hadEmployees =
        (await prisma.employee.count({
          where: {
            isActive: true,
            primaryWorkplace: wp,
            employmentType: 'FULL_TIME',
            OR: [{ retiredAt: null }, { retiredAt: { gte: new Date(startDate) } }],
          },
        })) > 0
      if (hadEmployees && resultsByWorkplace[wp].length === 0) {
        failedWorkplaces.push(wp)
      }
    }
    if (failedWorkplaces.length > 0) {
      await prisma.shiftPeriod.update({ where: { id: periodId }, data: { status: 'DRAFT' } })
      return {
        ok: false,
        error: `${failedWorkplaces.join(', ')}でシフトを生成できませんでした`,
        detail: allErrors,
      }
    }

    const maxCandidates = Math.min(
      ...WORKPLACES.map((w) => resultsByWorkplace[w].length).filter((n) => n > 0),
    )

    const allEmployees = await prisma.employee.findMany({
      where: {
        isActive: true,
        employmentType: 'FULL_TIME',
        OR: [{ retiredAt: null }, { retiredAt: { gte: new Date(startDate) } }],
      },
      include: { secondaryWorkplaces: true, skills: { include: { skill: true } } },
    })

    const allStaffingRules = await prisma.workplaceStaffingRule.findMany()
    const requiredOf = (workplace: string, dayType: string): number => {
      return allStaffingRules.find((r) => r.workplace === workplace && r.dayType === dayType)?.requiredCount ?? 0
    }

    const mergedCandidates: CandidateOutput[] = []
    for (let i = 0; i < maxCandidates; i++) {
      const merged: CandidateOutput = {
        candidateIndex: i + 1,
        assignments: [],
        violations: [],
        hardViolations: [],
        score: 0,
      }
      let totalScore = 0
      for (const wp of WORKPLACES) {
        const c = resultsByWorkplace[wp][i]
        if (!c) continue
        merged.assignments.push(...c.assignments)
        // CAFE/FLOORのSOFT違反は移動後に再評価するので持ち越さない
        // FACTORYは移動の影響を受けないので保持
        if (wp === 'FACTORY') {
          merged.violations.push(...c.violations.map((v) => `[${wp}] ${v}`))
        }
        merged.hardViolations.push(...(c.hardViolations ?? []).map((v) => `[${wp}] ${v}`))
        totalScore += c.score ?? 0
      }

      for (const pa of preAssignmentInputs) {
        if (pa.workplace === null) continue
        const target = merged.assignments.find((a) => a.employeeId === pa.employeeId && a.date === pa.date)
        if (target) {
          target.workplace = pa.workplace
          target.slotId = null
          target.isMoved = true
        } else {
          merged.assignments.push({
            employeeId: pa.employeeId,
            date: pa.date,
            workplace: pa.workplace,
            slotId: null,
            isMoved: true,
          })
        }
      }

      const allDates: string[] = []
      const startD = new Date(startDate)
      const endD = new Date(endDate)
      const cur = new Date(startD)
      while (cur <= endD) {
        allDates.push(formatDate(cur))
        cur.setDate(cur.getDate() + 1)
      }

      const factoryEmployees = allEmployees.filter((e) => e.primaryWorkplace === 'FACTORY')
      const MIN_HOLIDAYS = holidayCount
      const allEmpMap = new Map(allEmployees.map((e) => [e.id, e]))

      const empWorkDays = new Map<string, Set<string>>()
      for (const a of merged.assignments) {
        if (!empWorkDays.has(a.employeeId)) empWorkDays.set(a.employeeId, new Set())
        empWorkDays.get(a.employeeId)!.add(a.date)
      }

      const checkConsecutive = (workSet: Set<string>): boolean => {
        let consecutive = 0
        for (const d of allDates) {
          if (workSet.has(d)) {
            consecutive++
            if (consecutive > 5) return false
          } else {
            consecutive = 0
          }
        }
        return true
      }

      const empCafeProficiency = (emp: typeof factoryEmployees[0]): 'HIGH' | 'MID' | 'LOW' | null => {
        const cafeSkills = emp.skills.filter((s) => s.skill.workplace === 'CAFE')
        if (cafeSkills.length === 0) return null
        if (cafeSkills.some((s) => s.proficiency === 'HIGH')) return 'HIGH'
        if (cafeSkills.some((s) => s.proficiency === 'MID')) return 'MID'
        if (cafeSkills.some((s) => s.proficiency === 'LOW')) return 'LOW'
        return null
      }

      // 日を「不足の合計」が大きい順に処理する。
      // GW のような連休で需要が集中する日に factory の余剰を優先的に振り向ける。
      const sortedDays = [...allDates].sort((a, b) => {
        const dowA = new Date(a).getDay()
        const dowB = new Date(b).getDay()
        const dtA = dowA === 0 || dowA === 6 ? 'HOLIDAY' : dowA === 5 ? 'FRIDAY' : 'WEEKDAY_MON_THU'
        const dtB = dowB === 0 || dowB === 6 ? 'HOLIDAY' : dowB === 5 ? 'FRIDAY' : 'WEEKDAY_MON_THU'
        const shortA = (requiredOf('CAFE', dtA) - merged.assignments.filter((x) => x.date === a && x.workplace === 'CAFE').length)
          + (requiredOf('FLOOR', dtA) - merged.assignments.filter((x) => x.date === a && x.workplace === 'FLOOR').length)
        const shortB = (requiredOf('CAFE', dtB) - merged.assignments.filter((x) => x.date === b && x.workplace === 'CAFE').length)
          + (requiredOf('FLOOR', dtB) - merged.assignments.filter((x) => x.date === b && x.workplace === 'FLOOR').length)
        return shortB - shortA
      })

      for (const date of sortedDays) {
        const dow = new Date(date).getDay()
        const dayType = dow === 0 || dow === 6 ? 'HOLIDAY' : dow === 5 ? 'FRIDAY' : 'WEEKDAY_MON_THU'
        const cafeMin = requiredOf('CAFE', dayType)
        const floorMin = requiredOf('FLOOR', dayType)

        const cafeToday = merged.assignments.filter((a) => a.date === date && a.workplace === 'CAFE')
        const floorToday = merged.assignments.filter((a) => a.date === date && a.workplace === 'FLOOR')

        let cafeShort = Math.max(0, cafeMin - cafeToday.length)
        let floorShort = Math.max(0, floorMin - floorToday.length)

        if (cafeShort === 0 && floorShort === 0) continue

        const cafeHasHigh = (): boolean => {
          for (const a of merged.assignments.filter((aa) => aa.date === date && aa.workplace === 'CAFE')) {
            const e = allEmpMap.get(a.employeeId)
            if (e?.skills.some((s) => s.skill.workplace === 'CAFE' && s.proficiency === 'HIGH')) return true
          }
          return false
        }
        const floorLowCount = (): number => {
          let n = 0
          for (const a of merged.assignments.filter((aa) => aa.date === date && aa.workplace === 'FLOOR')) {
            const e = allEmpMap.get(a.employeeId)
            if (e?.floorProficiency === 'LOW') n++
          }
          return n
        }

        const lockedOffOnDate = new Set(
          preAssignmentInputs
            .filter((pa) => pa.workplace === null && pa.date === date)
            .map((pa) => pa.employeeId),
        )
        const restingFactoryEmps = factoryEmployees.filter((emp) => {
          if (lockedOffOnDate.has(emp.id)) return false
          const workDays = empWorkDays.get(emp.id) ?? new Set()
          return !workDays.has(date)
        })

        const sortedCandidates = [...restingFactoryEmps].sort((a, b) => {
          const order = { HIGH: 0, MID: 1, LOW: 2 } as const
          const pa = empCafeProficiency(a)
          const pb = empCafeProficiency(b)
          const va = pa ? order[pa] : 3
          const vb = pb ? order[pb] : 3
          return va - vb
        })

        // 移動候補を 3 グループに分ける:
        //   - cafeOnly: CAFE secondary のみ（FLOOR には動かせない）
        //   - floorOnly: FLOOR secondary のみ（CAFE には動かせない）
        //   - both: 両方持っている（どちらにも動かせる）
        // 単一 secondary 組を最初に該当 workplace へ割り当て、残った both 組は不足の
        // 大きい方から埋める。これにより CAFE/FLOOR それぞれの最大限まで補填できる。
        const tryAssign = (emp: typeof factoryEmployees[0], target: 'CAFE' | 'FLOOR'): boolean => {
          const secondaries = new Set(emp.secondaryWorkplaces.map((sw) => sw.workplace))
          if (!secondaries.has(target)) return false
          if (empWorkDays.get(emp.id)?.has(date)) return false
          const workDays = empWorkDays.get(emp.id) ?? new Set()
          const restDays = allDates.length - workDays.size
          if (restDays <= MIN_HOLIDAYS) return false
          const tempSet = new Set(workDays)
          tempSet.add(date)
          if (!checkConsecutive(tempSet)) return false

          if (target === 'CAFE') {
            const cafeSkill = emp.skills.find((s) => s.skill.workplace === 'CAFE')
            if (!cafeSkill) return false
            const empProf = empCafeProficiency(emp)
            if (empProf === 'LOW' && !cafeHasHigh()) return false
            merged.assignments.push({
              employeeId: emp.id, date, workplace: 'CAFE', slotId: null, isMoved: true,
            })
          } else {
            if (emp.floorProficiency === 'LOW' && floorLowCount() >= 2) return false
            merged.assignments.push({
              employeeId: emp.id, date, workplace: 'FLOOR', slotId: null, isMoved: true,
            })
          }
          workDays.add(date)
          empWorkDays.set(emp.id, workDays)
          return true
        }

        const cafeOnly = sortedCandidates.filter((e) => {
          const sec = new Set(e.secondaryWorkplaces.map((sw) => sw.workplace))
          return sec.has('CAFE') && !sec.has('FLOOR')
        })
        const floorOnly = sortedCandidates.filter((e) => {
          const sec = new Set(e.secondaryWorkplaces.map((sw) => sw.workplace))
          return sec.has('FLOOR') && !sec.has('CAFE')
        })
        const both = sortedCandidates.filter((e) => {
          const sec = new Set(e.secondaryWorkplaces.map((sw) => sw.workplace))
          return sec.has('CAFE') && sec.has('FLOOR')
        })

        // 1) 専属 secondary を該当 workplace へ
        for (const emp of cafeOnly) {
          if (cafeShort <= 0) break
          if (tryAssign(emp, 'CAFE')) cafeShort--
        }
        for (const emp of floorOnly) {
          if (floorShort <= 0) break
          if (tryAssign(emp, 'FLOOR')) floorShort--
        }

        // 2) 両対応者を不足の大きい方へ
        for (const emp of both) {
          if (cafeShort === 0 && floorShort === 0) break
          const target: 'CAFE' | 'FLOOR' = floorShort > cafeShort ? 'FLOOR' : (cafeShort > 0 ? 'CAFE' : 'FLOOR')
          if (tryAssign(emp, target)) {
            if (target === 'CAFE') cafeShort--
            else floorShort--
          } else {
            // 反対側にも試す
            const other: 'CAFE' | 'FLOOR' = target === 'CAFE' ? 'FLOOR' : 'CAFE'
            if ((other === 'CAFE' ? cafeShort : floorShort) > 0 && tryAssign(emp, other)) {
              if (other === 'CAFE') cafeShort--
              else floorShort--
            }
          }
        }
      }

      // ============================================================
      // 移動後スロット再割当 (CAFE/FLOOR)
      //   工場員が cafe/floor へ移動した状態でスキル割当を再計算する。
      //   primaryWorkplace に依存せず、実際に勤務する人プールでマッチング。
      // ============================================================
      const allCafeFloorSlots: SlotInput[] = []
      for (const wp of ['CAFE', 'FLOOR'] as const) {
        const wpSlotsRaw = await prisma.workplaceSlot.findMany({
          where: { workplace: wp },
          include: { skills: true, rules: true },
        })
        for (const s of wpSlotsRaw) {
          allCafeFloorSlots.push({
            id: s.id,
            workplace: s.workplace as Workplace,
            name: s.name,
            sortOrder: s.sortOrder,
            requiredSkillIds: s.skills.map((sk) => sk.skillId),
            rules: s.rules.map((r) => ({
              dayType: r.dayType as DayType,
              isRequired: r.isRequired,
              groupKey: r.groupKey,
            })),
          })
        }
      }
      const allEmpsForSlot = allEmployees.map((e) => ({
        id: e.id,
        skillIds: e.skills.map((s) => s.skillId),
      }))
      const dateInfos: { date: string; dayType: DayType }[] = allDates.map((d) => {
        const dow = new Date(d).getDay()
        const dayType: DayType = dow === 0 || dow === 6 ? 'HOLIDAY' : dow === 5 ? 'FRIDAY' : 'WEEKDAY_MON_THU'
        return { date: d, dayType }
      })
      for (const wp of ['CAFE', 'FLOOR'] as const) {
        const { errors: slotErrs } = reassignSlots(wp, merged.assignments, allEmpsForSlot, allCafeFloorSlots, dateInfos)
        for (const err of slotErrs) merged.violations.push(`[${wp}] ${err}`)
      }

      const dailyCount: Record<string, Record<string, number>> = {}
      const dailyAssignments: Record<string, typeof merged.assignments> = {}
      for (const a of merged.assignments) {
        if (!dailyCount[a.date]) dailyCount[a.date] = {}
        dailyCount[a.date][a.workplace] = (dailyCount[a.date][a.workplace] ?? 0) + 1
        if (!dailyAssignments[a.date]) dailyAssignments[a.date] = []
        dailyAssignments[a.date].push(a)
      }

      for (const d of allDates) {
        const dow = new Date(d).getDay()
        const dayType = dow === 0 || dow === 6 ? 'HOLIDAY' : dow === 5 ? 'FRIDAY' : 'WEEKDAY_MON_THU'

        for (const wp of WORKPLACES) {
          const required = requiredOf(wp, dayType)
          const actual = dailyCount[d]?.[wp] ?? 0
          if (actual < required) {
            merged.violations.push(`[${wp}] ${d}: ${actual}名（必要${required}名）`)
          }
        }

        const cafeAssignments = (dailyAssignments[d] ?? []).filter((a) => a.workplace === 'CAFE')
        let cafeHasLow = false
        let cafeHasHigh = false
        for (const a of cafeAssignments) {
          const emp = allEmpMap.get(a.employeeId)
          if (!emp) continue
          for (const sk of emp.skills) {
            if (sk.skill.workplace !== 'CAFE') continue
            if (sk.proficiency === 'LOW') cafeHasLow = true
            if (sk.proficiency === 'HIGH') cafeHasHigh = true
          }
        }
        if (cafeHasLow && !cafeHasHigh) {
          merged.hardViolations.push(`[CAFE] ${d}: ▲の従業員がいる日は◎の従業員も必要`)
        }

        const floorAssignments = (dailyAssignments[d] ?? []).filter((a) => a.workplace === 'FLOOR')
        let floorLowCount = 0
        for (const a of floorAssignments) {
          const emp = allEmpMap.get(a.employeeId)
          if (emp?.floorProficiency === 'LOW') floorLowCount++
        }
        if (floorLowCount > 2) {
          merged.hardViolations.push(`[FLOOR] ${d}: ▲の従業員が${floorLowCount}名（上限2名）`)
        }
      }

      const workDaysByEmp = new Map<string, number>()
      for (const a of merged.assignments) {
        workDaysByEmp.set(a.employeeId, (workDaysByEmp.get(a.employeeId) ?? 0) + 1)
      }
      for (const emp of allEmployees) {
        const workDays = workDaysByEmp.get(emp.id) ?? 0
        const restDays = allDates.length - workDays
        if (restDays < holidayCount) {
          merged.hardViolations.push(`[公休] ${emp.lastName}: 公休${restDays}日（最低${holidayCount}日）`)
        }
      }

      for (const emp of allEmployees) {
        const empWorkSet = new Set(merged.assignments.filter((a) => a.employeeId === emp.id).map((a) => a.date))
        // 前月末からの連勤数を初期値として使う (月跨ぎ5連勤判定)
        let consecutive = initialConsecutiveWork[emp.id] ?? 0
        for (const d of allDates) {
          if (empWorkSet.has(d)) {
            consecutive++
            if (consecutive > 5) {
              merged.hardViolations.push(`[5連勤] ${emp.lastName}: ${d}時点で${consecutive}連勤`)
              break
            }
          } else {
            consecutive = 0
          }
        }
      }

      for (const a of merged.assignments) {
        const emp = allEmpMap.get(a.employeeId)
        if (!emp) continue
        // L は特殊な勤務地で、運用上は誰でも臨時配置されるため適性チェック対象外
        if (a.workplace === 'L') continue
        const allowedWorkplaces = new Set([emp.primaryWorkplace, ...emp.secondaryWorkplaces.map((sw) => sw.workplace)])
        if (!allowedWorkplaces.has(a.workplace)) {
          merged.hardViolations.push(`[適性] ${emp.lastName}: ${a.date}に${a.workplace}（資格なし）`)
        }
      }

      const cafeFloorCount = merged.assignments.filter((a) => a.workplace === 'CAFE' || a.workplace === 'FLOOR').length
      merged.score = totalScore + cafeFloorCount

      mergedCandidates.push(merged)
    }

    const validCandidates = mergedCandidates.filter((c) => c.hardViolations.length === 0)

    if (validCandidates.length === 0) {
      await prisma.shiftPeriod.update({ where: { id: periodId }, data: { status: 'DRAFT' } })
      const sampleHard = mergedCandidates[0]?.hardViolations.slice(0, 10) ?? []
      return {
        ok: false,
        error: '必須条件を満たすシフトを生成できませんでした',
        detail: [...allErrors, ...sampleHard],
      }
    }

    validCandidates.sort((a, b) => {
      const violationDiff = a.violations.length - b.violations.length
      if (violationDiff !== 0) return violationDiff
      return (b.score ?? 0) - (a.score ?? 0)
    })
    validCandidates.forEach((c, i) => {
      c.candidateIndex = i + 1
    })

    await prisma.shiftCandidate.deleteMany({ where: { shiftPeriodId: periodId } })

    for (const candidate of validCandidates) {
      const created = await prisma.shiftCandidate.create({
        data: {
          shiftPeriodId: periodId,
          candidateIndex: candidate.candidateIndex,
          score: candidate.score ?? 0,
          violations: candidate.violations,
        },
      })

      if (candidate.assignments.length > 0) {
        await prisma.shiftAssignment.createMany({
          data: candidate.assignments.map((a) => ({
            shiftCandidateId: created.id,
            employeeId: a.employeeId,
            date: new Date(a.date),
            workplace: a.workplace,
            workplaceSlotId: a.slotId,
            isMoved: a.isMoved,
          })),
        })
      }
    }

    await prisma.shiftPeriod.update({ where: { id: periodId }, data: { status: 'REVIEW' } })

    return {
      ok: true,
      candidateCount: validCandidates.length,
      errors: allErrors,
      violations: validCandidates.map((c) => ({
        candidateIndex: c.candidateIndex,
        violationCount: c.violations.length,
        violations: c.violations.slice(0, 10),
      })),
    }
  } catch (error) {
    await prisma.shiftPeriod.update({ where: { id: periodId }, data: { status: 'DRAFT' } })
    console.error('Shift generation error:', error instanceof Error ? error.message : error)
    return {
      ok: false,
      error: 'Generation failed',
      detail: [error instanceof Error ? error.message : String(error)],
    }
  }
}

/**
 * 失敗時に最大 maxRetries 回まで再生成を試みる。
 * 各試行は独立した rejection sampling なので結果が変わる可能性がある。
 */
export async function generatePeriodWithRetry(
  periodId: string,
  maxRetries = 3,
): Promise<GeneratePeriodResult & { attempts: number }> {
  let lastResult: GeneratePeriodResult | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await generatePeriod(periodId)
    lastResult = result
    if (result.ok) {
      return { ...result, attempts: attempt }
    }
  }
  return { ...(lastResult as GeneratePeriodResult), attempts: maxRetries }
}
