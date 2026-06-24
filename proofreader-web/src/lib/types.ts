export type ProofreadResponse = {
  correctedText: string
}

export type ProofreadStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; correctedText: string }
  | { type: 'error'; error: string }
