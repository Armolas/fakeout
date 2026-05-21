import { Web3AuthNoModal } from '@web3auth/no-modal'
import { AuthAdapter } from '@web3auth/auth-adapter'
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider'
import { CHAIN_NAMESPACES, UX_MODE, WEB3AUTH_NETWORK } from '@web3auth/base'
import { Web3AuthConnector } from '@web3auth/web3auth-wagmi-connector'
import { celo, celoSepolia } from 'wagmi/chains'

const isMainnet = import.meta.env.VITE_MAINNET === 'true'
const gameChain = isMainnet ? celo : celoSepolia

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0x' + gameChain.id.toString(16),
  rpcTarget: isMainnet ? 'https://forno.celo.org' : 'https://forno.celo-sepolia.celo-testnet.org',
  displayName: isMainnet ? 'Celo' : 'Celo Sepolia',
  ticker: 'CELO',
  tickerName: 'Celo',
}

function createWeb3Auth() {
  const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID
  if (!clientId) return null

  const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } })

  const instance = new Web3AuthNoModal({
    clientId,
    web3AuthNetwork: isMainnet ? WEB3AUTH_NETWORK.SAPPHIRE_MAINNET : WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    privateKeyProvider,
  })

  instance.configureAdapter(new AuthAdapter({
    privateKeyProvider,
    adapterSettings: { uxMode: UX_MODE.REDIRECT },
  }))
  return instance
}

export const web3AuthInstance = createWeb3Auth()

export function makeEmailConnector(email: string) {
  if (!web3AuthInstance) return null
  return Web3AuthConnector({
    web3AuthInstance,
    loginParams: {
      loginProvider: 'email_passwordless',
      extraLoginOptions: { login_hint: email },
    },
    id: 'web3auth-email',
    name: 'Email',
  })
}
