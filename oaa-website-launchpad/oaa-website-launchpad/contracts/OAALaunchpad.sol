// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "contracts/core/libraries/TickMath.sol";
import "contracts/core/libraries/FullMath.sol";
import "contracts/core/interfaces/ICLFactory.sol";
import "contracts/periphery/interfaces/INonfungiblePositionManager.sol";
import "contracts/periphery/interfaces/ISwapRouter.sol";
import "./OAAToken.sol";

interface IWETH9Minimal {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function decimals() external view returns (uint8);
}

/// @dev Common subset of Uniswap V3 pools and Aerodrome Slipstream pools.
interface IV3PoolLike {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data)
        external
        returns (int256 amount0, int256 amount1);
}

interface IUniswapV3FactoryLike {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

/// @title OAALaunchpad
/// @notice Launches fixed-supply tokens "powered by OAA" on Aerodrome Slipstream (Base).
///         - 1,000,000,000 supply, 18 decimals, no owner, no mint, no tax in the token itself
///         - 100% of the supply goes into the pool as single-sided liquidity in three ranges:
///           50% from $30k to $1M market cap, 30% from $1M to $50M, 20% from $50M to $1B
///         - the three position NFTs stay in this contract forever: the liquidity can never be removed
///         - the pool uses the 1% fee tier; the fees earned by the locked positions are split:
///           40% to the creator, 40% to the OAA treasury, 20% buys $OAA and burns it
///           (on sells the fee is paid in the launched token: 40% creator, 40% treasury, 20% burned)
///         - the creator may buy first in the same transaction, for up to $500 in ETH (not locked)
contract OAALaunchpad is ReentrancyGuard {
    // ---------------------------------------------------------------- fixed rules
    uint256 public constant SUPPLY = 1_000_000_000 ether;
    int24 public constant TICK_SPACING = 2_000; // Slipstream 1% fee tier
    uint256 public constant MAX_DEV_BUY_USD = 500; // whole dollars
    uint256 public constant MAX_ORACLE_AGE = 3 hours;
    uint256 public constant SEQUENCER_GRACE = 1 hours;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint8 public constant CATEGORY_COUNT = 8; // 0 meme, 1 SI agents, 2 RWA, 3 x402, 4 cats, 5 characters, 6 gaming, 7 DeFi

    uint256 public constant CREATOR_SHARE_BPS = 4_000; // 0.4% of volume
    uint256 public constant BURN_SHARE_BPS = 2_000; //    0.2% of volume (buys and burns $OAA)
    //                                                    rest 0.4% of volume to the treasury

    uint256 public constant MCAP_0 = 30_000;
    uint256 public constant MCAP_1 = 1_000_000;
    uint256 public constant MCAP_2 = 50_000_000;
    uint256 public constant MCAP_3 = 1_000_000_000;
    uint256 public constant SHARE_0 = 5_000;
    uint256 public constant SHARE_1 = 3_000; // SHARE_2 = the rest (20%)

    /// @notice Buyback protection: the swap may not execute more than ~3% above the 30-minute average price.
    uint32 public constant TWAP_SECONDS = 1_800;
    int24 public constant MAX_TWAP_DEVIATION_TICKS = 300; // ~3%

    // ---------------------------------------------------------------- external contracts
    INonfungiblePositionManager public immutable positionManager;
    ISwapRouter public immutable swapRouter;
    ICLFactory public immutable poolFactory;
    IUniswapV3FactoryLike public immutable uniV3Factory; // may be address(0)
    address public immutable weth;
    IAggregatorV3 public immutable ethUsdFeed;
    IAggregatorV3 public immutable sequencerFeed; // may be address(0)
    uint256 private immutable feedScale;

    // ---------------------------------------------------------------- state
    address public owner;
    address public pendingOwner;
    address public treasury;
    bool public paused;

    struct Launch {
        address creator;
        address pool;
        uint256[3] positions;
        uint64 launchedAt;
        int24 startTick;
        uint8 category;
    }

    mapping(address => Launch) internal _launches;
    address[] public allTokens;

    /// @notice Statistics for the public dashboard (all amounts in wei of WETH unless noted)
    uint256 public totalFeesWeth;
    mapping(address => uint256) public feesWeth;
    mapping(address => uint256) public creatorFeesWeth;

    /// @notice $OAA and the pool used to buy it back (Aerodrome Slipstream or Uniswap V3, paired with WETH).
    address public buybackToken;
    address public buybackPool;
    /// @notice WETH reserved for buybacks. It can only ever be spent on buying $OAA for the burn address.
    uint256 public buybackReserve;
    uint256 public minBuybackWeth = 0.002 ether;
    uint256 public totalBuybackWeth;
    uint256 public totalOaaBurned;

    event Launched(
        address indexed token,
        address indexed creator,
        uint8 indexed category,
        address pool,
        uint256[3] positions,
        int24 startTick,
        uint256 devBuyEth,
        uint256 devBuyTokens,
        uint256 burnedDust
    );
    event FeesSplit(
        address indexed token,
        uint256 wethToCreator,
        uint256 wethToTreasury,
        uint256 wethToBuyback,
        uint256 tokenToCreator,
        uint256 tokenToTreasury,
        uint256 tokenBurned
    );
    event Buyback(uint256 wethIn, uint256 oaaBurned);
    event BuybackSkipped(uint256 reserve);
    event BuybackPoolSet(address token, address pool);
    event MinBuybackChanged(uint256 amount);
    event TreasuryChanged(address treasury);
    event PausedChanged(bool paused);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "OL: not owner");
        _;
    }

    constructor(
        INonfungiblePositionManager _positionManager,
        ISwapRouter _swapRouter,
        IUniswapV3FactoryLike _uniV3Factory,
        address _weth,
        IAggregatorV3 _ethUsdFeed,
        IAggregatorV3 _sequencerFeed,
        address _treasury
    ) {
        require(_treasury != address(0) && _weth != address(0) && address(_ethUsdFeed) != address(0), "OL: zero address");
        positionManager = _positionManager;
        swapRouter = _swapRouter;
        poolFactory = ICLFactory(_positionManager.factory());
        uniV3Factory = _uniV3Factory;
        weth = _weth;
        ethUsdFeed = _ethUsdFeed;
        sequencerFeed = _sequencerFeed;
        feedScale = 10 ** uint256(_ethUsdFeed.decimals());
        require(ICLFactory(_positionManager.factory()).tickSpacingToFee(TICK_SPACING) == 10_000, "OL: not the 1% tier");
        owner = msg.sender;
        treasury = _treasury;
        emit OwnershipTransferred(address(0), msg.sender);
        emit TreasuryChanged(_treasury);
    }

    // ================================================================ launch
    /// @notice Launch a new token. Send ETH with the call to buy first (max $500, sent straight to you); send 0 to skip.
    function launch(string calldata name, string calldata symbol, uint8 category, string calldata metadata)
        external
        payable
        nonReentrant
        returns (address token)
    {
        require(!paused, "OL: paused");
        require(bytes(name).length > 0 && bytes(name).length <= 40, "OL: name length");
        require(bytes(symbol).length > 0 && bytes(symbol).length <= 12, "OL: symbol length");
        require(bytes(metadata).length <= 2_000, "OL: metadata length");
        require(category < CATEGORY_COUNT, "OL: category");

        uint256 ethUsd = _ethUsdPrice();
        if (msg.value > 0) {
            require(FullMath.mulDiv(msg.value, ethUsd, 1 ether) <= MAX_DEV_BUY_USD * feedScale, "OL: first buy above $500");
        }

        // CREATE2 with an unpredictable salt: nobody can pre-create the pool for the next token address
        bytes32 salt = keccak256(abi.encode(msg.sender, allTokens.length, blockhash(block.number - 1), name, symbol));
        token = address(new OAAToken{salt: salt}(name, symbol, msg.sender, metadata));
        require(poolFactory.getPool(token, weth, TICK_SPACING) == address(0), "OL: pool exists");
        bool tokenIsToken0 = token < weth;

        int24[4] memory t;
        t[0] = _tickForMcap(MCAP_0, ethUsd);
        t[1] = _tickForMcap(MCAP_1, ethUsd);
        t[2] = _tickForMcap(MCAP_2, ethUsd);
        t[3] = _tickForMcap(MCAP_3, ethUsd);
        require(t[0] < t[1] && t[1] < t[2] && t[2] < t[3], "OL: bad ranges");

        IERC20(token).approve(address(positionManager), SUPPLY);

        Launch storage l = _launches[token];
        l.creator = msg.sender;
        l.launchedAt = uint64(block.timestamp);
        l.category = category;

        uint256[3] memory amounts = [SUPPLY * SHARE_0 / 10_000, SUPPLY * SHARE_1 / 10_000, 0];
        amounts[2] = SUPPLY - amounts[0] - amounts[1];

        for (uint256 i = 0; i < 3; i++) {
            int24 lower;
            int24 upper;
            uint160 initPrice;
            if (tokenIsToken0) {
                lower = t[i];
                upper = t[i + 1];
                if (i == 0) initPrice = TickMath.getSqrtRatioAtTick(t[0]) - 1;
            } else {
                lower = -t[i + 1];
                upper = -t[i];
                if (i == 0) initPrice = TickMath.getSqrtRatioAtTick(-t[0]);
            }
            (uint256 tokenId,,,) = positionManager.mint(
                INonfungiblePositionManager.MintParams({
                    token0: tokenIsToken0 ? token : weth,
                    token1: tokenIsToken0 ? weth : token,
                    tickSpacing: TICK_SPACING,
                    tickLower: lower,
                    tickUpper: upper,
                    amount0Desired: tokenIsToken0 ? amounts[i] : 0,
                    amount1Desired: tokenIsToken0 ? 0 : amounts[i],
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: address(this),
                    deadline: block.timestamp,
                    sqrtPriceX96: initPrice
                })
            );
            l.positions[i] = tokenId;
        }
        l.startTick = tokenIsToken0 ? t[0] : -t[0];
        l.pool = poolFactory.getPool(token, weth, TICK_SPACING);

        uint256 dust = IERC20(token).balanceOf(address(this));
        if (dust > 0) require(IERC20(token).transfer(DEAD, dust), "OL: burn failed");

        // the creator buys first, in the same transaction, so nobody can trade before
        uint256 bought;
        if (msg.value > 0) {
            IWETH9Minimal(weth).deposit{value: msg.value}();
            IWETH9Minimal(weth).approve(address(swapRouter), msg.value);
            bought = swapRouter.exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: weth,
                    tokenOut: token,
                    tickSpacing: TICK_SPACING,
                    recipient: msg.sender,
                    deadline: block.timestamp,
                    amountIn: msg.value,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
        }

        allTokens.push(token);
        emit Launched(token, msg.sender, category, l.pool, l.positions, l.startTick, msg.value, bought, dust);
    }

    // ================================================================ fees
    /// @notice Collects the trading fees of a token's locked positions and splits them. Anyone may call.
    function collectFees(address token) public nonReentrant returns (uint256 amount0, uint256 amount1) {
        (amount0, amount1) = _collect(token);
        _tryBuyback();
    }

    /// @notice Collect fees for several tokens in one transaction (one buyback at the end).
    function collectFeesMany(address[] calldata tokens) external nonReentrant {
        for (uint256 i = 0; i < tokens.length; i++) _collect(tokens[i]);
        _tryBuyback();
    }

    /// @notice Runs the $OAA buyback with the reserved WETH. Anyone may call; the price is protected by the TWAP limit.
    function buyback() external nonReentrant returns (uint256 burned) {
        burned = _tryBuyback();
    }

    function _collect(address token) internal returns (uint256 amount0, uint256 amount1) {
        Launch storage l = _launches[token];
        require(l.pool != address(0), "OL: unknown token");
        for (uint256 i = 0; i < 3; i++) {
            (uint256 a0, uint256 a1) = positionManager.collect(
                INonfungiblePositionManager.CollectParams({
                    tokenId: l.positions[i],
                    recipient: address(this),
                    amount0Max: type(uint128).max,
                    amount1Max: type(uint128).max
                })
            );
            amount0 += a0;
            amount1 += a1;
        }
        bool t0 = token < weth;
        uint256 w = t0 ? amount1 : amount0;
        uint256 tk = t0 ? amount0 : amount1;
        address cr = l.creator;
        uint256 wCr = w * CREATOR_SHARE_BPS / 10_000;
        uint256 wBb = w * BURN_SHARE_BPS / 10_000;
        uint256 tCr = tk * CREATOR_SHARE_BPS / 10_000;
        uint256 tBurn = tk * BURN_SHARE_BPS / 10_000;
        if (w > 0) {
            totalFeesWeth += w;
            feesWeth[token] += w;
            creatorFeesWeth[cr] += wCr;
            buybackReserve += wBb;
            if (wCr > 0) require(IERC20(weth).transfer(cr, wCr), "OL: weth transfer");
            require(IERC20(weth).transfer(treasury, w - wCr - wBb), "OL: weth transfer");
        }
        if (tk > 0) {
            if (tBurn > 0) require(IERC20(token).transfer(DEAD, tBurn), "OL: burn failed");
            if (tCr > 0) require(IERC20(token).transfer(cr, tCr), "OL: token transfer");
            require(IERC20(token).transfer(treasury, tk - tCr - tBurn), "OL: token transfer");
        }
        emit FeesSplit(token, wCr, w - wCr - wBb, wBb, tCr, tk - tCr - tBurn, tBurn);
    }

    /// @dev Buys $OAA with the reserve and sends it to the burn address. Never reverts: if the pool has no
    ///      usable price history yet, the reserve simply waits. The swap stops at ~3% above the 30-minute
    ///      average price, so a manipulated spot price cannot make the buyback overpay; unspent WETH stays reserved.
    function _tryBuyback() internal returns (uint256 burned) {
        uint256 reserve = buybackReserve;
        address pool = buybackPool;
        if (pool == address(0) || reserve < minBuybackWeth) return 0;
        uint32[] memory ago = new uint32[](2);
        ago[0] = TWAP_SECONDS;
        (bool ok, bytes memory data) = pool.staticcall(abi.encodeWithSelector(IV3PoolLike.observe.selector, ago));
        if (!ok) {
            emit BuybackSkipped(reserve);
            return 0;
        }
        (int56[] memory cum,) = abi.decode(data, (int56[], uint160[]));
        int24 avg = int24((cum[1] - cum[0]) / int56(uint56(TWAP_SECONDS)));
        bool zeroForOne = weth < buybackToken; // paying WETH
        // paying token0 pushes the price (tick) down, paying token1 pushes it up
        int24 limitTick = zeroForOne ? avg - MAX_TWAP_DEVIATION_TICKS : avg + MAX_TWAP_DEVIATION_TICKS;
        if (limitTick <= TickMath.MIN_TICK) limitTick = TickMath.MIN_TICK + 1;
        if (limitTick >= TickMath.MAX_TICK) limitTick = TickMath.MAX_TICK - 1;
        uint160 limit = TickMath.getSqrtRatioAtTick(limitTick);
        try IV3PoolLike(pool).swap(DEAD, zeroForOne, int256(reserve), limit, abi.encode(pool)) returns (int256 a0, int256 a1) {
            uint256 paid = uint256(zeroForOne ? a0 : a1);
            burned = uint256(-(zeroForOne ? a1 : a0));
            buybackReserve = reserve - paid;
            totalBuybackWeth += paid;
            totalOaaBurned += burned;
            emit Buyback(paid, burned);
        } catch {
            emit BuybackSkipped(reserve);
        }
    }

    /// @dev Pays the buyback pool. Only the configured buyback pool, only during a buyback, only WETH.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        address pool = abi.decode(data, (address));
        require(msg.sender == buybackPool && pool == buybackPool, "OL: bad callback");
        uint256 owed = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        require(owed <= buybackReserve, "OL: over reserve");
        require(IERC20(weth).transfer(msg.sender, owed), "OL: pay failed");
    }

    // ================================================================ views
    function getLaunch(address token)
        external
        view
        returns (address creator, address pool, uint256[3] memory positions, uint64 launchedAt, int24 startTick, uint8 category)
    {
        Launch storage l = _launches[token];
        return (l.creator, l.pool, l.positions, l.launchedAt, l.startTick, l.category);
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function ethUsdPrice() external view returns (uint256) {
        return _ethUsdPrice();
    }

    /// @notice Maximum ETH the creator may spend on the first buy right now.
    function maxDevBuyWei() external view returns (uint256) {
        return FullMath.mulDiv(MAX_DEV_BUY_USD * feedScale, 1 ether, _ethUsdPrice());
    }

    // ================================================================ admin (cannot touch liquidity or fees)
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "OL: zero address");
        treasury = _treasury;
        emit TreasuryChanged(_treasury);
    }

    /// @notice Sets $OAA (only once) and its WETH pool. The pool must be a real Slipstream or Uniswap V3 pool.
    ///         Passing tickSpacing != 0 selects Slipstream, otherwise `uniFee` selects a Uniswap V3 pool.
    function setBuybackPool(address token, int24 tickSpacing, uint24 uniFee) external onlyOwner {
        require(token != address(0) && token != weth, "OL: bad token");
        require(buybackToken == address(0) || buybackToken == token, "OL: token fixed");
        address pool = tickSpacing != 0
            ? poolFactory.getPool(token, weth, tickSpacing)
            : (address(uniV3Factory) == address(0) ? address(0) : uniV3Factory.getPool(token, weth, uniFee));
        require(pool != address(0), "OL: no pool");
        buybackToken = token;
        buybackPool = pool;
        emit BuybackPoolSet(token, pool);
    }

    function setMinBuyback(uint256 amount) external onlyOwner {
        require(amount <= 1 ether, "OL: too high");
        minBuybackWeth = amount;
        emit MinBuybackChanged(amount);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedChanged(_paused);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "OL: not pending owner");
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    /// @dev Position NFTs are only ever received from the position manager and can never leave this contract.
    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        require(msg.sender == address(positionManager), "OL: unexpected NFT");
        return this.onERC721Received.selector;
    }

    // ================================================================ internal math
    function _ethUsdPrice() internal view returns (uint256) {
        if (address(sequencerFeed) != address(0)) {
            (, int256 status, uint256 startedAt,,) = sequencerFeed.latestRoundData();
            require(status == 0, "OL: sequencer down");
            require(startedAt != 0, "OL: sequencer round");
            require(block.timestamp - startedAt > SEQUENCER_GRACE, "OL: sequencer grace");
        }
        (, int256 answer,, uint256 updatedAt,) = ethUsdFeed.latestRoundData();
        require(answer > 0, "OL: bad price");
        require(updatedAt + MAX_ORACLE_AGE >= block.timestamp, "OL: stale price");
        return uint256(answer);
    }

    function _tickForMcap(uint256 mcapUsd, uint256 ethUsd) internal view returns (int24) {
        uint256 ratioX192 = FullMath.mulDiv(mcapUsd * feedScale, uint256(1) << 192, 1_000_000_000 * ethUsd);
        uint160 sqrtPriceX96 = uint160(_sqrt(ratioX192));
        int24 tick = TickMath.getTickAtSqrtRatio(sqrtPriceX96);
        int24 rounded = _roundToSpacing(tick);
        require(rounded > TickMath.MIN_TICK && rounded < TickMath.MAX_TICK, "OL: tick out of range");
        return rounded;
    }

    function _roundToSpacing(int24 tick) internal pure returns (int24) {
        int24 q = tick / TICK_SPACING;
        int24 r = tick % TICK_SPACING;
        if (r < 0) {
            q -= 1;
            r += TICK_SPACING;
        }
        if (r * 2 >= TICK_SPACING) q += 1;
        return q * TICK_SPACING;
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x >> 1) + 1;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) >> 1;
        }
    }
}
