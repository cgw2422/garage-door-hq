'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Signature capture.
 *
 * Pointer events cover finger, stylus and mouse with one code path. The canvas
 * is sized to its container at the device pixel ratio so a signature does not
 * come out blurry on a phone, and it is redrawn on resize rather than cleared,
 * because losing a customer's signature to a rotation is not acceptable.
 */
export function SignaturePad({
  onChange,
  height = 180,
  label = 'Customer signature',
}: {
  onChange: (dataUrl: string | null) => void
  height?: number
  label?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const strokes = useRef<Array<Array<{ x: number; y: number }>>>([])
  const [hasInk, setHasInk] = useState(false)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    context.scale(ratio, ratio)

    context.clearRect(0, 0, width, height)
    context.lineWidth = 2.2
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#0f172a'

    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue
      context.beginPath()
      context.moveTo(stroke[0]!.x, stroke[0]!.y)
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y)
      context.stroke()
    }
  }, [height])

  useEffect(() => {
    redraw()
    window.addEventListener('resize', redraw)
    return () => window.removeEventListener('resize', redraw)
  }, [redraw])

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function emit() {
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(strokes.current.length > 0 ? canvas.toDataURL('image/png') : null)
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[0.8125rem] font-semibold text-ink-muted">{label}</span>
        {hasInk ? (
          <button
            type="button"
            onClick={() => {
              strokes.current = []
              setHasInk(false)
              redraw()
              onChange(null)
            }}
            className="text-[0.8125rem] font-semibold text-brand-600"
          >
            Clear
          </button>
        ) : null}
      </div>

      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        style={{ height, touchAction: 'none' }}
        className="w-full rounded-[--radius-control] border border-hairline-strong bg-white"
        onPointerDown={(event) => {
          // Capture keeps a stroke tracking when a finger drifts off the pad.
          // Some input paths reject it; drawing must not depend on it.
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            /* not capturable — the pointerleave handler still ends the stroke */
          }
          drawing.current = true
          strokes.current.push([pointFrom(event)])
          setHasInk(true)
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return
          strokes.current[strokes.current.length - 1]?.push(pointFrom(event))
          redraw()
        }}
        onPointerUp={() => {
          drawing.current = false
          emit()
        }}
        onPointerLeave={() => {
          if (!drawing.current) return
          drawing.current = false
          emit()
        }}
      />

      {!hasInk ? (
        <p className="mt-1.5 text-center text-xs text-ink-subtle">Sign above with your finger</p>
      ) : null}
    </div>
  )
}
