import { useRef } from 'react'

interface Props {
  fvLink: string
  onVerified: () => void
  onClose: () => void
}

export function IdentityVerificationModal({ fvLink, onVerified, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  function handleIframeLoad() {
    try {
      const href = iframeRef.current?.contentWindow?.location.href
      if (href && href.startsWith(window.location.origin)) {
        onVerified()
      }
    } catch {
      // Still on cross-origin GoodID page — ignore
    }
  }

  return (
    <div className="fv-modal-overlay">
      <div className="fv-modal">
        <div className="fv-modal-header">
          <span className="fv-modal-title">Verify with GoodDollar</span>
          <button className="fv-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <iframe
          ref={iframeRef}
          src={fvLink}
          className="fv-iframe"
          onLoad={handleIframeLoad}
          allow="camera; microphone"
          title="GoodDollar Identity Verification"
        />
      </div>
    </div>
  )
}
