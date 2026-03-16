"use client";

/**
 * Approvals Page — Admin only.
 *
 * Displays the approval queue with:
 *  - Filter by entity type
 *  - Paginated table of pending approvals
 *  - Detail modal showing full diff (previousData vs newData)
 *  - Approve / Reject buttons with optional notes
 *  - Toast feedback on action
 *  - Count badge in header showing total pending
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApprovalRecord {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  status: string;
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  requestedBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  reviewedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface ApprovalsResponse {
  data: ApprovalRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  pendingCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENTITY_TYPE_LABELS: Record<string, string> = {
  TRANSACTION: "Transaction",
  MEMBER_ADD: "New Member",
  MEMBER_EDIT: "Member Edit",
  MEMBER_DELETE: "Member Delete",
  MEMBERSHIP: "Membership",
};

const ACTION_LABELS: Record<string, string> = {
  add_member: "Add Member",
  edit_member: "Edit Member",
  delete_member: "Delete Member",
  add_sub_member: "Add Sub-member",
  edit_sub_member: "Edit Sub-member",
  remove_sub_member: "Remove Sub-member",
  add_transaction: "Add Transaction",
  edit_transaction: "Edit Transaction",
  delete_transaction: "Delete Transaction",
  approve_transaction: "Transaction Approval",
  add_membership: "Add Membership",
  create_membership: "Create Membership",
  approve_membership: "Membership Approval",
  approve: "Approve",
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  TRANSACTION: "bg-sky-100 text-sky-800",
  MEMBER_ADD: "bg-emerald-100 text-emerald-800",
  MEMBER_EDIT: "bg-amber-100 text-amber-800",
  MEMBER_DELETE: "bg-rose-100 text-rose-800",
  MEMBERSHIP: "bg-indigo-100 text-indigo-800",
};

/** Human-readable field names */
const FIELD_LABELS: Record<string, string> = {
  // Transaction
  type: "Transaction Type",
  category: "Category",
  amount: "Amount",
  paymentMode: "Payment Mode",
  description: "Description",
  sponsorPurpose: "Sponsor Purpose",
  senderName: "Sender / Receiver Name",
  senderPhone: "Sender / Receiver Phone",
  approvalStatus: "Approval Status",
  transactionId: "Transaction ID",
  deleted: "Deleted",
  // Member / Sub-member
  name: "Full Name",
  email: "Email Address",
  phone: "Phone Number",
  address: "Address",
  relation: "Relation to Member",
  // Membership
  plan: "Plan",
  startDate: "Start Date",
  endDate: "End Date",
  fee: "Fee",
  // Common
  memberId: "Member ID",
  parentMemberId: "Parent Member ID",
  status: "Status",
  notes: "Notes",
  canLogin: "Can Login",
};

/** Enum value → readable label per field */
const ENUM_LABELS: Record<string, Record<string, string>> = {
  type: {
    CASH_IN: "Cash In",
    CASH_OUT: "Cash Out",
    ANNUAL: "Annual",
    HONORARY: "Honorary",
    LIFE: "Life",
    ASSOCIATE: "Associate",
  },
  approvalStatus: {
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  },
  category: {
    MEMBERSHIP_FEE: "Membership Fee",
    APPLICATION_FEE: "Application Fee",
    SPONSORSHIP: "Sponsorship",
    EXPENSE: "Expense",
    OTHER: "Other",
  },
  paymentMode: { UPI: "UPI", BANK_TRANSFER: "Bank Transfer", CASH: "Cash" },
  sponsorPurpose: {
    TITLE_SPONSOR: "Title Sponsor",
    GOLD_SPONSOR: "Gold Sponsor",
    SILVER_SPONSOR: "Silver Sponsor",
    FOOD_PARTNER: "Food Partner",
    MEDIA_PARTNER: "Media Partner",
    STALL_VENDOR: "Stall Vendor",
    MARKETING_PARTNER: "Marketing Partner",
  },
};

