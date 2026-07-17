import {DEPTH} from "./config"

export const lerp = (a, b, t) => a + (b - a) * t

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const project = (x, y) => ({x, y: y * DEPTH})

export const colorFromCss = (value, fallback) => {
  if (typeof value !== "string") return fallback
  const parsed = Number.parseInt(value.replace("#", ""), 16)
  return Number.isNaN(parsed) ? fallback : parsed
}

export const ellipse = (graphics, color, x, y, width, height, alpha = 1) => {
  graphics.beginFill(color, alpha)
  graphics.drawEllipse(x, y, width, height)
  graphics.endFill()
}

export const rounded = (graphics, color, x, y, width, height, radius, alpha = 1) => {
  graphics.beginFill(color, alpha)
  graphics.drawRoundedRect(x, y, width, height, radius)
  graphics.endFill()
}

export const starPoints = (centerX, centerY, points, outerRadius, innerRadius) => {
  const vertices = []
  for (let index = 0; index < points * 2; index += 1) {
    const angle = index * Math.PI / points - Math.PI / 2
    const radius = index % 2 === 0 ? outerRadius : innerRadius
    vertices.push(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius)
  }
  return vertices
}

export const destroyChildren = container => {
  container.removeChildren().forEach(child => child.destroy({children: true}))
}
