"use client";

/**
 * Print button for the membership application form.
 * Hidden automatically via .no-print class when the user prints.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 px-4 py-1.5 rounded-md bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 active:bg-orange-700 transition-colors shadow-sm"
    >
      🖨️ Print Form
    </button>
  );
}
