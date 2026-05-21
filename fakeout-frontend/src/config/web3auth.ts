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

const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } })

export const web3AuthInstance = new Web3AuthNoModal({
  clientId: import.meta.env.VITE_WEB3AUTH_CLIENT_ID,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  privateKeyProvider,
})

const authAdapter = new AuthAdapter({ privateKeyProvider })
web3AuthInstance.configureAdapter(authAdapter)

export const googleConnector = Web3AuthConnector({
  web3AuthInstance,
  loginParams: { loginProvider: 'google' },
  id: 'web3auth-google',
  name: 'Google',
})

export const appleConnector = Web3AuthConnector({
  web3AuthInstance,
  loginParams: { loginProvider: 'apple' },
  id: 'web3auth-apple',
  name: 'Apple',
})

export const emailConnector = Web3AuthConnector({
  web3AuthInstance,
  loginParams: { loginProvider: 'email_passwordless' },
  id: 'web3auth-email',
  name: 'Email',
})
