// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title OAA Agent Registry on Base
/// @notice Anyone can register an SI agent. Clients hire an agent and pay in ETH or USDC; the payment waits
///         in this contract (escrow) until the agent delivers its result on-chain. Then the payment is split:
///         80% to the agent owner, 20% to the OAA treasury (100% to the treasury for OAA's own agents).
///         If an agent does not deliver in time, the client takes the full payment back.
///
///         The admin (later the OAA Treasury Safe) can only: verify agents, suspend agents (no new jobs),
///         mark OAA's own agents and change the registration fee (capped). The admin can never move funds:
///         every payment either goes to the agent owner and treasury, or back to the client.
contract OAAAgentRegistry {
    // ------------------------------------------------------------------ constants
    uint256 public constant TREASURY_BPS = 2_000; //          20% of each paid job
    uint256 public constant MAX_REGISTRATION_FEE = 0.05 ether;
    uint32 public constant MIN_DEADLINE = 10 minutes;
    uint32 public constant MAX_DEADLINE = 7 days;
    uint256 public constant MAX_UNITS = 1_000;

    IERC20Like public immutable usdc;
    address public immutable treasury;

    // ------------------------------------------------------------------ storage
    struct Agent {
        address owner; //     controls the agent entry
        address operator; //  the agent's server wallet that delivers results
        address payout; //    receives the owner share
        uint96 priceEth; //   per job unit in wei, 0 = ETH not accepted
        uint96 priceUsdc; //  per job unit in USDC (6 decimals), 0 = USDC not accepted
        uint32 deadline; //   seconds the agent has to deliver
        bool active; //       owner switch
        bool verified; //     set by the admin
        bool suspended; //    set by the admin
        bool official; //     OAA's own agent: 100% to the treasury
        uint64 jobsDone;
        uint128 earnedEth; // owner share paid out in ETH (wei)
        uint128 earnedUsdc; // owner share paid out in USDC
        string name;
        string uri; //        description, logo, endpoint (JSON or https/ipfs link)
    }

    enum Status { None, Open, Done, Refunded }

    struct Job {
        uint64 agentId;
        address client;
        bool usdcPaid;
        Status status;
        uint32 units;
        uint64 dueAt;
        uint128 amount;
        bytes32 request; //  hash or id of the request (the content stays off-chain)
        bytes32 result; //   hash of the delivered result
    }

    address public admin;
    address public pendingAdmin;
    uint256 public registrationFee;

    Agent[] internal _agents; // index 0 unused
    Job[] internal _jobs; //     index 0 unused
    mapping(address => uint256) public agentCount; // agents per owner

    mapping(address => uint256) public claimableEth;
    mapping(address => uint256) public claimableUsdc;

    uint256 private _lock = 1;

    // ------------------------------------------------------------------ events
    event AgentRegistered(uint256 indexed agentId, address indexed owner, string name);
    event AgentUpdated(uint256 indexed agentId);
    event AgentOwnerChanged(uint256 indexed agentId, address indexed newOwner);
    event AgentFlags(uint256 indexed agentId, bool verified, bool suspended, bool official);
    event JobRequested(uint256 indexed jobId, uint256 indexed agentId, address indexed client, uint256 units, uint256 amount, bool usdc, bytes32 request, uint256 dueAt);
    event JobDelivered(uint256 indexed jobId, uint256 indexed agentId, bytes32 result, string resultUri, uint256 toOwner, uint256 toTreasury);
    event JobRefunded(uint256 indexed jobId, uint256 indexed agentId, uint256 amount);
    event Withdrawn(address indexed to, uint256 eth, uint256 usdcAmount);
    event RegistrationFeeChanged(uint256 fee);
    event AdminTransferStarted(address indexed to);
    event AdminChanged(address indexed admin);

    // ------------------------------------------------------------------ errors
    error NotAdmin();
    error NotAgentOwner();
    error NotOperator();
    error BadAgent();
    error BadInput();
    error AgentUnavailable();
    error WrongPayment();
    error JobNotOpen();
    error TooLate();
    error TooEarly();
    error NothingToWithdraw();
    error TransferFailed();
    error Reentrancy();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address _treasury, IERC20Like _usdc, uint256 _registrationFee) {
        if (_treasury == address(0) || address(_usdc) == address(0) || _registrationFee > MAX_REGISTRATION_FEE) revert BadInput();
        treasury = _treasury;
        usdc = _usdc;
        admin = msg.sender;
        registrationFee = _registrationFee;
        _agents.push();
        _jobs.push();
        emit AdminChanged(msg.sender);
        emit RegistrationFeeChanged(_registrationFee);
    }

    // ------------------------------------------------------------------ agents

    /// @notice Registers an agent. Pays the registration fee (to the treasury) in ETH.
    function registerAgent(
        string calldata name,
        string calldata uri,
        address operator,
        address payout,
        uint96 priceEth,
        uint96 priceUsdc,
        uint32 deadline
    ) external payable returns (uint256 agentId) {
        if (msg.value != registrationFee) revert WrongPayment();
        _check(name, uri, operator, payout, priceEth, priceUsdc, deadline);
        agentId = _agents.length;
        Agent storage a = _agents.push();
        a.owner = msg.sender;
        a.operator = operator;
        a.payout = payout;
        a.priceEth = priceEth;
        a.priceUsdc = priceUsdc;
        a.deadline = deadline;
        a.active = true;
        a.name = name;
        a.uri = uri;
        agentCount[msg.sender]++;
        if (msg.value > 0) claimableEth[treasury] += msg.value;
        emit AgentRegistered(agentId, msg.sender, name);
    }

    function updateAgent(
        uint256 agentId,
        string calldata name,
        string calldata uri,
        address operator,
        address payout,
        uint96 priceEth,
        uint96 priceUsdc,
        uint32 deadline,
        bool active
    ) external {
        Agent storage a = _ownAgent(agentId);
        _check(name, uri, operator, payout, priceEth, priceUsdc, deadline);
        a.name = name;
        a.uri = uri;
        a.operator = operator;
        a.payout = payout;
        a.priceEth = priceEth;
        a.priceUsdc = priceUsdc;
        a.deadline = deadline;
        a.active = active;
        emit AgentUpdated(agentId);
    }

    function transferAgent(uint256 agentId, address newOwner) external {
        Agent storage a = _ownAgent(agentId);
        if (newOwner == address(0)) revert BadInput();
        agentCount[a.owner]--;
        agentCount[newOwner]++;
        a.owner = newOwner;
        emit AgentOwnerChanged(agentId, newOwner);
    }

    function _check(string calldata name, string calldata uri, address operator, address payout, uint96 priceEth, uint96 priceUsdc, uint32 deadline) internal pure {
        uint256 n = bytes(name).length;
        if (n == 0 || n > 48 || bytes(uri).length > 512) revert BadInput();
        if (operator == address(0) || payout == address(0)) revert BadInput();
        if (priceEth == 0 && priceUsdc == 0) revert BadInput();
        if (deadline < MIN_DEADLINE || deadline > MAX_DEADLINE) revert BadInput();
    }

    function _ownAgent(uint256 agentId) internal view returns (Agent storage a) {
        if (agentId == 0 || agentId >= _agents.length) revert BadAgent();
        a = _agents[agentId];
        if (a.owner != msg.sender) revert NotAgentOwner();
    }

    // ------------------------------------------------------------------ jobs

    /// @notice Hires an agent and pays in ETH: msg.value must equal priceEth * units.
    function hireWithEth(uint256 agentId, uint256 units, bytes32 request) external payable nonReentrant returns (uint256 jobId) {
        Agent storage a = _available(agentId, units);
        uint256 cost = uint256(a.priceEth) * units;
        if (a.priceEth == 0 || msg.value != cost) revert WrongPayment();
        jobId = _open(agentId, a, units, cost, false, request);
    }

    /// @notice Hires an agent and pays in USDC (approve this contract first).
    function hireWithUsdc(uint256 agentId, uint256 units, bytes32 request) external nonReentrant returns (uint256 jobId) {
        Agent storage a = _available(agentId, units);
        uint256 cost = uint256(a.priceUsdc) * units;
        if (a.priceUsdc == 0) revert WrongPayment();
        _pullUsdc(msg.sender, cost);
        jobId = _open(agentId, a, units, cost, true, request);
    }

    function _available(uint256 agentId, uint256 units) internal view returns (Agent storage a) {
        if (agentId == 0 || agentId >= _agents.length) revert BadAgent();
        if (units == 0 || units > MAX_UNITS) revert BadInput();
        a = _agents[agentId];
        if (!a.active || a.suspended) revert AgentUnavailable();
    }

    function _open(uint256 agentId, Agent storage a, uint256 units, uint256 cost, bool isUsdc, bytes32 request) internal returns (uint256 jobId) {
        jobId = _jobs.length;
        uint64 due = uint64(block.timestamp + a.deadline);
        _jobs.push(Job({
            agentId: uint64(agentId),
            client: msg.sender,
            usdcPaid: isUsdc,
            status: Status.Open,
            units: uint32(units),
            dueAt: due,
            amount: uint128(cost),
            request: request,
            result: bytes32(0)
        }));
        emit JobRequested(jobId, agentId, msg.sender, units, cost, isUsdc, request, due);
    }

    /// @notice The agent's operator delivers the result before the deadline; the payment is split.
    function deliver(uint256 jobId, bytes32 result, string calldata resultUri) external nonReentrant {
        Job storage j = _openJob(jobId);
        Agent storage a = _agents[j.agentId];
        if (msg.sender != a.operator) revert NotOperator();
        if (block.timestamp > j.dueAt) revert TooLate();
        if (bytes(resultUri).length > 512) revert BadInput();
        j.status = Status.Done;
        j.result = result;
        uint256 amount = j.amount;
        uint256 toTreasury = a.official ? amount : (amount * TREASURY_BPS) / 10_000;
        uint256 toOwner = amount - toTreasury;
        if (j.usdcPaid) {
            claimableUsdc[treasury] += toTreasury;
            if (toOwner > 0) { claimableUsdc[a.payout] += toOwner; a.earnedUsdc += uint128(toOwner); }
        } else {
            claimableEth[treasury] += toTreasury;
            if (toOwner > 0) { claimableEth[a.payout] += toOwner; a.earnedEth += uint128(toOwner); }
        }
        a.jobsDone++;
        emit JobDelivered(jobId, j.agentId, result, resultUri, toOwner, toTreasury);
    }

    /// @notice After the deadline without delivery the client takes the full payment back.
    function refund(uint256 jobId) external nonReentrant {
        Job storage j = _openJob(jobId);
        if (block.timestamp <= j.dueAt) revert TooEarly();
        j.status = Status.Refunded;
        uint256 amount = j.amount;
        if (j.usdcPaid) claimableUsdc[j.client] += amount;
        else claimableEth[j.client] += amount;
        emit JobRefunded(jobId, j.agentId, amount);
    }

    function _openJob(uint256 jobId) internal view returns (Job storage j) {
        if (jobId == 0 || jobId >= _jobs.length) revert JobNotOpen();
        j = _jobs[jobId];
        if (j.status != Status.Open) revert JobNotOpen();
    }

    /// @notice Withdraws everything this address can claim (owner shares, refunds, treasury share).
    function withdraw() external nonReentrant {
        uint256 e = claimableEth[msg.sender];
        uint256 u = claimableUsdc[msg.sender];
        if (e == 0 && u == 0) revert NothingToWithdraw();
        claimableEth[msg.sender] = 0;
        claimableUsdc[msg.sender] = 0;
        if (u > 0 && !usdc.transfer(msg.sender, u)) revert TransferFailed();
        if (e > 0) {
            (bool ok,) = msg.sender.call{value: e}("");
            if (!ok) revert TransferFailed();
        }
        emit Withdrawn(msg.sender, e, u);
    }

    /// @notice Sends the treasury's share to the treasury. Anyone can call it.
    function withdrawTreasury() external nonReentrant {
        uint256 e = claimableEth[treasury];
        uint256 u = claimableUsdc[treasury];
        if (e == 0 && u == 0) revert NothingToWithdraw();
        claimableEth[treasury] = 0;
        claimableUsdc[treasury] = 0;
        if (u > 0 && !usdc.transfer(treasury, u)) revert TransferFailed();
        if (e > 0) {
            (bool ok,) = treasury.call{value: e}("");
            if (!ok) revert TransferFailed();
        }
        emit Withdrawn(treasury, e, u);
    }

    function _pullUsdc(address from, uint256 amount) internal {
        (bool ok, bytes memory r) = address(usdc).call(abi.encodeWithSelector(IERC20Like.transferFrom.selector, from, address(this), amount));
        if (!ok || (r.length > 0 && !abi.decode(r, (bool)))) revert TransferFailed();
    }

    // ------------------------------------------------------------------ admin (cannot move funds)

    function setFlags(uint256 agentId, bool verified, bool suspended, bool official) external onlyAdmin {
        if (agentId == 0 || agentId >= _agents.length) revert BadAgent();
        Agent storage a = _agents[agentId];
        a.verified = verified;
        a.suspended = suspended;
        a.official = official;
        emit AgentFlags(agentId, verified, suspended, official);
    }

    function setRegistrationFee(uint256 fee) external onlyAdmin {
        if (fee > MAX_REGISTRATION_FEE) revert BadInput();
        registrationFee = fee;
        emit RegistrationFeeChanged(fee);
    }

    function transferAdmin(address to) external onlyAdmin {
        pendingAdmin = to;
        emit AdminTransferStarted(to);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotAdmin();
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminChanged(msg.sender);
    }

    // ------------------------------------------------------------------ views

    function agentsLength() external view returns (uint256) {
        return _agents.length - 1;
    }

    function jobsLength() external view returns (uint256) {
        return _jobs.length - 1;
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        if (agentId == 0 || agentId >= _agents.length) revert BadAgent();
        return _agents[agentId];
    }

    /// @notice Agents `from` to `from + count - 1` (for the website list).
    function getAgents(uint256 from, uint256 count) external view returns (Agent[] memory list) {
        uint256 n = _agents.length;
        if (from == 0) from = 1;
        if (from >= n) return new Agent[](0);
        if (from + count > n) count = n - from;
        list = new Agent[](count);
        for (uint256 i = 0; i < count; i++) list[i] = _agents[from + i];
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        if (jobId == 0 || jobId >= _jobs.length) revert JobNotOpen();
        return _jobs[jobId];
    }
}
