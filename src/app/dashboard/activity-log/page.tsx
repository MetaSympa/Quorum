"use client";

/**
 * System Activity Log — /dashboard/activity-log
 *
 * Read-only page. No create/edit/delete buttons.
 * Columns: Date/Time, User, Action, Description, Metadata (truncated)
 * Detail modal on row click: full metadata JSON, user details.
 * Filters: user search (by name text), action dropdown, date range.
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

interface ActivityUser {
  id: string;
  name: string;
  role: string;
  memberId: string;
}

interface ActivityEntry {
  id: string;
  userId: string;
  action: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: ActivityUser;
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

/** Truncate metadata JSON to one-line preview */
function metadataPreview(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "—";
  const str = JSON.stringify(metadata);
  return str.length > 60 ? str.slice(0, 57) + "..." : str;
}

/** Role badge variant */
function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "ADMIN") return "default";
  if (role === "OPERATOR") return "secondary";
  return "outline";
}

// Actual action strings logged by the system (must match logActivity calls in services)
const ACTIVITY_ACTIONS = [
  // Auth
  "login_success",
  "login_failed",
  "password_changed",
  // Member
  "member_created",
  "member_add_requested",
  "member_updated",
  "member_edit_requested",
  "member_deleted",
  "member_delete_requested",
  // Sub-member
  "sub_member_created",
  "sub_member_add_requested",
  "sub_member_updated",
  "sub_member_edit_requested",
  "sub_member_removed",
  "sub_member_remove_requested",
  // Transaction
  "transaction_created",
  "transaction_add_requested",
  "transaction_updated",
  "transaction_edit_requested",
  "transaction_deleted",
  "transaction_delete_requested",
  // Membership
  "membership_created",
  "membership_create_requested",
  "membership_approved",
  "membership_rejected",
  "membership_expiry_reminder_sent",
  "membership_expired",
  // Approvals
  "approval_approved",
  "approval_rejected",
  // Sponsors
  "sponsor_created",
  "sponsor_updated",
  "sponsor_deleted",
  "sponsor_link_created",
  "sponsor_link_deactivated",
  "sponsor_payment_received",
  // Receipts & notifications
  "receipt_generated",
  "whatsapp_notification_sent",
];

// ---------------------------------------------------------------------------
// JSON Block — formatted syntax display
// ---------------------------------------------------------------------------

function JsonBlock({ data }: { data: Record<string, unknown> | null | undefined }) {
  if (data == null) return <p className="text-sm text-muted-foreground italic">No metadata</p>;
  return (
    <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64 whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActivityLogPage() {
  const { data: session, status } = useSession();

  // Data state
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState<string>("__all__");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  // User search: text input, maps to userId query param after lookup
  const [filterUserSearch, setFilterUserSearch] = useState("");
  const [filterPage, setFilterPage] = useState(1);

  // Detail modal
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntry | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterAction && filterAction !== "__all__") params.set("action", filterAction);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      params.set("page", String(filterPage));
      params.set("limit", "20");

      const res = await fetch(`/api/activity-log?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();

      // Client-side filter by user name if filterUserSearch is set
      let data: ActivityEntry[] = json.data ?? [];
      if (filterUserSearch.trim()) {
        const q = filterUserSearch.trim().toLowerCase();
        data = data.filter((e) => e.user?.name?.toLowerCase().includes(q));
      }

      setEntries(data);
      setPagination(json.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterDateFrom, filterDateTo, filterPage, filterUserSearch]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchEntries();
    }
  }, [status, fetchEntries]);

  function applyFilters() {
    setFilterPage(1);
    fetchEntries();
  }

  // ---------------------------------------------------------------------------
  // Access check
  // ---------------------------------------------------------------------------

  const canView =
    session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  if (!canView) {
    return (
      <div className="p-6">
        <p className="text-destructive">Access denied. Admins and Operators only.</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Activity Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Append-only record of all user and system actions. Read-only.
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
            {/* User search */}
            <Input
              placeholder="Search by user name"
              value={filterUserSearch}
              onChange={(e) => {
                setFilterUserSearch(e.target.value);
                setFilterPage(1);
              }}
            />

            {/* Action dropdown */}
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
                {ACTIVITY_ACTIONS.map((a) => (
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

            {/* Apply */}
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
            <div className="p-8 text-center text-muted-foreground">No activity log entries found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Metadata</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer hover:bg-sky-50/60"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateTime(entry.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium">{entry.user?.name ?? "SYSTEM"}</span>
                      {entry.user?.role && (
                        <Badge variant={roleBadgeVariant(entry.user.role)} className="ml-2 text-xs">
                          {entry.user.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-mono">
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {entry.description}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono max-w-xs truncate">
                      {metadataPreview(entry.metadata)}
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity Entry Details</DialogTitle>
            <DialogDescription>Full details of the selected activity log entry.</DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-5">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">Date/Time</span>
                <span className="font-medium">{formatDateTime(selectedEntry.createdAt)}</span>

                <span className="text-muted-foreground">Action</span>
                <Badge variant="outline" className="text-xs font-mono w-fit">
                  {selectedEntry.action}
                </Badge>

                <span className="text-muted-foreground">Description</span>
                <span className="font-medium">{selectedEntry.description}</span>
              </div>

              {/* User details */}
              <div>
                <h3 className="font-semibold text-sm mb-2">User</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">
                    {selectedEntry.user?.name ?? "SYSTEM"}
                    {selectedEntry.user?.role && (
                      <Badge variant={roleBadgeVariant(selectedEntry.user.role)} className="ml-2 text-xs">
                        {selectedEntry.user.role}
                      </Badge>
                    )}
                  </span>

                  {selectedEntry.user?.memberId && (
                    <>
                      <span className="text-muted-foreground">Member ID</span>
                      <span className="font-mono text-xs">{selectedEntry.user.memberId}</span>
                    </>
                  )}

                  {selectedEntry.user?.id && (
                    <>
                      <span className="text-muted-foreground">User ID</span>
                      <span className="font-mono text-xs break-all">{selectedEntry.user.id}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div>
                <h3 className="font-semibold text-sm mb-2">Metadata</h3>
                <JsonBlock data={selectedEntry.metadata} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
