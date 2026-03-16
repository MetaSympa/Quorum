"use client";

/**
 * Cash Management page — /dashboard/cash
 *
 * Summary cards: Total Income, Total Expenses, Pending Amount, Net Balance
 * Transaction table with filters (type, category, payment mode, date range)
 * Add / Edit / Delete transaction dialogs
 * Operator sees "Submit for Approval" label; admin sees "Create"
 * Razorpay-sourced transactions shown with badge, edit/delete disabled
 */

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  RefreshCwIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ClockIcon,
  WalletIcon,
  ReceiptIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ReceiptView } from "@/components/receipts/ReceiptView";
import type { ReceiptData } from "@/lib/receipt-utils";
import { formatCurrency as formatCurrencyUtil, formatDate, formatSponsorPurpose } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transaction {
  id: string;
  type: "CASH_IN" | "CASH_OUT";
  category: string;
  amount: string;
  paymentMode: string;
  description: string;
  sponsorPurpose: string | null;
  memberId: string | null;
  sponsorId: string | null;
  enteredById: string;
  approvalStatus: string;
  approvalSource: "MANUAL" | "RAZORPAY_WEBHOOK";
  senderName: string | null;
  senderPhone: string | null;
  createdAt: string;
  member: { id: string; name: string; email: string } | null;
  sponsor: { id: string; name: string; company: string | null } | null;
  enteredBy: { id: string; name: string; email: string };
  approvedBy: { id: string; name: string } | null;
}

interface PaginatedTransactions {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Summary {
  totalIncome: number;
  totalExpenses: number;
  pendingAmount: number;
  netBalance: number;
}

interface TransactionFormData {
  type: "CASH_IN" | "CASH_OUT";
  category: string;
  amount: string;
  paymentMode: string;
  description: string;
  sponsorPurpose: string;
  memberId: string;
  sponsorId: string;
  senderName: string;
  senderPhone: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: "MEMBERSHIP_FEE", label: "Membership Fee" },
  { value: "APPLICATION_FEE", label: "Application Fee" },
  { value: "SPONSORSHIP", label: "Sponsorship" },
  { value: "EXPENSE", label: "Expense" },
  { value: "OTHER", label: "Other" },
];

const PAYMENT_MODES = [
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CASH", label: "Cash" },
];

const SPONSOR_PURPOSES = [
  { value: "TITLE_SPONSOR", label: "Title Sponsor" },
  { value: "GOLD_SPONSOR", label: "Gold Sponsor" },
  { value: "SILVER_SPONSOR", label: "Silver Sponsor" },
  { value: "FOOD_PARTNER", label: "Food Partner" },
  { value: "MEDIA_PARTNER", label: "Media Partner" },
  { value: "STALL_VENDOR", label: "Stall Vendor" },
  { value: "MARKETING_PARTNER", label: "Marketing Partner" },
];

const APPROVAL_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

// ---------------------------------------------------------------------------
// Currency formatter (alias for imported utility)
// ---------------------------------------------------------------------------

const formatCurrency = formatCurrencyUtil;

// ---------------------------------------------------------------------------
// Category / mode label helpers
// ---------------------------------------------------------------------------

function getCategoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function getPaymentModeLabel(value: string): string {
  return PAYMENT_MODES.find((m) => m.value === value)?.label ?? value;
}

function getSponsorPurposeLabel(value: string | null): string {
  if (!value) return "—";
  return SPONSOR_PURPOSES.find((s) => s.value === value)?.label ?? value;
}

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

