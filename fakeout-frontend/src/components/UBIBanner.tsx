import { formatUnits } from 'viem'

interface Props {
  entitlement: bigint
  nextClaimTime: Date | null
  isClaiming: boolean
  claimSuccess: boolean
  onClaim: () => void
  isWhitelisted?: boolean | null
  onVerifyClick?: () => void
  isVerifying?: boolean
}

function hoursUntil(date: Date): string {
  const diff = date.getTime() - Date.now()
  if (diff <= 0) return 'soon'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function UBIBanner({
  entitlement,
  nextClaimTime,
  isClaiming,
  claimSuccess,
  onClaim,
  isWhitelisted,
  onVerifyClick,
  isVerifying,
}: Props) {
  if (isWhitelisted === false) {
    return (
      <div className="ubi-banner ubi-banner--verify">
        <div className="ubi-info">
          <span className="ubi-icon">🪪</span>
          <div>
            <p className="ubi-title">Verify identity to claim G$</p>
            <p className="ubi-sub">GoodDollar requires a one-time face check</p>
          </div>
        </div>
        <button className="btn btn-accent btn-sm" onClick={onVerifyClick} disabled={isVerifying}>
          {isVerifying ? <><span className="btn-spinner" />Opening…</> : 'Verify'}
        </button>
      </div>
    )
  }

  if (entitlement > 0n) {
    return (
      <div className="ubi-banner ubi-banner--ready">
        <div className="ubi-info">
          <span className="ubi-icon">🎁</span>
          <div>
            <p className="ubi-title">Daily G$ available</p>
            <p className="ubi-amount">{parseFloat(formatUnits(entitlement, 18)).toFixed(2)} G$</p>
          </div>
        </div>
        <button className="btn btn-accent btn-sm" onClick={onClaim} disabled={isClaiming}>
          {isClaiming ? <><span className="btn-spinner" />Claiming…</> : 'Claim'}
        </button>
      </div>
    )
  }

  if (claimSuccess && nextClaimTime) {
    return (
      <div className="ubi-banner ubi-banner--claimed">
        <span className="ubi-icon">✓</span>
        <p className="ubi-claimed-text">G$ claimed! Next in {hoursUntil(nextClaimTime)}</p>
      </div>
    )
  }

  if (nextClaimTime) {
    return (
      <div className="ubi-banner ubi-banner--waiting">
        <span className="ubi-icon">⏳</span>
        <p className="ubi-claimed-text">Next G$ claim in {hoursUntil(nextClaimTime)}</p>
      </div>
    )
  }

  return null
}
