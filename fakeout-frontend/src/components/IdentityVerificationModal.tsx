import { useState } from 'react'
import { ExternalLink, X, AlertTriangle } from 'lucide-react'

interface Props {
  fvLink: string | null
  isGenerating: boolean
  linkError: boolean
  onRetry: () => void
  onVerified: () => void
  onClose: () => void
}

export function IdentityVerificationModal({ fvLink, isGenerating, linkError, onRetry, onClose }: Props) {
  const [iframeLoaded, setIframeLoaded] = useState(false)

  function openInNewTab() {
    if (fvLink) window.open(fvLink, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fv-modal-overlay">
      <div className="fv-modal">
        <div className="fv-modal-header">
          <span className="fv-modal-title">Verify with GoodDollar</span>
          <div className="fv-modal-header-actions">
            {fvLink && !linkError && (
              <button className="fv-newtab-btn" onClick={openInNewTab} title="Open in new tab">
                <ExternalLink size={16} />
              </button>
            )}
            <button className="fv-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        {fvLink && !linkError && (
          <div className="fv-device-warning">
            If you see a "new device" error inside the window, tap <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> to open in a new tab.
          </div>
        )}

        <div className="fv-modal-body">
          {isGenerating && (
            <div className="fv-state-center">
              <span className="btn-spinner fv-spinner" />
              <p className="fv-state-text">Preparing verification…</p>
            </div>
          )}

          {linkError && (
            <div className="fv-state-center">
              <AlertTriangle size={32} className="fv-state-icon" />
              <p className="fv-state-text">Couldn't start verification. Check your wallet is connected to Celo.</p>
              <button className="btn btn-accent btn-sm" onClick={onRetry}>Retry</button>
            </div>
          )}

          {fvLink && !linkError && (
            <>
              {!iframeLoaded && (
                <div className="fv-iframe-loading">
                  <span className="btn-spinner fv-spinner" />
                </div>
              )}
              <iframe
                key={fvLink}
                src={fvLink}
                className="fv-iframe"
                onLoad={() => setIframeLoaded(true)}
                allow="camera; microphone; clipboard-write"
                title="GoodDollar Identity Verification"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
