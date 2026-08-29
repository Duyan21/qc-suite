import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ROBOTO_VIETNAMESE_BOLD_BASE64, ROBOTO_VIETNAMESE_NORMAL_BASE64 } from './fonts/robotoVietnamese'
import type { BurndownPoint, Release } from './releases'
import type { DefectListItem, DefectSeverity, DefectStatus } from './defects'
import { formatDate } from './utils'

const FONT = 'RobotoVN'

const SEVERITY_COLORS: Record<DefectSeverity, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#9ca3af',
}
const STATUS_COLORS: Record<DefectStatus, string> = {
  Open: '#3b82f6',
  Fixed: '#22c55e',
  Closed: '#9ca3af',
  'Wont-Fix': '#111827',
}
const SEVERITIES: DefectSeverity[] = ['Critical', 'High', 'Medium', 'Low']
const STATUSES: DefectStatus[] = ['Open', 'Fixed', 'Closed', 'Wont-Fix']

function registerVietnameseFont(doc: jsPDF) {
  doc.addFileToVFS('Roboto-VN-Regular.ttf', ROBOTO_VIETNAMESE_NORMAL_BASE64)
  doc.addFont('Roboto-VN-Regular.ttf', FONT, 'normal')
  doc.addFileToVFS('Roboto-VN-Bold.ttf', ROBOTO_VIETNAMESE_BOLD_BASE64)
  doc.addFont('Roboto-VN-Bold.ttf', FONT, 'bold')
  doc.setFont(FONT, 'normal')
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1).trimEnd() + '…'
}

function todayFileStamp(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y + needed > pageHeight - 20) {
    doc.addPage()
    return 18
  }
  return y
}

function sectionHeading(doc: jsPDF, x: number, y: number, text: string): void {
  doc.setFont(FONT, 'bold')
  doc.setFontSize(10)
  doc.setTextColor('#111827')
  doc.text(text, x, y)
}

function drawKpiRow(doc: jsPDF, x: number, y: number, width: number, tiles: { label: string; value: string }[]): void {
  const gap = 6
  const tileWidth = (width - gap * (tiles.length - 1)) / tiles.length
  tiles.forEach((tile, i) => {
    const tileX = x + i * (tileWidth + gap)
    doc.setDrawColor('#e5e7eb')
    doc.roundedRect(tileX, y, tileWidth, 16, 2, 2)
    doc.setFont(FONT, 'normal')
    doc.setFontSize(7)
    doc.setTextColor('#6b7280')
    doc.text(tile.label, tileX + 4, y + 6)
    doc.setFont(FONT, 'bold')
    doc.setFontSize(13)
    doc.setTextColor('#111827')
    doc.text(tile.value, tileX + 4, y + 13)
  })
}

function drawLegendRow(doc: jsPDF, x: number, y: number, items: { label: string; color: string }[]): void {
  let cursorX = x
  doc.setFontSize(8)
  for (const item of items) {
    doc.setFillColor(item.color)
    doc.rect(cursorX, y - 3, 3, 3, 'F')
    doc.setFont(FONT, 'normal')
    doc.setTextColor('#374151')
    doc.text(item.label, cursorX + 5, y)
    cursorX += doc.getTextWidth(item.label) + 16
  }
}

function drawStackedBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  segments: { value: number; color: string }[],
): void {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) {
    doc.setFillColor('#e5e7eb')
    doc.rect(x, y, width, height, 'F')
    return
  }
  let cursorX = x
  for (const seg of segments) {
    if (seg.value <= 0) continue
    const segWidth = (seg.value / total) * width
    doc.setFillColor(seg.color)
    doc.rect(cursorX, y, segWidth, height, 'F')
    cursorX += segWidth
  }
}

function drawVerticalBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  bars: { label: string; value: number; color: string }[],
): void {
  const maxValue = Math.max(...bars.map((b) => b.value), 1)
  const gap = 6
  const barWidth = (width - gap * (bars.length - 1)) / bars.length
  const baseline = y + height
  doc.setDrawColor('#e5e7eb')
  doc.line(x, baseline, x + width, baseline)
  bars.forEach((bar, i) => {
    const barX = x + i * (barWidth + gap)
    const barHeight = bar.value > 0 ? Math.max((bar.value / maxValue) * (height - 10), 2) : 0
    const barY = baseline - barHeight
    if (barHeight > 0) {
      doc.setFillColor(bar.color)
      doc.rect(barX, barY, barWidth, barHeight, 'F')
    }
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor('#111827')
    doc.text(String(bar.value), barX + barWidth / 2, barY - 2, { align: 'center' })
    doc.setFontSize(7)
    doc.setTextColor('#6b7280')
    doc.text(bar.label, barX + barWidth / 2, baseline + 5, { align: 'center' })
  })
}

