import { ethers, network } from 'hardhat'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

// ─── G$ token addresses ───────────────────────────────────────────────────────
// Leave empty to auto-deploy MockERC20 (testnets only).
// Override any entry via GOOD_DOLLAR_ADDRESS in .env.
const GOOD_DOLLAR_ADDRESSES: Record<string, string> = {
  hardhat: '',
  alfajores: '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A',
  'celo-sepolia': '', // G$ not yet on Celo Sepolia — MockERC20 deployed automatically
  celo: '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A',
}

async function main() {
  const [deployer] = await ethers.getSigners()
  const networkName = network.name

  console.log(`\n🚀 Deploying FAKEOUT contract`)
  console.log(`   Network:   ${networkName}`)
  console.log(`   Deployer:  ${deployer.address}`)

  const balance = await ethers.provider.getBalance(deployer.address)
  console.log(`   Balance:   ${ethers.formatEther(balance)} CELO\n`)

  // ── Resolve G$ address (env override > map > auto-mock) ─────────────────────
  const rawGoodDollar =
    process.env.GOOD_DOLLAR_ADDRESS || GOOD_DOLLAR_ADDRESSES[networkName] || ''

  let goodDollarAddress: string = rawGoodDollar
    ? ethers.getAddress(rawGoodDollar) // normalise EIP-55 checksum
    : ''

  if (!goodDollarAddress) {
    if (networkName === 'celo') {
      throw new Error('GOOD_DOLLAR_ADDRESS must be set for mainnet deployment')
    }
    console.log('   ⚠️  No G$ address — deploying MockERC20 as stand-in...')
    const MockERC20 = await ethers.getContractFactory('MockERC20')
    const mock = await MockERC20.deploy(
      'Mock GoodDollar',
      'G$',
      ethers.parseEther('1000000'),
    )
    await mock.waitForDeployment()
    goodDollarAddress = await mock.getAddress()
    console.log(`   MockERC20 deployed to: ${goodDollarAddress}\n`)
  }

  const treasuryAddress = process.env.TREASURY_ADDRESS
  if (!treasuryAddress) {
    throw new Error('TREASURY_ADDRESS not set in .env')
  }

  console.log(`   G$ token:  ${goodDollarAddress}`)
  console.log(`   Treasury:  ${treasuryAddress}\n`)

  // ── Deploy ──────────────────────────────────────────────────────────────────
  const FakeoutGame = await ethers.getContractFactory('FakeoutGame')
  const fakeoutGame = await FakeoutGame.deploy(goodDollarAddress, treasuryAddress)

  await fakeoutGame.waitForDeployment()

  const contractAddress = await fakeoutGame.getAddress()

  console.log(`✅ FakeoutGame deployed to: ${contractAddress}`)
  console.log(`   Tx hash: ${fakeoutGame.deploymentTransaction()?.hash}\n`)

  // ── Save deployment info ────────────────────────────────────────────────────
  const deploymentInfo = {
    network: networkName,
    contractAddress,
    goodDollarAddress,
    treasuryAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    txHash: fakeoutGame.deploymentTransaction()?.hash,
  }

  const deploymentsDir = path.join(__dirname, '../deployments')
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir)
  }

  const filePath = path.join(deploymentsDir, `${networkName}.json`)
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2))
  console.log(`📄 Deployment info saved to deployments/${networkName}.json`)

  // ── Remind to verify ────────────────────────────────────────────────────────
  console.log(`\n🔍 To verify on Celoscan:`)
  console.log(`   npx hardhat verify --network ${networkName} ${contractAddress} ${goodDollarAddress} ${treasuryAddress}\n`)

  // ── Update backend .env reminder ────────────────────────────────────────────
  const rpcByNetwork: Record<string, string> = {
    alfajores: 'https://alfajores-forno.celo-testnet.org',
    'celo-sepolia': 'https://forno.celo-sepolia.celo-testnet.org',
    celo: 'https://forno.celo.org',
  }
  console.log(`📝 Update your backend .env:`)
  console.log(`   CONTRACT_ADDRESS=${contractAddress}`)
  console.log(`   CELO_RPC_URL=${rpcByNetwork[networkName] ?? ''}\n`)
}

main().catch((err) => {
  console.error('❌ Deployment failed:', err)
  process.exitCode = 1
})