const SKIP_KEYS = new Set(["parentUserId", "sponsorId", "approvalStatus", "id", "membershipId"]);

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";

function entityApiUrl(entityType: string, entityId: string, action: string): string | null {
  if (entityId === PLACEHOLDER_ID) return null;
  if (entityType === "TRANSACTION") return `/api/transactions/${entityId}`;
  if (entityType === "MEMBER_EDIT") {
    // Sub-member edits store SubMember.id as entityId — not a Member UUID
    if (action === "edit_sub_member") return null;
    return `/api/members/${entityId}`;
  }
  if (entityType === "MEMBER_DELETE") {
    // Sub-member removes store SubMember.id as entityId — not a Member UUID
    if (action === "remove_sub_member") return null;
    return `/api/members/${entityId}`;
  }
  if (entityType === "MEMBERSHIP") {
    // approve_membership records store the Member ID as entityId (not a Membership ID)
    if (action === "approve_membership") return `/api/members/${entityId}`;
    return `/api/memberships/${entityId}`;
  }
  return null;
}

/** Format a field value — returns display text and optional Tailwind class. */
function formatFieldValue(
  key: string,
  val: unknown,
  txType?: unknown
): { text: string; className?: string } {
  if (val === null || val === undefined || val === "") return { text: "—" };
  const str = String(val);

  if (ENUM_LABELS[key]?.[str]) return { text: ENUM_LABELS[key][str] };

  if (key === "amount") {
    const n = parseFloat(str);
    const formatted = isNaN(n)
      ? str
      : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const className =
      txType === "CASH_IN"
        ? "text-emerald-700 font-semibold"
        : txType === "CASH_OUT"
        ? "text-rose-700 font-semibold"
        : "font-semibold";
    return { text: formatted, className };
  }

  if (key === "startDate" || key === "endDate") {
    try {
      return {
        text: new Date(str).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      };
    } catch {
      // fall through
    }
  }

  if (key === "memberId") {
    return { text: str.slice(0, 8) + "…", className: "font-mono text-xs" };
  }

  return { text: str };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Single label+value row */
function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 py-2 border-b border-muted/50 last:border-0 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={className ?? "font-medium break-words"}>{value}</span>
    </div>
  );
}

/** Old → new diff row (highlighted yellow if changed) */
function DiffRow({
  label,
  oldText,
  newText,
  oldClass,
  newClass,
  changed,
}: {
  label: string;
  oldText: string;
  newText: string;
  oldClass?: string;
  newClass?: string;
  changed: boolean;
}) {
  return (
    <div
      className={`py-2 border-b border-muted/50 last:border-0 ${
        changed ? "rounded px-2 bg-amber-50" : ""
      }`}
    >
      <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
      {changed ? (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className={`line-through text-rose-500 ${oldClass ?? ""}`}>{oldText || "—"}</span>
          <span className="text-muted-foreground text-xs">→</span>
          <span className={`font-medium text-emerald-700 ${newClass ?? ""}`}>{newText || "—"}</span>
        </div>
      ) : (
        <span className={`text-sm font-medium ${newClass ?? ""}`}>{newText || "—"}</span>
      )}
    </div>
  );
}

