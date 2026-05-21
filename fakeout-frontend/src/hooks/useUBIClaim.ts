import { useEffect, useState, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { celo } from 'wagmi/chains'
import { ClaimSDK, IdentitySDK } from '@goodsdks/citizen-sdk'

const GD_ENV = (import.meta.env.VITE_GOODDOLLAR_ENV ?? 'production') as 'production' | 'staging' | 'development'

export function useUBIClaim() {
  const { address } = useAccount()
  // Use Celo mainnet clients — GoodDollar UBI only runs on Celo mainnet (42220)
  const publicClient = usePublicClient({ chainId: celo.id })
  const { data: walletClient } = useWalletClient({ chainId: celo.id })

  const [entitlement, setEntitlement] = useState<bigint>(0n)
  const [nextClaimTime, setNextClaimTime] = useState<Date | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimSuccess, setClaimSuccess] = useState(false)

  const buildSDK = useCallback(() => {
    if (!address || !publicClient || !walletClient || !walletClient.account) return null
    const identitySDK = new IdentitySDK({ account: address, publicClient, walletClient, env: GD_ENV })
    return new ClaimSDK({ account: address, publicClient, walletClient, identitySDK, env: GD_ENV })
  }, [address, publicClient, walletClient])

  const checkEntitlement = useCallback(async () => {
    const sdk = buildSDK()
    if (!sdk) return
    setIsChecking(true)
    try {
      const result = await sdk.checkEntitlement()
      setEntitlement(result.amount)
      if (result.amount === 0n) {
        const next = await sdk.nextClaimTime()
        setNextClaimTime(next)
      } else {
        setNextClaimTime(null)
      }
    } catch { /* not whitelisted or network error — stay at 0n */ }
    finally { setIsChecking(false) }
  }, [buildSDK])

  const claim = useCallback(async () => {
    const sdk = buildSDK()
    if (!sdk || entitlement === 0n) return
    setIsClaiming(true)
    setClaimError(null)
    setClaimSuccess(false)
    try {
      await sdk.claim()
      setEntitlement(0n)
      setClaimSuccess(true)
      const next = await sdk.nextClaimTime()
      setNextClaimTime(next)
    } catch (e: unknown) {
      setClaimError((e as { message?: string })?.message ?? 'Claim failed')
    } finally {
      setIsClaiming(false)
    }
  }, [buildSDK, entitlement])

  useEffect(() => {
    if (address) checkEntitlement()
  }, [address, walletClient]) // eslint-disable-line

  return { entitlement, nextClaimTime, isChecking, isClaiming, claimError, claimSuccess, claim }
}
