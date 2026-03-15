"use client";

/**
 * ReceiptView — printable A5 payment receipt.
 *
 * Renders a clean, print-friendly receipt for both member fee payments and
 * sponsor payments. The layout targets A5 paper (148 x 210 mm).
 *
 * Features:
 *   - Club header with name, address, and receipt number
 *   - Date in DD/MM/YYYY format
 *   - Member receipts: name, member ID, amount, period, payment mode
 *   - Sponsor receipts: name/company, sponsorship type, amount, payment mode
 *   - Amount in both numerals and words (Indian English)
 *   - Authorized signatory line
 *   - Print button (hidden via @media print)
 *   - All print-specific CSS injected via a style tag
 *
 * Usage:
 *   <ReceiptView receipt={receiptData} />
 *
 * The parent page is responsible for fetching receiptData from /api/receipts/[id].
 */

import type { ReceiptData } from "@/lib/receipt-utils";
import { amountToWords } from "@/lib/receipt-utils";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReceiptViewProps {
  receipt: ReceiptData;
}

// ---------------------------------------------------------------------------
// Date formatter — DD/MM/YYYY
// ---------------------------------------------------------------------------

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Currency formatter — ₹ with Indian grouping
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// ReceiptView component
// ---------------------------------------------------------------------------

export function ReceiptView({ receipt }: ReceiptViewProps) {
  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* Print-friendly CSS — injected as a style tag */}
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
          }
          .no-print { display: none !important; }
          @page {
            size: A5 portrait;
            margin: 0;
          }
        }
      `}</style>

      {/* Print button — hidden when printing */}
      <div className="no-print flex justify-end mb-4">
        <Button onClick={handlePrint} size="sm" className="gap-2">
          <PrinterIcon className="h-4 w-4" />
          Print Receipt
        </Button>
      </div>

      {/* Receipt area */}
      <div
        id="receipt-print-area"
        className="bg-white border-2 border-gray-800 rounded-sm mx-auto"
        style={{ width: "148mm", minHeight: "210mm", padding: "12mm", fontFamily: "serif", boxSizing: "border-box" }}
      >
        {/* Club header */}
        <div style={{ textAlign: "center", borderBottom: "2px solid #1a1a1a", paddingBottom: "8px", marginBottom: "10px" }}>
          <div style={{ fontSize: "15px", fontWeight: "bold", letterSpacing: "0.5px", textTransform: "uppercase" }}>
            {receipt.clubName}
          </div>
          <div style={{ fontSize: "10px", color: "#444", marginTop: "3px" }}>
            {receipt.clubAddress}
          </div>
        </div>

        {/* Receipt title + number row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", textDecoration: "underline" }}>
            Payment Receipt
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: "#555" }}>Receipt No.</div>
            <div style={{ fontSize: "11px", fontWeight: "bold", fontFamily: "monospace" }}>
              {receipt.receiptNumber}
            </div>
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: "10px", fontSize: "10px", color: "#444" }}>
          Date: <span style={{ fontWeight: "bold", color: "#111" }}>{formatDate(receipt.date)}</span>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px dashed #aaa", marginBottom: "10px" }} />

        {/* Receipt body — Member or Sponsor */}
        {receipt.type === "MEMBER" ? (
          <MemberReceiptBody receipt={receipt} />
        ) : (
          <SponsorReceiptBody receipt={receipt} />
        )}

        {/* Divider */}
        <div style={{ borderTop: "1px dashed #aaa", marginTop: "14px", marginBottom: "10px" }} />

        {/* Amount block */}
        <div style={{ marginBottom: "12px" }}>
          <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ paddingBottom: "4px", color: "#555", width: "40%" }}>Amount Received:</td>
                <td style={{ paddingBottom: "4px", fontWeight: "bold", fontSize: "13px", textAlign: "right" }}>
                  {formatCurrency(receipt.amount)}
                </td>
              </tr>
              <tr>
                <td style={{ color: "#555", verticalAlign: "top" }}>In Words:</td>
                <td style={{ fontStyle: "italic", textAlign: "right", fontSize: "9px" }}>
                  {amountToWords(receipt.amount)}
                </td>
              </tr>
              <tr>
                <td style={{ paddingTop: "4px", color: "#555" }}>Payment Mode:</td>
                <td style={{ paddingTop: "4px", textAlign: "right" }}>
                  {receipt.paymentMode}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Received By */}
        <div style={{ fontSize: "9px", color: "#555", marginBottom: "16px" }}>
          Received by: <span style={{ fontWeight: "bold", color: "#111" }}>{receipt.receivedBy}</span>
        </div>

        {/* Footer — signatory */}
        <div style={{ marginTop: "auto", paddingTop: "20px", borderTop: "1px solid #ccc", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: "8px", color: "#777", maxWidth: "55%" }}>
            This is a computer-generated receipt and does not require a physical signature.
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ borderTop: "1px solid #333", paddingTop: "4px", width: "80px", textAlign: "center" }}>
              <div style={{ fontSize: "8px", color: "#555" }}>Authorised Signatory</div>
              <div style={{ fontSize: "8px", color: "#555" }}>Treasurer</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Member receipt body
// ---------------------------------------------------------------------------

function MemberReceiptBody({ receipt }: { receipt: ReceiptData }) {
  return (
    <div>
      <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ paddingBottom: "6px", color: "#555", width: "40%" }}>Received From:</td>
            <td style={{ paddingBottom: "6px", fontWeight: "bold" }}>
              {receipt.memberName ?? "—"}
            </td>
          </tr>
          {receipt.memberId && (
            <tr>
              <td style={{ paddingBottom: "6px", color: "#555" }}>Member ID:</td>
              <td style={{ paddingBottom: "6px", fontFamily: "monospace" }}>
                {receipt.memberId}
              </td>
            </tr>
          )}
          <tr>
            <td style={{ paddingBottom: "6px", color: "#555" }}>Purpose:</td>
            <td style={{ paddingBottom: "6px" }}>{receipt.category}</td>
          </tr>
          {receipt.membershipStart && receipt.membershipEnd && (
            <tr>
              <td style={{ paddingBottom: "6px", color: "#555" }}>Period:</td>
              <td style={{ paddingBottom: "6px" }}>
                {formatDate(receipt.membershipStart)} — {formatDate(receipt.membershipEnd)}
              </td>
            </tr>
          )}
          <tr>
            <td style={{ paddingBottom: "6px", color: "#555" }}>Description:</td>
            <td style={{ paddingBottom: "6px" }}>{receipt.description}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sponsor receipt body
// ---------------------------------------------------------------------------

function SponsorReceiptBody({ receipt }: { receipt: ReceiptData }) {
  return (
    <div>
      <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ paddingBottom: "6px", color: "#555", width: "40%" }}>Received From:</td>
            <td style={{ paddingBottom: "6px", fontWeight: "bold" }}>
              {receipt.sponsorName ?? "—"}
            </td>
          </tr>
          {receipt.sponsorCompany && (
            <tr>
              <td style={{ paddingBottom: "6px", color: "#555" }}>Company:</td>
              <td style={{ paddingBottom: "6px" }}>{receipt.sponsorCompany}</td>
            </tr>
          )}
          <tr>
            <td style={{ paddingBottom: "6px", color: "#555" }}>Sponsorship Type:</td>
            <td style={{ paddingBottom: "6px", fontWeight: "bold" }}>
              {receipt.sponsorPurpose ?? "—"}
            </td>
          </tr>
          <tr>
            <td style={{ paddingBottom: "6px", color: "#555" }}>Purpose:</td>
            <td style={{ paddingBottom: "6px" }}>
              {receipt.category} — {receipt.description}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default ReceiptView;
