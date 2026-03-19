// app/api/smart/chunks/[resultId]/route.ts
// GET: 查询结构化翻译任务的所有分块及进度
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

interface Params { resultId: string }

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { resultId } = params
  const rows = await db.run(sql`
    SELECT idx, type, meta, content, translated, status, error
    FROM smart_chunks WHERE result_id = ${resultId} ORDER BY idx ASC
  `)
  return NextResponse.json({
    chunks: rows.rows.map((r: any) => ({
      idx: r.idx,
      type: r.type,
      meta: r.meta ? JSON.parse(r.meta) : {},
      content: r.content,
      translated: r.translated,
      status: r.status,
      error: r.error,
    }))
  })
}
