"use client";

/**
 * My Membership Page
 *
 * Displays:
 * - Current membership status card (status badge, type, expiry, member ID)
 * - User details card (name, email, phone, address)
 * - Sub-members list (linked sub-members and their details)
 * - Payment history (table of all Membership records)
 * - Renew/Pay button with payment mode selection
 *   - ACTIVE: expiry countdown + "Renew" button
 *   - EXPIRED / PENDING_PAYMENT: "Pay Now" button
 *   - PENDING_APPROVAL: "Awaiting Approval" message
 * - Sub-member pay-on-behalf: if logged-in user is a sub-member, show "Pay for [Parent Name]"
 * - Application fee indicator if not yet paid
 *
 * Cash payment creates a Transaction + Approval record (Razorpay in T12).
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import type { MembershipType } from "@/types";
import { MEMBERSHIP_FEES, APPLICATION_FEE } from "@/types";
import {
  formatCurrency as formatCurrencyUtil,
  formatDate as formatDateUtil,
  formatMembershipType,
  formatMembershipStatus,
} from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubMemberInfo {
  id: string;
  memberId: string;
  name: string;
  email: string;
  phone: string;
  relation: string;
}

interface MembershipRecord {
  id: string;
  type: MembershipType;
  amount: string;
  startDate: string;
  endDate: string;
  isApplicationFee: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

interface MyMembershipData {
  user: {
    id: string;
    memberId: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    role: string;
    membershipStatus: string;
    membershipType: MembershipType | null;
    membershipStart: string | null;
    membershipExpiry: string | null;
    totalPaid: string;
    applicationFeePaid: boolean;
  };
  member: { id: string; membershipStatus: string } | null;
  subMembers: SubMemberInfo[];
  paymentHistory: MembershipRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use centralized formatters from @/lib/utils
const formatDate = formatDateUtil;
const formatCurrency = formatCurrencyUtil;

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  expiry.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diff;
}

function membershipStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "EXPIRED":
      return "Expired";
    case "PENDING_APPROVAL":
      return "Pending Approval";
    case "PENDING_PAYMENT":
      return "Pending Payment";
    case "SUSPENDED":
      return "Suspended";
    default:
      return status;
  }
}

function membershipStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ACTIVE":
      return "default";
    case "EXPIRED":
    case "SUSPENDED":
      return "destructive";
    case "PENDING_APPROVAL":
    case "PENDING_PAYMENT":
      return "secondary";
    default:
      return "outline";
  }
}

function approvalStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "APPROVED":
      return "default";
    case "REJECTED":
      return "destructive";
    case "PENDING":
      return "secondary";
    default:
      return "outline";
  }
}

// membershipTypeLabel — use formatMembershipType from @/lib/utils
const membershipTypeLabel = (type: MembershipType | null): string => formatMembershipType(type);

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function MyMembershipPage() {
  const { data: session, status } = useSession();
  const { toast } = useToast();

  const [data, setData] = useState<MyMembershipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<MembershipType>("MONTHLY");
  const [selectedMode, setSelectedMode] = useState<"UPI" | "BANK_TRANSFER" | "CASH">("CASH");
  const [includeAppFee, setIncludeAppFee] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isRenewal, setIsRenewal] = useState(false);

  const user = session?.user;
  const isSubMember = user?.isSubMember ?? false;

  // ---------------------------------------------------------------------------
  // Fetch membership data
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Derive base URL from membership list which returns paginated data;
      // we need the full "my membership" data including sub-members.
      // Use the memberships endpoint + a separate user-info fetch via existing session.
      // Since we have getMyMembership via the service, we expose it via the stats or a
      // dedicated endpoint. For now we compose from /api/memberships and session data.
      // T08 provides the full data via GET /api/memberships (scoped to the current user).

      const membershipRes = await fetch("/api/memberships?limit=100");
      const membershipJson = await membershipRes.json();

      // Also fetch user profile for sub-member information.
      // We rely on /api/members/[id] if we have a memberId, or build from session.
      // Since we want the full MyMembershipData shape, we'll do a dedicated fetch.
      const profileRes = await fetch("/api/my-membership");
      if (profileRes.ok) {
        const profileJson = await profileRes.json();
        setData(profileJson);
      } else if (membershipJson && session?.user) {
        // Fallback: compose from session + memberships list
        setData({
          user: {
            id: user?.id ?? "",
            memberId: user?.memberId ?? "",
            name: user?.name ?? "",
            email: user?.email ?? "",
            phone: "",
            address: "",
            role: user?.role ?? "MEMBER",
            membershipStatus: "PENDING_PAYMENT",
            membershipType: null,
            membershipStart: null,
            membershipExpiry: null,
            totalPaid: "0",
            applicationFeePaid: false,
          },
          member: null,
          subMembers: [],
          paymentHistory: membershipJson?.data ?? [],
        });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to load membership data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [session, user, toast]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchData();
    }
  }, [status, fetchData]);

  // ---------------------------------------------------------------------------
  // Compute payment amount
  // ---------------------------------------------------------------------------

  const computeAmount = (): number => {
    const base = MEMBERSHIP_FEES[selectedType];
    return includeAppFee ? base + APPLICATION_FEE : base;
  };

  // ---------------------------------------------------------------------------
  // Submit payment (Cash for now — Razorpay in T12)
  // ---------------------------------------------------------------------------

  const handlePay = async () => {
    if (!data?.member?.id) {
      toast({
        title: "No member record found",
        description: "Your account has not been linked to a member record yet.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const amount = computeAmount();
      const res = await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: data.member.id,
          type: selectedType,
          amount: amount.toString(),
          isApplicationFee: includeAppFee,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast({
          title: "Payment failed",
          description: json.error ?? "An error occurred",
          variant: "destructive",
        });
        return;
      }

      toast({
        title:
          json.action === "pending_approval"
            ? "Payment submitted for approval"
            : "Membership activated",
        description:
          json.action === "pending_approval"
            ? "Your payment has been recorded and is awaiting admin approval."
            : `Your ${membershipTypeLabel(selectedType)} membership is now active.`,
      });

      setPayDialogOpen(false);
      fetchData();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const membershipStatus = data?.user.membershipStatus ?? "PENDING_PAYMENT";
  const isActive = membershipStatus === "ACTIVE";
  const isPendingApproval =
    membershipStatus === "PENDING_APPROVAL" ||
    (data?.paymentHistory ?? []).some((p) => p.status === "PENDING");
  const daysLeft = daysUntil(data?.user.membershipExpiry ?? null);
  const needsAppFee = data ? !data.user.applicationFeePaid : false;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-8 text-muted-foreground">Loading membership data...</div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-muted-foreground">
        No membership data available. Please contact the administrator.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Membership</h1>

      {/* ------------------------------------------------------------------ */}
      {/* Sub-member pay-on-behalf banner                                      */}
      {/* ------------------------------------------------------------------ */}
      {isSubMember && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center justify-between p-4">
            <p className="text-sm text-amber-800">
              You are viewing the membership for{" "}
              <strong>{data.user.name}</strong>. As a sub-member, you can pay
              on their behalf.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-800 hover:bg-amber-100"
              onClick={() => {
                setIsRenewal(isActive);
                setIncludeAppFee(needsAppFee);
                setPayDialogOpen(true);
              }}
            >
              Pay for {data.user.name}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Application fee alert                                               */}
      {/* ------------------------------------------------------------------ */}
      {needsAppFee && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-sm text-blue-800">
              <strong>Application fee pending:</strong> A one-time application
              fee of {formatCurrency(APPLICATION_FEE)} is required. It will be
              included with your first membership payment.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Current Status Card                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Membership Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Badge variant={membershipStatusVariant(membershipStatus)}>
              {membershipStatusLabel(membershipStatus)}
            </Badge>
            {data.user.membershipType && (
              <span className="text-sm text-muted-foreground">
                {membershipTypeLabel(data.user.membershipType)} Plan
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Member ID
              </p>
              <p className="font-mono text-sm font-semibold">{data.user.memberId}</p>
            </div>

            {data.user.membershipStart && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Start Date
                </p>
                <p className="text-sm">{formatDate(data.user.membershipStart)}</p>
              </div>
            )}

            {data.user.membershipExpiry && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Expiry Date
                </p>
                <p className="text-sm">{formatDate(data.user.membershipExpiry)}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total Paid
              </p>
              <p className="text-sm font-semibold">
                {formatCurrency(data.user.totalPaid)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Application Fee
              </p>
              <p className="text-sm">
                {data.user.applicationFeePaid ? (
                  <span className="text-green-600">Paid</span>
                ) : (
                  <span className="text-amber-600">Not Paid</span>
                )}
              </p>
            </div>
          </div>

          <Separator />

          {/* Action area */}
          <div className="flex flex-wrap items-center gap-3">
            {isActive && daysLeft !== null && daysLeft >= 0 && (
              <p className="text-sm text-muted-foreground">
                {daysLeft === 0
                  ? "Expires today"
                  : `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
              </p>
            )}

            {isPendingApproval && !isActive && (
              <Badge variant="secondary">Awaiting Approval</Badge>
            )}

            {isActive && (
              <Button
                onClick={() => {
                  setIsRenewal(true);
                  setIncludeAppFee(false);
                  setPayDialogOpen(true);
                }}
              >
                Renew Membership
              </Button>
            )}

            {(membershipStatus === "EXPIRED" ||
              membershipStatus === "PENDING_PAYMENT") && (
              <Button
                onClick={() => {
                  setIsRenewal(false);
                  setIncludeAppFee(needsAppFee);
                  setPayDialogOpen(true);
                }}
              >
                Pay Now
              </Button>
            )}

            {membershipStatus === "PENDING_APPROVAL" && (
              <p className="text-sm text-muted-foreground">
                Your membership application is pending admin approval.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* User Details Card                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Full Name
              </p>
              <p className="text-sm">{data.user.name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Email
              </p>
              <p className="text-sm">{data.user.email}</p>
            </div>
            {data.user.phone && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  WhatsApp / Phone
                </p>
                <p className="text-sm">{data.user.phone}</p>
              </div>
            )}
            {data.user.address && (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Address
                </p>
                <p className="text-sm">{data.user.address}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Sub-members List                                                    */}
      {/* ------------------------------------------------------------------ */}
      {!isSubMember && data.subMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sub-Members</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Relation</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.subMembers.map((sm) => (
                  <TableRow key={sm.id}>
                    <TableCell className="font-mono text-xs">{sm.memberId}</TableCell>
                    <TableCell>{sm.name}</TableCell>
                    <TableCell>{sm.relation}</TableCell>
                    <TableCell>{sm.email}</TableCell>
                    <TableCell>{sm.phone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Payment History                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.paymentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payment records found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.paymentHistory.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-sm">
                      {formatDate(record.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm">
                          {membershipTypeLabel(record.type)}
                        </span>
                        {record.isApplicationFee && (
                          <Badge variant="outline" className="w-fit text-xs">
                            + App Fee
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(record.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(record.startDate)} — {formatDate(record.endDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={approvalStatusVariant(record.status)}>
                        {record.status.charAt(0) +
                          record.status.slice(1).toLowerCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Pay / Renew Dialog                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isRenewal ? "Renew Membership" : "Pay Membership Fee"}
            </DialogTitle>
            <DialogDescription>
              {isSubMember
                ? `Paying on behalf of ${data.user.name}.`
                : "Select your membership type and payment mode."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Membership type */}
            <div className="space-y-1">
              <Label>Membership Type</Label>
              <Select
                value={selectedType}
                onValueChange={(v) => setSelectedType(v as MembershipType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">
                    Monthly — {formatCurrency(MEMBERSHIP_FEES.MONTHLY)}
                  </SelectItem>
                  <SelectItem value="HALF_YEARLY">
                    Half-Yearly — {formatCurrency(MEMBERSHIP_FEES.HALF_YEARLY)}
                  </SelectItem>
                  <SelectItem value="ANNUAL">
                    Annual — {formatCurrency(MEMBERSHIP_FEES.ANNUAL)}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Application fee toggle (only if unpaid and not a renewal) */}
            {needsAppFee && !isRenewal && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Include Application Fee</p>
                  <p className="text-xs text-muted-foreground">
                    One-time fee: {formatCurrency(APPLICATION_FEE)}
                  </p>
                </div>
                <Button
                  variant={includeAppFee ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIncludeAppFee(!includeAppFee)}
                >
                  {includeAppFee ? "Included" : "Add"}
                </Button>
              </div>
            )}

            {/* Payment mode */}
            <div className="space-y-1">
              <Label>Payment Mode</Label>
              <Select
                value={selectedMode}
                onValueChange={(v) =>
                  setSelectedMode(v as "UPI" | "BANK_TRANSFER" | "CASH")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash (in-person)</SelectItem>
                  <SelectItem value="UPI" disabled>
                    UPI (coming soon — Razorpay)
                  </SelectItem>
                  <SelectItem value="BANK_TRANSFER" disabled>
                    Bank Transfer (coming soon — Razorpay)
                  </SelectItem>
                </SelectContent>
              </Select>
              {selectedMode === "CASH" && (
                <p className="text-xs text-muted-foreground">
                  Cash payments are recorded by the operator and require admin
                  approval before your membership is activated.
                </p>
              )}
            </div>

            {/* Amount summary */}
            <div className="rounded-md bg-muted p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Amount</span>
                <span className="text-lg font-bold">
                  {formatCurrency(computeAmount())}
                </span>
              </div>
              {includeAppFee && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Includes {formatCurrency(APPLICATION_FEE)} one-time application
                  fee + {formatCurrency(MEMBERSHIP_FEES[selectedType])} membership
                  fee
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPayDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handlePay} disabled={submitting}>
              {submitting
                ? "Processing..."
                : selectedMode === "CASH"
                ? "Submit Cash Payment"
                : "Proceed to Pay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
