// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

/// @title OAA launch hook for the $OAA / ETH pool on Uniswap V4
/// @notice One transaction creates the pool, adds the $OAA liquidity in three one-sided ranges (no ETH needed)
///         and makes the launcher's first buy at the normal 1% fee. Nobody can trade in that block.
///         The ranges are set at launch, e.g. start -> $1M market cap, $1M -> $50M, $50M -> $1B.
///
///         Anti-sniper rules after launch (from the next block on):
///           - first 10 minutes: the swap fee starts at 25% and falls in a straight line to 1%, for buys and sells
///           - first 5 minutes: at most 20,000,000 $OAA per buy and one buy per wallet (tx.origin) per block
///             (no limit on the total: buy again in a later block)
///         After 5 minutes anyone can buy any amount; after 10 minutes the pool is a normal pool with a 1% fee.
///         The rules can never be changed.
///
///         The liquidity (all three ranges) belongs to this contract and has no remove function: it is locked forever.
///         Trading fees from the position can be collected by anyone and always go to the treasury.
///         There is no owner function to stop trading, change fees or move funds.
contract OAALaunchHook is IHooks, IUnlockCallback {
    IPoolManager public immutable poolManager;
    address public immutable oaa;
    address public immutable launcher;
    address public immutable treasury;

    int24 public constant TICK_SPACING = 200;
    uint24 public constant BASE_FEE = 10_000; //        1%
    uint24 public constant START_FEE = 250_000; //     25%
    uint256 public constant WINDOW = 10 minutes; //        high fee period
    uint256 public constant LIMIT_WINDOW = 5 minutes; //   buy limits period
    uint256 public constant MAX_BUY = 20_000_000 ether; // per buy during the limit period

    bool public launched;
    uint64 public launchBlock;
    uint64 public launchTime;
    PoolKey internal _key;
    int24[4] internal _ticks; //     range edges, from the start price down: [start, edge1, edge2, end]
    uint256[3] internal _amounts; // $OAA in each range

    mapping(address => uint256) public lastBuyBlock;

    event Launched(PoolId indexed poolId, int24[4] ticks, uint256[3] amounts, uint256 launchEth, uint256 launchOaa);
    event FeesCollected(uint256 eth, uint256 oaa);

    error NotPoolManager();
    error NotLauncher();
    error AlreadyLaunched();
    error NotLaunched();
    error PoolCreatedByLaunch();
    error TradingOpensNextBlock();
    error OneBuyPerBlock();
    error MaxBuyPerTrade();
    error BadTick();
    error SlippageTooHigh();
    error HookNotImplemented();

    constructor(IPoolManager _poolManager, address _oaa, address _launcher, address _treasury) {
        require(address(_poolManager) != address(0) && _oaa != address(0) && _launcher != address(0) && _treasury != address(0), "zero address");
        poolManager = _poolManager;
        oaa = _oaa;
        launcher = _launcher;
        treasury = _treasury;
        Hooks.validateHookPermissions(
            IHooks(address(this)),
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    /// @notice The pool key of the $OAA / ETH pool (ETH is currency0, $OAA is currency1).
    function poolKey() public view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(oaa),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(this))
        });
    }

    /// @notice Current swap fee in hundredths of a bip (10000 = 1%).
    function currentFee() public view returns (uint24) {
        if (!launched || block.timestamp >= uint256(launchTime) + WINDOW) return BASE_FEE;
        uint256 elapsed = block.timestamp - launchTime;
        return uint24(uint256(START_FEE) - (uint256(START_FEE - BASE_FEE) * elapsed) / WINDOW);
    }

    /// @notice The range edges as ticks (OAA per ETH, falling = $OAA more expensive) and the $OAA in each range.
    function ranges() external view returns (int24[4] memory ticks, uint256[3] memory amounts) {
        return (_ticks, _amounts);
    }

    // ------------------------------------------------------------------ launch

    /// @notice Creates the pool at the start price, adds three one-sided $OAA ranges and buys $OAA with the
    ///         ETH sent (at the 1% fee). Only the launcher, only once.
    /// @param ticks range edges from the start price down: ticks[0] = start (also the pool price),
    ///        range i goes from ticks[i] to ticks[i+1]; all multiples of 200, strictly falling
    /// @param amounts $OAA for each range (approve this contract for the sum first)
    /// @param minOaaOut minimum $OAA the launcher must receive for the ETH sent
    function launch(int24[4] calldata ticks, uint256[3] calldata amounts, uint256 minOaaOut)
        external
        payable
        returns (uint256 oaaBought)
    {
        if (msg.sender != launcher) revert NotLauncher();
        if (launched) revert AlreadyLaunched();
        if (ticks[0] > TickMath.maxUsableTick(TICK_SPACING) || ticks[3] < TickMath.minUsableTick(TICK_SPACING)) revert BadTick();
        uint256 total;
        for (uint256 i = 0; i < 4; i++) {
            if (ticks[i] % TICK_SPACING != 0) revert BadTick();
            if (i < 3) {
                if (ticks[i] <= ticks[i + 1]) revert BadTick();
                require(amounts[i] > 0, "amount");
                total += amounts[i];
            }
        }

        launched = true;
        launchBlock = uint64(block.number);
        launchTime = uint64(block.timestamp);
        _ticks = ticks;
        _amounts = amounts;
        PoolKey memory key = poolKey();
        _key = key;

        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(ticks[0]));
        poolManager.updateDynamicLPFee(key, BASE_FEE);

        require(IERC20Minimal(oaa).transferFrom(msg.sender, address(this), total), "transfer");
        bytes memory r = poolManager.unlock(abi.encode(uint8(0), msg.value, minOaaOut));
        oaaBought = abi.decode(r, (uint256));

        // dust that did not fit in the positions goes back to the launcher
        uint256 rest = IERC20Minimal(oaa).balanceOf(address(this));
        if (rest > 0) require(IERC20Minimal(oaa).transfer(msg.sender, rest), "refund");
        uint256 restEth = address(this).balance;
        if (restEth > 0) {
            (bool ok,) = msg.sender.call{value: restEth}("");
            require(ok, "eth refund");
        }
        emit Launched(key.toId(), ticks, amounts, msg.value - restEth, oaaBought);
    }

    /// @notice Sends the trading fees earned by the locked positions to the treasury. Anyone can call it.
    function collectFees() external returns (uint256 eth, uint256 oaaFees) {
        if (!launched) revert NotLaunched();
        bytes memory r = poolManager.unlock(abi.encode(uint8(1), uint256(0), uint256(0)));
        (eth, oaaFees) = abi.decode(r, (uint256, uint256));
        emit FeesCollected(eth, oaaFees);
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (uint8 mode, uint256 ethIn, uint256 minOut) = abi.decode(data, (uint8, uint256, uint256));
        PoolKey memory key = _key;
        if (mode == 0) {
            uint256 owe1;
            for (uint256 i = 0; i < 3; i++) {
                int24 lo = _ticks[i + 1];
                int24 hi = _ticks[i];
                uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(
                    TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), _amounts[i]
                );
                (BalanceDelta added,) = poolManager.modifyLiquidity(
                    key, ModifyLiquidityParams({tickLower: lo, tickUpper: hi, liquidityDelta: int256(uint256(liquidity)), salt: 0}), ""
                );
                require(added.amount0() == 0, "one-sided");
                owe1 += uint256(int256(-added.amount1()));
            }
            poolManager.sync(key.currency1);
            require(IERC20Minimal(oaa).transfer(address(poolManager), owe1), "pay");
            poolManager.settle();

            uint256 got;
            if (ethIn > 0) {
                BalanceDelta d = poolManager.swap(
                    key, SwapParams({zeroForOne: true, amountSpecified: -int256(ethIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}), ""
                );
                uint256 paid = uint256(int256(-d.amount0()));
                got = uint256(int256(d.amount1()));
                if (got < minOut) revert SlippageTooHigh();
                poolManager.settle{value: paid}();
                poolManager.take(key.currency1, launcher, got);
            }
            return abi.encode(got);
        }
        // mode 1: collect the fees of the three locked positions to the treasury
        uint256 e;
        uint256 o;
        for (uint256 i = 0; i < 3; i++) {
            (BalanceDelta fees,) = poolManager.modifyLiquidity(
                key, ModifyLiquidityParams({tickLower: _ticks[i + 1], tickUpper: _ticks[i], liquidityDelta: 0, salt: 0}), ""
            );
            e += uint256(int256(fees.amount0()));
            o += uint256(int256(fees.amount1()));
        }
        if (e > 0) poolManager.take(key.currency0, treasury, e);
        if (o > 0) poolManager.take(key.currency1, treasury, o);
        return abi.encode(e, o);
    }

    // ------------------------------------------------------------------ hooks

    /// @dev Only launch() can create a pool with this hook (the pool manager skips the hook for its own calls).
    function beforeInitialize(address, PoolKey calldata, uint160) external view onlyPoolManager returns (bytes4) {
        revert PoolCreatedByLaunch();
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (block.number <= launchBlock) revert TradingOpensNextBlock();
        if (block.timestamp >= uint256(launchTime) + WINDOW) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }
        if (params.zeroForOne && block.timestamp < uint256(launchTime) + LIMIT_WINDOW) {
            if (lastBuyBlock[tx.origin] == block.number) revert OneBuyPerBlock();
            lastBuyBlock[tx.origin] = block.number;
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, currentFee() | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        if (params.zeroForOne && block.timestamp < uint256(launchTime) + LIMIT_WINDOW) {
            int128 out = delta.amount1();
            if (out > 0 && uint256(int256(out)) > MAX_BUY) revert MaxBuyPerTrade();
        }
        return (IHooks.afterSwap.selector, 0);
    }

    // unused hooks (their permission bits are not set, the pool manager never calls them)
    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) { revert HookNotImplemented(); }
    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata) external pure returns (bytes4) { revert HookNotImplemented(); }
    function afterAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata) external pure returns (bytes4, BalanceDelta) { revert HookNotImplemented(); }
    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata) external pure returns (bytes4) { revert HookNotImplemented(); }
    function afterRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata) external pure returns (bytes4, BalanceDelta) { revert HookNotImplemented(); }
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) { revert HookNotImplemented(); }
    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) { revert HookNotImplemented(); }

    receive() external payable {
        require(msg.sender == address(poolManager), "no ETH");
    }
}
