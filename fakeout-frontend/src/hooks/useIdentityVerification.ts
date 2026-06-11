import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { celo } from 'wagmi/chains'
import { IdentitySDK } from '@goodsdks/citizen-sdk'

const GD_ENV = (import.meta.env.VITE_GOODDOLLAR_ENV ?? 'production') as 'production' | 'staging' | 'development'

export function useIdentityVerification() {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: celo.id })
  const { data: walletClient } = useWalletClient({ chainId: celo.id })

  // null = loading/unknown, true = verified, false = confirmed not whitelisted
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null)
  // true only when there was a network/SDK error — distinct from "not whitelisted"
  const [identityError, setIdentityError] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [linkError, setLinkError] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false) // popup is open

  const popupRef = useRef<Window | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initial whitelist check — errors set identityError, NOT isWhitelisted=false
  useEffect(() => {
    if (!address || !publicClient || !walletClient) return
    setIdentityError(false)
    const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
    sdk.getWhitelistedRoot(address)
      .then(({ isWhitelisted }) => setIsWhitelisted(isWhitelisted))
      .catch(() => setIdentityError(true))
  }, [address, publicClient, walletClient])

  // Clean up poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const checkWhitelist = useCallback(async () => {
    if (!address || !publicClient || !walletClient) return
    const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
    try {
      const { isWhitelisted } = await sdk.getWhitelistedRoot(address)
      setIsWhitelisted(isWhitelisted)
      if (isWhitelisted) {
        setIsVerifying(false)
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    } catch { /* ignore transient poll errors */ }
  }, [address, publicClient, walletClient])

  const openVerificationPopup = useCallback(async () => {
    if (!address || !publicClient || !walletClient?.account) return
    setIsGenerating(true)
    setLinkError(false)
    try {
      const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
      const result = await sdk.generateFVLink(true, window.location.href, celo.id)
      const link = typeof result === 'string' ? result : (result as any)?.link ?? null
      if (!link) { setLinkError(true); return }

      const popup = window.open(link, 'faceVerification', 'width=600,height=700,scrollbars=yes,resizable=yes')
      if (!popup) {
        // Popup blocked by browser — show link error with hint
        setLinkError(true)
        return
      }
      popupRef.current = popup
      setIsVerifying(true)

      // Poll until popup is closed, then re-check whitelist status
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(() => {
        if (popupRef.current?.closed) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          checkWhitelist()
        }
      }, 1000)
    } catch (e) {
      console.error('[identity] generateFVLink failed:', e)
      setLinkError(true)
    } finally {
      setIsGenerating(false)
    }
  }, [address, publicClient, walletClient, checkWhitelist])

  const retryIdentityCheck = useCallback(() => {
    if (!address || !publicClient || !walletClient) return
    setIdentityError(false)
    const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
    sdk.getWhitelistedRoot(address)
      .then(({ isWhitelisted }) => setIsWhitelisted(isWhitelisted))
      .catch(() => setIdentityError(true))
  }, [address, publicClient, walletClient])

  const closeModal = useCallback(() => {
    setIsVerifying(false)
    setLinkError(false)
    setIsGenerating(false)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
  }, [])

  return {
    isWhitelisted,
    identityError,
    retryIdentityCheck,
    isGenerating,
    linkError,
    isVerifying,
    openVerificationPopup,
    closeModal,
  }
}
