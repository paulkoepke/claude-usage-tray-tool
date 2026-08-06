import { createCanvas, loadImage } from '@napi-rs/canvas'
import { nativeImage, type NativeImage } from 'electron'
import trayMascotAsset from '../../resources/tray-mascot.png?asset'

const SIZE = 32
const MASCOT_SIZE = 18

function colorForPercent(percent: number): string {
  if (percent > 80) return '#e5484d'
  if (percent >= 50) return '#f5a623'
  return '#30a46c'
}

type MascotImage = Awaited<ReturnType<typeof loadImage>>

let mascotImagePromise: Promise<MascotImage> | null = null

function getMascotImage(): Promise<MascotImage> {
  if (!mascotImagePromise) {
    mascotImagePromise = loadImage(trayMascotAsset)
  }
  return mascotImagePromise
}

/**
 * Draws the mascot with a surrounding 32x32 progress ring for the tray icon.
 */
export async function renderProgressIcon(percent: number): Promise<NativeImage> {
  const clamped = Math.min(100, Math.max(0, percent))
  const canvas = createCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')

  const center = SIZE / 2
  const radius = SIZE / 2 - 3
  const lineWidth = 4
  const startAngle = -Math.PI / 2
  const endAngle = startAngle + (clamped / 100) * Math.PI * 2

  ctx.clearRect(0, 0, SIZE, SIZE)

  const mascot = await getMascotImage()
  const mascotOffset = (SIZE - MASCOT_SIZE) / 2
  ctx.drawImage(mascot, mascotOffset, mascotOffset, MASCOT_SIZE, MASCOT_SIZE)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.arc(center, center, radius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = colorForPercent(clamped)
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(center, center, radius, startAngle, endAngle)
  ctx.stroke()

  const buffer = canvas.toBuffer('image/png')
  return nativeImage.createFromBuffer(buffer)
}
