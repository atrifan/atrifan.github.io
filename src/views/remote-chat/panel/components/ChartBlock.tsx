import { useRef, useEffect, useState } from "react"
import { Chart, registerables } from "chart.js"

// Register all Chart.js components (tree-shaken at build time via chart.js)
Chart.register(...registerables)

interface Props {
  config: unknown
}

export function ChartBlock({ config }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    // Validate config shape
    if (
      !config ||
      typeof config !== "object" ||
      !("type" in config) ||
      !("data" in config)
    ) {
      setError("Invalid chart config: must have 'type' and 'data' properties")
      return
    }

    try {
      // Destroy previous chart if it exists
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }

      const chartConfig = config as {
        type: string
        data: object
        options?: object
      }

      // Axis labels and grid lines follow the page theme tokens (Chart.js defaults are light-only).
      const css = getComputedStyle(canvasRef.current)
      Chart.defaults.color = css.getPropertyValue("--color-text-muted").trim() || Chart.defaults.color
      Chart.defaults.borderColor = css.getPropertyValue("--color-border").trim() || Chart.defaults.borderColor

      chartRef.current = new Chart(canvasRef.current, {
        type: chartConfig.type as any,
        data: chartConfig.data as any,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          ...(chartConfig.options as any),
        },
      })

      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to render chart")
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [config])

  if (error) {
    return (
      <div className="chart-block chart-block-error">
        <div className="chart-block-error-label">Chart error: {error}</div>
        <pre className="chart-block-fallback">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <div className="chart-block">
      <canvas ref={canvasRef} />
    </div>
  )
}
