import { diffWordsWithSpace } from 'diff'

export type ChangeSegment =
  | { type: 'equal'; text: string }
  | { type: 'insert'; text: string }
  | { type: 'delete'; text: string }
  | { type: 'replace'; before: string; after: string }

type BuildChangeSegmentsOptions = {
  streaming?: boolean
}

export function buildChangeSegments(
  original: string,
  corrected: string,
  options: BuildChangeSegmentsOptions = {},
): ChangeSegment[] {
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

  const merged = mergeSplitReplacements(mergeAdjacentSegments(segments))
  return options.streaming ? stripTrailingDeletes(merged) : merged
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

function mergeSplitReplacements(segments: ChangeSegment[]): ChangeSegment[] {
  const merged: ChangeSegment[] = []

  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index]
    const next = segments[index + 1]
    const following = segments[index + 2]

    if (
      current.type === 'replace' &&
      next?.type === 'equal' &&
      isWhitespaceOnly(next.text) &&
      following?.type === 'insert'
    ) {
      merged.push({
        type: 'replace',
        before: current.before,
        after: current.after + next.text + following.text,
      })
      index += 2
      continue
    }

    if (
      current.type === 'delete' &&
      next?.type === 'equal' &&
      isWhitespaceOnly(next.text) &&
      following?.type === 'replace'
    ) {
      merged.push({
        type: 'replace',
        before: current.text + next.text + following.before,
        after: following.after,
      })
      index += 2
      continue
    }

    merged.push(current)
  }

  return merged
}

function isWhitespaceOnly(text: string) {
  return text.length > 0 && text.trim() === ''
}

function stripTrailingDeletes(segments: ChangeSegment[]) {
  let lastIncludedIndex = segments.length - 1

  while (lastIncludedIndex >= 0 && segments[lastIncludedIndex].type === 'delete') {
    lastIncludedIndex -= 1
  }

  return segments.slice(0, lastIncludedIndex + 1)
}
