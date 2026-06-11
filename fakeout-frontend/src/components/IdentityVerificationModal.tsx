import { X, AlertTriangle } from 'lucide-react'

interface Props {
  isGenerating: boolean
  linkError: boolean
  isVerifying: boolean
  onRetry: () => void
  onClose: () => void
}

export function IdentityVerificationModal({ isGenerating, linkError, isVerifying, onRetry, onClose }: Props) {
  return (
    <div className="fv-modal-overlay">
      <div className="fv-modal">
        <div className="fv-modal-header">
          <span className="fv-modal-title">Verify with GoodDollar</span>
          <button className="fv-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="fv-modal-body">
          {isGenerating && (
            <div className="fv-state-center">
              <span className="btn-spinner fv-spinner" />
              <p className="fv-state-text">Opening verification window…</p>
            </div>
          )}

          {linkError && (
            <div className="fv-state-center">
              <AlertTriangle size={32} className="fv-state-icon" />
              <p className="fv-state-text">Couldn't open verification. Make sure popups are allowed for this site, then try again.</p>
              <button className="btn btn-accent btn-sm" onClick={onRetry}>Try again</button>
            </div>
          )}

          {isVerifying && !linkError && (
            <div className="fv-state-center">
              <span className="btn-spinner fv-spinner" />
              <p className="fv-state-text">Complete the steps in the popup window.</p>
              <p className="fv-state-hint">Once you close the popup, your status will update automatically.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
