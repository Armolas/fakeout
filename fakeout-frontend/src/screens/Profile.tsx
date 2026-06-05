import { useState } from 'react'
import { formatUnits } from 'viem'
import { ChevronLeft, ChevronRight, Check, Pencil } from 'lucide-react'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import { GOOD_DOLLAR_ADDRESS } from '../config/contracts'
import { ERC20_ABI } from '../config/contracts'
import { ThemeToggle } from '../components/ThemeToggle'
import { UBIBanner } from '../components/UBIBanner'
import { IdentityVerificationModal } from '../components/IdentityVerificationModal'
import { useTheme } from '../hooks/useTheme'
import { useUBIClaim } from '../hooks/useUBIClaim'
import { useIdentityVerification } from '../hooks/useIdentityVerification'

type PlayerStats = {
  gamesPlayed: number
  gamesWon: number
  totalAmountWon: string
  totalAmountLost: string
}

interface Props {
  walletAddress: string
  displayName: string
  playerStats: PlayerStats | null
  onEditName: (name: string) => void
  onBack: () => void
  onDisconnect: () => void
}

export function Profile({ walletAddress, displayName, playerStats, onEditName, onBack, onDisconnect }: Props) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(displayName)
  const [copied, setCopied] = useState(false)
  const { entitlement, nextClaimTime, isClaiming, claimSuccess, claim } = useUBIClaim()
  const { isWhitelisted, fvLink, isGenerating, linkError, generateLink, onVerified, closeModal } = useIdentityVerification()
  const { address } = useAccount()
  const { data: celoBalance } = useBalance({ address, query: { enabled: !!address } })
  const { data: gdBalance } = useReadContract({
    address: GOOD_DOLLAR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const { preference: themePreference, setPreference: setThemePreference } = useTheme()

  function saveEdit() {
    const trimmed = editValue.trim()
    if (!trimmed) return
    onEditName(trimmed)
    setEditing(false)
  }

  function copyAddress() {
    navigator.clipboard?.writeText(walletAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const winRate = playerStats && playerStats.gamesPlayed > 0
    ? Math.round((playerStats.gamesWon / playerStats.gamesPlayed) * 100)
    : 0

  const wonG$ = playerStats ? parseFloat(formatUnits(BigInt(playerStats.totalAmountWon), 18)).toFixed(2) : '0.00'
  const lostG$ = playerStats ? parseFloat(formatUnits(BigInt(playerStats.totalAmountLost), 18)).toFixed(2) : '0.00'
  const hasStaked = playerStats && (BigInt(playerStats.totalAmountWon) > 0n || BigInt(playerStats.totalAmountLost) > 0n)

  return (
    <div className="screen profile-screen">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="profile-topbar">
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft size={16} /> Back</button>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="profile-hero">
        <div className="profile-avatar-lg">
          {displayName?.[0]?.toUpperCase() ?? '?'}
        </div>

        {editing ? (
          <div className="profile-edit-inline">
            <input
              className="input profile-name-input"
              value={editValue}
              maxLength={20}
              autoFocus
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <div className="profile-edit-actions">
              <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={!editValue.trim()}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="profile-name-row">
            <span className="profile-name">{displayName || 'Anonymous'}</span>
            <button
              className="profile-edit-btn"
              onClick={() => { setEditValue(displayName); setEditing(true) }}
              title="Edit name"
            >
              <Pencil size={14} />
            </button>
          </div>
        )}

        <button className="profile-address" onClick={copyAddress}>
          <span className="profile-address-text">
            {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}
          </span>
          <span className={`profile-copy-badge ${copied ? 'copied' : ''}`}>
            {copied ? <><Check size={12} /> Copied</> : 'Copy'}
          </span>
        </button>
      </div>

      {/* ── Wallet ────────────────────────────────────────────────────────── */}
      <div className="profile-card">
        <p className="profile-card-label">Wallet</p>
        <div className="profile-amounts">
          <div className="profile-amount celo">
            <span className="profile-amount-label">CELO</span>
            <span className="profile-amount-value">
              {celoBalance ? parseFloat(formatUnits(celoBalance.value, celoBalance.decimals)).toFixed(4) : '—'}
            </span>
          </div>
          <div className="profile-amount gd">
            <span className="profile-amount-label">GoodDollar</span>
            <span className="profile-amount-value">
              {gdBalance !== undefined ? `${parseFloat(formatUnits(gdBalance as bigint, 18)).toFixed(2)} G$` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="profile-card">
        <p className="profile-card-label">Statistics</p>
        <div className="profile-stats-row">
          <div className="profile-stat">
            <span className="profile-stat-value">{playerStats?.gamesPlayed ?? 0}</span>
            <span className="profile-stat-label">Played</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat">
            <span className="profile-stat-value">{playerStats?.gamesWon ?? 0}</span>
            <span className="profile-stat-label">Won</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat">
            <span className="profile-stat-value">{winRate}%</span>
            <span className="profile-stat-label">Win rate</span>
          </div>
        </div>

        {hasStaked && (
          <>
            <div className="profile-card-divider" />
            <div className="profile-amounts">
              <div className="profile-amount won">
                <span className="profile-amount-label">Total won</span>
                <span className="profile-amount-value">+{wonG$} G$</span>
              </div>
              <div className="profile-amount lost">
                <span className="profile-amount-label">Total lost</span>
                <span className="profile-amount-value">-{lostG$} G$</span>
              </div>
            </div>
          </>
        )}
      </div>

      <UBIBanner
        entitlement={entitlement}
        nextClaimTime={nextClaimTime}
        isClaiming={isClaiming}
        claimSuccess={claimSuccess}
        onClaim={claim}
        isWhitelisted={isWhitelisted}
        onVerifyClick={generateLink}
        isVerifying={isGenerating}
      />

      {(fvLink || isGenerating || linkError) && (
        <IdentityVerificationModal
          fvLink={fvLink}
          isGenerating={isGenerating}
          linkError={linkError}
          onRetry={generateLink}
          onVerified={onVerified}
          onClose={closeModal}
        />
      )}

      <div className="profile-card">
        <p className="profile-card-label">Appearance</p>
        <div className="profile-theme-section">
          <ThemeToggle preference={themePreference} onChange={setThemePreference} />
        </div>
      </div>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <div className="profile-card">
        <button className="profile-disconnect" onClick={onDisconnect}>
          <span>Disconnect wallet</span>
          <ChevronRight size={16} className="profile-disconnect-arrow" />
        </button>
      </div>

    </div>
  )
}
