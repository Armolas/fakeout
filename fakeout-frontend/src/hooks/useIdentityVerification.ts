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

  // walletClient must be defined — SDK accesses .account in constructor
  useEffect(() => {
    if (!address || !publicClient || !walletClient) return
    const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
    sdk.getWhitelistedRoot(address)
      .then(({ isWhitelisted }) => setIsWhitelisted(isWhitelisted))
      .catch(() => setIsWhitelisted(false))
  }, [address, publicClient, walletClient])

  const generateLink = useCallback(async () => {
    if (!address || !publicClient || !walletClient?.account) return
    setIsGenerating(true)
    try {
      const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
      const link = await sdk.generateFVLink(false, window.location.href, celo.id)
      setFvLink(link)
    } catch (e) {
      console.error('[identity] generateFVLink failed:', e)
    } finally {
      setIsGenerating(false)
    }
  }, [address, publicClient, walletClient])

  const onVerified = useCallback(() => {
    setFvLink(null)
    setIsWhitelisted(null) // triggers re-check via useEffect
  }, [])

  return { isWhitelisted, fvLink, isGenerating, generateLink, onVerified }
}
