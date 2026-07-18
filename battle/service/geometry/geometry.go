package geometry

import (
	"math"
	"math/rand"
)

type Vector2 struct {
	X float64
	Y float64
}

type CircleBody struct {
	X      float64
	Y      float64
	Radius float64
}

func (c *CircleBody) Left() float64   { return c.X - c.Radius }
func (c *CircleBody) Top() float64    { return c.Y - c.Radius }
func (c *CircleBody) Right() float64  { return c.X + c.Radius }
func (c *CircleBody) Bottom() float64 { return c.Y + c.Radius }

func (c *CircleBody) Box() *RectangleBody {
	return &RectangleBody{
		X:      c.X - c.Radius,
		Y:      c.Y - c.Radius,
		Width:  c.Radius * 2,
		Height: c.Radius * 2,
	}
}

type RectangleBody struct {
	X      float64
	Y      float64
	Width  float64
	Height float64
}

func (r *RectangleBody) Left() float64    { return r.X }
func (r *RectangleBody) Top() float64     { return r.Y }
func (r *RectangleBody) Right() float64   { return r.X + r.Width }
func (r *RectangleBody) Bottom() float64  { return r.Y + r.Height }
func (r *RectangleBody) CenterX() float64 { return r.X + r.Width/2 }
func (r *RectangleBody) CenterY() float64 { return r.Y + r.Height/2 }

func (r *RectangleBody) SetRight(v float64)  { r.X = v - r.Width }
func (r *RectangleBody) SetBottom(v float64) { r.Y = v - r.Height }
func (r *RectangleBody) SetLeft(v float64)   { r.X = v }
func (r *RectangleBody) SetTop(v float64)    { r.Y = v }

func CalculateAngle(x1, y1, x2, y2 float64) float64 {
	return math.Atan2(y1-y2, x1-x2)
}

func GetDistance(x1, y1, x2, y2 float64) float64 {
	return math.Hypot(x2-x1, y2-y1)
}

func Clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func Normalize2D(ax, ay float64) float64 {
	return math.Sqrt(ax*ax + ay*ay)
}

func Round2Digits(v float64) float64 {
	return math.Round(math.Round(v*1000)/10) / 100
}

func GetRandomInt(min, max int) int {
	if min >= max {
		return min
	}
	return rand.Intn(max-min+1) + min
}

func GetRandomFloat(min, max float64) float64 {
	return min + (max-min)*rand.Float64()
}

func ShuffleStrings(arr []string) []string {
	result := make([]string, len(arr))
	copy(result, arr)
	for i := len(result) - 1; i > 0; i-- {
		j := rand.Intn(i + 1)
		result[i], result[j] = result[j], result[i]
	}
	return result
}
