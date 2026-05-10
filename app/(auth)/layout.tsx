export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-[#FAF6EE]">
      {/* 背景: パンのイラスト (繰り返しパターン) */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><g fill='none' stroke='%238B5A2B' stroke-width='1.4' stroke-linecap='round'><ellipse cx='45' cy='45' rx='30' ry='20' fill='%23E8C994' fill-opacity='0.6'/><path d='M18 45 Q26 36 34 45 Q42 54 50 45 Q58 36 66 45 Q74 54 72 45'/><path d='M18 50 Q26 41 34 50 Q42 59 50 50 Q58 41 66 50'/><ellipse cx='150' cy='65' rx='24' ry='24' fill='%23DCB075' fill-opacity='0.6'/><path d='M132 65 Q141 56 150 65 Q159 74 168 65'/><path d='M138 53 L140 77 M150 51 L150 79 M162 53 L160 77'/><ellipse cx='55' cy='145' rx='34' ry='16' fill='%23D4A05A' fill-opacity='0.6'/><path d='M22 145 L88 145 M32 138 L78 138 M32 152 L78 152'/><circle cx='155' cy='155' r='20' fill='%23C8923B' fill-opacity='0.6'/><path d='M138 155 Q146 148 154 155 Q162 162 170 155'/><path d='M144 144 L144 166 M154 142 L154 168 M164 144 L162 166'/></g></svg>\")",
          backgroundRepeat: 'repeat',
        }}
      />
      <div className="relative z-10 w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}
