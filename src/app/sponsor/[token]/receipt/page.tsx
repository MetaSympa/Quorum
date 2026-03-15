"use client";

/**
 * /sponsor/[token]/receipt?paymentId=xxx — Public Sponsor Payment Receipt Page
 *
 * No authentication required.
 * Reads paymentId from URL query params.
 * Fetches receipt data from GET /api/sponsor-links/[token]/receipt?paymentId=xxx
 *
 * Displays:
 *   - "Thank You for Your Sponsorship!" header
 *   - Club name
 *   - Sponsor name / company
 *   - Amount paid (₹ formatted)
 *   - Payment date
 *   - Sponsorship purpose
 *   - Receipt number
 *   - Payment reference (Razorpay payment ID)
 *   - Print button
 *   - "Return to Homepage" link
 *
 * Note: The receipt page may briefly show a "processing" state if the Razorpay
 * webhook has not yet processed the payment (the webhook fires asynchronously).
 * We retry up to 5 times with a 2-second delay.
 */

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PrinterIcon, CheckCircleIcon, LoaderIcon, AlertCircleIcon, HomeIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReceiptData {
  receiptNumber: string;
  sponsorName: string | null;
  sponsorCompany: string | null;
  amount: number;
  date: string;
  purpose: string;
  purposeLabel: string;
  paymentRef: string;
  clubName: string;
  clubAddress: string;
  paymentMode: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function paymentModeLabel(mode: string): string {
  const map: Record<string, string> = {
    UPI: "UPI",
    BANK_TRANSFER: "Bank Transfer (NEFT/IMPS/RTGS)",
    CASH: "Cash",
  };
  return map[mode] ?? mode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SponsorReceiptPage({
  params,
}: {
  params: { token: string };
}) {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId");
  const { token } = params;

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 3000;

  const fetchReceipt = useCallback(
    async (attempt: number) => {
      if (!paymentId) {
        setErrorMsg("No payment ID provided. Please return to the payment page.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/sponsor-links/${token}/receipt?paymentId=${encodeURIComponent(paymentId)}`
        );

        if (res.status === 404) {
          // Payment may not have been processed by webhook yet — retry
          if (attempt < MAX_RETRIES) {
            setRetrying(true);
            setRetryCount(attempt + 1);
            setTimeout(() => fetchReceipt(attempt + 1), RETRY_DELAY_MS);
            return;
          }
          // Exhausted retries
          setErrorMsg(
            "Your payment was received but the receipt is still being generated. " +
              "Please check back in a few moments or contact the club with your payment reference."
          );
          setRetrying(false);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(
            data.error ?? "Unable to load receipt. Please contact the club with your payment reference."
          );
          setRetrying(false);
          setLoading(false);
          return;
        }

        const data: ReceiptData = await res.json();
        setReceipt(data);
        setRetrying(false);
        setLoading(false);
      } catch {
        if (attempt < MAX_RETRIES) {
          setTimeout(() => fetchReceipt(attempt + 1), RETRY_DELAY_MS);
          return;
        }
        setErrorMsg("Network error. Please check your connection and try again.");
        setRetrying(false);
        setLoading(false);
      }
    },
    [token, paymentId]
  );

  useEffect(() => {
    fetchReceipt(0);
  }, [fetchReceipt]);

  // =========================================================================
  // Render states
  // =========================================================================

  // Loading / retrying
  if (loading || retrying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
          <LoaderIcon className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">
            {retryCount > 0 ? "Generating Receipt..." : "Loading..."}
          </h2>
          {retryCount > 0 && (
            <p className="text-sm text-gray-500">
              Your payment was received. The receipt is being generated
              {retryCount > 1 ? ` (attempt ${retryCount}/${MAX_RETRIES})` : ""}...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (errorMsg || !receipt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
          {/* Payment was received even if receipt generation failed */}
          {paymentId && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Payment Received</p>
                  <p className="text-xs text-green-600 font-mono mt-1">{paymentId}</p>
                </div>
              </div>
            </div>
          )}

          <AlertCircleIcon className="h-10 w-10 text-amber-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-800 text-center mb-2">Receipt Unavailable</h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            {errorMsg ?? "Unable to load receipt data."}
          </p>

          {paymentId && (
            <div className="bg-gray-50 rounded-lg p-3 mb-6">
              <p className="text-xs text-gray-400 mb-1">Your Payment Reference</p>
              <p className="text-sm font-mono font-semibold text-gray-800 break-all">{paymentId}</p>
              <p className="text-xs text-gray-400 mt-2">
                Please save this reference number for your records.
              </p>
            </div>
          )}

          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors text-sm"
          >
            <HomeIcon className="h-4 w-4" />
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Success — show receipt
  // =========================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      {/* Print-friendly CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-print-area,
          #receipt-print-area * { visibility: visible; }
          #receipt-print-area {
            position: fixed;
            top: 0;
            left: 0;
            width: 148mm;
            min-height: 210mm;
            margin: 0;
            padding: 12mm;
            box-sizing: border-box;
            background: white;
          }
          .no-print { display: none !important; }
          @page {
            size: A5 portrait;
            margin: 0;
          }
        }
      `}</style>

      {/* Header bar — hidden on print */}
      <div className="no-print bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 py-4 px-6 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-white/80 text-xs uppercase tracking-widest font-medium">
              Payment Confirmed
            </p>
            <h1 className="text-white text-lg font-bold leading-tight">
              {receipt.clubName}
            </h1>
          </div>
          <CheckCircleIcon className="h-8 w-8 text-white/90" />
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 pt-6">
        {/* Thank you card — hidden on print */}
        <div className="no-print bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-4">
          <CheckCircleIcon className="h-10 w-10 text-green-500 flex-shrink-0" />
          <div>
            <h2 className="text-base font-bold text-green-800">Thank You for Your Sponsorship!</h2>
            <p className="text-sm text-green-600 mt-0.5">
              Your contribution helps keep our heritage alive. We are grateful for your support.
            </p>
          </div>
        </div>

        {/* Action buttons — hidden on print */}
        <div className="no-print flex gap-3 mb-6">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-300 hover:border-orange-400 text-gray-700 hover:text-orange-600 font-semibold py-3 px-4 rounded-xl transition-colors text-sm shadow-sm"
          >
            <PrinterIcon className="h-4 w-4" />
            Print Receipt
          </button>
          <Link
            href="/"
            className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors text-sm shadow-sm"
          >
            <HomeIcon className="h-4 w-4" />
            Homepage
          </Link>
        </div>

        {/* ============================================================
            RECEIPT PRINT AREA
            ============================================================ */}
        <div
          id="receipt-print-area"
          className="bg-white rounded-2xl shadow-lg overflow-hidden"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {/* Receipt header */}
          <div className="bg-gradient-to-r from-orange-600 to-amber-500 p-6 text-white no-print">
            <div className="text-center">
              <div className="text-2xl mb-1">ॐ</div>
              <h2 className="text-xl font-bold uppercase tracking-wide">{receipt.clubName}</h2>
              <p className="text-white/75 text-xs mt-1">{receipt.clubAddress}</p>
            </div>
          </div>

          {/* Print-only header */}
          <div
            className="hidden"
            style={{
              display: "none",
              textAlign: "center",
              borderBottom: "2px solid #1a1a1a",
              paddingBottom: "8px",
              marginBottom: "10px",
            }}
          >
            <div style={{ fontSize: "15px", fontWeight: "bold", textTransform: "uppercase" }}>
              {receipt.clubName}
            </div>
            <div style={{ fontSize: "10px", color: "#444", marginTop: "3px" }}>
              {receipt.clubAddress}
            </div>
          </div>

          {/* Receipt body */}
          <div className="p-6">
            {/* Receipt title + number */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 uppercase tracking-wide underline">
                  Sponsorship Receipt
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {formatDate(receipt.date)} at {formatTime(receipt.date)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Receipt No.</p>
                <p className="text-sm font-bold font-mono text-gray-800">
                  {receipt.receiptNumber}
                </p>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-200 mb-5" />

            {/* Sponsor details */}
            <div className="space-y-3 mb-5">
              {receipt.sponsorName && (
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-400 w-32 flex-shrink-0 uppercase tracking-wide">
                    Received From
                  </span>
                  <span className="text-sm font-bold text-gray-900">{receipt.sponsorName}</span>
                </div>
              )}
              {receipt.sponsorCompany && (
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-400 w-32 flex-shrink-0 uppercase tracking-wide">
                    Company
                  </span>
                  <span className="text-sm text-gray-800">{receipt.sponsorCompany}</span>
                </div>
              )}
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-gray-400 w-32 flex-shrink-0 uppercase tracking-wide">
                  Sponsorship Type
                </span>
                <span className="text-sm font-semibold text-orange-700">
                  {receipt.purposeLabel}
                </span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-200 mb-5" />

            {/* Amount block */}
            <div className="bg-orange-50 rounded-xl p-4 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 font-medium">Amount Paid</span>
                <span className="text-2xl font-bold text-gray-900">
                  {formatCurrency(receipt.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">Payment Mode</span>
                <span className="text-xs font-semibold text-gray-700">
                  {paymentModeLabel(receipt.paymentMode)}
                </span>
              </div>
            </div>

            {/* Payment reference */}
            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Payment Reference</p>
              <p className="text-sm font-mono font-semibold text-gray-800 break-all">
                {receipt.paymentRef}
              </p>
              <p className="text-xs text-gray-400 mt-1">Date: {formatDateShort(receipt.date)}</p>
            </div>

            <div className="border-t border-dashed border-gray-200 mb-5" />

            {/* Footer */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-gray-400 leading-relaxed max-w-48">
                  This is a computer-generated receipt and does not require a physical signature.
                </p>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 w-24 text-center">
                  <p className="text-xs text-gray-500">Authorised</p>
                  <p className="text-xs text-gray-500">Signatory</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer links — hidden on print */}
        <div className="no-print text-center mt-6 pb-8">
          <p className="text-xs text-gray-400 mb-2">
            A receipt has been generated for your records.
          </p>
          <p className="text-xs text-gray-400">
            {receipt.clubName} — Est. 1938 — Deshapriya Park, Kolkata
          </p>
        </div>
      </div>
    </div>
  );
}
