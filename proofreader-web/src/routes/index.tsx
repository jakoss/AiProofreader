import { createFileRoute } from '@tanstack/react-router'
import { Check, Clipboard, Copy, Loader2, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChangeViewer } from '../components/ChangeViewer'
import { buildChangeSegments } from '../lib/diff'
import { proofreadModes, type ProofreadMode } from '../lib/modes'
import type { ProofreadStreamEvent } from '../lib/types'

export const Route = createFileRoute('/')({
  component: ProofreaderApp,
})

type ResultView = 'changes' | 'rawDiff'

function ProofreaderApp() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<ProofreadMode>('typos')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [correctedText, setCorrectedText] = useState('')
  const [submittedText, setSubmittedText] = useState('')
  const [resultView, setResultView] = useState<ResultView>('changes')
  const [copied, setCopied] = useState(false)
  const [streamIncomplete, setStreamIncomplete] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])

  async function handleProofread() {
    const requestText = text

    setError('')
    setCopied(false)
    setStreamIncomplete(false)

    if (!requestText.trim()) {
      setError('Enter text to proofread.')
      return
    }

    abortControllerRef.current?.abort()

    const controller = new AbortController()
    abortControllerRef.current = controller
    let accumulatedText = ''
    let completed = false
    let animationFrameId = 0

    function flushCorrectedText() {
      animationFrameId = 0

      if (!mountedRef.current || abortControllerRef.current !== controller) {
        return
      }

      setCorrectedText(accumulatedText)
    }

    function scheduleCorrectedTextFlush() {
      if (animationFrameId) {
        return
      }

      animationFrameId = window.requestAnimationFrame(flushCorrectedText)
    }

    function flushCorrectedTextNow() {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
        animationFrameId = 0
      }

      flushCorrectedText()
    }

    setLoading(true)
    setCorrectedText('')
    setSubmittedText(requestText)
    setResultView('changes')

    try {
      const response = await fetch('/api/proofread', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: requestText, mode, stream: true }),
      })

      if (!response.ok) {
        throw new Error((await readErrorPayload(response)) ?? 'Proofreading failed.')
      }

      await readProofreadStream(response, (event) => {
        if (abortControllerRef.current !== controller) {
          return
        }

        if (event.type === 'delta') {
          accumulatedText += event.text
          scheduleCorrectedTextFlush()
          return
        }

        if (event.type === 'done') {
          completed = true
          accumulatedText = event.correctedText
          flushCorrectedTextNow()
          return
        }

        throw new Error(event.error)
      })

      if (!completed) {
        throw new Error('Proofreading stream ended before completion.')
      }
    } catch (nextError) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        abortControllerRef.current !== controller
      ) {
        return
      }

      if (accumulatedText) {
        setStreamIncomplete(true)
      }

      setError(getMessage(nextError, 'Proofreading failed.'))
    } finally {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      if (mountedRef.current && abortControllerRef.current === controller) {
        setCorrectedText(accumulatedText)
        setLoading(false)
        abortControllerRef.current = null
      }
    }
  }

  async function handleCopy() {
    if (!correctedText || loading || streamIncomplete) return

    await navigator.clipboard.writeText(correctedText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const segments = useMemo(
    () => buildChangeSegments(submittedText || text, correctedText, { streaming: loading }),
    [submittedText, text, correctedText, loading],
  )

  const activeMode = proofreadModes.find((item) => item.id === mode)
  const visibleResultView = loading ? 'changes' : resultView

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Proofreader</h1>
          <p>Clean up emails, docs, specs, and business messages with your configured LLMs.</p>
        </div>
      </header>

      <section className="workspace" aria-label="Proofreader workspace">
        <section className="panel input-panel" aria-labelledby="input-title">
          <div className="panel-header">
            <div>
              <h2 id="input-title">Input</h2>
              <p>{text.length.toLocaleString()} characters</p>
            </div>
          </div>

          <textarea
            className="text-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste the text you want to proofread..."
            spellCheck
          />

          <div className="controls">
            <div className="field-group">
              <label>Mode</label>
              <div className="segmented-control" role="radiogroup" aria-label="Proofreading mode">
                {proofreadModes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === mode ? 'selected' : ''}
                    onClick={() => setMode(item.id)}
                    role="radio"
                    aria-checked={item.id === mode}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="mode-description">{activeMode?.description}</p>
            </div>

            <div className="action-row">
              <button
                className="primary-action"
                type="button"
                onClick={handleProofread}
                disabled={loading}
              >
                {loading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
                Proofread
              </button>
            </div>

            {error ? <p className="status-error">{error}</p> : null}
          </div>
        </section>

        <section className="panel result-panel" aria-labelledby="result-title">
          <div className="panel-header result-header">
            <div>
              <h2 id="result-title">Results</h2>
              <p>
                {loading
                  ? correctedText
                    ? 'Streaming changes as the model responds.'
                    : 'Waiting for model output...'
                  : streamIncomplete
                    ? 'Partial result shown. Run proofreading again for a complete result.'
                    : correctedText
                      ? 'Review changes and copy the corrected text.'
                      : 'Results appear here.'}
              </p>
            </div>
            <div className="view-toggle" role="tablist" aria-label="Result view">
              <button
                type="button"
                className={visibleResultView === 'changes' ? 'selected' : ''}
                onClick={() => setResultView('changes')}
                disabled={loading}
                role="tab"
                aria-selected={visibleResultView === 'changes'}
              >
                Changes
              </button>
              <button
                type="button"
                className={visibleResultView === 'rawDiff' ? 'selected' : ''}
                onClick={() => setResultView('rawDiff')}
                disabled={loading}
                role="tab"
                aria-selected={visibleResultView === 'rawDiff'}
              >
                Raw Diff
              </button>
            </div>
          </div>

          <div className="legend" aria-label="Change legend">
            <span><i className="legend-dot changed" />Changed</span>
            <span><i className="legend-dot added" />Added</span>
            <span><i className="legend-dot removed" />Removed</span>
          </div>

          <div className="change-output" aria-live="polite" aria-busy={loading}>
            {correctedText ? (
              <>
                {loading ? (
                  <div className="stream-status">
                    <Loader2 className="spin" size={16} />
                    Streaming changes...
                  </div>
                ) : null}
                {streamIncomplete ? (
                  <div className="stream-status incomplete">
                    Stream ended before completion. Partial result is shown.
                  </div>
                ) : null}
                <ChangeViewer segments={segments} view={visibleResultView} />
              </>
            ) : loading ? (
              <div className="empty-state">
                <Loader2 className="spin" size={22} />
                Proofreading...
              </div>
            ) : (
              <div className="empty-state">
                <Clipboard size={24} />
                Enter text, choose a mode, then run proofreading.
              </div>
            )}
          </div>

          <section className="corrected-section" aria-labelledby="corrected-title">
            <div className="corrected-header">
              <h3 id="corrected-title">Corrected Text</h3>
              <button
                className="copy-button"
                type="button"
                onClick={handleCopy}
                disabled={!correctedText || loading || streamIncomplete}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="corrected-text">{correctedText || 'No corrected text yet.'}</pre>
          </section>
        </section>
      </section>
    </main>
  )
}

async function readProofreadStream(
  response: Response,
  onEvent: (event: ProofreadStreamEvent) => void,
) {
  const reader = response.body?.getReader()

  if (!reader) {
    throw new Error('Proofreading stream is unavailable.')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      buffer = drainProofreadStreamBuffer(buffer, onEvent)
    }

    buffer += decoder.decode()
    const lastLine = buffer.trim()

    if (lastLine) {
      onEvent(parseProofreadStreamEvent(lastLine))
    }
  } finally {
    reader.releaseLock()
  }
}

