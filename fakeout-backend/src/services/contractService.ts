import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo, celoSepolia } from 'viem/chains'

// ─── Minimal ABI — only the functions the backend calls ───────────────────────

const ABI = parseAbi([
  'function createGame(bytes32 gameId, uint256 stakeAmount)',
  'function joinGame(bytes32 gameId, address player)',
  'function removePlayer(bytes32 gameId, address player)',
  'function startGame(bytes32 gameId)',
  'function distributeRewards(bytes32 gameId, address[] winners)',
  'function cancelGame(bytes32 gameId)',
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a UUID v4 to bytes32 by stripping dashes and right-padding to 32 bytes.
 */
export function uuidToBytes32(uuid: string): Hex {
  return `0x${uuid.replace(/-/g, '').padEnd(64, '0')}` as Hex
}

// ─── Setup ────────────────────────────────────────────────name──────────────────

function buildClients() {
  const rawKey  = process.env.OWNER_PRIVATE_KEY
  const rpcUrl  = process.env.CELO_RPC_URL
  const address = process.env.CONTRACT_ADDRESS

  if (!rawKey || !rpcUrl || !address) return null
  if (address === '0x0000000000000000000000000000000000000000') return null

  const privateKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex
  const chain      = rpcUrl.includes('sepolia') ? celoSepolia : celo
  const account    = privateKeyToAccount(privateKey)

  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) })
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })

  async function send(args: Record<string, unknown>): Promise<Hex> {
    return walletClient.writeContract({ ...args, chain } as any)
  }

  return { contractAddress: address as Hex, chain, walletClient, publicClient, send }
}

const clients = buildClients()

if (clients) {
  console.log(`[contract] service enabled — ${clients.contractAddress} (${clients.chain.name})`)
} else {
  console.log('[contract] service disabled (CONTRACT_ADDRESS / OWNER_PRIVATE_KEY / CELO_RPC_URL not set)')
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const contractService = {
  get isEnabled() {
    return clients !== null
  },

  /**
   * Register a new game on-chain. Fire and forget.
   * Only called for staked games (stakeAmount > 0).
   */
  createGame(gameId: string, stakeAmountWei: string): void {
    if (!clients) return
    clients.send({
      address: clients.contractAddress,
      abi: ABI,
      functionName: 'createGame',
      args: [uuidToBytes32(gameId), BigInt(stakeAmountWei)],
    }).then(hash => {
      console.log(`[contract] createGame tx: ${hash}`)
    }).catch(err => {
      console.error(`[contract] createGame failed for ${gameId}:`, err.shortMessage ?? err.message)
    })
  },

  /**
   * Pull the player's stake into the contract. Awaited so a failed approval
   * rejects the join before the player is added to game state.
   * Only called for staked games (stakeAmount > 0).
   */
  async joinGame(gameId: string, playerAddress: string): Promise<void> {
    if (!clients) return
    const hash = await clients.send({
      address: clients.contractAddress,
      abi: ABI,
      functionName: 'joinGame',
      args: [uuidToBytes32(gameId), playerAddress as Hex],
    })
    console.log(`[contract] joinGame tx: ${hash}`)
    // Receipt confirmation in background — failure logged but doesn't block
    clients.publicClient.waitForTransactionReceipt({ hash }).catch(err => {
      console.error(`[contract] joinGame receipt failed for ${playerAddress}:`, err.shortMessage ?? err.message)
    })
  },

  /**
   * Remove a player from an open lobby and refund their stake. Fire and forget.
   * Only called for staked games (stakeAmount > 0) while game is still Open.
   */
  removePlayer(gameId: string, playerAddress: string): void {
    if (!clients) return
    clients.send({
      address: clients.contractAddress,
      abi: ABI,
      functionName: 'removePlayer',
      args: [uuidToBytes32(gameId), playerAddress as Hex],
    }).then(hash => {
      console.log(`[contract] removePlayer tx: ${hash} — ${playerAddress}`)
    }).catch(err => {
      console.error(`[contract] removePlayer failed for ${playerAddress}:`, err.shortMessage ?? err.message)
    })
  },

  /**
   * Lock the game on-chain. Fire and forget.
   * Only called for staked games (stakeAmount > 0).
   */
  startGame(gameId: string): void {
    if (!clients) return
    clients.send({
      address: clients.contractAddress,
      abi: ABI,
      functionName: 'startGame',
      args: [uuidToBytes32(gameId)],
    }).then(hash => {
      console.log(`[contract] startGame tx: ${hash}`)
    }).catch(err => {
      console.error(`[contract] startGame failed for ${gameId}:`, err.shortMessage ?? err.message)
    })
  },

  /**
   * Cancel a game and refund all remaining staked players. Fire and forget.
   * Used when a staked lobby empties out or an active game is aborted.
   */
  cancelGame(gameId: string): void {
    if (!clients) return
    clients.send({
      address: clients.contractAddress,
      abi: ABI,
      functionName: 'cancelGame',
      args: [uuidToBytes32(gameId)],
    }).then(hash => {
      console.log(`[contract] cancelGame tx: ${hash}`)
    }).catch(err => {
      console.error(`[contract] cancelGame failed for ${gameId}:`, err.shortMessage ?? err.message)
    })
  },

  /**
   * Distribute rewards to winners. Fire and forget — game:result is emitted
   * to clients immediately; token transfer settles on-chain in the background.
   * Only called for staked games (stakeAmount > 0).
   */
  distributeRewards(gameId: string, winners: string[]): void {
    if (!clients) return
    clients.send({
      address: clients.contractAddress,
      abi: ABI,
      functionName: 'distributeRewards',
      args: [uuidToBytes32(gameId), winners as Hex[]],
    }).then(hash => {
      console.log(`[contract] distributeRewards tx: ${hash} — winners: ${winners.join(', ')}`)
    }).catch(err => {
      console.error(`[contract] distributeRewards failed for ${gameId}:`, err.shortMessage ?? err.message)
    })
  },
}
