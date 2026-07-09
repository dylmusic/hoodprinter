"use client";

import { useState } from "react";

export default function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (e.g. non-secure context) — no-op
    }
  }

  return (
    <button className="copy-btn" onClick={copy} type="button">
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
