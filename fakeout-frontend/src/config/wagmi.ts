import { createConfig, http } from 'wagmi'
import { celo, celoSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [celoSepolia, celo],
  connectors: [
    injected({
      // MiniPay injects window.ethereum; target it explicitly
      target() {
        return {
          id: 'minipay',
          name: 'MiniPay',
          provider: typeof window !== 'undefined'
            ? (window as any).ethereum
            : undefined,
        }
      },
    }),
  ],
  transports: {
    [celoSepolia.id]: http('https://forno.celo-sepolia.celo-testnet.org'),
    [celo.id]: http('https://forno.celo.org'),
  },
})
