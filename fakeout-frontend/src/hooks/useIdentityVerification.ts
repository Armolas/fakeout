import { useCallback, useEffect, useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { celo } from 'wagmi/chains'
import { IdentitySDK } from '@goodsdks/citizen-sdk'

const GD_ENV = (import.meta.env.VITE_GOODDOLLAR_ENV ?? 'production') as 'production' | 'staging' | 'development'

export function useIdentityVerification() {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: celo.id })
  const { data: walletClient } = useWalletClient({ chainId: celo.id })

  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null)
  const [fvLink, setFvLink] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [linkError, setLinkError] = useState(false)

  // Initial whitelist check — walletClient must be defined (SDK accesses .account in constructor)
  useEffect(() => {
    if (!address || !publicClient || !walletClient) return
    const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
    sdk.getWhitelistedRoot(address)
      .then(({ isWhitelisted }) => setIsWhitelisted(isWhitelisted))
      .catch(() => setIsWhitelisted(false))
  }, [address, publicClient, walletClient])

  // Poll every 5s while modal is open — detects completion without relying on iframe redirect
  useEffect(() => {
    if (!fvLink || !address || !publicClient || !walletClient) return
    const id = setInterval(() => {
      const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
      sdk.getWhitelistedRoot(address)
        .then(({ isWhitelisted }) => { if (isWhitelisted) onVerified() })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [fvLink, address, publicClient, walletClient]) // eslint-disable-line

  const generateLink = useCallback(async () => {
    if (!address || !publicClient || !walletClient?.account) return
    setIsGenerating(true)
    setLinkError(false)
    setFvLink(null)
    try {
      const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
      const result = await sdk.generateFVLink(false, window.location.href, celo.id)
      // SDK may return a string or an object { link: string }
      const link = typeof result === 'string' ? result : (result as any)?.link ?? null
      if (!link) {
        setLinkError(true)
      } else {
        setFvLink(link)
      }
    } catch (e) {
      console.error('[identity] generateFVLink failed:', e)
      setLinkError(true)
    } finally {
      setIsGenerating(false)
    }
  }, [address, publicClient, walletClient])

  const onVerified = useCallback(() => {
    setFvLink(null)
    setLinkError(false)
    setIsWhitelisted(null) // triggers re-check via useEffect
  }, [])

  const closeModal = useCallback(() => {
    setFvLink(null)
    setLinkError(false)
    setIsGenerating(false)
  }, [])

  return { isWhitelisted, fvLink, isGenerating, linkError, generateLink, onVerified, closeModal }
}
