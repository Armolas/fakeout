import { expect } from 'chai'
import { ethers } from 'hardhat'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { FakeoutGame } from '../typechain-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toGameId(str: string): string {
  return ethers.encodeBytes32String(str.substring(0, 31))
}

const STAKE = ethers.parseEther('1')   // 1 G$

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FakeoutGame', () => {
  let fakeout: FakeoutGame
  let mockToken: any
  let owner: HardhatEthersSigner
  let treasury: HardhatEthersSigner
  let players: HardhatEthersSigner[]

  beforeEach(async () => {
    const signers = await ethers.getSigners()
    owner = signers[0]
    treasury = signers[1]
    players = signers.slice(2, 12)   // 10 players

    // Deploy a mock ERC20 as G$
    const MockToken = await ethers.getContractFactory('MockERC20')
    mockToken = await MockToken.deploy('GoodDollar', 'G$', ethers.parseEther('100000'))
    await mockToken.waitForDeployment()

    // Fund all players with 10 G$ each
    for (const player of players) {
      await mockToken.transfer(player.address, ethers.parseEther('10'))
    }

    // Deploy FakeoutGame
    const FakeoutGame = await ethers.getContractFactory('FakeoutGame')
    fakeout = await FakeoutGame.deploy(
      await mockToken.getAddress(),
      treasury.address
    )
    await fakeout.waitForDeployment()
  })

  // ── createGame ──────────────────────────────────────────────────────────────
  describe('createGame', () => {
    it('creates a game with correct stake amount', async () => {
      const gameId = toGameId('game-1')
      await fakeout.createGame(gameId, STAKE)

      const game = await fakeout.getGame(gameId)
      expect(game.stakeAmount).to.equal(STAKE)
      expect(game.status).to.equal(0) // Open
      expect(game.pot).to.equal(0)
    })

    it('reverts if game already exists', async () => {
      const gameId = toGameId('game-1')
      await fakeout.createGame(gameId, STAKE)
      await expect(fakeout.createGame(gameId, STAKE))
        .to.be.revertedWithCustomError(fakeout, 'GameAlreadyExists')
    })

    it('reverts if called by non-owner', async () => {
      const gameId = toGameId('game-1')
      await expect(fakeout.connect(players[0]).createGame(gameId, STAKE))
        .to.be.revertedWithCustomError(fakeout, 'OwnableUnauthorizedAccount')
    })
  })

  // ── joinGame ────────────────────────────────────────────────────────────────
  describe('joinGame', () => {
    const gameId = toGameId('game-2')

    beforeEach(async () => {
      await fakeout.createGame(gameId, STAKE)
    })

    it('first game is free — no stake taken', async () => {
      const player = players[0]
      const balanceBefore = await mockToken.balanceOf(player.address)

      await fakeout.joinGame(gameId, player.address)

      const balanceAfter = await mockToken.balanceOf(player.address)
      expect(balanceAfter).to.equal(balanceBefore) // no change
      expect(await fakeout.hasPlayedBefore(player.address)).to.be.true
    })

    it('subsequent games require stake', async () => {
      const player = players[0]
      const contractAddress = await fakeout.getAddress()

      // First game free
      await fakeout.joinGame(gameId, player.address)

      // Second game
      const gameId2 = toGameId('game-2b')
      await fakeout.createGame(gameId2, STAKE)

      // Approve and join
      await mockToken.connect(player).approve(contractAddress, STAKE)
      const balanceBefore = await mockToken.balanceOf(player.address)

      await fakeout.joinGame(gameId2, player.address)

      const balanceAfter = await mockToken.balanceOf(player.address)
      expect(balanceBefore - balanceAfter).to.equal(STAKE)
    })

    it('pot increases when player pays stake', async () => {
      const gameId2 = toGameId('game-pot')
      await fakeout.createGame(gameId2, STAKE)

      // First player — free
      await fakeout.joinGame(gameId2, players[0].address)

      // Mark player[1] as having played before by joining another game first
      const gameId3 = toGameId('game-pre')
      await fakeout.createGame(gameId3, STAKE)
      await fakeout.joinGame(gameId3, players[1].address)

      // Now player[1] must stake
      const contractAddress = await fakeout.getAddress()
      await mockToken.connect(players[1]).approve(contractAddress, STAKE)
      await fakeout.joinGame(gameId2, players[1].address)

      const game = await fakeout.getGame(gameId2)
      expect(game.pot).to.equal(STAKE)
    })

    it('reverts if game is full (10 players)', async () => {
      const gameId = toGameId('game-full')
      await fakeout.createGame(gameId, STAKE)

      for (let i = 0; i < 10; i++) {
        await fakeout.joinGame(gameId, players[i].address)
      }

      const extraPlayer = (await ethers.getSigners())[12]
      await expect(fakeout.joinGame(gameId, extraPlayer.address))
        .to.be.revertedWithCustomError(fakeout, 'GameFull')
    })

    it('reverts on duplicate join', async () => {
      await fakeout.joinGame(gameId, players[0].address)
      await expect(fakeout.joinGame(gameId, players[0].address))
        .to.be.revertedWithCustomError(fakeout, 'AlreadyJoined')
    })
  })

  // ── startGame ───────────────────────────────────────────────────────────────
  describe('startGame', () => {
    it('starts with 3+ players', async () => {
      const gameId = toGameId('game-start')
      await fakeout.createGame(gameId, STAKE)

      for (let i = 0; i < 3; i++) {
        await fakeout.joinGame(gameId, players[i].address)
      }

      await expect(fakeout.startGame(gameId))
        .to.emit(fakeout, 'GameStarted')

      const game = await fakeout.getGame(gameId)
      expect(game.status).to.equal(1) // Active
    })

    it('reverts with fewer than 3 players', async () => {
      const gameId = toGameId('game-nostart')
      await fakeout.createGame(gameId, STAKE)
      await fakeout.joinGame(gameId, players[0].address)
      await fakeout.joinGame(gameId, players[1].address)

      await expect(fakeout.startGame(gameId))
        .to.be.revertedWithCustomError(fakeout, 'NotEnoughPlayers')
    })
  })

  // ── distributeRewards ───────────────────────────────────────────────────────
  describe('distributeRewards', () => {
    let gameId: string
    const contractAddress = { value: '' }

    beforeEach(async () => {
      gameId = toGameId('game-rewards')
      contractAddress.value = await fakeout.getAddress()
      await fakeout.createGame(gameId, STAKE)

      // 3 players join — mark 2 as having played before so they stake
      await fakeout.joinGame(gameId, players[0].address) // free

      // Make players[1] and players[2] pay stake
      for (let i = 1; i <= 2; i++) {
        const preGame = toGameId(`pre-${i}`)
        await fakeout.createGame(preGame, STAKE)
        await fakeout.joinGame(preGame, players[i].address)
        await mockToken.connect(players[i]).approve(contractAddress.value, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }

      await fakeout.startGame(gameId)
    })

    it('distributes rewards correctly to single winner', async () => {
      const winner = players[1]
      const treasuryBefore = await mockToken.balanceOf(treasury.address)
      const winnerBefore = await mockToken.balanceOf(winner.address)

      await fakeout.distributeRewards(gameId, [winner.address])

      const pot = STAKE * 2n  // 2 staking players
      const fee = (pot * 500n) / 10000n
      const rewardPool = pot - fee

      const treasuryAfter = await mockToken.balanceOf(treasury.address)
      const winnerAfter = await mockToken.balanceOf(winner.address)

      expect(treasuryAfter - treasuryBefore).to.equal(fee)
      expect(winnerAfter - winnerBefore).to.equal(rewardPool)
    })

    it('splits rewards equally among multiple winners', async () => {
      const winners = [players[1].address, players[2].address]

      await fakeout.distributeRewards(gameId, winners)

      const pot = STAKE * 2n
      const fee = (pot * 500n) / 10000n
      const rewardPool = pot - fee
      const perWinner = rewardPool / 2n

      const p1Balance = await mockToken.balanceOf(players[1].address)
      const p2Balance = await mockToken.balanceOf(players[2].address)

      // Both players staked 1 G$ and should receive perWinner back
      // players[1] started with 10 G$, staked 1 G$, so now has 9 + perWinner
      expect(p1Balance).to.equal(ethers.parseEther('9') + perWinner)
      expect(p2Balance).to.equal(ethers.parseEther('9') + perWinner)
    })

    it('marks game as completed', async () => {
      await fakeout.distributeRewards(gameId, [players[1].address])
      const game = await fakeout.getGame(gameId)
      expect(game.status).to.equal(2) // Completed
    })

    it('reverts on double distribution', async () => {
      await fakeout.distributeRewards(gameId, [players[1].address])
      await expect(fakeout.distributeRewards(gameId, [players[1].address]))
        .to.be.revertedWithCustomError(fakeout, 'GameNotActive')
    })
  })

  // ── topUpPot ────────────────────────────────────────────────────────────────
  describe('topUpPot', () => {
    it('allows owner to top up pot for subsidized players', async () => {
      const gameId = toGameId('game-topup')
      await fakeout.createGame(gameId, STAKE)

      const contractAddress = await fakeout.getAddress()
      await mockToken.approve(contractAddress, STAKE)
      await fakeout.topUpPot(gameId, STAKE)

      const game = await fakeout.getGame(gameId)
      expect(game.pot).to.equal(STAKE)
    })
  })

  // ── admin ───────────────────────────────────────────────────────────────────
  describe('admin', () => {
    it('updates protocol fee', async () => {
      await fakeout.setProtocolFee(300) // 3%
      expect(await fakeout.protocolFeeBps()).to.equal(300)
    })

    it('reverts fee above 10%', async () => {
      await expect(fakeout.setProtocolFee(1100))
        .to.be.revertedWithCustomError(fakeout, 'FeeTooHigh')
    })

    it('updates treasury', async () => {
      const newTreasury = players[9].address
      await fakeout.setTreasury(newTreasury)
      expect(await fakeout.treasury()).to.equal(newTreasury)
    })
  })
})
