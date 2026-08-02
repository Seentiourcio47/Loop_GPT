/**
 * create_document tool: generate downloadable documents (PDF, Word, Excel,
 * PowerPoint, CSV, Markdown) as artifacts — the Manus-style "produce a file"
 * capability.
 */
import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx'
import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'
import { saveArtifact } from '../artifacts'
import type { ToolDefinition, ArtifactRef } from '../types'

async function makePdf(title: string, content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    if (title) doc.fontSize(20).text(title, { underline: false }).moveDown()
    doc.fontSize(11)
    for (const line of content.split('\n')) {
      if (line.startsWith('# ')) doc.fontSize(16).text(line.slice(2)).fontSize(11)
      else if (line.startsWith('## ')) doc.fontSize(14).text(line.slice(3)).fontSize(11)
      else doc.text(line)
    }
    doc.end()
  })
}

async function makeDocx(title: string, content: string): Promise<Buffer> {
  const children: Paragraph[] = []
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }))
  for (const line of content.split('\n')) {
    if (line.startsWith('# ')) children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }))
    else if (line.startsWith('## ')) children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }))
    else children.push(new Paragraph({ children: [new TextRun(line)] }))
  }
  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}

async function makeXlsx(title: string, rows: any[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(title?.slice(0, 30) || 'Sheet1')
  rows.forEach((r) => ws.addRow(r))
  if (rows[0]) ws.getRow(1).font = { bold: true }
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

async function makePptx(title: string, slides: Array<{ title?: string; bullets?: string[] }>): Promise<Buffer> {
  const pptx = new PptxGenJS()
  const cover = pptx.addSlide()
  cover.addText(title || 'Presentation', { x: 0.5, y: 2, w: 9, h: 1.5, fontSize: 32, bold: true })
  for (const s of slides) {
    const slide = pptx.addSlide()
    if (s.title) slide.addText(s.title, { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 24, bold: true })
    if (s.bullets?.length) {
      slide.addText(s.bullets.map((b) => ({ text: b, options: { bullet: true } })), { x: 0.7, y: 1.6, w: 8.5, h: 4, fontSize: 16 })
    }
  }
  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return out
}

export const createDocumentTool: ToolDefinition = {
  name: 'create_document',
  source: 'builtin',
  description:
    'Create a downloadable document. For pdf/docx/markdown pass "content" (use "# " and "## " for headings). For xlsx/csv pass "rows" (array of arrays). For pptx pass "slides" (array of {title, bullets}).',
  parameters: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'md'], description: 'Output format.' },
      filename: { type: 'string', description: 'Base filename without extension.' },
      title: { type: 'string', description: 'Document title.' },
      content: { type: 'string', description: 'Body text for pdf/docx/md.' },
      rows: { type: 'array', description: 'Rows (array of arrays) for xlsx/csv.', items: { type: 'array' } },
      slides: { type: 'array', description: 'Slides for pptx: [{title, bullets:[...]}].', items: { type: 'object' } },
    },
    required: ['format'],
  },
  async handler(args, ctx) {
    const format = String(args.format || 'pdf').toLowerCase()
    const title = String(args.title || 'Document')
    const base = String(args.filename || title || 'document').replace(/\.[a-z0-9]+$/i, '')
    const content = String(args.content || '')

    let buffer: Buffer
    let ext = format
    try {
      switch (format) {
        case 'pdf':
          buffer = await makePdf(title, content)
          break
        case 'docx':
          buffer = await makeDocx(title, content)
          break
        case 'xlsx':
          buffer = await makeXlsx(title, Array.isArray(args.rows) ? args.rows : [])
          break
        case 'pptx':
          buffer = await makePptx(title, Array.isArray(args.slides) ? args.slides : [])
          break
        case 'csv': {
          const rows: any[][] = Array.isArray(args.rows) ? args.rows : []
          buffer = Buffer.from(rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'utf-8')
          break
        }
        case 'md':
          ext = 'md'
          buffer = Buffer.from(`# ${title}\n\n${content}`, 'utf-8')
          break
        default:
          return { content: `Unsupported format "${format}".`, isError: true }
      }
    } catch (error: any) {
      return { content: `Document generation failed: ${error?.message || error}`, isError: true }
    }

    const artifact: ArtifactRef = saveArtifact(`${base}.${ext}`, buffer)
    ctx.scratch.artifacts = ctx.scratch.artifacts || []
    ctx.scratch.artifacts.push(artifact)
    ctx.emit({ type: 'artifact', artifact })
    return { content: `Created ${format.toUpperCase()} document "${artifact.name}". It is available for download.`, data: { artifact } }
  },
}

function csvCell(v: any): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
