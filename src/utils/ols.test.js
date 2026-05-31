import { describe, it, expect } from 'vitest'
import { transpose, multiply, invertMatrix, solveOLS } from './ols'

describe('ols matrix utilities', () => {
  it('should transpose matrices correctly', () => {
    const A = [
      [1, 2, 3],
      [4, 5, 6],
    ]
    const expected = [
      [1, 4],
      [2, 5],
      [3, 6],
    ]
    expect(transpose(A)).toEqual(expected)
  })

  it('should multiply matrices correctly', () => {
    const A = [
      [1, 2],
      [3, 4],
    ]
    const B = [
      [2, 0],
      [1, 2],
    ]
    const expected = [
      [4, 4],
      [10, 8],
    ]
    expect(multiply(A, B)).toEqual(expected)
  })

  it('should invert non-singular matrices correctly', () => {
    const M = [
      [4, 7],
      [2, 6],
    ]
    const inv = invertMatrix(M)
    expect(inv).not.toBeNull()

    // Check that M * M^-1 = Identity
    const product = multiply(M, inv)
    expect(product[0][0]).toBeCloseTo(1)
    expect(product[0][1]).toBeCloseTo(0)
    expect(product[1][0]).toBeCloseTo(0)
    expect(product[1][1]).toBeCloseTo(1)
  })

  it('should return null for singular matrices', () => {
    const singular = [
      [1, 2],
      [2, 4],
    ]
    expect(invertMatrix(singular)).toBeNull()
  })

  it('should solve OLS coefficients correctly for linear regression', () => {
    // Model: y = 2x + 1
    // Points: (0, 1), (1, 3), (2, 5)
    const y = [1, 3, 5]
    const X = [
      [1, 0],
      [1, 1],
      [1, 2],
    ] // [Intercept, X_val]

    const coefficients = solveOLS(y, X)
    expect(coefficients).not.toBeNull()
    expect(coefficients[0]).toBeCloseTo(1) // Intercept
    expect(coefficients[1]).toBeCloseTo(2) // Slope
  })
})
