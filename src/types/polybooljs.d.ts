declare module 'polybooljs' {
  export interface PolyBoolRegion {
    regions: number[][][]
    inverted?: boolean
  }

  export interface PolyBoolSegments {
    segments: unknown[]
    isInverted: boolean
  }

  const PolyBool: {
    epsilon(epsilon?: number): number
    segments(poly: PolyBoolRegion): PolyBoolSegments
    polygon(segments: PolyBoolSegments): PolyBoolRegion
    combine(seg1: PolyBoolSegments, seg2: PolyBoolSegments): {
      combined: unknown[]
      isInverted: boolean
    }
    selectUnion(combined: { combined: unknown[]; isInverted: boolean }): PolyBoolSegments
    selectIntersect(combined: { combined: unknown[]; isInverted: boolean }): PolyBoolSegments
    selectDifference(combined: { combined: unknown[]; isInverted: boolean }): PolyBoolSegments
  }

  export default PolyBool
}
