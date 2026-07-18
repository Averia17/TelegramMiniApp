import {DEPTH} from "./config"

export const lerp = (a, b, t) => a + (b - a) * t

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// Affine 2.5D projection matrix: [ 1  0 ; 0  DEPTH ]. Keeping this in one
// function makes depth keys, aiming and every world-space effect agree.
export const project = (x, y) => ({x, y: y * DEPTH})

