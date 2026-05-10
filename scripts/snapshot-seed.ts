/**
 * 現状の本番DB(マスター/設定データ)を prisma/seed-data/*.json に書き出す。
 * これを実行後 git にコミットすれば、次回 `npm run seed` で同じ状態に復元可能。
 *
 * Usage:
 *   DATABASE_URL="<direct接続文字列>" npm run snapshot
 *
 * 対象 (リセット時に保持したいマスター/設定):
 *   - Employee + EmployeeSkill + EmployeeSecondaryWorkplace + EmployeeShiftTime
 *   - Skill
 *   - WorkplaceSlot + WorkplaceSlotRule + WorkplaceSlotSkill
 *   - WorkplaceStaffingRule
 *   - MonthlyHolidayConfig
 *   - EmployeeRecurringRule
 *
 * 対象外 (運用データ。リセット時は空に):
 *   - ShiftPeriod / ShiftCandidate / ShiftAssignment
 *   - DayOffRequest / PreAssignment / PreAssignmentExclusion
 *   - Notification / Holiday
 *   - RequestWindow
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const OUT_DIR = join(process.cwd(), 'prisma', 'seed-data')

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  // 1) Skill
  const skills = await prisma.skill.findMany({ orderBy: [{ workplace: 'asc' }, { sortOrder: 'asc' }] })
  writeFileSync(join(OUT_DIR, 'skills.json'), JSON.stringify(skills, null, 2))
  console.log(`✓ skills.json (${skills.length})`)

  // 2) Employee (関連を含む)
  const employees = await prisma.employee.findMany({
    orderBy: { employeeNumber: 'asc' },
    include: {
      skills: { select: { skillId: true, proficiency: true } },
      secondaryWorkplaces: { select: { workplace: true } },
      availableShiftTimes: { select: { timeSlot: true } },
    },
  })
  writeFileSync(join(OUT_DIR, 'employees.json'), JSON.stringify(employees, null, 2))
  console.log(`✓ employees.json (${employees.length})`)

  // 3) WorkplaceSlot (関連含む)
  const slots = await prisma.workplaceSlot.findMany({
    orderBy: [{ workplace: 'asc' }, { sortOrder: 'asc' }],
    include: {
      rules: { select: { dayType: true, isRequired: true, groupKey: true } },
      skills: { select: { skillId: true } },
    },
  })
  writeFileSync(join(OUT_DIR, 'workplace-slots.json'), JSON.stringify(slots, null, 2))
  console.log(`✓ workplace-slots.json (${slots.length})`)

  // 4) WorkplaceStaffingRule
  const staffingRules = await prisma.workplaceStaffingRule.findMany({
    orderBy: [{ workplace: 'asc' }, { dayType: 'asc' }],
  })
  writeFileSync(join(OUT_DIR, 'staffing-rules.json'), JSON.stringify(staffingRules, null, 2))
  console.log(`✓ staffing-rules.json (${staffingRules.length})`)

  // 5) MonthlyHolidayConfig
  const holidayConfigs = await prisma.monthlyHolidayConfig.findMany({
    orderBy: [{ fiscalYear: 'asc' }, { month: 'asc' }],
  })
  writeFileSync(join(OUT_DIR, 'monthly-holiday-configs.json'), JSON.stringify(holidayConfigs, null, 2))
  console.log(`✓ monthly-holiday-configs.json (${holidayConfigs.length})`)

  // 6) EmployeeRecurringRule
  const recurringRules = await prisma.employeeRecurringRule.findMany({
    orderBy: [{ employeeId: 'asc' }],
  })
  writeFileSync(join(OUT_DIR, 'employee-recurring-rules.json'), JSON.stringify(recurringRules, null, 2))
  console.log(`✓ employee-recurring-rules.json (${recurringRules.length})`)

  console.log(`\nスナップショット完了: ${OUT_DIR}`)
  console.log('git add prisma/seed-data && git commit -m "..." でリセット時の状態として保存できます。')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
