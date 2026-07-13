// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*//////////////////////////////////////////////////////////////////////////////

    ██╗  ██╗ ██████╗  ██████╗ ██████╗ ██████╗ ██████╗ ██╗███╗   ██╗████████╗███████╗██████╗
    ██║  ██║██╔═══██╗██╔═══██╗██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
    ███████║██║   ██║██║   ██║██║  ██║██████╔╝██████╔╝██║██╔██╗ ██║   ██║   █████╗  ██████╔╝
    ██╔══██║██║   ██║██║   ██║██║  ██║██╔═══╝ ██╔══██╗██║██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗
    ██║  ██║╚██████╔╝╚██████╔╝██████╔╝██║     ██║  ██║██║██║ ╚████║   ██║   ███████╗██║  ██║
    ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝     ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝

               ┌─────────────────────────────────────────────┐
               │  $PRINT · B U Y   R O U T E R · ROBINHOOD CH │
               │            💵  ▶  🖨️  ▶  💸  ▶  📈            │
               │            "When we print, everyone prints."  │
               └─────────────────────────────────────────────┘

    HOODPrinter Buy Router — the canonical, branded front door for the
    HOODPrinter Buy Bot on Robinhood Chain.

    Every auto-buy is forwarded through this contract to the on-chain swap
    router, so all that transaction volume and gas is stamped as HOODPrinter
    activity on-chain — while the bought tokens go STRAIGHT to the buyer. It also
    records buy volume per wallet on-chain, so Buy Bot users can be rewarded /
    airdropped provably from a single source of truth.

    ── How a buy works ────────────────────────────────────────────────────────
    You send ETH plus a pre-built swap payload. This contract forwards both to
    the swap router in a single call; the swap router wraps your ETH, executes,
    and delivers the tokens to the recipient encoded in the payload (the buyer).
    This contract NEVER custodies your swap funds and holds no user balance
    between calls — any ETH dust is refunded to you in the same transaction.

    ── Treasury (airdrops), owner + operator ──────────────────────────────────
    Ecosystem airdrops and reward tokens are often sent to the most active
    contracts. Two roles manage what accrues here:
      • owner    — a secure wallet (e.g. the team's main wallet / multisig).
                   Full control: claim airdrops via arbitrary calls, sweep to
                   any address, set the operator, transfer ownership.
      • operator — a convenience role (e.g. the Buy Bot's in-browser wallet).
                   Can trigger sweeps too, but sweeps it initiates can ONLY send
                   funds to the owner. It cannot pick a destination, make
                   arbitrary calls, or change roles.

    So a compromised operator key can, at worst, move the contract's airdrops to
    the OWNER — never to an attacker. Neither role can ever touch a user's
    in-flight swap; those funds pass through atomically and never rest here.

    Site:  https://www.hoodprinter.xyz
    X:     @HOODPrinterxyz

//////////////////////////////////////////////////////////////////////////////*/

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title HOODPrinter Buy Router
 * @author HOODPrinter ($PRINT) — https://www.hoodprinter.xyz
 * @notice Canonical pass-through that forwards ETH-in Buy Bot swaps to the
 *         underlying swap router, attributing volume + gas to HOODPrinter and
 *         recording per-wallet buy stats on-chain. Holds no user funds.
 */
contract HOODPrinterBuyRouter {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The underlying swap router (Universal Router) on Robinhood Chain.
    address public constant SWAP_ROUTER =
        0x8876789976dEcBfCbBbe364623C63652db8C0904;

    string public constant name = "HOODPrinter Buy Router";
    string public constant token = "$PRINT";
    string public constant website = "https://www.hoodprinter.xyz";
    string public constant twitter = "@HOODPrinterxyz";
    string public constant tagline = "When we print, everyone prints.";
    string public constant version = "1.0.0";

    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Treasury owner — full control over airdrops that accrue here.
    address public owner;

    /// @notice Convenience role (e.g. the burner). Can trigger sweeps, but only
    ///         to the owner. Cannot make arbitrary calls or change roles.
    address public operator;

    /// @notice Global lifetime stats (a canonical on-chain volume source).
    uint256 public totalBuys;
    uint256 public totalEthRouted;
    uint256 public uniqueBuyers;

    /// @notice Per-wallet buy stats — the on-chain basis for user airdrops.
    mapping(address => uint256) public buyerBuys;
    mapping(address => uint256) public buyerEthRouted;

    /// @dev Non-reentrancy guard.
    uint256 private _lock = 1;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted on every buy — stamps HOODPrinter branding + volume.
    event Printed(address indexed buyer, uint256 ethIn, uint256 buyerBuyCount);
    event OwnershipTransferred(address indexed from, address indexed to);
    event OperatorChanged(address indexed from, address indexed to);
    event Swept(address indexed t, address indexed to, uint256 amount);
    event OwnerCall(address indexed target, uint256 value, bytes data);

    /*//////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyOwnerOrOperator() {
        require(msg.sender == owner || msg.sender == operator, "not authorized");
        _;
    }

    modifier nonReentrant() {
        require(_lock == 1, "reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address initialOwner, address initialOperator) {
        require(initialOwner != address(0), "owner=0");
        owner = initialOwner;
        operator = initialOperator; // may be address(0) if unused
        emit OwnershipTransferred(address(0), initialOwner);
        emit OperatorChanged(address(0), initialOperator);
    }

    /*//////////////////////////////////////////////////////////////
                                  BUY
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Forward an ETH-in swap to the underlying router. `commands`,
     *         `inputs` and `deadline` are the exact Universal Router
     *         `execute(bytes,bytes[],uint256)` arguments the Buy Bot builds. The
     *         router pays with the ETH sent here and delivers the bought tokens
     *         to the recipient encoded inside `inputs` (the buyer).
     * @dev    Checks-effects-interactions + a reentrancy guard. Any ETH left
     *         here afterward (dust / a refunded leg) is returned to the caller.
     */
    function buy(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable nonReentrant {
        require(msg.value > 0, "no ETH");

        // ---- effects: record stats before external interactions ----
        if (buyerBuys[msg.sender] == 0) {
            uniqueBuyers += 1;
        }
        totalBuys += 1;
        totalEthRouted += msg.value;
        buyerBuys[msg.sender] += 1;
        buyerEthRouted[msg.sender] += msg.value;

        // ---- interaction: forward the swap ----
        (bool ok, bytes memory ret) = SWAP_ROUTER.call{value: msg.value}(
            abi.encodeWithSignature(
                "execute(bytes,bytes[],uint256)",
                commands,
                inputs,
                deadline
            )
        );
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }

        // ---- refund any ETH dust to the buyer; never keep user funds ----
        uint256 bal = address(this).balance;
        if (bal > 0) {
            (bool refunded, ) = msg.sender.call{value: bal}("");
            require(refunded, "refund failed");
        }

        emit Printed(msg.sender, msg.value, buyerBuys[msg.sender]);
    }

    /*//////////////////////////////////////////////////////////////
                            TREASURY / AIRDROPS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sweep the full ERC-20 balance of a token held by this contract
    ///         (e.g. an airdrop) TO THE OWNER. Callable by owner or operator, so
    ///         the burner can pull airdrops in with one click — but the funds
    ///         can only ever go to the owner. Cannot affect user swaps.
    function sweepToken(address t) external onlyOwnerOrOperator {
        address to = owner;
        uint256 amount = IERC20(t).balanceOf(address(this));
        require(IERC20(t).transfer(to, amount), "sweep failed");
        emit Swept(t, to, amount);
    }

    /// @notice Sweep this contract's ETH balance TO THE OWNER. Owner/operator.
    function sweepETH() external onlyOwnerOrOperator {
        address to = owner;
        uint256 amount = address(this).balance;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "sweep failed");
        emit Swept(address(0), to, amount);
    }

    /// @notice Owner-only: sweep a token to ANY address (full flexibility).
    function sweepTokenTo(address t, address to, uint256 amount)
        external
        onlyOwner
    {
        require(to != address(0), "to=0");
        require(IERC20(t).transfer(to, amount), "sweep failed");
        emit Swept(t, to, amount);
    }

    /// @notice Owner-only: sweep ETH to ANY address.
    function sweepETHTo(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to=0");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "sweep failed");
        emit Swept(address(0), to, amount);
    }

    /// @notice Make this contract call another contract — e.g. to CLAIM an
    ///         airdrop / reward directed at this contract's address. Owner-only.
    ///         Bounded to the contract's own idle assets; cannot reach user
    ///         swap funds (there are none at rest).
    function ownerCall(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyOwner returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        emit OwnerCall(target, value, data);
        return ret;
    }

    /*//////////////////////////////////////////////////////////////
                              OWNERSHIP
    //////////////////////////////////////////////////////////////*/

    /// @notice Hand the treasury to a new owner (e.g. a multisig). Renounce by
    ///         transferring to a burn address if ever desired.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner=0");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Set (or clear, with address(0)) the operator — the convenience
    ///         role that can sweep airdrops to the owner. Owner-only.
    function setOperator(address newOperator) external onlyOwner {
        emit OperatorChanged(operator, newOperator);
        operator = newOperator;
    }

    /*//////////////////////////////////////////////////////////////
                                VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Buy stats for a wallet — the basis for provable user airdrops.
    function statsOf(address buyer)
        external
        view
        returns (uint256 buys, uint256 ethRouted)
    {
        return (buyerBuys[buyer], buyerEthRouted[buyer]);
    }

    /// @notice Accept ETH (router refunds / airdrops). Not meant to hold funds.
    receive() external payable {}
}
