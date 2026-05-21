// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FakeoutGame
 * @notice Handles staking and reward distribution for the FAKEOUT social deduction game.
 *         Game logic lives off-chain (backend). This contract is purely a treasury:
 *         it holds stakes, enforces first-game-free logic, takes a protocol fee,
 *         and distributes rewards to winners.
 *
 * @dev Deployed on Celo. Uses GoodDollar (G$) as the staking token.
 */
contract FakeoutGame is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public immutable goodDollar;
    address public treasury;
    uint256 public protocolFeeBps = 500; // 5% — max 10%

    enum GameStatus {
        Open,       // accepting joins
        Active,     // game in progress
        Completed   // rewards distributed
    }

    struct Game {
        bool exists;
        uint256 stakeAmount;
        uint256 pot;
        GameStatus status;
        address[] players;
        address[] winners;
    }

    // gameId (bytes32 from backend uuid) → Game
    mapping(bytes32 => Game) private games;


    // ─── Events ───────────────────────────────────────────────────────────────

    event GameCreated(bytes32 indexed gameId, uint256 stakeAmount);
    event PlayerJoined(bytes32 indexed gameId, address indexed player);
    event GameStarted(bytes32 indexed gameId, uint256 pot);
    event GameCompleted(
        bytes32 indexed gameId,
        address[] winners,
        uint256 perWinnerAmount,
        uint256 feeCollected
    );
    event TreasuryUpdated(address indexed newTreasury);
    event ProtocolFeeUpdated(uint256 newFeeBps);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error GameAlreadyExists();
    error GameNotFound();
    error GameNotOpen();
    error GameNotActive();
    error GameAlreadyCompleted();
    error GameFull();
    error AlreadyJoined();
    error NotEnoughPlayers();
    error NoWinners();
    error FeeTooHigh();
    error ZeroAddress();
    error TransferFailed();
    error WinnerNotAPlayer();
    error PlayerNotInGame();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _goodDollar,
        address _treasury
    ) Ownable(msg.sender) {
        if (_goodDollar == address(0) || _treasury == address(0)) revert ZeroAddress();
        goodDollar = IERC20(_goodDollar);
        treasury = _treasury;
    }

    // ─── Game Lifecycle ───────────────────────────────────────────────────────

    /**
     * @notice Create a new game session. Called by backend when host creates a game.
     * @param gameId  Unique ID matching the backend game UUID (as bytes32)
     * @param stakeAmount  Amount of G$ each player must stake (in wei, 18 decimals)
     */
    function createGame(
        bytes32 gameId,
        uint256 stakeAmount
    ) external onlyOwner {
        if (games[gameId].exists) revert GameAlreadyExists();

        games[gameId].exists = true;
        games[gameId].stakeAmount = stakeAmount;
        games[gameId].status = GameStatus.Open;

        emit GameCreated(gameId, stakeAmount);
    }

    /**
     * @notice Player joins a game and stakes G$ (if stakeAmount > 0).
     *         For free games (stakeAmount = 0) no token transfer occurs.
     *         Backend calls this on behalf of the player after they approve the tx.
     * @param gameId  The game to join
     * @param player  The player's wallet address
     */
    function joinGame(
        bytes32 gameId,
        address player
    ) external onlyOwner nonReentrant {
        Game storage game = games[gameId];

        if (!game.exists) revert GameNotFound();
        if (game.status != GameStatus.Open) revert GameNotOpen();
        if (game.players.length >= 10) revert GameFull();

        // Check for duplicate join
        for (uint256 i = 0; i < game.players.length; i++) {
            if (game.players[i] == player) revert AlreadyJoined();
        }

        if (game.stakeAmount > 0) {
            // Pull stake from player — player must have approved contract first
            goodDollar.safeTransferFrom(player, address(this), game.stakeAmount);
            game.pot += game.stakeAmount;
        }

        game.players.push(player);

        emit PlayerJoined(gameId, player);
    }

    /**
     * @notice Lock the game — no more joins. Called when host starts the game.
     * @param gameId  The game to start
     */
    function startGame(bytes32 gameId) external onlyOwner {
        Game storage game = games[gameId];

        if (!game.exists) revert GameNotFound();
        if (game.status != GameStatus.Open) revert GameNotOpen();
        if (game.players.length < 3) revert NotEnoughPlayers();

        game.status = GameStatus.Active;

        emit GameStarted(gameId, game.pot);
    }

    /**
     * @notice Distribute rewards to winners. Called by backend after game resolution.
     *         Takes protocol fee, sends remainder equally to all winners.
     * @param gameId   The completed game
     * @param winners  Array of winner wallet addresses
     */
    function distributeRewards(
        bytes32 gameId,
        address[] calldata winners
    ) external onlyOwner nonReentrant {
        Game storage game = games[gameId];

        if (!game.exists) revert GameNotFound();
        if (game.status != GameStatus.Active) revert GameNotActive();
        if (winners.length == 0) revert NoWinners();

        // Validate every winner was an actual player in this game
        for (uint256 i = 0; i < winners.length; i++) {
            bool found = false;
            for (uint256 j = 0; j < game.players.length; j++) {
                if (game.players[j] == winners[i]) { found = true; break; }
            }
            if (!found) revert WinnerNotAPlayer();
        }

        game.status = GameStatus.Completed;
        game.winners = winners;

        uint256 pot = game.pot;

        // If pot is 0 (e.g. all players were first-timers), nothing to distribute
        if (pot == 0) {
            emit GameCompleted(gameId, winners, 0, 0);
            return;
        }

        uint256 fee = (pot * protocolFeeBps) / 10_000;
        uint256 rewardPool = pot - fee;
        uint256 perWinner = rewardPool / winners.length;

        // Send fee to treasury
        if (fee > 0) {
            goodDollar.safeTransfer(treasury, fee);
        }

        // Pay each winner
        for (uint256 i = 0; i < winners.length; i++) {
            goodDollar.safeTransfer(winners[i], perWinner);
        }

        // Dust (from integer division rounding) goes to treasury
        uint256 dust = rewardPool - (perWinner * winners.length);
        if (dust > 0) {
            goodDollar.safeTransfer(treasury, dust);
        }

        emit GameCompleted(gameId, winners, perWinner, fee);
    }

    // ─── Owner Utilities ──────────────────────────────────────────────────────

    /**
     * @notice Remove a single player from an open lobby and refund their stake.
     *         Called when a player leaves before the game starts.
     * @param gameId  The open game
     * @param player  The player to remove
     */
    function removePlayer(bytes32 gameId, address player) external onlyOwner nonReentrant {
        Game storage game = games[gameId];

        if (!game.exists) revert GameNotFound();
        if (game.status != GameStatus.Open) revert GameNotOpen();

        // Find and remove player by swapping with the last element then popping
        uint256 len = game.players.length;
        bool found = false;
        for (uint256 i = 0; i < len; i++) {
            if (game.players[i] == player) {
                game.players[i] = game.players[len - 1];
                game.players.pop();
                found = true;
                break;
            }
        }
        if (!found) revert PlayerNotInGame();

        // Refund stake if they paid
        if (game.stakeAmount > 0) {
            game.pot -= game.stakeAmount;
            goodDollar.safeTransfer(player, game.stakeAmount);
        }
    }

    /**
     * @notice Cancel a game and refund stakes to all players.
     *         Use if the backend cannot complete the game after players have staked.
     * @param gameId  The game to cancel
     */
    function cancelGame(bytes32 gameId) external onlyOwner nonReentrant {
        Game storage game = games[gameId];

        if (!game.exists) revert GameNotFound();
        if (game.status == GameStatus.Completed) revert GameAlreadyCompleted();

        game.status = GameStatus.Completed;

        if (game.stakeAmount > 0) {
            for (uint256 i = 0; i < game.players.length; i++) {
                goodDollar.safeTransfer(game.players[i], game.stakeAmount);
            }
        }
    }

    /**
     * @notice Update the treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @notice Recover tokens accidentally sent to this contract.
     * @dev    Owner is responsible for not over-withdrawing from active game pots.
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @notice Update the protocol fee. Max 10%.
     */
    function setProtocolFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 1000) revert FeeTooHigh();
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(newFeeBps);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getGame(bytes32 gameId) external view returns (
        uint256 stakeAmount,
        uint256 pot,
        GameStatus status,
        address[] memory players,
        address[] memory winners
    ) {
        Game storage game = games[gameId];
        return (
            game.stakeAmount,
            game.pot,
            game.status,
            game.players,
            game.winners
        );
    }

    function getGamePot(bytes32 gameId) external view returns (uint256) {
        return games[gameId].pot;
    }

    function getGameStatus(bytes32 gameId) external view returns (GameStatus) {
        return games[gameId].status;
    }

    function getGamePlayers(bytes32 gameId) external view returns (address[] memory) {
        return games[gameId].players;
    }
}
