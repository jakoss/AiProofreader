import { createFileRoute } from '@tanstack/react-router'
import { Check, Clipboard, Copy, Loader2, RefreshCw, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ChangeViewer } from '../components/ChangeViewer'
import { buildChangeSegments } from '../lib/diff'
import { proofreadModes, type ProofreadMode } from '../lib/modes'
import type { ModelInfo, ProofreadResponse } from '../lib/types'

export const Route = createFileRoute('/')({
  component: ProofreaderApp,
})

type ResultView = 'changes' | 'rawDiff'

function ProofreaderApp() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<ProofreadMode>('typos')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modelsError, setModelsError] = useState('')
  const [correctedText, setCorrectedText] = useState('')
  const [resultView, setResultView] = useState<ResultView>('changes')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void loadModels()
  }, [])

  async function loadModels() {
    setModelsLoading(true)
    setModelsError('')

    try {
      const response = await fetch('/api/models')
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load models.')
      }

      const nextModels = Array.isArray(payload.models) ? payload.models : []
      setModels(nextModels)
      setModel((current) => current || nextModels[0]?.id || '')
    } catch (nextError) {
      setModelsError(getMessage(nextError, 'Unable to load models from model provider.'))
    } finally {
      setModelsLoading(false)
    }
  }

  async function handleProofread() {
    setError('')
    setCopied(false)

    if (!text.trim()) {
      setError('Enter text to proofread.')
      return
    }

    if (!model) {
      setError('Select a model before proofreading.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/proofread', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, mode, model }),
      })
      const payload = (await response.json()) as ProofreadResponse & { error?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Proofreading failed.')
      }

      if (typeof payload.correctedText !== 'string') {
        throw new Error('Model provider returned an invalid proofreading response.')
      }

      setCorrectedText(payload.correctedText)
      setResultView('changes')
    } catch (nextError) {
      setError(getMessage(nextError, 'Proofreading failed.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!correctedText) return

    await navigator.clipboard.writeText(correctedText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const segments = useMemo(
    () => buildChangeSegments(text, correctedText),
    [text, correctedText],
  )

  const activeMode = proofreadModes.find((item) => item.id === mode)

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Proofreader</h1>
          <p>Clean up emails, docs, specs, and business messages with your configured LLMs.</p>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={loadModels}
          disabled={modelsLoading}
          title="Refresh models"
          aria-label="Refresh models"
        >
          <RefreshCw size={18} />
        </button>
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

            <div className="field-grid">
              <label className="field">
                <span>Model</span>
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={modelsLoading || models.length === 0}
                >
                  <option value="">
                    {modelsLoading ? 'Loading models...' : 'Select a model'}
                  </option>
                  {models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="primary-action"
                type="button"
                onClick={handleProofread}
                disabled={loading || modelsLoading}
              >
                {loading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
                Proofread
              </button>
            </div>

            {modelsError ? <p className="status-error">{modelsError}</p> : null}
            {error ? <p className="status-error">{error}</p> : null}
          </div>
        </section>

        <section className="panel result-panel" aria-labelledby="result-title">
          <div className="panel-header result-header">
            <div>
              <h2 id="result-title">Results</h2>
              <p>{correctedText ? 'Review changes and copy the corrected text.' : 'Results appear here.'}</p>
            </div>
            <div className="view-toggle" role="tablist" aria-label="Result view">
              <button
                type="button"
                className={resultView === 'changes' ? 'selected' : ''}
                onClick={() => setResultView('changes')}
                role="tab"
                aria-selected={resultView === 'changes'}
              >
                Changes
              </button>
              <button
                type="button"
                className={resultView === 'rawDiff' ? 'selected' : ''}
                onClick={() => setResultView('rawDiff')}
                role="tab"
                aria-selected={resultView === 'rawDiff'}
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

          <div className="change-output" aria-live="polite">
            {loading ? (
              <div className="empty-state">
                <Loader2 className="spin" size={22} />
                Proofreading...
              </div>
            ) : correctedText ? (
              <ChangeViewer segments={segments} view={resultView} />
            ) : (
              <div className="empty-state">
                <Clipboard size={24} />
                Enter text, choose a mode and model, then run proofreading.
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
                disabled={!correctedText}
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

function getMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
