import 'dotenv/config'
import { PrismaClient, Workplace, EmploymentType, EmployeeRole, DayType, Proficiency } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const SNAPSHOT_DIR = join(process.cwd(), 'prisma', 'seed-data')

async function deleteAll() {
  await prisma.notification.deleteMany()
  await prisma.shiftAssignment.deleteMany()
  await prisma.shiftCandidate.deleteMany()
  await prisma.shiftPeriod.deleteMany()
  await prisma.dayOffRequest.deleteMany()
  await prisma.preAssignmentExclusion.deleteMany()
  await prisma.preAssignment.deleteMany()
  await prisma.employeeRecurringRule.deleteMany()
  await prisma.workplaceSlotRule.deleteMany()
  await prisma.workplaceSlotSkill.deleteMany()
  await prisma.workplaceSlot.deleteMany()
  await prisma.workplaceStaffingRule.deleteMany()
  await prisma.employeeSkill.deleteMany()
  await prisma.employeeShiftTime.deleteMany()
  await prisma.employeeSecondaryWorkplace.deleteMany()
  await prisma.skill.deleteMany()
  await prisma.employee.deleteMany()
  await prisma.holiday.deleteMany()
  await prisma.monthlyHolidayConfig.deleteMany()
  await prisma.requestWindow.deleteMany()
}

/**
 * prisma/seed-data/*.json から復元する。
 * snapshot-seed スクリプトで取った最新状態を再現。
 */
async function restoreFromSnapshot() {
  const load = <T>(name: string): T => JSON.parse(readFileSync(join(SNAPSHOT_DIR, name), 'utf8'))

  // 1) Skill (FK 元なので最初)
  const skills: Array<{ id: string; workplace: string; name: string; sortOrder: number }> = load('skills.json')
  for (const s of skills) {
    await prisma.skill.create({
      data: { id: s.id, workplace: s.workplace as Workplace, name: s.name, sortOrder: s.sortOrder },
    })
  }

  // 2) Employee + 関連
  const employees: Array<{
    id: string; employeeNumber: number; lastName: string; firstName: string;
    lastNameRomaji: string; firstNameRomaji: string; password: string;
    mustChangePassword: boolean; role: string; employmentType: string;
    primaryWorkplace: string; floorProficiency: string | null;
    isActive: boolean; retiredAt: string | null;
    skills: Array<{ skillId: string; proficiency: string | null }>;
    secondaryWorkplaces: Array<{ workplace: string }>;
    availableShiftTimes: Array<{ timeSlot: string }>;
  }> = load('employees.json')

  for (const e of employees) {
    await prisma.employee.create({
      data: {
        id: e.id,
        employeeNumber: e.employeeNumber,
        lastName: e.lastName,
        firstName: e.firstName,
        lastNameRomaji: e.lastNameRomaji,
        firstNameRomaji: e.firstNameRomaji,
        password: e.password,
        mustChangePassword: e.mustChangePassword,
        role: e.role as EmployeeRole,
        employmentType: e.employmentType as EmploymentType,
        primaryWorkplace: e.primaryWorkplace as Workplace,
        floorProficiency: e.floorProficiency as Proficiency | null,
        isActive: e.isActive,
        retiredAt: e.retiredAt ? new Date(e.retiredAt) : null,
        skills: { create: e.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency as Proficiency | null })) },
        secondaryWorkplaces: { create: e.secondaryWorkplaces.map((sw) => ({ workplace: sw.workplace as Workplace })) },
        availableShiftTimes: { create: e.availableShiftTimes.map((t) => ({ timeSlot: t.timeSlot as 'EARLY' | 'DAYTIME' | 'CLOSE' })) },
      },
    })
  }

  // 3) WorkplaceSlot + 関連
  const slots: Array<{
    id: string; workplace: string; name: string; sortOrder: number;
    rules: Array<{ dayType: string; isRequired: boolean; groupKey: string | null }>;
    skills: Array<{ skillId: string }>;
  }> = load('workplace-slots.json')

  for (const slot of slots) {
    await prisma.workplaceSlot.create({
      data: {
        id: slot.id,
        workplace: slot.workplace as Workplace,
        name: slot.name,
        sortOrder: slot.sortOrder,
        rules: { create: slot.rules.map((r) => ({ dayType: r.dayType as DayType, isRequired: r.isRequired, groupKey: r.groupKey })) },
        skills: { create: slot.skills.map((sk) => ({ skillId: sk.skillId })) },
      },
    })
  }

  // 4) WorkplaceStaffingRule
  const staffingRules: Array<{
    workplace: string; dayType: string; requiredCount: number;
    minFullTimeCount: number | null; baseFullTimeCount: number | null;
  }> = load('staffing-rules.json')

  for (const r of staffingRules) {
    await prisma.workplaceStaffingRule.create({
      data: {
        workplace: r.workplace as Workplace,
        dayType: r.dayType as DayType,
        requiredCount: r.requiredCount,
        minFullTimeCount: r.minFullTimeCount,
        baseFullTimeCount: r.baseFullTimeCount,
      },
    })
  }

  // 5) MonthlyHolidayConfig
  const holidayConfigs: Array<{ fiscalYear: number; month: number; holidayCount: number }> = load('monthly-holiday-configs.json')
  for (const c of holidayConfigs) {
    await prisma.monthlyHolidayConfig.create({
      data: { fiscalYear: c.fiscalYear, month: c.month, holidayCount: c.holidayCount },
    })
  }

  // 6) EmployeeRecurringRule
  const recurringRules: Array<{
    id: string; employeeId: string; dayOfWeek: number | null; dayCategory: string | null;
    excludeHolidays: boolean; ruleType: string; workplace: string | null; memo: string | null;
  }> = load('employee-recurring-rules.json')

  for (const r of recurringRules) {
    await prisma.employeeRecurringRule.create({
      data: {
        id: r.id,
        employeeId: r.employeeId,
        dayOfWeek: r.dayOfWeek,
        dayCategory: r.dayCategory as 'HOLIDAY' | 'WEEKEND_OR_HOLIDAY' | 'WEEKDAY' | null,
        excludeHolidays: r.excludeHolidays,
        ruleType: r.ruleType as 'ALWAYS_OFF' | 'ALWAYS_WORK',
        workplace: r.workplace as Workplace | null,
        memo: r.memo,
      },
    })
  }

  console.log(`スナップショット復元: skills=${skills.length}, employees=${employees.length}, slots=${slots.length}, staffingRules=${staffingRules.length}, holidayConfigs=${holidayConfigs.length}, recurringRules=${recurringRules.length}`)
}

