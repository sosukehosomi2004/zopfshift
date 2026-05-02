import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { generateShiftCandidates } from '@/lib/shift-generator'
import { GeneratorInput, SlotInput, SlotRuleInput, CandidateOutput, Workplace } from '@/lib/shift-generator/types'
import { formatDate } from '@/lib/shift-generator/utils'

export const maxDuration = 300

type Params = { params: Promise<{ id: string }> }


const CANDIDATE_COUNT = 5
const WORKPLACES: Workplace[] = ['FACTORY', 'CAFE', 'FLOOR']

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const period = await prisma.shiftPeriod.findUnique({ where: { id } })
  if (!period) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 確定済みでも再生成可（手動編集は破棄される）

  await prisma.shiftPeriod.update({ where: { id }, data: { status: 'GENERATING' } })

  try {
    const startDate = formatDate(new Date(period.startDate))
    const endDate = formatDate(new Date(period.endDate))

    // 全勤務場所共通のデータ
    const dayOffsRaw = await prisma.dayOffRequest.findMany({
      where: {
        status: 'APPROVED',
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
    })
    const dayOffInputs = dayOffsRaw.map((d) => ({
      employeeId: d.employeeId,
      date: formatDate(new Date(d.date)),
      type: d.type as 'DAY_OFF' | 'PAID_LEAVE',
    }))

    // 事前確定セルを取得
    const preAssignmentsRaw = await prisma.preAssignment.findMany({
      where: { shiftPeriodId: id },
    })
    const preAssignmentInputs = preAssignmentsRaw.map((p) => ({
      employeeId: p.employeeId,
      date: formatDate(new Date(p.date)),
      workplace: p.workplace as Workplace | null,
      memo: p.memo,
    }))

    // 祝日を自動取得（既にDBにあれば使う、なければ公開APIから取得して保存）
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
    console.log(`[generate] Holidays in period: ${holidayInputs.length}`)

    const endDateObj = new Date(endDate)
    const holidayConfig = await prisma.monthlyHolidayConfig.findUnique({
      where: { fiscalYear_month: { fiscalYear: endDateObj.getFullYear(), month: endDateObj.getMonth() + 1 } },
    })
    const holidayCount = holidayConfig?.holidayCount ?? 8

    // 各勤務場所ごとに生成
    const resultsByWorkplace: Record<Workplace, CandidateOutput[]> = {
      FACTORY: [], CAFE: [], FLOOR: [], OFFICE: [], OTHER: [],
    }
    const allErrors: string[] = []

    for (const workplace of WORKPLACES) {
      const employees = await prisma.employee.findMany({
        where: { isActive: true, primaryWorkplace: workplace, employmentType: 'FULL_TIME' },
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
        startDate, endDate,
        employees: employees.map((e) => ({
          id: e.id, employeeNumber: e.employeeNumber,
          lastName: e.lastName, firstName: e.firstName,
          employmentType: e.employmentType as 'FULL_TIME' | 'PART_TIME',
          primaryWorkplace: e.primaryWorkplace as Workplace,
          secondaryWorkplaces: e.secondaryWorkplaces.map((sw) => sw.workplace as Workplace),
          skillIds: e.skills.map((s) => s.skillId),
          skillsWithProficiency: e.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })),
          floorProficiency: e.floorProficiency,
        })),
        skills: skills.map((s) => ({ id: s.id, workplace: s.workplace as Workplace, name: s.name })),
        slots: slotsRaw.map((s): SlotInput => ({
          id: s.id, workplace: s.workplace as Workplace, name: s.name, sortOrder: s.sortOrder,
          requiredSkillIds: s.skills.map((sk) => sk.skillId),
          rules: s.rules.map((r) => ({
            dayType: r.dayType as SlotRuleInput['dayType'],
            isRequired: r.isRequired, groupKey: r.groupKey,
          })),
        })),
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
      }

      console.log(`[generate] ${workplace}: employees=${input.employees.length}, slots=${input.slots.length}`)
      const result = generateShiftCandidates(input)
      console.log(`[generate] ${workplace}: generated=${result.candidates.length}, errors=${JSON.stringify(result.errors)}`)

      resultsByWorkplace[workplace] = result.candidates
      if (result.errors.length > 0) {
        allErrors.push(...result.errors.map((e) => `${workplace}: ${e}`))
      }
    }

    // 各勤務場所のi番目の候補を1つの統合候補として結合
    const maxCandidates = Math.min(
      ...WORKPLACES.map((w) => resultsByWorkplace[w].length).filter((n) => n > 0)
    )

    // 移動配置のために全従業員データを取得
    const allEmployees = await prisma.employee.findMany({
      where: { isActive: true, employmentType: 'FULL_TIME' },
      include: { secondaryWorkplaces: true, skills: { include: { skill: true } } },
    })
    const allCafeSkillsByName = new Map<string, string>()
    const cafeSkillRows = await prisma.skill.findMany({ where: { workplace: 'CAFE' } })
    for (const s of cafeSkillRows) allCafeSkillsByName.set(s.name, s.id)

    // 全勤務場所×曜日タイプの稼働人数ルール
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
        merged.violations.push(...c.violations.map((v) => `[${wp}] ${v}`))
        merged.hardViolations.push(...(c.hardViolations ?? []).map((v) => `[${wp}] ${v}`))
        totalScore += c.score ?? 0
      }

      // 事前確定で「出勤確定だが勤務場所がprimaryと違う」場合、勤務場所を上書き
      for (const pa of preAssignmentInputs) {
        if (pa.workplace === null) continue
        const target = merged.assignments.find((a) => a.employeeId === pa.employeeId && a.date === pa.date)
        if (target) {
          target.workplace = pa.workplace
          target.slotId = null
          target.isMoved = true
        } else {
          // 候補側に出勤がない場合は新規追加
          merged.assignments.push({
            employeeId: pa.employeeId,
            date: pa.date,
            workplace: pa.workplace,
            slotId: null,
            isMoved: true,
          })
        }
      }

      // 期間の全日付
      const allDates: string[] = []
      const startD = new Date(startDate)
      const endD = new Date(endDate)
      const cur = new Date(startD)
      while (cur <= endD) {
        allDates.push(formatDate(cur))
        cur.setDate(cur.getDate() + 1)
      }

      // 移動ステップ:
      // 各日について、カフェ/フロアの不足を工場員（余剰休み日を持つ）で補填する
      const factoryEmployees = allEmployees.filter((e) => e.primaryWorkplace === 'FACTORY')
      const MIN_HOLIDAYS = holidayCount
      const allEmpMap = new Map(allEmployees.map((e) => [e.id, e]))

      // 各従業員の出勤日マップ
      const empWorkDays = new Map<string, Set<string>>()
      for (const a of merged.assignments) {
        if (!empWorkDays.has(a.employeeId)) empWorkDays.set(a.employeeId, new Set())
        empWorkDays.get(a.employeeId)!.add(a.date)
      }

      // 5連勤チェック関数
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

      // 工場員の習熟度判定ヘルパー
      const empCafeProficiency = (emp: typeof factoryEmployees[0]): 'HIGH' | 'MID' | 'LOW' | null => {
        const cafeSkills = emp.skills.filter((s) => s.skill.workplace === 'CAFE')
        if (cafeSkills.length === 0) return null
        if (cafeSkills.some((s) => s.proficiency === 'HIGH')) return 'HIGH'
        if (cafeSkills.some((s) => s.proficiency === 'MID')) return 'MID'
        if (cafeSkills.some((s) => s.proficiency === 'LOW')) return 'LOW'
        return null
      }

      for (const date of allDates) {
        const dow = new Date(date).getDay()
        const dayType = (dow === 0 || dow === 6) ? 'HOLIDAY' : (dow === 5 ? 'FRIDAY' : 'WEEKDAY_MON_THU')
        const cafeMin = requiredOf('CAFE', dayType)
        const floorMin = requiredOf('FLOOR', dayType)

        const cafeToday = merged.assignments.filter((a) => a.date === date && a.workplace === 'CAFE')
        const floorToday = merged.assignments.filter((a) => a.date === date && a.workplace === 'FLOOR')

        let cafeShort = Math.max(0, cafeMin - cafeToday.length)
        let floorShort = Math.max(0, floorMin - floorToday.length)

        if (cafeShort === 0 && floorShort === 0) continue

        // 現在のカフェのHIGH存在チェック
        const cafeHasHigh = (): boolean => {
          for (const a of merged.assignments.filter((aa) => aa.date === date && aa.workplace === 'CAFE')) {
            const e = allEmpMap.get(a.employeeId)
            if (e?.skills.some((s) => s.skill.workplace === 'CAFE' && s.proficiency === 'HIGH')) return true
          }
          return false
        }
        // 現在のフロア▲数
        const floorLowCount = (): number => {
          let n = 0
          for (const a of merged.assignments.filter((aa) => aa.date === date && aa.workplace === 'FLOOR')) {
            const e = allEmpMap.get(a.employeeId)
            if (e?.floorProficiency === 'LOW') n++
          }
          return n
        }

        // この日休みの工場従業員（移動候補）
        // ただし PreAssignment で「休み確定」(workplace=null) のものは動かさない
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

        // 候補をソート: HIGHを先に、次にMID、最後にLOW
        const sortedCandidates = [...restingFactoryEmps].sort((a, b) => {
          const order = { HIGH: 0, MID: 1, LOW: 2 } as const
          const pa = empCafeProficiency(a)
          const pb = empCafeProficiency(b)
          const va = pa ? order[pa] : 3
          const vb = pb ? order[pb] : 3
          return va - vb
        })

        for (const emp of sortedCandidates) {
          if (cafeShort === 0 && floorShort === 0) break
          const secondaries = new Set(emp.secondaryWorkplaces.map((sw) => sw.workplace))
          if (!secondaries.has('CAFE') && !secondaries.has('FLOOR')) continue

          const workDays = empWorkDays.get(emp.id) ?? new Set()
          const restDays = allDates.length - workDays.size

          // 余剰休みがあるか
          if (restDays <= MIN_HOLIDAYS) continue

          // 5連勤違反チェック
          const tempSet = new Set(workDays)
          tempSet.add(date)
          if (!checkConsecutive(tempSet)) continue

          // カフェ優先
          if (cafeShort > 0 && secondaries.has('CAFE')) {
            const cafeSkill = emp.skills.find((s) => s.skill.workplace === 'CAFE')
            if (cafeSkill) {
              const empProf = empCafeProficiency(emp)
              // LOWを追加するなら、◎が既にいるか追加で◎が来る予定がないと違反
              if (empProf === 'LOW' && !cafeHasHigh()) {
                // この後HIGHが入る見込みがないので、LOW追加は避ける
                // → スキップ
              } else {
                merged.assignments.push({
                  employeeId: emp.id, date, workplace: 'CAFE', slotId: null, isMoved: true,
                })
                workDays.add(date)
                empWorkDays.set(emp.id, workDays)
                cafeShort--
                continue
              }
            }
          }
          if (floorShort > 0 && secondaries.has('FLOOR')) {
            // フロア▲上限チェック
            if (emp.floorProficiency === 'LOW' && floorLowCount() >= 2) {
              continue
            }
            merged.assignments.push({
              employeeId: emp.id, date, workplace: 'FLOOR', slotId: null, isMoved: true,
            })
            workDays.add(date)
            empWorkDays.set(emp.id, workDays)
            floorShort--
          }
        }
      }

      // 移動後の最終staffingチェック + 習熟度チェック
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
        const dayType = (dow === 0 || dow === 6) ? 'HOLIDAY' : (dow === 5 ? 'FRIDAY' : 'WEEKDAY_MON_THU')

        // staffingチェック（SOFT）
        for (const wp of WORKPLACES) {
          const required = requiredOf(wp, dayType)
          const actual = dailyCount[d]?.[wp] ?? 0
          if (actual < required) {
            merged.violations.push(`[${wp}] ${d}: ${actual}名（必要${required}名）`)
          }
        }

        // カフェ習熟度（HARD）: ▲がいる日は◎が必要
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

        // フロア習熟度（HARD）: ▲は最大2人
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

      // HARD: 公休数（最低holidayCount日）
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

      // HARD: 連続勤務日数（最大5日）
      for (const emp of allEmployees) {
        const empWorkSet = new Set(merged.assignments.filter((a) => a.employeeId === emp.id).map((a) => a.date))
        let consecutive = 0
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

      // HARD: 勤務場所適性
      for (const a of merged.assignments) {
        const emp = allEmpMap.get(a.employeeId)
        if (!emp) continue
        const allowedWorkplaces = new Set([emp.primaryWorkplace, ...emp.secondaryWorkplaces.map((sw) => sw.workplace)])
        if (!allowedWorkplaces.has(a.workplace)) {
          merged.hardViolations.push(`[適性] ${emp.lastName}: ${a.date}に${a.workplace}（資格なし）`)
        }
      }

      // スコア: カフェ・フロアの総出勤数
      const cafeFloorCount = merged.assignments.filter((a) => a.workplace === 'CAFE' || a.workplace === 'FLOOR').length
      merged.score = totalScore + cafeFloorCount

      mergedCandidates.push(merged)
    }

    // HARD違反のない候補のみ採用
    const validCandidates = mergedCandidates.filter((c) => c.hardViolations.length === 0)

    if (validCandidates.length === 0) {
      await prisma.shiftPeriod.update({ where: { id }, data: { status: 'DRAFT' } })
      const sampleHard = mergedCandidates[0]?.hardViolations.slice(0, 10) ?? []
      return NextResponse.json({
        error: '必須条件を満たすシフトを生成できませんでした',
        detail: [...allErrors, ...sampleHard],
      }, { status: 400 })
    }

    // SOFT違反の少ない順にソート (タイブレークで2連休+カフェ/フロア配置の score)
    validCandidates.sort((a, b) => {
      const violationDiff = a.violations.length - b.violations.length
      if (violationDiff !== 0) return violationDiff
      return (b.score ?? 0) - (a.score ?? 0)
    })
    validCandidates.forEach((c, i) => { c.candidateIndex = i + 1 })
    mergedCandidates.length = 0
    mergedCandidates.push(...validCandidates)

    // DBに保存
    await prisma.shiftCandidate.deleteMany({ where: { shiftPeriodId: id } })

    for (const candidate of mergedCandidates) {
      const created = await prisma.shiftCandidate.create({
        data: {
          shiftPeriodId: id,
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

    await prisma.shiftPeriod.update({ where: { id }, data: { status: 'REVIEW' } })

    return NextResponse.json({
      success: true,
      candidateCount: mergedCandidates.length,
      errors: allErrors,
      violations: mergedCandidates.map((c) => ({
        candidateIndex: c.candidateIndex,
        violationCount: c.violations.length,
        violations: c.violations.slice(0, 10),
      })),
    })
  } catch (error) {
    await prisma.shiftPeriod.update({ where: { id }, data: { status: 'DRAFT' } })
    console.error('Shift generation error:', error instanceof Error ? error.message : error)
    return NextResponse.json({
      error: 'Generation failed',
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
