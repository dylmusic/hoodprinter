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
               │  $PRINT · M U L T I S E N D · ROBINHOOD CHAIN│
               │        ┌───────────────────────────┐        │
               │        │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  │        │
               │        │  █  H O O D P R I N T E R █  │      │
               │        │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  │        │
               │        └────────────┬──────────────┘        │
               │            💵  💵  💵 │ 💵  💵  💵             │
               │          ══════════════════════════          │
               │            "When we print, everyone prints."  │
               └─────────────────────────────────────────────┘

    HOODPrinter Multisend — the public airdrop / bulk-send tool for Robinhood
    Chain. Built by the team behind HOODPrinter ($PRINT), the ETH-reflection
    token, and the HOODPrinter Buy Bot.  🖨️ 💸

    Robinhood Chain launched without a multisender, so this is the first one —
    free, forever.

    ── Permissionless & ownerless ─────────────────────────────────────────────
    No owner. No admin. No upgradeability. No stored funds. This contract can
    ONLY move exactly what the caller passes into a single call. Deployed once,
    reusable by anyone. Verify every send on the Robinhood Chain explorer.

    Site:  https://www.hoodprinter.xyz
    X:     @HOODPrinterxyz

//////////////////////////////////////////////////////////////////////////////*/

/**
 * @title HOODPrinter Multisend
 * @author HOODPrinter ($PRINT) — https://www.hoodprinter.xyz
 * @notice Public, ownerless bulk-send / airdrop tool for Robinhood Chain.
 *
 *         Entrypoints:
 *           - multisendEther(recipients, values): split the ETH you send.
 *           - multisendToken(token, recipients, values): pull the total once via
 *             transferFrom, then fan out from this contract; refunds any dust.
 *           - multisendTokenSimple(token, recipients, values): transferFrom the
 *             caller straight to each recipient — the contract never custodies
 *             tokens (safest for fee-on-transfer / rebasing tokens).
 *
 *         For token modes, approve() this contract for at least the sum of
 *         `values` first.
 */
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract HOODPrinterMultisend {
    /*//////////////////////////////////////////////////////////////
                                BRANDING
    //////////////////////////////////////////////////////////////*/

    /// @notice Human-readable identity, visible on the block explorer.
    string public constant name = "HOODPrinter Multisend";
    string public constant token = "$PRINT";
    string public constant website = "https://www.hoodprinter.xyz";
    string public constant twitter = "@HOODPrinterxyz";
    string public constant tagline = "When we print, everyone prints.";
    string public constant version = "1.0.0";

    /// @notice Emitted once per send — every airdrop stamps the logs with
    ///         HOODPrinter branding, verifiable on the explorer.
    event Printed(
        address indexed sender,
        address indexed tokenAddr,
        uint256 recipients,
        uint256 total
    );

    /*//////////////////////////////////////////////////////////////
                                MULTISEND
    //////////////////////////////////////////////////////////////*/

    /// @notice Send ETH to many recipients in one transaction. Any unspent ETH
    ///         (e.g. from rounding) is returned to the sender.
    function multisendEther(address[] calldata recipients, uint256[] calldata values)
        external
        payable
    {
        require(recipients.length == values.length, "length mismatch");
        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            total += values[i];
            (bool ok, ) = recipients[i].call{value: values[i]}("");
            require(ok, "ETH transfer failed");
        }
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool ok, ) = msg.sender.call{value: balance}("");
            require(ok, "refund failed");
        }
        emit Printed(msg.sender, address(0), recipients.length, total);
    }

    /// @notice Pull the total from the caller once, then distribute. Requires
    ///         prior approve(). Any surplus held afterwards is refunded.
    function multisendToken(
        IERC20 tokenContract,
        address[] calldata recipients,
        uint256[] calldata values
    ) external {
        require(recipients.length == values.length, "length mismatch");
        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            total += values[i];
        }
        require(tokenContract.transferFrom(msg.sender, address(this), total), "pull failed");
        for (uint256 i = 0; i < recipients.length; i++) {
            require(tokenContract.transfer(recipients[i], values[i]), "transfer failed");
        }
        uint256 remaining = tokenContract.balanceOf(address(this));
        if (remaining > 0) {
            tokenContract.transfer(msg.sender, remaining);
        }
        emit Printed(msg.sender, address(tokenContract), recipients.length, total);
    }

    /// @notice transferFrom the caller straight to each recipient — this
    ///         contract never holds the tokens. Requires prior approve().
    function multisendTokenSimple(
        IERC20 tokenContract,
        address[] calldata recipients,
        uint256[] calldata values
    ) external {
        require(recipients.length == values.length, "length mismatch");
        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            total += values[i];
            require(
                tokenContract.transferFrom(msg.sender, recipients[i], values[i]),
                "transfer failed"
            );
        }
        emit Printed(msg.sender, address(tokenContract), recipients.length, total);
    }
}
