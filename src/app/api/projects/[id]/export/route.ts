import { NextRequest, NextResponse } from 'next/server'
import { getProjectPayload } from '@/lib/lem/tree'
import { bibleToDocx, bibleToMarkdown, collectBibleData } from '@/lib/lem/export'
import { contentDisposition, jsonError } from '@/lib/lem/api'

/** FR-8: экспорт «романной библии» в Markdown и DOCX, доступен в любой момент */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const format = req.nextUrl.searchParams.get('format') === 'docx' ? 'docx' : 'md'

  const payload = await getProjectPayload(id)
  if (!payload) return jsonError('Проект не найден', 404)

  const data = collectBibleData(payload)
  const safeName = (payload.project.name || 'романная-библия').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)

  if (format === 'docx') {
    const bytes = await bibleToDocx(data)
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': contentDisposition(`${safeName}.docx`),
      },
    })
  }

  const md = bibleToMarkdown(data)
  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': contentDisposition(`${safeName}.md`),
    },
  })
}
