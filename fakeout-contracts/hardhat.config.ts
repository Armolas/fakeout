import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@openzeppelin/hardhat-upgrades'
import dotenv from 'dotenv'

dotenv.config()

const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001'

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local hardhat network
    hardhat: {},

    // Celo Alfajores Testnet (legacy)
    alfajores: {
      url: 'https://alfajores-forno.celo-testnet.org',
      accounts: [OWNER_PRIVATE_KEY],
      chainId: 44787,
      gas: 'auto',
      gasPrice: 'auto',
    },

    // Celo Sepolia Testnet (OP Stack, chainId 11142220)
    'celo-sepolia': {
      url: 'https://forno.celo-sepolia.celo-testnet.org',
      accounts: [OWNER_PRIVATE_KEY],
      chainId: 11142220,
      gas: 'auto',
      gasPrice: 'auto',
    },

    // Celo Mainnet
    celo: {
      url: 'https://forno.celo.org',
      accounts: [OWNER_PRIVATE_KEY],
      chainId: 42220,
      gas: 'auto',
      gasPrice: 'auto',
    },
  },
  etherscan: {
    // Single Etherscan V2 API key — works across all Etherscan-family chains
    apiKey: process.env.CELOSCAN_API_KEY || '',
    customChains: [
      {
        network: 'alfajores',
        chainId: 44787,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=44787',
          browserURL: 'https://alfajores.celoscan.io',
        },
      },
      {
        network: 'celo',
        chainId: 42220,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=42220',
          browserURL: 'https://celoscan.io',
        },
      },
      {
        network: 'celo-sepolia',
        chainId: 11142220,
        urls: {
          // Blockscout — not Etherscan-family, no API key needed
          apiURL: 'https://celo-sepolia.blockscout.com/api',
          browserURL: 'https://celo-sepolia.blockscout.com',
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
}

export default config