function drawBurndownChart(doc: jsPDF, x: number, y: number, width: number, height: number, points: BurndownPoint[]): void {
  doc.setDrawColor('#e5e7eb')
  doc.rect(x, y, width, height)

  if (points.length < 2) {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#9ca3af')
    doc.text('Chưa có dữ liệu burn-down.', x + width / 2, y + height / 2, { align: 'center' })
    return
  }

  const hasExpected = points.some((p) => p.expected !== null)
  const maxValue = Math.max(
    1,
    ...points.map((p) => p.remaining),
    ...(hasExpected ? points.map((p) => p.expected ?? 0) : []),
  )
  const n = points.length
  const stepX = width / (n - 1)
  const plotY = (value: number) => y + height - (value / maxValue) * (height - 4) - 2

  const drawSeries = (values: number[], color: string, dashed: boolean) => {
    doc.setDrawColor(color)
    doc.setLineWidth(0.5)
    doc.setLineDashPattern(dashed ? [1.5, 1] : [], 0)
    for (let i = 0; i < n - 1; i++) {
      doc.line(x + i * stepX, plotY(values[i]), x + (i + 1) * stepX, plotY(values[i + 1]))
    }
  }

  drawSeries(
    points.map((p) => p.remaining),
    '#3b82f6',
    false,
  )
  if (hasExpected) {
    drawSeries(
      points.map((p) => p.expected ?? 0),
      '#9ca3af',
      true,
    )
  }
  doc.setLineDashPattern([], 0)

  doc.setFont(FONT, 'normal')
  doc.setFontSize(7)
  doc.setTextColor('#6b7280')
  const idxs = Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1]))
  for (const i of idxs) {
    doc.text(formatDate(points[i].date), x + i * stepX, y + height + 4, { align: 'center' })
  }
  doc.text('0', x - 2, y + height, { align: 'right' })
  doc.text(String(Math.round(maxValue)), x - 2, y + 4, { align: 'right' })

  drawLegendRow(doc, x, y + height + 10, [
    { label: 'Thực tế', color: '#3b82f6' },
    ...(hasExpected ? [{ label: 'Kỳ vọng', color: '#9ca3af' }] : []),
  ])
}

function drawPieSlice(doc: jsPDF, cx: number, cy: number, radius: number, startAngle: number, endAngle: number, color: string): void {
  const sweepDeg = ((endAngle - startAngle) * 180) / Math.PI
  const steps = Math.max(2, Math.ceil(sweepDeg / 3))
  const points: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + ((endAngle - startAngle) * i) / steps
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  const deltas: [number, number][] = [[points[0][0] - cx, points[0][1] - cy]]
  for (let i = 1; i < points.length; i++) {
    deltas.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]])
  }
  doc.setFillColor(color)
  doc.lines(deltas, cx, cy, [1, 1], 'F', true)
}

