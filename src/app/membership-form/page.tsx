import type { Metadata } from "next";
import Link from "next/link";
import PrintButton from "@/components/landing/PrintButton";

export const metadata: Metadata = {
  title: "Membership Application Form — Deshapriya Park Sarbojanin Durgotsav",
  description:
    "Print and fill this membership application form to apply for membership at Deshapriya Park Sarbojanin Durgotsav, Kolkata.",
};

export default function MembershipFormPage() {
  return (
    <>
      {/* Global print styles injected via a style tag — safe in server components */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              body { background: white !important; }
              .print-page {
                max-width: 100% !important;
                margin: 0 !important;
                padding: 16mm 20mm !important;
                box-shadow: none !important;
                border: none !important;
              }
              @page {
                size: A4;
                margin: 10mm;
              }
            }
          `,
        }}
      />

      {/* Back link + Print button — hidden when printing */}
      <div className="no-print bg-orange-50 border-b border-orange-100 py-3 px-4 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-orange-700 hover:text-orange-900 font-medium transition-colors"
        >
          ← Back to Home
        </Link>
        <PrintButton />
      </div>

      {/* Page wrapper — centres the A4 card on screen */}
      <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
        <div className="print-page mx-auto bg-white shadow-lg rounded-sm border border-gray-200 max-w-[794px] p-10 sm:p-12 print:max-w-none print:shadow-none print:border-none print:rounded-none">

          {/* ── Header ─────────────────────────────────────────── */}
          <header className="text-center border-b-2 border-orange-600 pb-6 mb-8">
            <div className="text-3xl mb-2" aria-hidden="true">🪔</div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 uppercase tracking-wide leading-tight mb-1">
              Deshapriya Park Sarbojanin Durgotsav
            </h1>
            <p className="text-sm text-gray-600">
              Deshapriya Park, Tilak Road / 34A Manoharpukur Road, Ballygunge, Kolkata — 700029
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Opposite Priya Cinema, near Rash Behari Avenue &nbsp;|&nbsp; Est. 1938
            </p>
            <div className="mt-5 inline-block px-6 py-2 border-2 border-orange-600 rounded">
              <span className="text-base sm:text-lg font-bold text-orange-700 uppercase tracking-widest">
                Membership Application Form
              </span>
            </div>
          </header>

          {/* ── Instructions Block ──────────────────────────────── */}
          <section className="mb-8 rounded-lg border border-orange-200 bg-orange-50 p-5 text-sm text-gray-700 space-y-2 print:bg-white print:border print:border-gray-300">
            <h2 className="font-bold text-gray-900 text-base mb-3 uppercase tracking-wide">
              Instructions
            </h2>
            <ol className="list-decimal list-inside space-y-1.5 text-sm leading-relaxed">
              <li>Please fill this form in <strong>BLOCK LETTERS</strong> using a blue or black ballpoint pen.</li>
              <li>
                Submit the completed form at the{" "}
                <strong>Club Office, Deshapriya Park, Ballygunge, Kolkata — 700029</strong>.
              </li>
              <li>
                For queries, contact the club operator at:{" "}
                <strong>+91 94330 82863</strong>.
              </li>
              <li>
                <strong>Application Fee (one-time): ₹10,000</strong> &nbsp;|&nbsp; Paid separately upon approval.
              </li>
              <li>
                <strong>Membership Fee:</strong>&nbsp;
                Monthly ₹250 &nbsp;/&nbsp; Half-yearly ₹1,500 &nbsp;/&nbsp; Annual ₹3,000.
              </li>
              <li>
                <strong>Accepted Payment Modes:</strong> UPI, Bank Transfer, Cash.
              </li>
              <li>
                All phone number fields refer to <strong>WhatsApp numbers</strong> (required for
                membership notifications).
              </li>
            </ol>
          </section>

          {/* ── Primary Member Details ──────────────────────────── */}
          <section className="mb-8">
            <h2 className="font-bold text-gray-900 text-base mb-5 pb-1 border-b border-gray-300 uppercase tracking-wide">
              Primary Member Details
            </h2>

            <div className="space-y-6 text-sm text-gray-700">
              <FormField label="Full Name (as per ID proof)" wide />
              <FormField label="WhatsApp Number" />
              <FormField label="Email Address" />
              <div>
                <div className="font-medium mb-1">
                  Address <span className="text-gray-400 font-normal">(full residential address)</span>
                </div>
                <div className="border-b border-gray-400 mb-3 mt-4 h-0" />
                <div className="border-b border-gray-400 mb-3 h-0" />
                <div className="border-b border-gray-400 h-0" />
              </div>
            </div>
          </section>

          {/* ── Membership Type ─────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="font-bold text-gray-900 text-base mb-5 pb-1 border-b border-gray-300 uppercase tracking-wide">
              Membership Type Selection
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Please tick (&nbsp;&#10003;&nbsp;) your preferred membership period:
            </p>
            <div className="flex flex-wrap gap-8 text-sm text-gray-700">
              <CheckboxField label="Monthly — ₹250 / month" />
              <CheckboxField label="Half-yearly — ₹1,500 / 6 months" />
              <CheckboxField label="Annual — ₹3,000 / year" />
            </div>
          </section>

          {/* ── Sub-Members ─────────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="font-bold text-gray-900 text-base mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide">
              Sub-Members
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Up to 3 sub-members (family members) may be added. No additional fee required for sub-members.
            </p>

            {[1, 2, 3].map((n) => (
              <div key={n} className="mb-7">
                <div className="font-semibold text-gray-700 text-sm mb-3">
                  Sub-member {n}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-gray-700">
                  <FormField label="Full Name" />
                  <FormField label="WhatsApp Number" />
                  <FormField label="Relation to Primary Member" />
                </div>
              </div>
            ))}
          </section>

          {/* ── Declaration ─────────────────────────────────────── */}
          <section className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-5 print:bg-white print:border print:border-gray-300">
            <h2 className="font-bold text-gray-900 text-base mb-3 uppercase tracking-wide">
              Declaration
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              I, the undersigned, hereby apply for membership of{" "}
              <strong>Deshapriya Park Sarbojanin Durgotsav</strong> and declare that the
              information furnished above is true and correct to the best of my knowledge. I
              agree to abide by the rules and regulations of the club and understand that my
              membership is subject to the approval of the club committee.
            </p>
          </section>

          {/* ── Signature Line ──────────────────────────────────── */}
          <section>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 text-sm text-gray-700">
              <div>
                <div className="mb-1 font-medium">Date</div>
                <div className="border-b border-gray-400 mt-8 mb-1" />
                <div className="text-xs text-gray-400">DD / MM / YYYY</div>
              </div>
              <div>
                <div className="mb-1 font-medium">Signature of Applicant</div>
                <div className="border-b border-gray-400 mt-8 mb-1" />
                <div className="text-xs text-gray-400">&nbsp;</div>
              </div>
            </div>

            {/* Office use only block */}
            <div className="mt-10 border-2 border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-500">
              <p className="font-semibold text-gray-600 mb-3 uppercase tracking-wide text-xs">
                For Office Use Only
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <div className="mb-1">Member ID</div>
                  <div className="border-b border-gray-300 mt-6" />
                </div>
                <div>
                  <div className="mb-1">Received by</div>
                  <div className="border-b border-gray-300 mt-6" />
                </div>
                <div>
                  <div className="mb-1">Date of Entry</div>
                  <div className="border-b border-gray-300 mt-6" />
                </div>
              </div>
            </div>
          </section>

          {/* ── Footer note ─────────────────────────────────────── */}
          <div className="mt-8 text-center text-xs text-gray-400 border-t border-gray-100 pt-4">
            Deshapriya Park Sarbojanin Durgotsav · Est. 1938 · Ballygunge, Kolkata 700029 · +91 94330 82863
          </div>
        </div>

        {/* Bottom navigation — hidden when printing */}
        <div className="no-print mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-orange-600 hover:underline font-medium"
          >
            ← Return to Home
          </Link>
        </div>
      </div>
    </>
  );
}

/* ─── Helper Components ──────────────────────────────────────────────────── */

/** A labelled form field rendered as a blank underline for handwriting. */
function FormField({ label, wide = false }: { label: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-full" : ""}>
      <div className="font-medium mb-1">{label}</div>
      <div className="border-b border-gray-400 mt-5" />
    </div>
  );
}

/** A checkbox with a label, rendered as an empty square for ticking. */
function CheckboxField({ label }: { label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-default">
      <span
        className="inline-block w-4 h-4 border-2 border-gray-500 rounded-sm flex-shrink-0"
        aria-hidden="true"
      />
      <span>{label}</span>
    </label>
  );
}
