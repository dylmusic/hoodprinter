// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Disperse
 * @notice Public, permissionless, ownerless multisend — a Robinhood Chain port
 *         of the classic disperse.app contract (which is NOT deployed on this
 *         chain). Anyone can use it; it holds no state, has no owner, no admin,
 *         no upgradeability, and no way to move funds except exactly what the
 *         caller asks for in a single call. Deployed once, used by everyone.
 *
 *         Three entrypoints, mirroring disperse.app:
 *           - disperseEther(recipients, values): split the ETH you send.
 *           - disperseToken(token, recipients, values): pull the total once via
 *             transferFrom, then fan out from this contract (handles the common
 *             case efficiently; refunds any dust left after distribution).
 *           - disperseTokenSimple(token, recipients, values): transferFrom the
 *             caller straight to each recipient — the contract never custodies
 *             tokens (safest for fee-on-transfer / rebasing tokens).
 *
 *         For token modes the caller must first approve() this contract for at
 *         least the sum of `values`.
 */
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract Disperse {
    /// @notice Send ETH to many recipients in one transaction. Any unspent ETH
    ///         (e.g. from rounding) is returned to the sender.
    function disperseEther(address[] calldata recipients, uint256[] calldata values)
        external
        payable
    {
        require(recipients.length == values.length, "length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool ok, ) = recipients[i].call{value: values[i]}("");
            require(ok, "ETH transfer failed");
        }
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool ok, ) = msg.sender.call{value: balance}("");
            require(ok, "refund failed");
        }
    }

    /// @notice Pull the total from the caller once, then distribute. Requires
    ///         prior approve(). Any surplus held afterwards is refunded.
    function disperseToken(
        IERC20 token,
        address[] calldata recipients,
        uint256[] calldata values
    ) external {
        require(recipients.length == values.length, "length mismatch");
        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            total += values[i];
        }
        require(token.transferFrom(msg.sender, address(this), total), "pull failed");
        for (uint256 i = 0; i < recipients.length; i++) {
            require(token.transfer(recipients[i], values[i]), "transfer failed");
        }
        uint256 remaining = token.balanceOf(address(this));
        if (remaining > 0) {
            token.transfer(msg.sender, remaining);
        }
    }

    /// @notice transferFrom the caller straight to each recipient — this
    ///         contract never holds the tokens. Requires prior approve().
    function disperseTokenSimple(
        IERC20 token,
        address[] calldata recipients,
        uint256[] calldata values
    ) external {
        require(recipients.length == values.length, "length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            require(
                token.transferFrom(msg.sender, recipients[i], values[i]),
                "transfer failed"
            );
        }
    }
}