function drainProofreadStreamBuffer(
  buffer: string,
  onEvent: (event: ProofreadStreamEvent) => void,
) {
  let lineEnd = buffer.indexOf('\n')

  while (lineEnd !== -1) {
    const line = buffer.slice(0, lineEnd).trim()

    if (line) {
      onEvent(parseProofreadStreamEvent(line))
    }

    buffer = buffer.slice(lineEnd + 1)
    lineEnd = buffer.indexOf('\n')
  }

  return buffer
}

function parseProofreadStreamEvent(line: string): ProofreadStreamEvent {
  let payload: unknown

  try {
    payload = JSON.parse(line)
  } catch {
    throw new Error('Proofreading stream returned invalid JSON.')
  }

  if (!isRecord(payload) || typeof payload.type !== 'string') {
    throw new Error('Proofreading stream returned an invalid event.')
  }

  if (payload.type === 'delta' && typeof payload.text === 'string') {
    return { type: 'delta', text: payload.text }
  }

  if (payload.type === 'done' && typeof payload.correctedText === 'string') {
    return { type: 'done', correctedText: payload.correctedText }
  }

  if (payload.type === 'error' && typeof payload.error === 'string') {
    return { type: 'error', error: payload.error }
  }

  throw new Error('Proofreading stream returned an invalid event.')
}

async function readErrorPayload(response: Response) {
  const payload = (await response.json().catch(() => null)) as unknown

  if (isRecord(payload) && typeof payload.error === 'string') {
    return payload.error
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