function drawPieChart(doc: jsPDF, cx: number, cy: number, radius: number, slices: { value: number; color: string }[]): void {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#9ca3af')
    doc.text('Không có defect nào.', cx, cy, { align: 'center' })
    return
  }
  let startAngle = -Math.PI / 2
  for (const slice of slices) {
    if (slice.value <= 0) continue
    const sweep = (slice.value / total) * Math.PI * 2
    drawPieSlice(doc, cx, cy, radius, startAngle, startAngle + sweep, slice.color)
    startAngle += sweep
  }
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, pageNum: number, totalPages: number): void {
  doc.setFont(FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor('#9ca3af')
  doc.text(`Được tạo bởi QMS · ${formatDate(new Date().toISOString())}`, pageWidth / 2, pageHeight - 10, { align: 'center' })
  doc.text(`${pageNum}/${totalPages}`, pageWidth - 15, pageHeight - 10, { align: 'right' })
}

export type GenerateReportPdfInput = {
  projectName: string
  release: Release
  burndown: BurndownPoint[]
  openDefectsCount: number
  severityCounts: Record<DefectSeverity, number>
  statusCounts: Record<DefectStatus, number>
  defects: DefectListItem[]
  passRate: number
}

export function generateReportPdf(input: GenerateReportPdfInput): void {
  const { projectName, release, burndown, openDefectsCount, severityCounts, statusCounts, defects, passRate } = input

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  registerVietnameseFont(doc)

  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 15
  const contentWidth = pageWidth - marginX * 2
  let y = 18

  doc.setFont(FONT, 'bold')
  doc.setFontSize(18)
  doc.setTextColor('#111827')
  doc.text('Release Report', marginX, y)
  y += 7
  doc.setFont(FONT, 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#6b7280')
  doc.text(`${projectName} · ${release.version_name}`, marginX, y)
  y += 5
  doc.text(`Ngày xuất: ${formatDate(new Date().toISOString())}`, marginX, y)
  y += 4
  doc.setDrawColor('#e5e7eb')
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 8

  y = ensureSpace(doc, y, 20)
  drawKpiRow(doc, marginX, y, contentWidth, [
    { label: 'PASS RATE', value: `${passRate}%` },
    { label: 'TỔNG SỐ TEST CASE', value: String(release.total_test_cases) },
  ])
  y += 22

  y = ensureSpace(doc, y, 24)
  sectionHeading(doc, marginX, y, 'Tiến độ thực thi')
  y += 4
  drawStackedBar(doc, marginX, y, contentWidth, 6, [
    { value: release.pass_count, color: '#10b981' },
    { value: release.fail_count, color: '#ef4444' },
    { value: release.not_run_count, color: '#3b82f6' },
  ])
  y += 10
  drawLegendRow(doc, marginX, y, [
    { label: `Pass (${release.pass_count})`, color: '#10b981' },
    { label: `Fail (${release.fail_count})`, color: '#ef4444' },
    { label: `Not Run (${release.not_run_count})`, color: '#3b82f6' },
  ])
  y += 14

  y = ensureSpace(doc, y, 60)
  sectionHeading(doc, marginX, y, 'Burn-down')
  y += 4
  drawBurndownChart(doc, marginX, y, contentWidth, 45, burndown)
  y += 65

  y = ensureSpace(doc, y, 20)
  drawKpiRow(doc, marginX, y, contentWidth, [
    { label: 'OPEN DEFECTS', value: String(openDefectsCount) },
    { label: 'CRITICAL DEFECTS', value: String(severityCounts.Critical) },
    { label: 'HIGH DEFECTS', value: String(severityCounts.High) },
  ])
  y += 22

  y = ensureSpace(doc, y, 55)
  sectionHeading(doc, marginX, y, 'Defects theo mức độ (chưa đóng)')
  y += 4
  drawVerticalBarChart(
    doc,
    marginX,
    y,
    contentWidth,
    38,
    SEVERITIES.map((s) => ({ label: s, value: severityCounts[s], color: SEVERITY_COLORS[s] })),
  )
  y += 46

  y = ensureSpace(doc, y, 60)
  sectionHeading(doc, marginX, y, 'Defects theo trạng thái')
  y += 6
  const pieRadius = 20
  const pieCx = marginX + pieRadius + 2
  const pieCy = y + pieRadius
  drawPieChart(
    doc,
    pieCx,
    pieCy,
    pieRadius,
    STATUSES.map((s) => ({ value: statusCounts[s], color: STATUS_COLORS[s] })),
  )
  let legendY = y + 4
  const legendX = pieCx + pieRadius + 14
  for (const s of STATUSES) {
    doc.setFillColor(STATUS_COLORS[s])
    doc.rect(legendX, legendY - 3, 3, 3, 'F')
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor('#374151')
    doc.text(`${s} (${statusCounts[s]})`, legendX + 5, legendY)
    legendY += 6
  }
  y += pieRadius * 2 + 10

  autoTable(doc, {
    startY: y,
    head: [['Tiêu đề', 'Mô tả', 'Mức độ', 'Trạng thái', 'Người phụ trách']],
    body: defects.map((d) => [
      d.title,
      truncate(d.description ?? '', 80),
      d.severity ?? '—',
      d.status,
      d.assignee_name ?? 'Chưa gán',
    ]),
    styles: { font: FONT, fontSize: 8, cellPadding: 2, textColor: '#111827' },
    headStyles: { font: FONT, fontStyle: 'bold', fillColor: '#111827', textColor: '#ffffff' },
    alternateRowStyles: { fillColor: '#f9fafb' },
    margin: { left: marginX, right: marginX, bottom: 18 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 60 },
    },
  })

  const pageHeight = doc.internal.pageSize.getHeight()
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawFooter(doc, pageWidth, pageHeight, i, totalPages)
  }

  doc.save(`release-report-${release.version_name}-${todayFileStamp()}.pdf`)
}
