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
  let treasury: HardhatEthersSigner
  let players: HardhatEthersSigner[]

  beforeEach(async () => {
    const signers = await ethers.getSigners()
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

    it('pulls stake from player on join', async () => {
      const player = players[0]
      const contractAddress = await fakeout.getAddress()
      await mockToken.connect(player).approve(contractAddress, STAKE)
      const balanceBefore = await mockToken.balanceOf(player.address)

      await fakeout.joinGame(gameId, player.address)

      const balanceAfter = await mockToken.balanceOf(player.address)
      expect(balanceBefore - balanceAfter).to.equal(STAKE)
    })

    it('pot increases for each staking player', async () => {
      const contractAddress = await fakeout.getAddress()
      for (let i = 0; i < 2; i++) {
        await mockToken.connect(players[i]).approve(contractAddress, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }
      const game = await fakeout.getGame(gameId)
      expect(game.pot).to.equal(STAKE * 2n)
    })

    it('reverts if game is full (10 players)', async () => {
      const gameId = toGameId('game-full')
      await fakeout.createGame(gameId, STAKE)
      const contractAddress = await fakeout.getAddress()

      for (let i = 0; i < 10; i++) {
        await mockToken.connect(players[i]).approve(contractAddress, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }

      const extraPlayer = (await ethers.getSigners())[12]
      await expect(fakeout.joinGame(gameId, extraPlayer.address))
        .to.be.revertedWithCustomError(fakeout, 'GameFull')
    })

    it('reverts on duplicate join', async () => {
      const contractAddress = await fakeout.getAddress()
      await mockToken.connect(players[0]).approve(contractAddress, STAKE)
      await fakeout.joinGame(gameId, players[0].address)
      await expect(fakeout.joinGame(gameId, players[0].address))
        .to.be.revertedWithCustomError(fakeout, 'AlreadyJoined')
    })
  })

  // ── startGame ───────────────────────────────────────────────────────────────
  describe('startGame', () => {
    async function joinPlayers(gameId: string, count: number) {
      const contractAddress = await fakeout.getAddress()
      for (let i = 0; i < count; i++) {
        await mockToken.connect(players[i]).approve(contractAddress, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }
    }

    it('starts with 3+ players', async () => {
      const gameId = toGameId('game-start')
      await fakeout.createGame(gameId, STAKE)
      await joinPlayers(gameId, 3)

      await expect(fakeout.startGame(gameId)).to.emit(fakeout, 'GameStarted')
      const game = await fakeout.getGame(gameId)
      expect(game.status).to.equal(1) // Active
    })

    it('reverts with fewer than 3 players', async () => {
      const gameId = toGameId('game-nostart')
      await fakeout.createGame(gameId, STAKE)
      await joinPlayers(gameId, 2)

      await expect(fakeout.startGame(gameId))
        .to.be.revertedWithCustomError(fakeout, 'NotEnoughPlayers')
    })
  })

  // ── distributeRewards ───────────────────────────────────────────────────────
  describe('distributeRewards', () => {
    let gameId: string
    let contractAddress: string

    beforeEach(async () => {
      gameId = toGameId('game-rewards')
      contractAddress = await fakeout.getAddress()
      await fakeout.createGame(gameId, STAKE)

      // 3 players join and stake
      for (let i = 0; i < 3; i++) {
        await mockToken.connect(players[i]).approve(contractAddress, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }

      await fakeout.startGame(gameId)
    })

    it('distributes rewards correctly to single winner', async () => {
      const winner = players[0]
      const treasuryBefore = await mockToken.balanceOf(treasury.address)
      const winnerBefore = await mockToken.balanceOf(winner.address)

      await fakeout.distributeRewards(gameId, [winner.address])

      const pot = STAKE * 3n  // 3 staking players
      const fee = (pot * 500n) / 10000n
      const rewardPool = pot - fee

      expect(await mockToken.balanceOf(treasury.address) - treasuryBefore).to.equal(fee)
      expect(await mockToken.balanceOf(winner.address) - winnerBefore).to.equal(rewardPool)
    })

    it('splits rewards equally among multiple winners', async () => {
      const winners = [players[0].address, players[1].address]
      await fakeout.distributeRewards(gameId, winners)

      const pot = STAKE * 3n
      const fee = (pot * 500n) / 10000n
      const rewardPool = pot - fee
      const perWinner = rewardPool / 2n

      // Each winner started with 10 G$, staked 1 G$, so now has 9 + perWinner
      expect(await mockToken.balanceOf(players[0].address)).to.equal(ethers.parseEther('9') + perWinner)
      expect(await mockToken.balanceOf(players[1].address)).to.equal(ethers.parseEther('9') + perWinner)
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

  // ── free games (stakeAmount = 0) ─────────────────────────────────────────────
  describe('free games', () => {
    it('creates a free game with stakeAmount = 0', async () => {
      const gameId = toGameId('game-free')
      await fakeout.createGame(gameId, 0)
      const game = await fakeout.getGame(gameId)
      expect(game.stakeAmount).to.equal(0)
      expect(game.status).to.equal(0) // Open
    })

    it('players join free game without staking', async () => {
      const gameId = toGameId('game-free2')
      await fakeout.createGame(gameId, 0)
      for (let i = 0; i < 3; i++) {
        const balBefore = await mockToken.balanceOf(players[i].address)
        await fakeout.joinGame(gameId, players[i].address)
        expect(await mockToken.balanceOf(players[i].address)).to.equal(balBefore)
      }
      expect((await fakeout.getGame(gameId)).pot).to.equal(0)
    })

    it('free game completes with pot = 0, emits 0 fee and 0 per winner', async () => {
      const gameId = toGameId('game-free3')
      await fakeout.createGame(gameId, 0)
      for (let i = 0; i < 3; i++) await fakeout.joinGame(gameId, players[i].address)
      await fakeout.startGame(gameId)
      await expect(fakeout.distributeRewards(gameId, [players[0].address]))
        .to.emit(fakeout, 'GameCompleted')
        .withArgs(gameId, [players[0].address], 0, 0)
    })
  })

  // ── winner validation ────────────────────────────────────────────────────────
  describe('winner validation', () => {
    it('reverts distributeRewards when winner is not a player', async () => {
      const gameId = toGameId('game-badwinner')
      const contractAddress = await fakeout.getAddress()
      await fakeout.createGame(gameId, STAKE)
      for (let i = 0; i < 3; i++) {
        await mockToken.connect(players[i]).approve(contractAddress, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }
      await fakeout.startGame(gameId)

      const outsider = (await ethers.getSigners())[12]
      await expect(fakeout.distributeRewards(gameId, [outsider.address]))
        .to.be.revertedWithCustomError(fakeout, 'WinnerNotAPlayer')
    })
  })

  // ── cancelGame ────────────────────────────────────────────────────────────────
  describe('cancelGame', () => {
    it('refunds all staking players', async () => {
      const gameId = toGameId('game-cancel')
      const contractAddress = await fakeout.getAddress()
      await fakeout.createGame(gameId, STAKE)

      for (let i = 0; i < 3; i++) {
        await mockToken.connect(players[i]).approve(contractAddress, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }

      const balsBefore = await Promise.all(players.slice(0, 3).map(p => mockToken.balanceOf(p.address)))
      await fakeout.cancelGame(gameId)

      for (let i = 0; i < 3; i++) {
        expect(await mockToken.balanceOf(players[i].address)).to.equal(balsBefore[i] + STAKE)
      }
      expect((await fakeout.getGame(gameId)).status).to.equal(2) // Completed
    })

    it('cancel a free game marks it completed without transfers', async () => {
      const gameId = toGameId('game-cancel-free')
      await fakeout.createGame(gameId, 0)
      for (let i = 0; i < 3; i++) await fakeout.joinGame(gameId, players[i].address)
      await fakeout.cancelGame(gameId)
      expect((await fakeout.getGame(gameId)).status).to.equal(2) // Completed
    })

    it('reverts cancelGame on a completed game', async () => {
      const gameId = toGameId('game-cancel2')
      const contractAddress = await fakeout.getAddress()
      await fakeout.createGame(gameId, STAKE)
      for (let i = 0; i < 3; i++) {
        await mockToken.connect(players[i]).approve(contractAddress, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }
      await fakeout.startGame(gameId)
      await fakeout.distributeRewards(gameId, [players[0].address])
      await expect(fakeout.cancelGame(gameId))
        .to.be.revertedWithCustomError(fakeout, 'GameAlreadyCompleted')
    })
  })

  // ── removePlayer ─────────────────────────────────────────────────────────────
  describe('removePlayer', () => {
    it('refunds stake and removes player from open staked game', async () => {
      const gameId = toGameId('game-remove')
      const contractAddress = await fakeout.getAddress()
      await fakeout.createGame(gameId, STAKE)

      for (let i = 0; i < 3; i++) {
        await mockToken.connect(players[i]).approve(contractAddress, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }

      const balBefore = await mockToken.balanceOf(players[1].address)
      const potBefore = (await fakeout.getGame(gameId)).pot

      await fakeout.removePlayer(gameId, players[1].address)

      expect(await mockToken.balanceOf(players[1].address)).to.equal(balBefore + STAKE)
      expect((await fakeout.getGame(gameId)).pot).to.equal(potBefore - STAKE)

      const remainingPlayers = await fakeout.getGamePlayers(gameId)
      expect(remainingPlayers).to.not.include(players[1].address)
      expect(remainingPlayers.length).to.equal(2)
    })

    it('removes player from free game without any transfer', async () => {
      const gameId = toGameId('game-remove-free')
      await fakeout.createGame(gameId, 0)

      for (let i = 0; i < 3; i++) await fakeout.joinGame(gameId, players[i].address)

      const balBefore = await mockToken.balanceOf(players[0].address)
      await fakeout.removePlayer(gameId, players[0].address)

      expect(await mockToken.balanceOf(players[0].address)).to.equal(balBefore)
      const remainingPlayers = await fakeout.getGamePlayers(gameId)
      expect(remainingPlayers.length).to.equal(2)
    })

    it('reverts if player is not in the game', async () => {
      const gameId = toGameId('game-remove-notfound')
      await fakeout.createGame(gameId, STAKE)
      await expect(fakeout.removePlayer(gameId, players[0].address))
        .to.be.revertedWithCustomError(fakeout, 'PlayerNotInGame')
    })

    it('reverts if game is not Open', async () => {
      const gameId = toGameId('game-remove-active')
      const contractAddress = await fakeout.getAddress()
      await fakeout.createGame(gameId, STAKE)
      for (let i = 0; i < 3; i++) {
        await mockToken.connect(players[i]).approve(contractAddress, STAKE)
        await fakeout.joinGame(gameId, players[i].address)
      }
      await fakeout.startGame(gameId)

      await expect(fakeout.removePlayer(gameId, players[0].address))
        .to.be.revertedWithCustomError(fakeout, 'GameNotOpen')
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