async function main() {
  await deleteAll()

  // スナップショットがあれば復元、なければ初期データを作成
  if (existsSync(join(SNAPSHOT_DIR, 'employees.json'))) {
    console.log(`スナップショット (${SNAPSHOT_DIR}) を検出: 復元モード`)
    await restoreFromSnapshot()
    console.log('Seed (snapshot restore) completed successfully!')
    return
  }

  console.log('スナップショット未検出: 初期データ生成モード')

  const hash = await bcrypt.hash('password123', 10)

  // ===== 管理者 =====
  await prisma.employee.create({
    data: {
      lastName: '管理',
      firstName: '太郎',
      lastNameRomaji: 'Kanri',
      firstNameRomaji: 'Taro',
      password: hash,
      role: EmployeeRole.ADMIN,
      employmentType: EmploymentType.FULL_TIME,
      primaryWorkplace: Workplace.OFFICE,
    },
  })

  // ===== 工場スキル定義 =====
  const factorySkillNames = [
    '平日午前窯', '休日午前窯', '平日午後窯', '休日午後窯',
    '平日午前仕込', '休日午前仕込', '平日午後仕込', '休日午後仕込',
    '前麺', '後麺', 'シーター', '焼込',
  ]

  const factorySkills: Record<string, string> = {}
  for (let i = 0; i < factorySkillNames.length; i++) {
    const skill = await prisma.skill.create({
      data: { workplace: Workplace.FACTORY, name: factorySkillNames[i], sortOrder: i },
    })
    factorySkills[factorySkillNames[i]] = skill.id
  }

  // ===== カフェスキル定義 =====
  const cafeSkillNames = ['K', 'S', 'KS']
  const cafeSkills: Record<string, string> = {}
  for (let i = 0; i < cafeSkillNames.length; i++) {
    const skill = await prisma.skill.create({
      data: { workplace: Workplace.CAFE, name: cafeSkillNames[i], sortOrder: i },
    })
    cafeSkills[cafeSkillNames[i]] = skill.id
  }

  // ===== 工場従業員データ =====
  type FactoryEmployeeData = {
    lastName: string
    firstName: string
    lastNameRomaji: string
    firstNameRomaji: string
    skills: string[]
    secondaryWorkplaces: Workplace[]
    cafeSkills?: { name: string; proficiency?: Proficiency }[]
    floorProficiency?: Proficiency
  }

  const factoryEmployees: FactoryEmployeeData[] = [
    {
      lastName: '上田', firstName: '怜', lastNameRomaji: 'Ueda', firstNameRomaji: 'Satoshi',
      skills: ['平日午前窯', '休日午前窯', '平日午後窯', '休日午後窯', '平日午前仕込', '休日午前仕込', '平日午後仕込', '休日午後仕込', '前麺', '後麺', 'シーター', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE, Workplace.FLOOR],
      cafeSkills: [{ name: 'K', proficiency: Proficiency.MID }],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '篠原', firstName: '遼', lastNameRomaji: 'Shinohara', firstNameRomaji: 'Ryo',
      skills: ['平日午前窯', '休日午前窯', '平日午後窯', '休日午後窯', '平日午前仕込', '休日午前仕込', '平日午後仕込', '休日午後仕込', '前麺', '後麺', 'シーター', '焼込'],
      secondaryWorkplaces: [],
    },
    {
      lastName: '伊藤', firstName: '大毅', lastNameRomaji: 'Ito', firstNameRomaji: 'Daiki',
      skills: ['平日午前窯', '休日午前窯', '平日午後窯', '休日午後窯', '平日午前仕込', '休日午前仕込', '平日午後仕込', '休日午後仕込', '前麺', '後麺', 'シーター', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE],
      cafeSkills: [
        { name: 'K', proficiency: Proficiency.MID },
        { name: 'S', proficiency: Proficiency.MID },
        { name: 'KS' },
      ],
    },
    {
      lastName: '福永', firstName: '将之', lastNameRomaji: 'Fukunaga', firstNameRomaji: 'Masayuki',
      skills: ['平日午前窯', '休日午前窯', '平日午後窯', '休日午後窯', '平日午前仕込', '休日午前仕込', '平日午後仕込', '休日午後仕込', '前麺', '後麺', 'シーター', '焼込'],
      secondaryWorkplaces: [],
    },
    {
      lastName: '小松', firstName: '裕也', lastNameRomaji: 'Komatsu', firstNameRomaji: 'Yuya',
      skills: ['平日午前窯', '休日午前窯', '平日午後窯', '休日午後窯', '平日午前仕込', '休日午前仕込', '平日午後仕込', '休日午後仕込', '前麺', '後麺'],
      secondaryWorkplaces: [],
    },
    {
      lastName: '三上', firstName: '大輔', lastNameRomaji: 'Mikami', firstNameRomaji: 'Daisuke',
      skills: ['平日午前窯', '休日午前窯', '平日午後窯', '休日午後窯', '平日午後仕込', '休日午後仕込', '前麺', '後麺', 'シーター', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE],
      cafeSkills: [
        { name: 'K', proficiency: Proficiency.HIGH },
        { name: 'S', proficiency: Proficiency.MID },
        { name: 'KS' },
      ],
    },
    {
      lastName: '泉', firstName: '百花', lastNameRomaji: 'Izumi', firstNameRomaji: 'Momoka',
      skills: ['後麺', '焼込'],
      secondaryWorkplaces: [Workplace.FLOOR],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '小笠原', firstName: '渚', lastNameRomaji: 'Ogasawara', firstNameRomaji: 'Nagisa',
      skills: ['平日午後窯', '平日午前仕込', '休日午前仕込', '平日午後仕込', '休日午後仕込', '前麺', 'シーター', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE, Workplace.FLOOR],
      cafeSkills: [{ name: 'S', proficiency: Proficiency.LOW }],
      floorProficiency: Proficiency.LOW,
    },
    {
      lastName: '吉田', firstName: '美咲', lastNameRomaji: 'Yoshida', firstNameRomaji: 'Misaki',
      skills: ['平日午前仕込', '休日午前仕込', '平日午後仕込', '休日午後仕込', '前麺', '後麺', 'シーター', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE, Workplace.FLOOR],
      cafeSkills: [{ name: 'S', proficiency: Proficiency.LOW }],
      floorProficiency: Proficiency.LOW,
    },
    {
      lastName: '高田', firstName: '省吾', lastNameRomaji: 'Takada', firstNameRomaji: 'Shogo',
      skills: ['平日午後窯', '休日午後窯', '平日午後仕込', '前麺', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE],
      cafeSkills: [
        { name: 'K', proficiency: Proficiency.HIGH },
        { name: 'S', proficiency: Proficiency.MID },
        { name: 'KS' },
      ],
    },
    {
      lastName: '後藤', firstName: '鈴奈', lastNameRomaji: 'Goto', firstNameRomaji: 'Suzuna',
      skills: ['後麺', 'シーター', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE, Workplace.FLOOR],
      cafeSkills: [{ name: 'S', proficiency: Proficiency.LOW }],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '本間', firstName: '友哉', lastNameRomaji: 'Honma', firstNameRomaji: 'Tomoya',
      skills: ['後麺', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE],
      cafeSkills: [
        { name: 'K', proficiency: Proficiency.HIGH },
        { name: 'S', proficiency: Proficiency.MID },
        { name: 'KS' },
      ],
    },
    {
      lastName: '丹治', firstName: '崇人', lastNameRomaji: 'Tanji', firstNameRomaji: 'Takahito',
      skills: ['前麺', 'シーター', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE, Workplace.FLOOR],
      cafeSkills: [{ name: 'S', proficiency: Proficiency.MID }],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '宮本', firstName: '健吾', lastNameRomaji: 'Miyamoto', firstNameRomaji: 'Kengo',
      skills: ['前麺'],
      secondaryWorkplaces: [Workplace.FLOOR],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '坂本', firstName: '裕一朗', lastNameRomaji: 'Sakamoto', firstNameRomaji: 'Yuichiro',
      skills: ['後麺', '焼込'],
      secondaryWorkplaces: [Workplace.CAFE, Workplace.FLOOR],
      cafeSkills: [{ name: 'S', proficiency: Proficiency.LOW }],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '河野', firstName: 'あかり', lastNameRomaji: 'Kono', firstNameRomaji: 'Akari',
      skills: ['後麺'],
      secondaryWorkplaces: [Workplace.FLOOR],
      floorProficiency: Proficiency.MID,
    },
  ]

  for (let i = 0; i < factoryEmployees.length; i++) {
    const data = factoryEmployees[i]
    const emp = await prisma.employee.create({
      data: {
        lastName: data.lastName,
        firstName: data.firstName,
        lastNameRomaji: data.lastNameRomaji,
        firstNameRomaji: data.firstNameRomaji,
        password: hash,
        role: EmployeeRole.STAFF,
        employmentType: EmploymentType.FULL_TIME,
        primaryWorkplace: Workplace.FACTORY,
        floorProficiency: data.floorProficiency,
      },
    })

    for (const skillName of data.skills) {
      await prisma.employeeSkill.create({
        data: { employeeId: emp.id, skillId: factorySkills[skillName] },
      })
    }

    for (const wp of data.secondaryWorkplaces) {
      await prisma.employeeSecondaryWorkplace.create({
        data: { employeeId: emp.id, workplace: wp },
      })
    }

    if (data.cafeSkills) {
      for (const cs of data.cafeSkills) {
        await prisma.employeeSkill.create({
          data: { employeeId: emp.id, skillId: cafeSkills[cs.name], proficiency: cs.proficiency },
        })
      }
    }
  }

  // ===== カフェ従業員データ =====
  type CafeEmployeeData = {
    lastName: string
    firstName: string
    lastNameRomaji: string
    firstNameRomaji: string
    employmentType: 'FULL_TIME' | 'PART_TIME'
    skills: { name: string; proficiency?: Proficiency }[]
    secondaryWorkplaces: Workplace[]
    floorProficiency?: Proficiency
  }

  const cafeEmployees: CafeEmployeeData[] = [
    {
      lastName: '末永', firstName: '美咲', lastNameRomaji: 'Suenaga', firstNameRomaji: 'Misaki', employmentType: 'FULL_TIME',
      skills: [
        { name: 'K', proficiency: Proficiency.HIGH },
        { name: 'S', proficiency: Proficiency.MID },
        { name: 'KS' },
      ],
      secondaryWorkplaces: [Workplace.FLOOR],
      floorProficiency: Proficiency.LOW,
    },
    {
      lastName: '池田', firstName: '麻衣', lastNameRomaji: 'Ikeda', firstNameRomaji: 'Mai', employmentType: 'FULL_TIME',
      skills: [
        { name: 'K', proficiency: Proficiency.HIGH },
        { name: 'S', proficiency: Proficiency.MID },
        { name: 'KS' },
      ],
      secondaryWorkplaces: [Workplace.FLOOR],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '斎木', firstName: '康平', lastNameRomaji: 'Saiki', firstNameRomaji: 'Kohei', employmentType: 'FULL_TIME',
      skills: [
        { name: 'K', proficiency: Proficiency.HIGH },
        { name: 'S', proficiency: Proficiency.MID },
        { name: 'KS' },
      ],
      secondaryWorkplaces: [],
    },
    {
      lastName: '廣瀬', firstName: '堅太郎', lastNameRomaji: 'Hirose', firstNameRomaji: 'Kentaro', employmentType: 'FULL_TIME',
      skills: [{ name: 'S', proficiency: Proficiency.LOW }],
      secondaryWorkplaces: [],
    },
    // カフェパート
    {
      lastName: '佐藤', firstName: '美奈子', lastNameRomaji: 'Sato', firstNameRomaji: 'Minako', employmentType: 'PART_TIME',
      skills: [], secondaryWorkplaces: [Workplace.OTHER],
    },
    {
      lastName: '山田', firstName: '幸恵', lastNameRomaji: 'Yamada', firstNameRomaji: 'Yukie', employmentType: 'PART_TIME',
      skills: [], secondaryWorkplaces: [Workplace.OTHER, Workplace.FLOOR],
    },
    {
      lastName: '大津', firstName: '正子', lastNameRomaji: 'Otsu', firstNameRomaji: 'Masako', employmentType: 'PART_TIME',
      skills: [], secondaryWorkplaces: [Workplace.OTHER],
    },
    {
      lastName: '相多', firstName: '礼子', lastNameRomaji: 'Aita', firstNameRomaji: 'Reiko', employmentType: 'PART_TIME',
      skills: [], secondaryWorkplaces: [Workplace.OTHER, Workplace.FLOOR],
    },
    {
      lastName: '井上', firstName: '太佳子', lastNameRomaji: 'Inoue', firstNameRomaji: 'Takako', employmentType: 'PART_TIME',
      skills: [], secondaryWorkplaces: [Workplace.OTHER, Workplace.FLOOR],
    },
  ]

  for (let i = 0; i < cafeEmployees.length; i++) {
    const data = cafeEmployees[i]
    const emp = await prisma.employee.create({
      data: {
        lastName: data.lastName,
        firstName: data.firstName,
        lastNameRomaji: data.lastNameRomaji,
        firstNameRomaji: data.firstNameRomaji,
        password: hash,
        role: EmployeeRole.STAFF,
        employmentType: data.employmentType as EmploymentType,
        primaryWorkplace: Workplace.CAFE,
        floorProficiency: data.floorProficiency,
      },
    })

    for (const cs of data.skills) {
      await prisma.employeeSkill.create({
        data: { employeeId: emp.id, skillId: cafeSkills[cs.name], proficiency: cs.proficiency },
      })
    }

    for (const wp of data.secondaryWorkplaces) {
      await prisma.employeeSecondaryWorkplace.create({
        data: { employeeId: emp.id, workplace: wp },
      })
    }
  }

  // ===== フロア従業員データ =====
  // フロアのスキルはまだ定義していないため、スキル紐付けはスキップ
  type FloorEmployeeData = {
    lastName: string
    firstName: string
    lastNameRomaji: string
    firstNameRomaji: string
    employmentType: 'FULL_TIME' | 'PART_TIME'
    secondaryWorkplaces: Workplace[]
    cafeSkills?: { name: string; proficiency?: Proficiency }[]
    factorySkills?: string[]
    floorProficiency: Proficiency
  }

  const floorEmployees: FloorEmployeeData[] = [
    {
      lastName: '上田', firstName: '美樹子', lastNameRomaji: 'Ueda', firstNameRomaji: 'Mikiko', employmentType: 'FULL_TIME',
      secondaryWorkplaces: [Workplace.CAFE],
      cafeSkills: [{ name: 'S', proficiency: Proficiency.LOW }],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '篠原', firstName: 'ゆい', lastNameRomaji: 'Shinohara', firstNameRomaji: 'Yui', employmentType: 'PART_TIME',
      secondaryWorkplaces: [],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '田中', firstName: '拓人', lastNameRomaji: 'Tanaka', firstNameRomaji: 'Takuto', employmentType: 'FULL_TIME',
      secondaryWorkplaces: [Workplace.FACTORY], factorySkills: ['前麺', '後麺'],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '三好', firstName: '由起', lastNameRomaji: 'Miyoshi', firstNameRomaji: 'Yuki', employmentType: 'FULL_TIME',
      secondaryWorkplaces: [],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '小川', firstName: '諒', lastNameRomaji: 'Ogawa', firstNameRomaji: 'Ryo', employmentType: 'FULL_TIME',
      secondaryWorkplaces: [],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '木村', firstName: '夏菜', lastNameRomaji: 'Kimura', firstNameRomaji: 'Natsuna', employmentType: 'FULL_TIME',
      secondaryWorkplaces: [],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '舩津', firstName: '蓮', lastNameRomaji: 'Funatsu', firstNameRomaji: 'Ren', employmentType: 'FULL_TIME',
      secondaryWorkplaces: [Workplace.CAFE],
      cafeSkills: [{ name: 'S', proficiency: Proficiency.LOW }],
      floorProficiency: Proficiency.LOW,
    },
    {
      lastName: '曽我', firstName: '美由佳', lastNameRomaji: 'Soga', firstNameRomaji: 'Miyuka', employmentType: 'FULL_TIME',
      secondaryWorkplaces: [],
      floorProficiency: Proficiency.LOW,
    },
    // フロアパート
    {
      lastName: '新倉', firstName: '琴絵', lastNameRomaji: 'Shinkura', firstNameRomaji: 'Kotoe', employmentType: 'PART_TIME',
      secondaryWorkplaces: [],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '渡邉', firstName: '星来', lastNameRomaji: 'Watanabe', firstNameRomaji: 'Seira', employmentType: 'PART_TIME',
      secondaryWorkplaces: [Workplace.OTHER],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '竹歳', firstName: '千鶴', lastNameRomaji: 'Taketoshi', firstNameRomaji: 'Chizuru', employmentType: 'PART_TIME',
      secondaryWorkplaces: [],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '厚', firstName: '靖代', lastNameRomaji: 'Atsu', firstNameRomaji: 'Yasuyo', employmentType: 'PART_TIME',
      secondaryWorkplaces: [Workplace.OTHER],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '川村', firstName: 'のり子', lastNameRomaji: 'Kawamura', firstNameRomaji: 'Noriko', employmentType: 'PART_TIME',
      secondaryWorkplaces: [Workplace.OTHER, Workplace.CAFE],
      floorProficiency: Proficiency.MID,
    },
    {
      lastName: '富田', firstName: '彩楽', lastNameRomaji: 'Tomita', firstNameRomaji: 'Sara', employmentType: 'PART_TIME',
      secondaryWorkplaces: [],
      floorProficiency: Proficiency.MID,
    },
  ]

  for (let i = 0; i < floorEmployees.length; i++) {
    const data = floorEmployees[i]
    const emp = await prisma.employee.create({
      data: {
        lastName: data.lastName,
        firstName: data.firstName,
        lastNameRomaji: data.lastNameRomaji,
        firstNameRomaji: data.firstNameRomaji,
        password: hash,
        role: EmployeeRole.STAFF,
        employmentType: data.employmentType as EmploymentType,
        primaryWorkplace: Workplace.FLOOR,
        floorProficiency: data.floorProficiency,
      },
    })

    for (const wp of data.secondaryWorkplaces) {
      await prisma.employeeSecondaryWorkplace.create({
        data: { employeeId: emp.id, workplace: wp },
      })
    }

    if (data.cafeSkills) {
      for (const cs of data.cafeSkills) {
        await prisma.employeeSkill.create({
          data: { employeeId: emp.id, skillId: cafeSkills[cs.name], proficiency: cs.proficiency },
        })
      }
    }

    if (data.factorySkills) {
      for (const skillName of data.factorySkills) {
        await prisma.employeeSkill.create({
          data: { employeeId: emp.id, skillId: factorySkills[skillName] },
        })
      }
    }
  }

  // ===== 事務パート =====
  type OfficeEmployeeData = {
    lastName: string
    firstName: string
    lastNameRomaji: string
    firstNameRomaji: string
    secondaryWorkplaces: Workplace[]
  }
  const officeEmployees: OfficeEmployeeData[] = [
    { lastName: '柳', firstName: '真理奈', lastNameRomaji: 'Yanagi', firstNameRomaji: 'Marina', secondaryWorkplaces: [Workplace.OTHER] },
    { lastName: '木村', firstName: '舞', lastNameRomaji: 'Kimura', firstNameRomaji: 'Mai', secondaryWorkplaces: [Workplace.OTHER] },
    { lastName: 'ローフト', firstName: '芳', lastNameRomaji: 'Looft', firstNameRomaji: 'Kaori', secondaryWorkplaces: [] },
  ]
  for (let i = 0; i < officeEmployees.length; i++) {
    const data = officeEmployees[i]
    const emp = await prisma.employee.create({
      data: {
        lastName: data.lastName,
        firstName: data.firstName,
        lastNameRomaji: data.lastNameRomaji,
        firstNameRomaji: data.firstNameRomaji,
        password: hash,
        role: EmployeeRole.STAFF,
        employmentType: EmploymentType.PART_TIME,
        primaryWorkplace: Workplace.OFFICE,
      },
    })
    for (const wp of data.secondaryWorkplaces) {
      await prisma.employeeSecondaryWorkplace.create({ data: { employeeId: emp.id, workplace: wp } })
    }
  }

  // ===== その他パート（宅急便等） =====
  type OtherEmployeeData = {
    lastName: string
    firstName: string
    lastNameRomaji: string
    firstNameRomaji: string
    secondaryWorkplaces: Workplace[]
  }
  const otherEmployees: OtherEmployeeData[] = [
    { lastName: '赤池', firstName: '梢', lastNameRomaji: 'Akaike', firstNameRomaji: 'Kozue', secondaryWorkplaces: [Workplace.FLOOR] },
    { lastName: '奥', firstName: '寿子', lastNameRomaji: 'Oku', firstNameRomaji: 'Hisako', secondaryWorkplaces: [] },
    { lastName: '山下', firstName: '恵美子', lastNameRomaji: 'Yamashita', firstNameRomaji: 'Emiko', secondaryWorkplaces: [] },
    { lastName: '湯原', firstName: '愛子', lastNameRomaji: 'Yuhara', firstNameRomaji: 'Aiko', secondaryWorkplaces: [] },
    { lastName: '藤本', firstName: '文子', lastNameRomaji: 'Fujimoto', firstNameRomaji: 'Ayako', secondaryWorkplaces: [] },
  ]
  for (let i = 0; i < otherEmployees.length; i++) {
    const data = otherEmployees[i]
    const emp = await prisma.employee.create({
      data: {
        lastName: data.lastName,
        firstName: data.firstName,
        lastNameRomaji: data.lastNameRomaji,
        firstNameRomaji: data.firstNameRomaji,
        password: hash,
        role: EmployeeRole.STAFF,
        employmentType: EmploymentType.PART_TIME,
        primaryWorkplace: Workplace.OTHER,
      },
    })
    for (const wp of data.secondaryWorkplaces) {
      await prisma.employeeSecondaryWorkplace.create({ data: { employeeId: emp.id, workplace: wp } })
    }
  }

  // ===== 工場スロット定義 =====
  const factorySlotDefs = [
    { name: '午前窯', sortOrder: 1, skillName: '午前窯' },
    { name: '午前仕込', sortOrder: 2, skillName: '午前仕込' },
    { name: '午後仕込', sortOrder: 3, skillName: '午後仕込' },
    { name: '前麺', sortOrder: 4, skillName: '前麺' },
    { name: '午後窯', sortOrder: 5, skillName: '午後窯' },
    { name: '後麺①', sortOrder: 6, skillName: '後麺' },
    { name: '後麺②', sortOrder: 7, skillName: '後麺' },
    { name: 'シーター', sortOrder: 8, skillName: 'シーター' },
    { name: '焼込①', sortOrder: 9, skillName: '焼込' },
    { name: '焼込②', sortOrder: 10, skillName: '焼込' },
  ]

  for (const slot of factorySlotDefs) {
    const created = await prisma.workplaceSlot.create({
      data: { workplace: Workplace.FACTORY, name: slot.name, sortOrder: slot.sortOrder },
    })

    // スロットに必要なスキルを紐付け（窯・仕込は平日/休日の2スキル）
    if (['午前窯', '午前仕込', '午後仕込', '午後窯'].includes(slot.skillName)) {
      await prisma.workplaceSlotSkill.create({
        data: { workplaceSlotId: created.id, skillId: factorySkills[`平日${slot.skillName}`] },
      })
      await prisma.workplaceSlotSkill.create({
        data: { workplaceSlotId: created.id, skillId: factorySkills[`休日${slot.skillName}`] },
      })
    } else {
      await prisma.workplaceSlotSkill.create({
        data: { workplaceSlotId: created.id, skillId: factorySkills[slot.skillName] },
      })
    }

    // スロットルール
    if (slot.name === '後麺①' || slot.name === '焼込①') {
      // 月〜木は 後麺① or 焼込① のどちらか
      await prisma.workplaceSlotRule.create({
        data: { workplaceSlotId: created.id, dayType: DayType.WEEKDAY_MON_THU, isRequired: false, groupKey: 'slot6or9' },
      })
    } else {
      await prisma.workplaceSlotRule.create({
        data: { workplaceSlotId: created.id, dayType: DayType.WEEKDAY_MON_THU, isRequired: true },
      })
    }

    // 金・休日は全スロット必須
    await prisma.workplaceSlotRule.create({
      data: { workplaceSlotId: created.id, dayType: DayType.FRIDAY, isRequired: true },
    })
    await prisma.workplaceSlotRule.create({
      data: { workplaceSlotId: created.id, dayType: DayType.HOLIDAY, isRequired: true },
    })
  }

  // ===== カフェスロット定義 =====
  const cafeSlotDefs = [
    { name: 'K', sortOrder: 1, skillName: 'K' },
    { name: 'S', sortOrder: 2, skillName: 'S' },
    { name: 'KS', sortOrder: 3, skillName: 'KS' },
    { name: 'S②', sortOrder: 4, skillName: 'S' },
  ]

  for (const slot of cafeSlotDefs) {
    const created = await prisma.workplaceSlot.create({
      data: { workplace: Workplace.CAFE, name: slot.name, sortOrder: slot.sortOrder },
    })

    await prisma.workplaceSlotSkill.create({
      data: { workplaceSlotId: created.id, skillId: cafeSkills[slot.skillName] },
    })

    if (slot.name === 'S②') {
      // S②は休日のみ
      await prisma.workplaceSlotRule.create({
        data: { workplaceSlotId: created.id, dayType: DayType.HOLIDAY, isRequired: true },
      })
    } else {
      await prisma.workplaceSlotRule.create({
        data: { workplaceSlotId: created.id, dayType: DayType.WEEKDAY_MON_THU, isRequired: true },
      })
      await prisma.workplaceSlotRule.create({
        data: { workplaceSlotId: created.id, dayType: DayType.FRIDAY, isRequired: true },
      })
      await prisma.workplaceSlotRule.create({
        data: { workplaceSlotId: created.id, dayType: DayType.HOLIDAY, isRequired: true },
      })
    }
  }

  // ===== 勤務場所の稼働人数ルール =====
  await prisma.workplaceStaffingRule.createMany({
    data: [
      // 工場
      { workplace: Workplace.FACTORY, dayType: DayType.WEEKDAY_MON_THU, requiredCount: 9 },
      { workplace: Workplace.FACTORY, dayType: DayType.FRIDAY, requiredCount: 10 },
      { workplace: Workplace.FACTORY, dayType: DayType.HOLIDAY, requiredCount: 11 },
      // カフェ
      { workplace: Workplace.CAFE, dayType: DayType.WEEKDAY_MON_THU, requiredCount: 3 },
      { workplace: Workplace.CAFE, dayType: DayType.FRIDAY, requiredCount: 3 },
      { workplace: Workplace.CAFE, dayType: DayType.HOLIDAY, requiredCount: 4 },
      // フロア
      { workplace: Workplace.FLOOR, dayType: DayType.WEEKDAY_MON_THU, requiredCount: 6, minFullTimeCount: 3, baseFullTimeCount: 3 },
      { workplace: Workplace.FLOOR, dayType: DayType.FRIDAY, requiredCount: 6, minFullTimeCount: 3, baseFullTimeCount: 3 },
      { workplace: Workplace.FLOOR, dayType: DayType.HOLIDAY, requiredCount: 7, minFullTimeCount: 4, baseFullTimeCount: 4 },
    ],
  })

  // ===== 公休数設定（2026年度サンプル: 各月8日） =====
  for (let m = 1; m <= 12; m++) {
    await prisma.monthlyHolidayConfig.create({
      data: { fiscalYear: 2026, month: m, holidayCount: 8 },
    })
  }

  console.log('Seed completed successfully!')
  console.log('社員番号でログイン (パスワードは全員 password123)')
  console.log('  管理者: 社員番号 1')
  console.log('  工場スタッフ: 社員番号 2 〜 17')
  console.log('  カフェスタッフ: 社員番号 18 〜 26')
  console.log('  フロアスタッフ: 社員番号 27 〜 40')
  console.log('  事務スタッフ: 社員番号 41 〜 43')
  console.log('  その他スタッフ: 社員番号 44 〜 48')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
