export function transpose(A) {
  return A[0].map((_, colIdx) => A.map((row) => row[colIdx]))
}

export function multiply(A, B) {
  const numRowsA = A.length
  const numColsA = A[0].length
  const numColsB = B[0].length
  const result = Array(numRowsA)
    .fill(0)
    .map(() => Array(numColsB).fill(0))
  for (let r = 0; r < numRowsA; r++) {
    for (let c = 0; c < numColsB; c++) {
      for (let i = 0; i < numColsA; i++) {
        result[r][c] += A[r][i] * B[i][c]
      }
    }
  }
  return result
}

export function invertMatrix(M) {
  const n = M.length
  const A = M.map((row, i) => [
    ...row,
    ...Array(n)
      .fill(0)
      .map((_, j) => (i === j ? 1 : 0)),
  ])
  for (let i = 0; i < n; i++) {
    let pivotRow = i
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[pivotRow][i])) {
        pivotRow = r
      }
    }
    const temp = A[i]
    A[i] = A[pivotRow]
    A[pivotRow] = temp

    const pivot = A[i][i]
    if (Math.abs(pivot) < 1e-10) return null
    for (let j = 0; j < 2 * n; j++) {
      A[i][j] /= pivot
    }
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const factor = A[r][i]
      for (let j = 0; j < 2 * n; j++) {
        A[r][j] -= factor * A[i][j]
      }
    }
  }
  return A.map((row) => row.slice(n))
}

export function solveOLS(y, X) {
  try {
    const XT = transpose(X)
    const XTX = multiply(XT, X)
    const XTX_inv = invertMatrix(XTX)
    if (!XTX_inv) return null
    return multiply(
      XTX_inv,
      multiply(
        XT,
        y.map((v) => [v])
      )
    ).map((v) => v[0])
  } catch {
    return null
  }
}
