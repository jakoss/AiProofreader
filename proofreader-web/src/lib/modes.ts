export const proofreadModes = [
  {
    id: 'typos',
    label: 'Typos',
    description: 'Fix spelling, punctuation, capitalization, and obvious grammar only.',
  },
  {
    id: 'improve',
    label: 'Improve English',
    description: 'Improve grammar, awkward phrasing, readability, and clarity.',
  },
  {
    id: 'lightRewrite',
    label: 'Light Rewrite',
    description: 'Make the text sound more natural, clear, and professional.',
  },
] as const

export type ProofreadMode = (typeof proofreadModes)[number]['id']

export const modeIds = proofreadModes.map((mode) => mode.id)

export const promptTemplates: Record<ProofreadMode, string> = {
  typos: `Proofread the text below.

Fix only typos, punctuation, capitalization, and obvious grammatical errors.
Do not rephrase sentences.
Do not change the tone.
Do not add new information.
Preserve formatting and paragraph structure.

Return only the corrected text.

Text:
{{text}}`,
  improve: `Improve the English in the text below.

Fix grammar, awkward phrasing, and unclear wording.
You may lightly rephrase sentences where needed.
Preserve the original meaning, tone, and structure.
Do not add new information.

Return only the corrected text.

Text:
{{text}}`,
  lightRewrite: `Rewrite the text below to sound natural, clear, and professional.

Preserve the original meaning and intent.
Do not add new information.
Keep paragraph structure where reasonable.

Return only the rewritten text.

Text:
{{text}}`,
}