/** Full transaction record fetched live from the DB */
function TransactionLiveSection({ tx }: { tx: Record<string, unknown> }) {
  const member = tx.member as { name: string; email: string } | null;
  const sponsor = tx.sponsor as { name: string; company: string | null } | null;
  const enteredBy = tx.enteredBy as { name: string } | null;
  const txType = tx.type as string;
  const sponsorPurpose = typeof tx.sponsorPurpose === "string" ? tx.sponsorPurpose : null;
  const senderName = typeof tx.senderName === "string" ? tx.senderName : null;
  const senderPhone = typeof tx.senderPhone === "string" ? tx.senderPhone : null;
  const receiptNumber = typeof tx.receiptNumber === "string" ? tx.receiptNumber : null;
  const amountNum = parseFloat(String(tx.amount));
  const amountStr = isNaN(amountNum)
    ? String(tx.amount)
    : `₹${amountNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const amountCls =
    txType === "CASH_IN"
      ? "text-emerald-700 font-semibold"
      : txType === "CASH_OUT"
      ? "text-rose-700 font-semibold"
      : "font-semibold";

  return (
    <div className="rounded-md border px-3">
      <DetailRow label="Type" value={ENUM_LABELS.type?.[txType] ?? txType} />
      <DetailRow label="Category" value={ENUM_LABELS.category?.[tx.category as string] ?? (tx.category as string)} />
      <DetailRow label="Amount" value={amountStr} className={amountCls} />
      <DetailRow label="Payment Mode" value={ENUM_LABELS.paymentMode?.[tx.paymentMode as string] ?? (tx.paymentMode as string)} />
      <DetailRow label="Description" value={(tx.description as string) || "—"} />
      {sponsorPurpose && (
        <DetailRow
          label="Sponsor Purpose"
          value={ENUM_LABELS.sponsorPurpose?.[sponsorPurpose] ?? sponsorPurpose}
        />
      )}
      {member && <DetailRow label="Member" value={`${member.name} (${member.email})`} />}
      {sponsor && (
        <DetailRow
          label="Sponsor"
          value={sponsor.company ? `${sponsor.name} — ${sponsor.company}` : sponsor.name}
        />
      )}
      {senderName && <DetailRow label="Sender Name" value={senderName} />}
      {senderPhone && <DetailRow label="Sender Phone" value={senderPhone} />}
      {receiptNumber && <DetailRow label="Receipt #" value={receiptNumber} />}
      {enteredBy && <DetailRow label="Entered By" value={enteredBy.name} />}
      <DetailRow
        label="Date"
        value={formatDate(tx.createdAt as string)}
      />
    </div>
  );
}

/** Full member record fetched live from the DB */
function MemberLiveSection({ member }: { member: Record<string, unknown> }) {
  const subMembers = (member.subMembers ?? member.childMembers) as Array<Record<string, unknown>> | undefined;

  return (
    <div className="space-y-3">
      <div className="rounded-md border px-3">
        <DetailRow label="Full Name" value={(member.name as string) || "—"} />
        <DetailRow label="Email" value={(member.email as string) || "—"} />
        <DetailRow label="Phone" value={(member.phone as string) || "—"} />
        {typeof member.address === "string" && <DetailRow label="Address" value={member.address} />}
        <DetailRow label="Status" value={(member.membershipStatus as string) || "—"} />
        <DetailRow
          label="Member Since"
          value={member.createdAt ? new Date(member.createdAt as string).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
        />
      </div>

      {subMembers && subMembers.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Sub-Members ({subMembers.length})
          </p>
          <div className="space-y-2">
            {subMembers.map((sub, i) => (
              <div key={i} className="rounded-md border px-3 bg-muted/20">
                <DetailRow label="Name" value={(sub.name as string) || "—"} />
                {typeof sub.relation === "string" && <DetailRow label="Relation" value={sub.relation} />}
                {typeof sub.phone === "string" && <DetailRow label="Phone" value={sub.phone} />}
                {typeof sub.email === "string" && <DetailRow label="Email" value={sub.email} />}
                {typeof sub.memberId === "string" && (
                  <DetailRow label="Member ID" value={sub.memberId} className="font-mono text-xs font-medium" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Membership plan details (without the member — shown separately) */
function MembershipPlanSection({ ms }: { ms: Record<string, unknown> }) {
  const amountNum = parseFloat(String(ms.amount));
  const amountStr = isNaN(amountNum)
    ? String(ms.amount)
    : `₹${amountNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function fmtDate(d: unknown) {
    if (!d) return "—";
    try {
      return new Date(d as string).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return "—"; }
  }

  return (
    <div className="rounded-md border px-3">
      <DetailRow
        label="Plan"
        value={ENUM_LABELS.type?.[ms.type as string] ?? (ms.type as string) ?? "—"}
      />
      <DetailRow label="Fee" value={amountStr} className="font-semibold" />
      <DetailRow label="Start Date" value={fmtDate(ms.startDate)} />
      <DetailRow label="End Date" value={fmtDate(ms.endDate)} />
      {ms.isApplicationFee === true && <DetailRow label="Note" value="Includes application fee" />}
    </div>
  );
}

/** Renders the appropriate live-entity view or a loading skeleton */
function LiveEntityView({
  entityType,
  liveEntity,
  loading,
}: {
  entityType: string;
  liveEntity: Record<string, unknown> | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-md border px-3 py-4 space-y-2 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 bg-muted rounded w-3/4" />
        ))}
      </div>
    );
  }
  if (!liveEntity) return null;
  if (entityType === "TRANSACTION") return <TransactionLiveSection tx={liveEntity} />;
  if (entityType === "MEMBER_EDIT" || entityType === "MEMBER_DELETE") return <MemberLiveSection member={liveEntity} />;
  if (entityType === "MEMBERSHIP") return <MembershipPlanSection ms={liveEntity} />;
  return null;
}

