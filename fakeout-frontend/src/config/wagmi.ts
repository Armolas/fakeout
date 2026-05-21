import { createConfig, http } from 'wagmi'
import { celo, celoSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { emailConnector } from './web3auth'

export const wagmiConfig = createConfig({
  chains: [celoSepolia, celo],
  connectors: [emailConnector, injected()],
  transports: {
    [celoSepolia.id]: http('https://forno.celo-sepolia.celo-testnet.org'),
    [celo.id]: http('https://forno.celo.org'),
  },
})
