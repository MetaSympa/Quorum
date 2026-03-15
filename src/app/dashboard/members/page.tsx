"use client";

/**
 * Member Management Page
 *
 * Provides full CRUD for members and sub-members.
 * Admin: direct operations. Operator: all changes require admin approval.
 *
 * Features:
 * - Paginated member table with search + status filter
 * - Add Member dialog
 * - Edit Member dialog (pre-filled)
 * - Delete confirmation dialog
 * - Member detail panel with sub-members list
 * - Add/Edit/Remove sub-member (max 3 enforced, "(max 3)" indicator shown)
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/components/ui/use-toast";
import { formatDate, formatMembershipStatus } from "@/lib/utils";
import type { MembershipStatus } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubMemberData {
  id: string;
  memberId: string;
  name: string;
  email: string;
  phone: string;
  relation: string;
  canLogin: boolean;
  createdAt: string;
}

interface MemberData {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  membershipStatus: MembershipStatus;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  user: {
    memberId: string;
    membershipStatus: MembershipStatus;
    totalPaid: string;
    applicationFeePaid: boolean;
  } | null;
  subMembers?: SubMemberData[];
}

interface PaginatedResponse {
  data: MemberData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function statusBadgeVariant(
  status: MembershipStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ACTIVE":
      return "default";
    case "PENDING_APPROVAL":
    case "PENDING_PAYMENT":
      return "secondary";
    case "SUSPENDED":
      return "destructive";
    case "EXPIRED":
      return "outline";
  }
}

function statusLabel(status: MembershipStatus): string {
  return formatMembershipStatus(status);
}

// formatDate is imported from @/lib/utils

// ---------------------------------------------------------------------------
// Empty form states
// ---------------------------------------------------------------------------

const emptyMemberForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
};

const emptySubMemberForm = {
  name: "",
  email: "",
  phone: "",
  relation: "",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MembersPage() {
  const { data: session, status } = useSession();
  const { toast } = useToast();

  // List state
  const [members, setMembers] = useState<MemberData[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MembershipStatus | "ALL">(
    "ALL"
  );
  const [isLoading, setIsLoading] = useState(false);

  // Selected member for detail panel
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(
    null
  );
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Add/Edit member dialog
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isEditMemberOpen, setIsEditMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState(emptyMemberForm);
  const [isMemberFormLoading, setIsMemberFormLoading] = useState(false);

  // Delete member dialog
  const [isDeleteMemberOpen, setIsDeleteMemberOpen] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  // Add/Edit sub-member dialog
  const [isAddSubMemberOpen, setIsAddSubMemberOpen] = useState(false);
  const [isEditSubMemberOpen, setIsEditSubMemberOpen] = useState(false);
  const [isDeleteSubMemberOpen, setIsDeleteSubMemberOpen] = useState(false);
  const [subMemberForm, setSubMemberForm] = useState(emptySubMemberForm);
  const [selectedSubMember, setSelectedSubMember] =
    useState<SubMemberData | null>(null);
  const [isSubMemberFormLoading, setIsSubMemberFormLoading] = useState(false);

  const isOperator = session?.user?.role === "OPERATOR";
  const isAdmin = session?.user?.role === "ADMIN";

  // ---------------------------------------------------------------------------
  // Fetch members list
  // ---------------------------------------------------------------------------

  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/members?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }
      const data: PaginatedResponse = await res.json();
      setMembers(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load members",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, toast]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchMembers();
    }
  }, [status, fetchMembers]);

  // ---------------------------------------------------------------------------
  // Fetch single member detail
  // ---------------------------------------------------------------------------

  const fetchMemberDetail = async (id: string) => {
    setIsDetailLoading(true);
    try {
      const res = await fetch(`/api/members/${id}`);
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }
      const data: MemberData = await res.json();
      setSelectedMember(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load member details",
        variant: "destructive",
      });
    } finally {
      setIsDetailLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Create member
  // ---------------------------------------------------------------------------

  const handleCreateMember = async () => {
    setIsMemberFormLoading(true);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memberForm),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldLabels: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", address: "Address" };
        const desc = data?.details?.fieldErrors
          ? Object.entries(data.details.fieldErrors as Record<string, string[]>).map(([f, e]) => `${fieldLabels[f] ?? f}: ${e[0]}`).join(" • ")
          : (data.error ?? "Failed to create member");
        toast({ title: "Error", description: desc, variant: "destructive" });
        return;
      }
      toast({
        title: "Success",
        description: data.message ?? "Member created",
      });
      setIsAddMemberOpen(false);
      setMemberForm(emptyMemberForm);
      fetchMembers();
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setIsMemberFormLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Update member
  // ---------------------------------------------------------------------------

  const handleUpdateMember = async () => {
    if (!selectedMember) return;
    setIsMemberFormLoading(true);
    try {
      const res = await fetch(`/api/members/${selectedMember.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memberForm),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldLabels: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", address: "Address" };
        const desc = data?.details?.fieldErrors
          ? Object.entries(data.details.fieldErrors as Record<string, string[]>).map(([f, e]) => `${fieldLabels[f] ?? f}: ${e[0]}`).join(" • ")
          : (data.error ?? "Failed to update member");
        toast({ title: "Error", description: desc, variant: "destructive" });
        return;
      }
      toast({
        title: "Success",
        description: data.message ?? "Member updated",
      });
      setIsEditMemberOpen(false);
      fetchMembers();
      fetchMemberDetail(selectedMember.id);
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setIsMemberFormLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete member
  // ---------------------------------------------------------------------------

  const handleDeleteMember = async () => {
    if (!selectedMember) return;
    setIsDeleteLoading(true);
    try {
      const res = await fetch(`/api/members/${selectedMember.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Error",
          description: data.error ?? "Failed to delete member",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Success",
        description: data.message ?? "Member deleted",
      });
      setIsDeleteMemberOpen(false);
      setSelectedMember(null);
      fetchMembers();
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setIsDeleteLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Add sub-member
  // ---------------------------------------------------------------------------

  const handleAddSubMember = async () => {
    if (!selectedMember) return;
    setIsSubMemberFormLoading(true);
    try {
      const res = await fetch(`/api/members/${selectedMember.id}/sub-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subMemberForm),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldLabels: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", relation: "Relation" };
        const desc = data?.details?.fieldErrors
          ? Object.entries(data.details.fieldErrors as Record<string, string[]>).map(([f, e]) => `${fieldLabels[f] ?? f}: ${e[0]}`).join(" • ")
          : (data.error ?? "Failed to add sub-member");
        toast({ title: "Error", description: desc, variant: "destructive" });
        return;
      }
      toast({
        title: "Success",
        description: data.message ?? "Sub-member added",
      });
      setIsAddSubMemberOpen(false);
      setSubMemberForm(emptySubMemberForm);
      fetchMemberDetail(selectedMember.id);
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setIsSubMemberFormLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Update sub-member
  // ---------------------------------------------------------------------------

  const handleUpdateSubMember = async () => {
    if (!selectedMember || !selectedSubMember) return;
    setIsSubMemberFormLoading(true);
    try {
      const res = await fetch(`/api/members/${selectedMember.id}/sub-members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subMemberId: selectedSubMember.id,
          ...subMemberForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldLabels: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", relation: "Relation" };
        const desc = data?.details?.fieldErrors
          ? Object.entries(data.details.fieldErrors as Record<string, string[]>).map(([f, e]) => `${fieldLabels[f] ?? f}: ${e[0]}`).join(" • ")
          : (data.error ?? "Failed to update sub-member");
        toast({ title: "Error", description: desc, variant: "destructive" });
        return;
      }
      toast({
        title: "Success",
        description: data.message ?? "Sub-member updated",
      });
      setIsEditSubMemberOpen(false);
      fetchMemberDetail(selectedMember.id);
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setIsSubMemberFormLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Remove sub-member
  // ---------------------------------------------------------------------------

  const handleRemoveSubMember = async () => {
    if (!selectedMember || !selectedSubMember) return;
    setIsSubMemberFormLoading(true);
    try {
      const res = await fetch(`/api/members/${selectedMember.id}/sub-members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subMemberId: selectedSubMember.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Error",
          description: data.error ?? "Failed to remove sub-member",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Success",
        description: data.message ?? "Sub-member removed",
      });
      setIsDeleteSubMemberOpen(false);
      setSelectedSubMember(null);
      fetchMemberDetail(selectedMember.id);
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setIsSubMemberFormLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Search debounce — reset page when search/filter changes
  // ---------------------------------------------------------------------------

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value as MembershipStatus | "ALL");
    setPage(1);
  };

  // ---------------------------------------------------------------------------
  // Member form shared component
  // ---------------------------------------------------------------------------

  const MemberFormFields = () => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="member-name">Full Name</Label>
        <Input
          id="member-name"
          placeholder="e.g. Ramesh Kumar"
          value={memberForm.name}
          onChange={(e) =>
            setMemberForm((f) => ({ ...f, name: e.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="member-email">Email</Label>
        <Input
          id="member-email"
          type="email"
          placeholder="e.g. ramesh@example.com"
          value={memberForm.email}
          onChange={(e) =>
            setMemberForm((f) => ({ ...f, email: e.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="member-phone">WhatsApp Number</Label>
        <Input
          id="member-phone"
          placeholder="+91XXXXXXXXXX"
          value={memberForm.phone}
          onChange={(e) =>
            setMemberForm((f) => ({ ...f, phone: e.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="member-address">Address</Label>
        <Input
          id="member-address"
          placeholder="Full address"
          value={memberForm.address}
          onChange={(e) =>
            setMemberForm((f) => ({ ...f, address: e.target.value }))
          }
        />
      </div>
    </div>
  );

  const SubMemberFormFields = () => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="sub-name">Full Name</Label>
        <Input
          id="sub-name"
          placeholder="e.g. Priya Kumar"
          value={subMemberForm.name}
          onChange={(e) =>
            setSubMemberForm((f) => ({ ...f, name: e.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sub-email">Email</Label>
        <Input
          id="sub-email"
          type="email"
          placeholder="e.g. priya@example.com"
          value={subMemberForm.email}
          onChange={(e) =>
            setSubMemberForm((f) => ({ ...f, email: e.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sub-phone">WhatsApp Number</Label>
        <Input
          id="sub-phone"
          placeholder="+91XXXXXXXXXX"
          value={subMemberForm.phone}
          onChange={(e) =>
            setSubMemberForm((f) => ({ ...f, phone: e.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sub-relation">Relation</Label>
        <Input
          id="sub-relation"
          placeholder="e.g. Spouse, Child, Parent"
          value={subMemberForm.relation}
          onChange={(e) =>
            setSubMemberForm((f) => ({ ...f, relation: e.target.value }))
          }
        />
      </div>
    </div>
  );

  const subMembersCount = selectedMember?.subMembers?.length ?? 0;
  const canAddSubMember = subMembersCount < 3;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Member Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isOperator
              ? "Add, edit, or delete members. All changes require admin approval."
              : "Manage club members and their sub-members."}
          </p>
        </div>
        <Button
          onClick={() => {
            setMemberForm(emptyMemberForm);
            setIsAddMemberOpen(true);
          }}
        >
          Add Member
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Members Table */}
        <div className="flex-1">
          {/* Search + Filter */}
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="Search by name, email, or member ID..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PENDING_APPROVAL">
                  Pending Approval
                </SelectItem>
                <SelectItem value="PENDING_PAYMENT">Pending Payment</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No members found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((member) => (
                      <TableRow
                        key={member.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => fetchMemberDetail(member.id)}
                      >
                        <TableCell className="font-medium">
                          {member.name}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {member.user?.memberId ?? "—"}
                        </TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>{member.phone}</TableCell>
                        <TableCell>
                          <Badge
                            variant={statusBadgeVariant(
                              member.membershipStatus
                            )}
                          >
                            {statusLabel(member.membershipStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(member.joinedAt)}</TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex gap-2 justify-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                fetchMemberDetail(member.id).then(() => {
                                  setMemberForm({
                                    name: member.name,
                                    email: member.email,
                                    phone: member.phone,
                                    address: member.address,
                                  });
                                  setIsEditMemberOpen(true);
                                });
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setSelectedMember(member);
                                setIsDeleteMemberOpen(true);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {members.length} of {total} members
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="flex items-center px-3 text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Member Detail Panel */}
        {selectedMember && (
          <div className="w-full lg:w-96">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {selectedMember.name}
                    </CardTitle>
                    <p className="font-mono text-sm text-muted-foreground mt-1">
                      {selectedMember.user?.memberId ?? "No member ID"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedMember(null)}
                  >
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isDetailLoading ? (
                  <p className="text-muted-foreground text-sm">Loading...</p>
                ) : (
                  <>
                    {/* Member details */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Email</span>
                        <span>{selectedMember.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Phone</span>
                        <span>{selectedMember.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge
                          variant={statusBadgeVariant(
                            selectedMember.membershipStatus
                          )}
                        >
                          {statusLabel(selectedMember.membershipStatus)}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Joined</span>
                        <span>{formatDate(selectedMember.joinedAt)}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground">Address</span>
                        <span className="text-right">
                          {selectedMember.address}
                        </span>
                      </div>
                    </div>

                    {/* Edit/Delete actions for detail panel */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setMemberForm({
                            name: selectedMember.name,
                            email: selectedMember.email,
                            phone: selectedMember.phone,
                            address: selectedMember.address,
                          });
                          setIsEditMemberOpen(true);
                        }}
                      >
                        Edit Member
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => setIsDeleteMemberOpen(true)}
                      >
                        Delete
                      </Button>
                    </div>

                    {/* Sub-members section */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-sm">
                            Sub-Members
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {subMembersCount}/3 (max 3)
                          </p>
                        </div>
                        {canAddSubMember && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSubMemberForm(emptySubMemberForm);
                              setIsAddSubMemberOpen(true);
                            }}
                          >
                            Add
                          </Button>
                        )}
                      </div>

                      {subMembersCount === 0 ? (
                        <p className="text-muted-foreground text-xs text-center py-3">
                          No sub-members yet
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {selectedMember.subMembers?.map((sm) => (
                            <div
                              key={sm.id}
                              className="border rounded-md p-3 space-y-1"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-sm">
                                    {sm.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    {sm.memberId}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {sm.relation}
                                  </p>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => {
                                      setSelectedSubMember(sm);
                                      setSubMemberForm({
                                        name: sm.name,
                                        email: sm.email,
                                        phone: sm.phone,
                                        relation: sm.relation,
                                      });
                                      setIsEditSubMemberOpen(true);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs text-destructive"
                                    onClick={() => {
                                      setSelectedSubMember(sm);
                                      setIsDeleteSubMemberOpen(true);
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {sm.email}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Dialogs                                                              */}
      {/* ------------------------------------------------------------------ */}

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Member</DialogTitle>
            <DialogDescription>
              {isOperator
                ? "This request will be sent for admin approval before the member is created."
                : "Create a new member. A temporary password will be generated."}
            </DialogDescription>
          </DialogHeader>
          <MemberFormFields />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddMemberOpen(false)}
              disabled={isMemberFormLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateMember}
              disabled={isMemberFormLoading}
            >
              {isMemberFormLoading
                ? "Submitting..."
                : isOperator
                ? "Submit for Approval"
                : "Create Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={isEditMemberOpen} onOpenChange={setIsEditMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>
              {isOperator
                ? "Changes will be sent for admin approval."
                : "Update member information."}
            </DialogDescription>
          </DialogHeader>
          <MemberFormFields />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditMemberOpen(false)}
              disabled={isMemberFormLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateMember}
              disabled={isMemberFormLoading}
            >
              {isMemberFormLoading
                ? "Saving..."
                : isOperator
                ? "Submit for Approval"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Member Confirmation */}
      <Dialog open={isDeleteMemberOpen} onOpenChange={setIsDeleteMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Member</DialogTitle>
            <DialogDescription>
              {isOperator
                ? `This will submit a delete request for ${selectedMember?.name ?? "this member"} for admin approval.`
                : `This will suspend ${selectedMember?.name ?? "this member"}'s account. This action requires admin approval to reverse.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteMemberOpen(false)}
              disabled={isDeleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteMember}
              disabled={isDeleteLoading}
            >
              {isDeleteLoading
                ? "Processing..."
                : isOperator
                ? "Submit Delete Request"
                : "Suspend Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Sub-Member Dialog */}
      <Dialog open={isAddSubMemberOpen} onOpenChange={setIsAddSubMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Sub-Member</DialogTitle>
            <DialogDescription>
              {isOperator
                ? "This request will be sent for admin approval."
                : `Add a sub-member to ${selectedMember?.name}. Max 3 allowed.`}
            </DialogDescription>
          </DialogHeader>
          <SubMemberFormFields />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddSubMemberOpen(false)}
              disabled={isSubMemberFormLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSubMember}
              disabled={isSubMemberFormLoading}
            >
              {isSubMemberFormLoading
                ? "Submitting..."
                : isOperator
                ? "Submit for Approval"
                : "Add Sub-Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sub-Member Dialog */}
      <Dialog open={isEditSubMemberOpen} onOpenChange={setIsEditSubMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sub-Member</DialogTitle>
            <DialogDescription>
              {isOperator
                ? "Changes will be sent for admin approval."
                : "Update sub-member information."}
            </DialogDescription>
          </DialogHeader>
          <SubMemberFormFields />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditSubMemberOpen(false)}
              disabled={isSubMemberFormLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateSubMember}
              disabled={isSubMemberFormLoading}
            >
              {isSubMemberFormLoading
                ? "Saving..."
                : isOperator
                ? "Submit for Approval"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Sub-Member Confirmation */}
      <Dialog
        open={isDeleteSubMemberOpen}
        onOpenChange={setIsDeleteSubMemberOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Sub-Member</DialogTitle>
            <DialogDescription>
              {isOperator
                ? `This will submit a remove request for ${selectedSubMember?.name ?? "this sub-member"} for admin approval.`
                : `Remove ${selectedSubMember?.name ?? "this sub-member"} from the family? This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteSubMemberOpen(false)}
              disabled={isSubMemberFormLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveSubMember}
              disabled={isSubMemberFormLoading}
            >
              {isSubMemberFormLoading
                ? "Processing..."
                : isOperator
                ? "Submit Remove Request"
                : "Remove Sub-Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