/** Full detail view for an approval record */
function ApprovalDetail({
  approval,
  liveEntity,
  entityLoading,
  memberData,
  memberLoading,
}: {
  approval: ApprovalRecord;
  liveEntity: Record<string, unknown> | null;
  entityLoading: boolean;
  memberData?: Record<string, unknown> | null;
  memberLoading?: boolean;
}) {
  const prev = approval.previousData ?? {};
  const next = approval.newData ?? {};
  const action = approval.action;

  const isDelete = action.includes("delete") || action.includes("remove");
  const isEdit =
    !isDelete && action.includes("edit") && Object.keys(prev).length > 0;
  const displayData = isDelete ? prev : next;
  const txType = (displayData as Record<string, unknown>).type;

  const allKeys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)])).filter(
    (k) => !SKIP_KEYS.has(k)
  );

  // ---- DELETE: show live entity (what will be removed) ----
  if (isDelete) {
    const warningText =
      action.includes("delete_transaction")
        ? "This transaction will be permanently voided."
        : action.includes("remove_sub_member")
        ? "This sub-member will be removed."
        : "This will suspend the member account. Data is retained.";

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{warningText}</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Current Record
        </p>
        {(entityLoading || liveEntity) ? (
          <LiveEntityView
            entityType={approval.entityType}
            liveEntity={liveEntity}
            loading={entityLoading}
          />
        ) : (
          // fallback to snapshot if live fetch failed
          <div className="rounded-md border px-3">
            {Object.keys(displayData)
              .filter((k) => !SKIP_KEYS.has(k))
              .map((k) => {
                const { text, className } = formatFieldValue(k, (displayData as Record<string, unknown>)[k], txType);
                return <DetailRow key={k} label={FIELD_LABELS[k] ?? k} value={text} className={className} />;
              })}
          </div>
        )}
      </div>
    );
  }

  // ---- EDIT: diff + full current record ----
  if (isEdit) {
    const changedKeys = allKeys.filter(
      (k) => String(prev[k] ?? "") !== String(next[k] ?? "")
    );
    const unchangedKeys = allKeys.filter((k) => !changedKeys.includes(k));

    return (
      <div className="space-y-5">
        {changedKeys.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Changed Fields ({changedKeys.length})
            </p>
            <div className="rounded-md border px-3">
              {changedKeys.map((k) => {
                const { text: oldText, className: oldCls } = formatFieldValue(k, prev[k], txType);
                const { text: newText, className: newCls } = formatFieldValue(k, next[k], txType);
                return (
                  <DiffRow
                    key={k}
                    label={FIELD_LABELS[k] ?? k}
                    oldText={oldText}
                    newText={newText}
                    oldClass={oldCls}
                    newClass={newCls}
                    changed={true}
                  />
                );
              })}
            </div>
          </div>
        )}

        {unchangedKeys.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Unchanged
            </p>
            <div className="rounded-md border px-3">
              {unchangedKeys.map((k) => {
                const { text, className } = formatFieldValue(k, next[k], txType);
                return (
                  <DetailRow key={k} label={FIELD_LABELS[k] ?? k} value={text} className={className} />
                );
              })}
            </div>
          </div>
        )}

        {(entityLoading || liveEntity) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Full Current Record
            </p>
            <LiveEntityView
              entityType={approval.entityType}
              liveEntity={liveEntity}
              loading={entityLoading}
            />
          </div>
        )}
      </div>
    );
  }

  // ---- MEMBERSHIP create: show full member profile + plan details ----
  if (approval.entityType === "MEMBERSHIP") {
    return (
      <div className="space-y-5">
        {/* Full member profile with sub-members */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Member Profile
          </p>
          {memberLoading ? (
            <div className="rounded-md border px-3 py-4 space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-4 bg-muted rounded w-3/4" />
              ))}
            </div>
          ) : memberData ? (
            <MemberLiveSection member={memberData} />
          ) : (liveEntity?.member as Record<string, string> | null) ? (
            // Fallback: brief member info from the membership relation
            <div className="rounded-md border px-3">
              <DetailRow
                label="Full Name"
                value={(liveEntity!.member as Record<string, string>).name ?? "—"}
              />
              <DetailRow
                label="Email"
                value={(liveEntity!.member as Record<string, string>).email ?? "—"}
              />
            </div>
          ) : (
            <div className="rounded-md border px-3 py-3 text-sm text-muted-foreground">
              Member details unavailable
            </div>
          )}
        </div>

        {/* Membership plan details */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Membership Plan
          </p>
          {(entityLoading || liveEntity) ? (
            <LiveEntityView
              entityType="MEMBERSHIP"
              liveEntity={liveEntity}
              loading={entityLoading}
            />
          ) : (
            // fallback: render newData snapshot
            <div className="rounded-md border px-3">
              {typeof next.type === "string" && (
                <DetailRow
                  label="Plan"
                  value={ENUM_LABELS.type?.[next.type] ?? next.type}
                />
              )}
              {next.amount != null && (
                <DetailRow
                  label="Fee"
                  value={`₹${parseFloat(String(next.amount)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  className="font-semibold"
                />
              )}
              {typeof next.startDate === "string" && (
                <DetailRow label="Start Date" value={formatFieldValue("startDate", next.startDate).text} />
              )}
              {typeof next.endDate === "string" && (
                <DetailRow label="End Date" value={formatFieldValue("endDate", next.endDate).text} />
              )}
              {next.isApplicationFee === true && (
                <DetailRow label="Note" value="Includes application fee" />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- TRANSACTION: prefer live entity over newData snapshot ----
  if (approval.entityType === "TRANSACTION") {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Transaction Details
        </p>
        {(entityLoading || liveEntity) ? (
          <LiveEntityView
            entityType="TRANSACTION"
            liveEntity={liveEntity}
            loading={entityLoading}
          />
        ) : (
          // fallback to newData snapshot
          <div className="rounded-md border px-3">
            {Object.keys(displayData)
              .filter((k) => !SKIP_KEYS.has(k))
              .map((k) => {
                const { text, className } = formatFieldValue(k, (displayData as Record<string, unknown>)[k], txType);
                return <DetailRow key={k} label={FIELD_LABELS[k] ?? k} value={text} className={className} />;
              })}
          </div>
        )}
      </div>
    );
  }

  // ---- ADD (member / sub-member): show proposed details in human-readable format ----
  const isSubMemberAdd = action === "add_sub_member";

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {isSubMemberAdd ? "Proposed Sub-Member Details" : "Proposed Member Details"}
      </p>
      {(entityLoading || liveEntity) ? (
        <LiveEntityView
          entityType={approval.entityType}
          liveEntity={liveEntity}
          loading={entityLoading}
        />
      ) : isSubMemberAdd ? (
        // Sub-member: compact card with relation field
        <div className="rounded-md border px-3">
          <DetailRow label="Full Name" value={(displayData.name as string) || "—"} />
          <DetailRow label="Email" value={(displayData.email as string) || "—"} />
          <DetailRow label="Phone" value={(displayData.phone as string) || "—"} />
          {typeof displayData.relation === "string" && (
            <DetailRow label="Relation to Member" value={displayData.relation} />
          )}
        </div>
      ) : (
        // Primary member: full MemberLiveSection formatting
        <MemberLiveSection member={displayData as Record<string, unknown>} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ApprovalsPage() {
  const { status } = useSession();
  const { toast } = useToast();

  // List state
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [entityTypeFilter, setEntityTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Detail modal
  const [selected, setSelected] = useState<ApprovalRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionNotes, setActionNotes] = useState("");
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);

  // Live entity fetch for detail modal
  const [entityData, setEntityData] = useState<Record<string, unknown> | null>(null);
  const [entityLoading, setEntityLoading] = useState(false);
  // For MEMBERSHIP approvals: the full member profile (with sub-members)
  const [memberData, setMemberData] = useState<Record<string, unknown> | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);

  function openDetail(approval: ApprovalRecord) {
    setSelected(approval);
    setActionNotes("");
    setEntityData(null);
    setMemberData(null);
    setDetailOpen(true);

    const url = entityApiUrl(approval.entityType, approval.entityId, approval.action);
    if (!url) return;

    setEntityLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        // approve_membership: entityId is the Member ID — data IS the member record
        if (approval.entityType === "MEMBERSHIP" && approval.action === "approve_membership") {
          setMemberData(data);
          return;
        }
        setEntityData(data);
        // For other MEMBERSHIP actions: chain-fetch full member profile from membership relation
        if (approval.entityType === "MEMBERSHIP") {
          const memberId =
            (data.member as Record<string, string> | null)?.id ??
            (data.memberId as string | null);
          if (memberId) {
            setMemberLoading(true);
            fetch(`/api/members/${memberId}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((mData) => { if (mData) setMemberData(mData); })
              .catch(() => {})
              .finally(() => setMemberLoading(false));
          }
        }
      })
      .catch(() => {})
      .finally(() => setEntityLoading(false));
  }

  // ---------------------------------------------------------------------------
  // Fetch approvals
  // ---------------------------------------------------------------------------

  const fetchApprovals = useCallback(async (pageToLoad: number, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pageToLoad),
        limit: String(limit),
        status: statusFilter,
      });

      if (entityTypeFilter !== "ALL") params.set("entityType", entityTypeFilter);

      const res = await fetch(`/api/approvals?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to load approvals", description: err.error, variant: "destructive" });
        return;
      }

      const data: ApprovalsResponse = await res.json();
      setApprovals((prev) => (append ? [...prev, ...data.data] : data.data));
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setPendingCount(data.pendingCount);
    } finally {
      setLoading(false);
    }
  }, [entityTypeFilter, statusFilter, toast]);

  useEffect(() => {
    if (status === "authenticated") {
      setPage(1);
      fetchApprovals(1, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityTypeFilter, statusFilter, status]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleAction(type: "approve" | "reject") {
    if (!selected) return;
    setActionLoading(type);

    try {
      const res = await fetch(`/api/approvals/${selected.id}/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: actionNotes || undefined }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast({
          title: `Failed to ${type}`,
          description: json.error ?? "An unexpected error occurred",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: type === "approve" ? "Approved successfully" : "Rejected successfully",
        description:
          type === "approve"
            ? "The proposed change has been applied."
            : "The proposed change has been discarded.",
      });

      setDetailOpen(false);
      setSelected(null);
      setActionNotes("");
      setPage(1);
      fetchApprovals(1, false);
    } finally {
      setActionLoading(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Approval Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and act on pending approval requests from operators.
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge className="text-base px-3 py-1">
            <Clock className="h-4 w-4 mr-1.5 inline-block" />
            {pendingCount} pending
          </Badge>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Entity Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="TRANSACTION">Transaction</SelectItem>
                <SelectItem value="MEMBER_ADD">New Member</SelectItem>
                <SelectItem value="MEMBER_EDIT">Member Edit</SelectItem>
                <SelectItem value="MEMBER_DELETE">Member Delete</SelectItem>
                <SelectItem value="MEMBERSHIP">Membership</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="ALL">All Statuses</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground ml-auto">
              {total} result{total !== 1 ? "s" : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            {statusFilter === "PENDING" ? "Pending Approvals" : "Approval History"}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Loading approvals...
            </div>
          ) : approvals.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No approvals found for the selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((approval) => (
                  <TableRow
                    key={approval.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(approval)}
                  >
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          ENTITY_TYPE_COLORS[approval.entityType] ?? "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {ENTITY_TYPE_LABELS[approval.entityType] ?? approval.entityType}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ACTION_LABELS[approval.action] ?? approval.action}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{approval.requestedBy.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {approval.requestedBy.role}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(approval.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          STATUS_CLASSES[approval.status] ?? "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {approval.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(approval);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Load more */}
      {page < totalPages && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              fetchApprovals(next, true);
            }}
          >
            {loading ? "Loading…" : `Show more (${total - approvals.length} remaining)`}
          </Button>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      ENTITY_TYPE_COLORS[selected.entityType] ?? "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {ENTITY_TYPE_LABELS[selected.entityType] ?? selected.entityType}
                  </span>
                  {ACTION_LABELS[selected.action] ?? selected.action}
                </DialogTitle>
                <DialogDescription>
                  Submitted by{" "}
                  <strong>{selected.requestedBy.name}</strong> (
                  {selected.requestedBy.role}) on{" "}
                  {formatDate(selected.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-2">
                <ApprovalDetail
                  approval={selected}
                  liveEntity={entityData}
                  entityLoading={entityLoading}
                  memberData={memberData}
                  memberLoading={memberLoading}
                />
              </div>

              {selected.status === "PENDING" && (
                <>
                  <div className="mt-4">
                    <label
                      htmlFor="approval-notes"
                      className="text-sm font-medium text-muted-foreground block mb-1"
                    >
                      Notes (optional)
                    </label>
                    <Input
                      id="approval-notes"
                      placeholder="Add a note for the operator..."
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      maxLength={1000}
                    />
                  </div>

                  <DialogFooter className="mt-4 flex gap-2 sm:flex-row flex-col">
                    <Button
                      variant="outline"
                      className="border-rose-300 text-rose-600 hover:bg-rose-50"
                      disabled={actionLoading !== null}
                      onClick={() => handleAction("reject")}
                    >
                      {actionLoading === "reject" ? (
                        "Rejecting..."
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 mr-1.5" />
                          Reject
                        </>
                      )}
                    </Button>
                    <Button
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={actionLoading !== null}
                      onClick={() => handleAction("approve")}
                    >
                      {actionLoading === "approve" ? (
                        "Approving..."
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1.5" />
                          Approve
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </>
              )}

              {selected.status !== "PENDING" && (
                <div className="mt-4 p-3 rounded-md bg-muted text-sm">
                  <div className="font-medium mb-1">
                    {selected.status === "APPROVED" ? (
                      <span className="flex items-center gap-1 text-emerald-700">
                        <CheckCircle className="h-4 w-4" /> Approved
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600">
                        <XCircle className="h-4 w-4" /> Rejected
                      </span>
                    )}
                  </div>
                  {selected.reviewedBy && (
                    <div className="text-muted-foreground">
                      By {selected.reviewedBy.name} on{" "}
                      {selected.reviewedAt ? formatDate(selected.reviewedAt) : "—"}
                    </div>
                  )}
                  {selected.notes && (
                    <div className="mt-1 italic text-muted-foreground">
                      &ldquo;{selected.notes}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
