"use client";

/**
 * Financial Audit Log — /dashboard/audit-log
 *
 * Read-only page. No create/edit/delete buttons.
 * Columns: Date/Time, Entity Type, Entity ID (truncated), Action, Performer, Details
 * Detail modal on row click: full previousData + newData (JSON), transaction details
 *   (amount, category, payment mode, sender), approval source badge, performer info.
 * Filters: entity type, action, date range, performer search (by name text → maps to performedById).
 */

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { SearchIcon, RefreshCwIcon, EyeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Performer {
  id: string;
  name: string;
  role: string;
  memberId: string;
}

interface TransactionDetail {
  id: string;
  type: string;
  category: string;
  amount: string;
  paymentMode: string;
  description: string;
  sponsorPurpose: string | null;
  approvalStatus: string;
  approvalSource: string;
  senderName: string | null;
  senderPhone: string | null;
  senderUpiId: string | null;
  senderBankAccount: string | null;
  senderBankName: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  receiptNumber: string | null;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown>;
  transactionId: string | null;
  performedById: string;
  createdAt: string;
  performedBy: Performer;
  transaction: TransactionDetail | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format ISO datetime to DD/MM/YYYY HH:MM */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/** Format amount as INR */
function formatAmount(amount: string | number): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Approval source badge color */
function approvalSourceVariant(source: string): "default" | "secondary" | "destructive" | "outline" {
  return source === "RAZORPAY_WEBHOOK" ? "default" : "secondary";
}

/** Entity type badge color */
function entityTypeBadgeVariant(et: string): "default" | "secondary" | "outline" {
  if (et.toLowerCase().includes("transaction")) return "default";
  if (et.toLowerCase().includes("member")) return "secondary";
  return "outline";
}

// Financial entity types and actions only
const FINANCIAL_ENTITY_TYPES = ["Transaction", "Sponsor", "SponsorLink"];

const ENTITY_TYPES = FINANCIAL_ENTITY_TYPES;

const ACTIONS = [
  "create_transaction",
  "approve_transaction",
  "reject_transaction",
  "payment_received",
  "sponsor_payment_received",
];

// ---------------------------------------------------------------------------
// JSON Block — formatted syntax display
// ---------------------------------------------------------------------------

function JsonBlock({ data }: { data: Record<string, unknown> | null | undefined }) {
  if (data == null) return <p className="text-sm text-muted-foreground italic">No data</p>;
  return (
    <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64 whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AuditLogPage() {
  const { data: session, status } = useSession();

  // Data state
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterEntityType, setFilterEntityType] = useState<string>("__all__");
  const [filterAction, setFilterAction] = useState<string>("__all__");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPerformer, setFilterPerformer] = useState("");
  const [filterPage, setFilterPage] = useState(1);

  // Detail modal
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterEntityType && filterEntityType !== "__all__") {
        params.set("entityType", filterEntityType);
      } else {
        // Always restrict to financial entity types
        params.set("entityTypes", FINANCIAL_ENTITY_TYPES.join(","));
      }
      if (filterAction && filterAction !== "__all__") params.set("action", filterAction);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      params.set("page", String(filterPage));
      params.set("limit", "20");

      const res = await fetch(`/api/audit-log?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setEntries(json.data ?? []);
      setPagination(json.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterEntityType, filterAction, filterDateFrom, filterDateTo, filterPage]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchEntries();
    }
  }, [status, fetchEntries]);

  // Reset to page 1 when filters change
  function applyFilters() {
    setFilterPage(1);
    fetchEntries();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderApprovalSourceBadge(source: string | undefined) {
    if (!source) return null;
    return (
      <Badge variant={approvalSourceVariant(source)} className="text-xs">
        {source === "RAZORPAY_WEBHOOK" ? "Razorpay Webhook" : "Manual"}
      </Badge>
    );
  }

  function renderTransactionDetail(txn: TransactionDetail) {
    return (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-muted-foreground">Type</span>
          <span className="font-medium">{txn.type}</span>

          <span className="text-muted-foreground">Category</span>
          <span className="font-medium">{txn.category}</span>

          <span className="text-muted-foreground">Amount</span>
          <span className={`font-medium ${txn.type === "CASH_IN" ? "text-green-700" : txn.type === "CASH_OUT" ? "text-red-700" : ""}`}>
            {formatAmount(txn.amount)}
          </span>

          <span className="text-muted-foreground">Payment Mode</span>
          <span className="font-medium">{txn.paymentMode}</span>

          {txn.sponsorPurpose && (
            <>
              <span className="text-muted-foreground">Sponsor Purpose</span>
              <span className="font-medium">{txn.sponsorPurpose}</span>
            </>
          )}

          <span className="text-muted-foreground">Status</span>
          <span className="font-medium">{txn.approvalStatus}</span>

          <span className="text-muted-foreground">Source</span>
          <span>{renderApprovalSourceBadge(txn.approvalSource)}</span>

          {txn.senderName && (
            <>
              <span className="text-muted-foreground">{txn.type === "CASH_OUT" ? "Receiver Name" : "Sender Name"}</span>
              <span className="font-medium">{txn.senderName}</span>
            </>
          )}

          {txn.senderPhone && (
            <>
              <span className="text-muted-foreground">{txn.type === "CASH_OUT" ? "Receiver Phone" : "Sender Phone"}</span>
              <span className="font-medium">{txn.senderPhone}</span>
            </>
          )}

          {txn.senderUpiId && (
            <>
              <span className="text-muted-foreground">UPI ID</span>
              <span className="font-medium font-mono text-xs">{txn.senderUpiId}</span>
            </>
          )}

          {txn.senderBankAccount && (
            <>
              <span className="text-muted-foreground">Bank Account</span>
              <span className="font-medium font-mono text-xs">{txn.senderBankAccount}</span>
            </>
          )}

          {txn.senderBankName && (
            <>
              <span className="text-muted-foreground">Bank Name</span>
              <span className="font-medium">{txn.senderBankName}</span>
            </>
          )}

          {txn.razorpayPaymentId && (
            <>
              <span className="text-muted-foreground">Razorpay Payment ID</span>
              <span className="font-medium font-mono text-xs break-all">{txn.razorpayPaymentId}</span>
            </>
          )}

          {txn.receiptNumber && (
            <>
              <span className="text-muted-foreground">Receipt No.</span>
              <span className="font-medium">{txn.receiptNumber}</span>
            </>
          )}
        </div>

        <div>
          <p className="text-muted-foreground text-xs mt-2">Description</p>
          <p className="text-sm">{txn.description}</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isAdmin = session?.user?.role === "ADMIN";
  const isOperator = session?.user?.role === "OPERATOR";
  const canView = isAdmin || isOperator;

  if (!canView) {
    return (
      <div className="p-6">
        <p className="text-destructive">Access denied. Admins and Operators only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Financial Audit Log</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Append-only record of all financial events. Read-only.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
          <RefreshCwIcon className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Entity Type */}
            <Select
              value={filterEntityType}
              onValueChange={(v) => {
                setFilterEntityType(v);
                setFilterPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Entity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All entity types</SelectItem>
                {ENTITY_TYPES.map((et) => (
                  <SelectItem key={et} value={et}>
                    {et}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action */}
            <Select
              value={filterAction}
              onValueChange={(v) => {
                setFilterAction(v);
                setFilterPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All actions</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date from */}
            <Input
              type="date"
              placeholder="From date"
              value={filterDateFrom}
              onChange={(e) => {
                setFilterDateFrom(e.target.value);
                setFilterPage(1);
              }}
            />

            {/* Date to */}
            <Input
              type="date"
              placeholder="To date"
              value={filterDateTo}
              onChange={(e) => {
                setFilterDateTo(e.target.value);
                setFilterPage(1);
              }}
            />

            {/* Apply button */}
            <Button onClick={applyFilters} className="w-full">
              <SearchIcon className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : error ? (
            <div className="p-8 text-center text-destructive">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No audit log entries found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Sender / Receiver</TableHead>
                  <TableHead>Performer</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateTime(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entityTypeBadgeVariant(entry.entityType)} className="text-xs">
                        {entry.entityType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{entry.action}</TableCell>
                    <TableCell className="text-right font-mono font-medium text-sm">
                      {entry.transaction ? (
                        <span className={entry.transaction.type === "CASH_IN" ? "text-green-700" : "text-red-700"}>
                          {formatAmount(entry.transaction.amount)}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.transaction?.senderName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.performedBy?.name ?? "SYSTEM"}
                      {entry.performedBy?.role && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({entry.performedBy.role})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEntry(entry);
                        }}
                      >
                        <EyeIcon className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filterPage <= 1}
              onClick={() => setFilterPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filterPage >= pagination.totalPages}
              onClick={() => setFilterPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Entry Details</DialogTitle>
            <DialogDescription>Full details of the selected audit log entry.</DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-5">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">Date/Time</span>
                <span className="font-medium">{formatDateTime(selectedEntry.createdAt)}</span>

                <span className="text-muted-foreground">Entity Type</span>
                <Badge variant={entityTypeBadgeVariant(selectedEntry.entityType)} className="text-xs w-fit">
                  {selectedEntry.entityType}
                </Badge>

                <span className="text-muted-foreground">Action</span>
                <span className="font-medium">{selectedEntry.action}</span>

                <span className="text-muted-foreground">Performed By</span>
                <span className="font-medium">
                  {selectedEntry.performedBy?.name ?? "SYSTEM"}
                  {selectedEntry.performedBy?.role && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {selectedEntry.performedBy.role}
                    </Badge>
                  )}
                </span>

                {selectedEntry.performedBy?.memberId && (
                  <>
                    <span className="text-muted-foreground">Member ID</span>
                    <span className="font-mono text-xs">{selectedEntry.performedBy.memberId}</span>
                  </>
                )}
              </div>

              {/* Transaction details (if linked) */}
              {selectedEntry.transaction && (
                <div>
                  <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    Linked Transaction
                    {renderApprovalSourceBadge(selectedEntry.transaction.approvalSource)}
                  </h3>
                  {renderTransactionDetail(selectedEntry.transaction)}
                </div>
              )}

              {/* Previous data */}
              <div>
                <h3 className="font-semibold text-sm mb-2">Previous Data</h3>
                <JsonBlock data={selectedEntry.previousData} />
              </div>

              {/* New data */}
              <div>
                <h3 className="font-semibold text-sm mb-2">New Data</h3>
                <JsonBlock data={selectedEntry.newData} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
