// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

/// @title OAA Time Capsule
/// @notice Anyone can seal a message for the OAA community. Messages are timelock-encrypted in the browser
///         (drand quicknet, tlock) to the round of 17 Nov 2027 15:00 UTC, so nobody, not even the OAA team,
///         can read them before that moment. This contract only stores the encrypted bytes as events.
///         No owner, no admin, no fees, holds no funds.
contract OAATimeCapsule {
    /// @notice 17 Nov 2027, 15:00:00 UTC (16:00 German time). Sealing closes at this moment.
    uint256 public constant OPENS_AT = 1826463600;
    /// @notice drand quicknet round that unlocks every message (the first round at OPENS_AT).
    uint64 public constant UNLOCK_ROUND = 44553412;
    uint256 public constant MAX_BYTES = 2048;
    uint256 public constant MAX_PER_WALLET = 3;

    uint256 public count;
    mapping(address => uint256) public sealedBy;

    event Sealed(uint256 indexed id, address indexed from, bytes ciphertext);

    function seal(bytes calldata ciphertext) external {
        require(block.timestamp < OPENS_AT, "TC: capsule closed");
        require(ciphertext.length > 0 && ciphertext.length <= MAX_BYTES, "TC: size");
        require(sealedBy[msg.sender] < MAX_PER_WALLET, "TC: limit");
        sealedBy[msg.sender] += 1;
        uint256 id = ++count;
        emit Sealed(id, msg.sender, ciphertext);
    }
}