const emptyForm: TransactionFormData = {
  type: "CASH_IN",
  category: "",
  amount: "",
  paymentMode: "",
  description: "",
  sponsorPurpose: "",
  memberId: "",
  sponsorId: "",
  senderName: "",
  senderPhone: "",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function CashPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const isOperator = session?.user?.role === "OPERATOR";
  const canWrite = isAdmin || isOperator;

  // Data state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState<Summary>({
    totalIncome: 0,
    totalExpenses: 0,
    pendingAmount: 0,
    netBalance: 0,
  });

  // Loading / error state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filter state
  const [filterType, setFilterType] = useState("ALL");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterPaymentMode, setFilterPaymentMode] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [formData, setFormData] = useState<TransactionFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/transactions/summary`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch {
      // Non-critical — keep previous summary
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filterType !== "ALL") params.set("type", filterType);
      if (filterCategory !== "ALL") params.set("category", filterCategory);
      if (filterPaymentMode !== "ALL")
        params.set("paymentMode", filterPaymentMode);
      if (filterStatus !== "ALL") params.set("status", filterStatus);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);

      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to fetch transactions");
      }
      const data: PaginatedTransactions = await res.json();
      setTransactions(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    filterType,
    filterCategory,
    filterPaymentMode,
    filterStatus,
    filterDateFrom,
    filterDateTo,
  ]);

  useEffect(() => {
    if (status === "authenticated") fetchTransactions();
  }, [fetchTransactions, status]);

  useEffect(() => {
    if (status === "authenticated") fetchSummary();
  }, [fetchSummary, status]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [
    filterType,
    filterCategory,
    filterPaymentMode,
    filterStatus,
    filterDateFrom,
    filterDateTo,
  ]);

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------

  function openAddDialog() {
    setFormData(emptyForm);
    setActionError(null);
    setShowAddDialog(true);
  }

  function openEditDialog(t: Transaction) {
    setSelectedTransaction(t);
    setFormData({
      type: t.type,
      category: t.category,
      amount: t.amount,
      paymentMode: t.paymentMode,
      description: t.description,
      sponsorPurpose: t.sponsorPurpose ?? "",
      memberId: t.memberId ?? "",
      sponsorId: t.sponsorId ?? "",
      senderName: t.senderName ?? "",
      senderPhone: t.senderPhone ?? "",
    });
    setActionError(null);
    setShowEditDialog(true);
  }

  function openDeleteDialog(t: Transaction) {
    setSelectedTransaction(t);
    setActionError(null);
    setShowDeleteDialog(true);
  }

  async function openReceiptDialog(t: Transaction) {
    setSelectedTransaction(t);
    setReceiptData(null);
    setReceiptError(null);
    setReceiptLoading(true);
    setShowReceiptDialog(true);
    try {
      const res = await fetch(`/api/receipts/${t.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate receipt");
      setReceiptData(data as ReceiptData);
    } catch (err: unknown) {
      setReceiptError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setReceiptLoading(false);
    }
  }

  function updateForm(field: keyof TransactionFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function validateTransactionForm(): string[] {
    const errs: string[] = [];
    if (!formData.category) errs.push("Category is required");
    const amt = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amt) || amt <= 0) errs.push("Amount must be a positive number");
    if (!formData.paymentMode) errs.push("Payment mode is required");
    if (!formData.description.trim()) errs.push("Description is required");
    if (formData.category === "SPONSORSHIP" && !formData.sponsorPurpose)
      errs.push("Sponsor purpose is required for Sponsorship transactions");
    if (formData.senderPhone && !/^\+91\d{10}$/.test(formData.senderPhone))
      errs.push("WhatsApp number must be in +91XXXXXXXXXX format (e.g. +919876543210)");
    return errs;
  }

  // ---------------------------------------------------------------------------
  // Submit handlers
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    const validationErrors = validateTransactionForm();
    if (validationErrors.length > 0) {
      setActionError(validationErrors.join(" • "));
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const payload: Record<string, unknown> = {
        type: formData.type,
        category: formData.category,
        amount: parseFloat(formData.amount),
        paymentMode: formData.paymentMode,
        description: formData.description,
      };
      if (formData.sponsorPurpose) payload.sponsorPurpose = formData.sponsorPurpose;
      if (formData.memberId) payload.memberId = formData.memberId;
      if (formData.sponsorId) payload.sponsorId = formData.sponsorId;
      if (formData.senderName) payload.senderName = formData.senderName;
      if (formData.senderPhone) payload.senderPhone = formData.senderPhone;

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldLabels: Record<string, string> = {
          category: "Category", amount: "Amount", paymentMode: "Payment mode",
          description: "Description", sponsorPurpose: "Sponsor purpose",
          senderPhone: "WhatsApp number", type: "Transaction type",
        };
        if (data?.details?.fieldErrors) {
          const msgs = Object.entries(data.details.fieldErrors as Record<string, string[]>)
            .map(([f, errs]) => `${fieldLabels[f] ?? f}: ${errs[0]}`)
            .join(" • ");
          throw new Error(msgs || data.error);
        }
        throw new Error(data.error ?? "Failed to create transaction");
      }

      setShowAddDialog(false);
      await fetchTransactions();
      await fetchSummary();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate() {
    if (!selectedTransaction) return;
    const validationErrors = validateTransactionForm();
    if (validationErrors.length > 0) {
      setActionError(validationErrors.join(" • "));
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (formData.type !== selectedTransaction.type) payload.type = formData.type;
      if (formData.category !== selectedTransaction.category)
        payload.category = formData.category;
      if (formData.amount !== selectedTransaction.amount)
        payload.amount = parseFloat(formData.amount);
      if (formData.paymentMode !== selectedTransaction.paymentMode)
        payload.paymentMode = formData.paymentMode;
      if (formData.description !== selectedTransaction.description)
        payload.description = formData.description;
      if (formData.sponsorPurpose !== (selectedTransaction.sponsorPurpose ?? ""))
        payload.sponsorPurpose = formData.sponsorPurpose || null;
      if (formData.senderName !== (selectedTransaction.senderName ?? ""))
        payload.senderName = formData.senderName || null;
      if (formData.senderPhone !== (selectedTransaction.senderPhone ?? ""))
        payload.senderPhone = formData.senderPhone || null;

      if (Object.keys(payload).length === 0) {
        setShowEditDialog(false);
        return;
      }

      const res = await fetch(`/api/transactions/${selectedTransaction.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldLabels: Record<string, string> = {
          category: "Category", amount: "Amount", paymentMode: "Payment mode",
          description: "Description", sponsorPurpose: "Sponsor purpose",
          senderPhone: "WhatsApp number", type: "Transaction type",
        };
        if (data?.details?.fieldErrors) {
          const msgs = Object.entries(data.details.fieldErrors as Record<string, string[]>)
            .map(([f, errs]) => `${fieldLabels[f] ?? f}: ${errs[0]}`)
            .join(" • ");
          throw new Error(msgs || data.error);
        }
        throw new Error(data.error ?? "Failed to update transaction");
      }

      setShowEditDialog(false);
      await fetchTransactions();
      await fetchSummary();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!selectedTransaction) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/transactions/${selectedTransaction.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete transaction");

      setShowDeleteDialog(false);
      await fetchTransactions();
      await fetchSummary();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function TypeBadge({ type }: { type: "CASH_IN" | "CASH_OUT" }) {
    return (
      <Badge
        variant={type === "CASH_IN" ? "default" : "destructive"}
        className={
          type === "CASH_IN"
            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
            : "bg-rose-100 text-rose-800 hover:bg-rose-100"
        }
      >
        {type === "CASH_IN" ? (
          <ArrowDownIcon className="mr-1 h-3 w-3" />
        ) : (
          <ArrowUpIcon className="mr-1 h-3 w-3" />
        )}
        {type === "CASH_IN" ? "Income" : "Expense"}
      </Badge>
    );
  }

  function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, string> = {
      APPROVED:
        "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
      PENDING:
        "bg-amber-100 text-amber-800 hover:bg-amber-100",
      REJECTED:
        "bg-rose-100 text-rose-800 hover:bg-rose-100",
    };
    return (
      <Badge className={variants[status] ?? ""}>{status}</Badge>
    );
  }

  // ---------------------------------------------------------------------------
  // Transaction form (shared between Add and Edit dialogs)
  // ---------------------------------------------------------------------------

  function TransactionForm() {
    return (
      <div className="grid gap-4 py-2">
        {/* Type toggle */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={formData.type === "CASH_IN" ? "default" : "outline"}
            className={
              formData.type === "CASH_IN"
                ? "flex-1 bg-emerald-600 hover:bg-emerald-700"
                : "flex-1"
            }
            onClick={() => updateForm("type", "CASH_IN")}
          >
            <ArrowDownIcon className="mr-2 h-4 w-4" />
            Cash In
          </Button>
          <Button
            type="button"
            variant={formData.type === "CASH_OUT" ? "destructive" : "outline"}
            className="flex-1"
            onClick={() => updateForm("type", "CASH_OUT")}
          >
            <ArrowUpIcon className="mr-2 h-4 w-4" />
            Cash Out
          </Button>
        </div>

        {/* Category */}
        <div className="grid gap-1.5">
          <Label>Category *</Label>
          <Select
            value={formData.category}
            onValueChange={(v) => updateForm("category", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sponsor purpose — only when category = SPONSORSHIP */}
        {formData.category === "SPONSORSHIP" && (
          <div className="grid gap-1.5">
            <Label>Sponsor Purpose *</Label>
            <Select
              value={formData.sponsorPurpose}
              onValueChange={(v) => updateForm("sponsorPurpose", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select sponsor type" />
              </SelectTrigger>
              <SelectContent>
                {SPONSOR_PURPOSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Amount */}
        <div className="grid gap-1.5">
          <Label>Amount (₹) *</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={formData.amount}
            onChange={(e) => updateForm("amount", e.target.value)}
          />
        </div>

        {/* Payment mode */}
        <div className="grid gap-1.5">
          <Label>Payment Mode *</Label>
          <Select
            value={formData.paymentMode}
            onValueChange={(v) => updateForm("paymentMode", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select payment mode" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div className="grid gap-1.5">
          <Label>Description *</Label>
          <Input
            placeholder="Brief description of this transaction"
            value={formData.description}
            onChange={(e) => updateForm("description", e.target.value)}
          />
        </div>

        {/* Sender / Receiver name (optional) */}
        <div className="grid gap-1.5">
          <Label>{formData.type === "CASH_OUT" ? "Receiver's Name (optional)" : "Sender's Name (optional)"}</Label>
          <Input
            placeholder={formData.type === "CASH_OUT" ? "Name of payee / receiver" : "Name of payer / sender"}
            value={formData.senderName}
            onChange={(e) => updateForm("senderName", e.target.value)}
          />
        </div>

        {/* Sender / Receiver phone (optional) */}
        <div className="grid gap-1.5">
          <Label>{formData.type === "CASH_OUT" ? "Receiver's WhatsApp Number (optional)" : "Sender's WhatsApp Number (optional)"}</Label>
          <Input
            placeholder="+91XXXXXXXXXX"
            value={formData.senderPhone}
            onChange={(e) => updateForm("senderPhone", e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cash Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track all income and expense transactions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchTransactions();
              fetchSummary();
            }}
          >
            <RefreshCwIcon className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {canWrite && (
            <Button size="sm" onClick={openAddDialog}>
              <PlusIcon className="h-4 w-4 mr-1" />
              {isOperator ? "Submit for Approval" : "Add Transaction"}
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownIcon className="h-4 w-4 text-emerald-600" />
              Total Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-700">
              {formatCurrency(summary.totalIncome)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Approved only</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpIcon className="h-4 w-4 text-rose-600" />
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rose-700">
              {formatCurrency(summary.totalExpenses)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Approved only</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ClockIcon className="h-4 w-4 text-amber-600" />
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-700">
              {formatCurrency(summary.pendingAmount)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting admin review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <WalletIcon className="h-4 w-4 text-sky-600" />
              Net Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                summary.netBalance >= 0 ? "text-sky-700" : "text-rose-700"
              }`}
            >
              {formatCurrency(summary.netBalance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Income minus expenses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-36">
          <Label className="text-xs mb-1 block">Type</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="CASH_IN">Cash In</SelectItem>
              <SelectItem value="CASH_OUT">Cash Out</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-40">
          <Label className="text-xs mb-1 block">Category</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-40">
          <Label className="text-xs mb-1 block">Payment Mode</Label>
          <Select value={filterPaymentMode} onValueChange={setFilterPaymentMode}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Modes</SelectItem>
              {PAYMENT_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-36">
          <Label className="text-xs mb-1 block">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              {APPROVAL_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs mb-1 block">From</Label>
          <Input
            type="date"
            className="h-9 w-36"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs mb-1 block">To</Label>
          <Input
            type="date"
            className="h-9 w-36"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => {
            setFilterType("ALL");
            setFilterCategory("ALL");
            setFilterPaymentMode("ALL");
            setFilterStatus("ALL");
            setFilterDateFrom("");
            setFilterDateTo("");
          }}
        >
          Clear
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Transaction table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entered By</TableHead>
              {canWrite && <TableHead className="w-28">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={canWrite ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!loading && transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={canWrite ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(t.createdAt)}
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={t.type} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {getCategoryLabel(t.category)}
                    {t.sponsorPurpose && (
                      <div className="text-xs text-muted-foreground">
                        {getSponsorPurposeLabel(t.sponsorPurpose)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(t.amount)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {getPaymentModeLabel(t.paymentMode)}
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">
                    {t.description}
                    {t.approvalSource === "RAZORPAY_WEBHOOK" && (
                      <Badge className="ml-2 bg-indigo-100 text-xs text-indigo-800">
                        Razorpay
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.approvalStatus} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.enteredBy?.name ?? "—"}
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      <div className="flex gap-1">
                        {/* Receipt button — enabled only for APPROVED transactions */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${
                            t.approvalStatus === "APPROVED"
                              ? "text-sky-600 hover:bg-sky-50 hover:text-sky-700"
                              : "cursor-not-allowed text-slate-300"
                          }`}
                          disabled={t.approvalStatus !== "APPROVED"}
                          title={
                            t.approvalStatus === "APPROVED"
                              ? "Generate / Print Receipt"
                              : "Receipt available only for approved transactions"
                          }
                          onClick={() => openReceiptDialog(t)}
                        >
                          <ReceiptIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={t.approvalSource === "RAZORPAY_WEBHOOK"}
                          title={
                            t.approvalSource === "RAZORPAY_WEBHOOK"
                              ? "Razorpay transactions cannot be edited"
                              : "Edit"
                          }
                          onClick={() => openEditDialog(t)}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          disabled={t.approvalSource === "RAZORPAY_WEBHOOK"}
                          title={
                            t.approvalSource === "RAZORPAY_WEBHOOK"
                              ? "Razorpay transactions cannot be deleted"
                              : "Delete"
                          }
                          onClick={() => openDeleteDialog(t)}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of{" "}
            {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Add Transaction Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isOperator ? "Submit Transaction for Approval" : "Add Transaction"}
            </DialogTitle>
          </DialogHeader>
          {TransactionForm()}
          {actionError && (
            <p className="mt-1 text-sm text-rose-600">{actionError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting
                ? "Saving..."
                : isOperator
                ? "Submit for Approval"
                : "Create Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isOperator ? "Submit Edit for Approval" : "Edit Transaction"}
            </DialogTitle>
          </DialogHeader>
          {TransactionForm()}
          {actionError && (
            <p className="mt-1 text-sm text-rose-600">{actionError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={submitting}>
              {submitting
                ? "Saving..."
                : isOperator
                ? "Submit for Approval"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {receiptData
                ? `Receipt ${receiptData.receiptNumber}`
                : "Generating Receipt..."}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {receiptLoading && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Generating receipt...
              </div>
            )}
            {receiptError && !receiptLoading && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {receiptError}
              </div>
            )}
            {receiptData && !receiptLoading && (
              <ReceiptView receipt={receiptData} />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReceiptDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isOperator ? "Request Transaction Void" : "Void Transaction"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            {selectedTransaction && (
              <>
                <p>
                  Are you sure you want to void this transaction?
                </p>
                <div className="mt-3 rounded-md bg-muted/50 p-3 space-y-1">
                  <p>
                    <span className="font-medium">Type:</span>{" "}
                    {selectedTransaction.type}
                  </p>
                  <p>
                    <span className="font-medium">Amount:</span>{" "}
                    {formatCurrency(selectedTransaction.amount)}
                  </p>
                  <p>
                    <span className="font-medium">Description:</span>{" "}
                    {selectedTransaction.description}
                  </p>
                </div>
                {isAdmin && (
                  <p className="mt-2 rounded p-2 text-xs text-amber-700 bg-amber-50">
                    This will mark the transaction as REJECTED. The record
                    will be retained in the audit log.
                  </p>
                )}
                {isOperator && (
                  <p className="mt-2 rounded bg-sky-50 p-2 text-xs text-sky-700">
                    This will submit a void request for admin approval.
                  </p>
                )}
              </>
            )}
          </div>
          {actionError && (
            <p className="text-sm text-rose-600">{actionError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting
                ? "Processing..."
                : isOperator
                ? "Submit Request"
                : "Void Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
