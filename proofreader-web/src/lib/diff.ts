import { diffWordsWithSpace } from 'diff'

export type ChangeSegment =
  | { type: 'equal'; text: string }
  | { type: 'insert'; text: string }
  | { type: 'delete'; text: string }
  | { type: 'replace'; before: string; after: string }

export function buildChangeSegments(original: string, corrected: string): ChangeSegment[] {
  if (!corrected) return []

  const parts = diffWordsWithSpace(original, corrected)
  const segments: ChangeSegment[] = []

  for (let index = 0; index < parts.length; index += 1) {
    const current = parts[index]
    const next = parts[index + 1]

    if (current.removed && next?.added) {
      segments.push({
        type: 'replace',
        before: current.value,
        after: next.value,
      })
      index += 1
      continue
    }

    if (current.added) {
      segments.push({ type: 'insert', text: current.value })
      continue
    }

    if (current.removed) {
      segments.push({ type: 'delete', text: current.value })
      continue
    }

    segments.push({ type: 'equal', text: current.value })
  }

  return mergeAdjacentSegments(segments)
}

function mergeAdjacentSegments(segments: ChangeSegment[]): ChangeSegment[] {
  const merged: ChangeSegment[] = []

  for (const segment of segments) {
    const previous = merged[merged.length - 1]

    if (!previous) {
      merged.push(segment)
      continue
    }

    if (previous.type === 'equal' && segment.type === 'equal') {
      previous.text += segment.text
      continue
    }

    if (previous.type === 'insert' && segment.type === 'insert') {
      previous.text += segment.text
      continue
    }

    if (previous.type === 'delete' && segment.type === 'delete') {
      previous.text += segment.text
      continue
    }

    if (previous.type === 'replace' && segment.type === 'replace') {
      previous.before += segment.before
      previous.after += segment.after
      continue
    }

    merged.push(segment)
  }

  return merged
}
