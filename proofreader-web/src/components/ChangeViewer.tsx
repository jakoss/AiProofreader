import type { ChangeSegment } from '../lib/diff'

type ChangeViewerProps = {
  segments: ChangeSegment[]
  view: 'changes' | 'rawDiff'
}

export function ChangeViewer({ segments, view }: ChangeViewerProps) {
  if (view === 'rawDiff') {
    return (
      <div className="diff-text">
        {segments.map((segment, index) => {
          if (segment.type === 'equal') {
            return <span key={index}>{segment.text}</span>
          }

          if (segment.type === 'replace') {
            return (
              <span key={index}>
                <span className="diff-token removed">[-{segment.before}-]</span>
                <span className="diff-token added">[+{segment.after}+]</span>
              </span>
            )
          }

          if (segment.type === 'insert') {
            return (
              <span key={index} className="diff-token added">
                [+{segment.text}+]
              </span>
            )
          }

          return (
            <span key={index} className="diff-token removed">
              [-{segment.text}-]
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="change-text">
      {segments.map((segment, index) => {
        if (segment.type === 'equal') {
          return <span key={index}>{segment.text}</span>
        }

        if (segment.type === 'replace') {
          return (
            <span key={index} className="change-token changed">
              {segment.before} <span aria-hidden="true">-&gt;</span> {segment.after}
            </span>
          )
        }

        if (segment.type === 'insert') {
          return (
            <span key={index} className="change-token added">
              {segment.text}
            </span>
          )
        }

        return (
          <span key={index} className="change-token removed">
            {segment.text}
          </span>
        )
      })}
    </div>
  )
}
