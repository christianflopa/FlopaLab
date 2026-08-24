import type { ParsedSvg } from '../../models/ParsedSvg'

const parsedByDesign = new Map<string, ParsedSvg>()

export function setParsedSvg(designId: string, parsed: ParsedSvg) {
  parsedByDesign.set(designId, parsed)
}

export function getParsedSvg(designId: string): ParsedSvg | undefined {
  return parsedByDesign.get(designId)
}

export function removeParsedSvg(designId: string) {
  parsedByDesign.delete(designId)
}
