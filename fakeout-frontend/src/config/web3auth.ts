import { Web3AuthNoModal } from '@web3auth/no-modal'
import { AuthAdapter } from '@web3auth/auth-adapter'
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider'
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from '@web3auth/base'
import { Web3AuthConnector } from '@web3auth/web3auth-wagmi-connector'

// Celo Sepolia = 44787 = 0xAEF3
const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0xAEF3',
  rpcTarget: 'https://forno.celo-sepolia.celo-testnet.org',
  displayName: 'Celo Sepolia',
  ticker: 'CELO',
  tickerName: 'Celo',
}

function createWeb3Auth() {
  const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID
  if (!clientId) return null

  const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } })

  const instance = new Web3AuthNoModal({
    clientId,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    privateKeyProvider,
  })

  instance.configureAdapter(new AuthAdapter({ privateKeyProvider }))
  return instance
}

export const web3AuthInstance = createWeb3Auth()

export const emailConnector = web3AuthInstance
  ? Web3AuthConnector({
      web3AuthInstance,
      loginParams: { loginProvider: 'email_passwordless' },
      id: 'web3auth-email',
      name: 'Email',
    })
  : null
