package geometry

import (
	"math"
	"testing"
)

func TestCircleBodyBounds(t *testing.T) {
	c := &CircleBody{X: 100, Y: 200, Radius: 16}

	if c.Left() != 84 {
		t.Errorf("Left() = %v, want 84", c.Left())
	}
	if c.Top() != 184 {
		t.Errorf("Top() = %v, want 184", c.Top())
	}
	if c.Right() != 116 {
		t.Errorf("Right() = %v, want 116", c.Right())
	}
	if c.Bottom() != 216 {
		t.Errorf("Bottom() = %v, want 216", c.Bottom())
	}
}

func TestCircleBodyBox(t *testing.T) {
	c := &CircleBody{X: 50, Y: 50, Radius: 10}
	box := c.Box()

	if box.X != 40 || box.Y != 40 || box.Width != 20 || box.Height != 20 {
		t.Errorf("Box() = %+v, want {X:40 Y:40 Width:20 Height:20}", box)
	}
}

func TestRectangleBodyBounds(t *testing.T) {
	r := &RectangleBody{X: 10, Y: 20, Width: 30, Height: 40}

	if r.Left() != 10 {
		t.Errorf("Left() = %v, want 10", r.Left())
	}
	if r.CenterX() != 25 {
		t.Errorf("CenterX() = %v, want 25", r.CenterX())
	}
}

func TestCalculateAngle(t *testing.T) {
	tests := []struct {
		x1, y1, x2, y2 float64
		want            float64
	}{
		{1, 0, 0, 0, 0},
		{0, 1, 0, 0, math.Pi / 2},
	}
	for _, tt := range tests {
		got := CalculateAngle(tt.x1, tt.y1, tt.x2, tt.y2)
		if math.Abs(got-tt.want) > 1e-10 {
			t.Errorf("CalculateAngle(%v,%v,%v,%v) = %v, want %v", tt.x1, tt.y1, tt.x2, tt.y2, got, tt.want)
		}
	}
}

func TestGetDistance(t *testing.T) {
	got := GetDistance(0, 0, 3, 4)
	if got != 5 {
		t.Errorf("GetDistance = %v, want 5", got)
	}
}

func TestClamp(t *testing.T) {
	if Clamp(5, 0, 10) != 5 {
		t.Error("Clamp(5,0,10) != 5")
	}
	if Clamp(-1, 0, 10) != 0 {
		t.Error("Clamp(-1,0,10) != 0")
	}
	if Clamp(15, 0, 10) != 10 {
		t.Error("Clamp(15,0,10) != 10")
	}
}

func TestGetRandomInt(t *testing.T) {
	for i := 0; i < 100; i++ {
		got := GetRandomInt(5, 10)
		if got < 5 || got > 10 {
			t.Errorf("GetRandomInt(5,10) = %v, out of range", got)
		}
	}
}
