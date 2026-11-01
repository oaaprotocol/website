// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title OAAToken
/// @notice Standard fixed-supply ERC-20 created through the OAA launchpad.
///         1,000,000,000 tokens, 18 decimals, minted once to the launchpad, no owner, no mint, no tax.
///         The on-chain name always carries the platform tag: "<creator's name> by OAA".
contract OAAToken is ERC20 {
    /// @notice Platform this token was launched on.
    string public constant poweredBy = "OAA Protocol";
    /// @notice Suffix added to every token name.
    string public constant NAME_SUFFIX = " by OAA";
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    /// @notice The launchpad contract that created this token (and holds its locked liquidity).
    address public immutable launchpad;
    /// @notice The wallet that launched this token.
    address public immutable creator;
    /// @notice Free-form metadata supplied at launch (JSON: description, image URL, socials).
    string public metadata;

    constructor(string memory name_, string memory symbol_, address creator_, string memory metadata_, address launchpad_)
        ERC20(string(abi.encodePacked(name_, NAME_SUFFIX)), symbol_)
    {
        launchpad = launchpad_;
        creator = creator_;
        metadata = metadata_;
        _mint(launchpad_, TOTAL_SUPPLY);
    }
}

/// @title OAATokenFactory
/// @notice Deploys OAA tokens for the launchpad (created by the launchpad itself; only it can use this factory).
contract OAATokenFactory {
    address public immutable launchpad;

    constructor() {
        launchpad = msg.sender;
    }

    function create(bytes32 salt, string calldata name, string calldata symbol, address creator, string calldata metadata)
        external
        returns (address token)
    {
        require(msg.sender == launchpad, "OTF: only launchpad");
        token = address(new OAAToken{salt: salt}(name, symbol, creator, metadata, launchpad));
    }
}
