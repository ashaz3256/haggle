"use client";
import { useState } from "react";

/** Shares or copies the public link to a listing. Uses the page's own origin so it works locally and on Railway. */
export default function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) await navigator.share({ url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* user closed the share sheet */ }
  }
  return (
    <button type="button" onClick={copy} className="btn-blue w-full">
      {copied ? "✓ Link copied" : "Share link with buyers"}
    </button>
  );
}
