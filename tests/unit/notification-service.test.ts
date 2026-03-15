import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockLogActivity, mockSendMessage } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    subMember: {
      findMany: vi.fn(),
    },
  },
  mockLogActivity: vi.fn(),
  mockSendMessage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/audit", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

vi.mock("@/lib/whatsapp", () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

import {
  TEMPLATES,
  notifyMembershipApproved,
  notifyMembershipExpired,
  notifyMembershipExpiryReminder,
  notifyNewApprovalRequest,
  notifyNewMemberRegistration,
  notifyPaymentReceived,
  notifyRejection,
  notifySponsorPayment,
} from "@/lib/services/notification-service";

describe("notification-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifyNewApprovalRequest sends to staff and logs mixed outcomes", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "system-user" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "admin-1", phone: "+919800000001", name: "Admin" },
      { id: "op-1", phone: "+919800000002", name: "Operator" },
    ]);
    mockSendMessage
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    const result = await notifyNewApprovalRequest({
      id: "approval-1",
      entityType: "MEMBER_ADD",
      requestedBy: { name: "Operator One" },
    } as never);

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      "+919800000001",
      TEMPLATES.NEW_APPROVAL.name,
      ["MEMBER ADD", "Operator One"]
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "system-user",
        metadata: expect.objectContaining({
          approvalId: "approval-1",
          sent: 1,
          failed: 1,
        }),
      })
    );
  });

  it("notifyPaymentReceived falls back to senderName and admin fallback system user", async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "admin-fallback" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "admin-1", phone: "+919800000010", name: "Admin" },
    ]);
    mockSendMessage.mockResolvedValue({ success: true });

    const result = await notifyPaymentReceived({
      id: "txn-1",
      amount: { toString: () => "1500.00", valueOf: () => 1500 },
      paymentMode: "UPI",
      senderName: "Walk-in Donor",
      member: null,
    } as never);

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(mockSendMessage).toHaveBeenCalledWith(
      "+919800000010",
      TEMPLATES.PAYMENT_RECEIVED.name,
      ["Rs. 1500.00", "Walk-in Donor", "UPI"]
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin-fallback" })
    );
  });

  it("notifyNewMemberRegistration returns zero when no staff recipients exist", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "system-user" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await notifyNewMemberRegistration({
      id: "user-1",
      name: "New Member",
      memberId: "DPC-2026-0001-00",
    } as never);

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          memberId: "user-1",
          memberMemberId: "DPC-2026-0001-00",
        }),
      })
    );
  });

  it("notifyMembershipApproved fans out to staff, member, and sub-members", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "system-user" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "admin-1", phone: "+919800000011", name: "Admin" },
      { id: "op-1", phone: "+919800000012", name: "Operator" },
    ]);
    mockPrisma.subMember.findMany.mockResolvedValue([
      { phone: "+919800000013" },
      { phone: "+919800000014" },
    ]);
    mockSendMessage.mockResolvedValue({ success: true });

    const result = await notifyMembershipApproved(
      {
        id: "user-2",
        name: "Primary Member",
        email: "member@example.com",
        phone: "+919800000015",
        memberId: "DPC-2026-0002-00",
      } as never,
      "TempPass1",
      "https://example.com/login"
    );

    expect(result).toEqual({ sent: 5, failed: 0 });
    expect(mockSendMessage).toHaveBeenCalledTimes(5);
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      3,
      "+919800000015",
      TEMPLATES.MEMBERSHIP_APPROVED.name,
      ["Primary Member", "https://example.com/login", "member@example.com", "TempPass1"]
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          userId: "user-2",
          memberId: "DPC-2026-0002-00",
          sent: 5,
          failed: 0,
        }),
      })
    );
  });

  it("notifyMembershipExpiryReminder formats the expiry date and counts failures", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "system-user" });
    mockPrisma.subMember.findMany.mockResolvedValue([{ phone: "+919800000016" }]);
    mockSendMessage
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    const result = await notifyMembershipExpiryReminder(
      {
        id: "user-3",
        name: "Expiring Member",
        phone: "+919800000017",
        memberId: "DPC-2026-0003-00",
        membershipExpiry: new Date("2026-04-05T10:00:00Z"),
      } as never,
      7
    );

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      "+919800000017",
      TEMPLATES.EXPIRY_REMINDER.name,
      ["Expiring Member", "7", "05/04/2026"]
    );
  });

  it("notifyMembershipExpired sends to member, sub-members, and staff", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "system-user" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "admin-1", phone: "+919800000018", name: "Admin" },
      { id: "op-1", phone: "+919800000019", name: "Operator" },
    ]);
    mockPrisma.subMember.findMany.mockResolvedValue([{ phone: "+919800000020" }]);
    mockSendMessage.mockResolvedValue({ success: true });

    const result = await notifyMembershipExpired({
      id: "user-4",
      name: "Expired Member",
      phone: "+919800000021",
      memberId: "DPC-2026-0004-00",
    } as never);

    expect(result).toEqual({ sent: 4, failed: 0 });
    expect(mockSendMessage).toHaveBeenCalledTimes(4);
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      "+919800000021",
      TEMPLATES.MEMBERSHIP_EXPIRED.name,
      ["Expired Member", "DPC-2026-0004-00"]
    );
  });

  it("notifySponsorPayment catches recipient lookup failures and still logs", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.user.findFirst.mockResolvedValue({ id: "system-user" });
    mockPrisma.user.findMany.mockRejectedValue(new Error("DB offline"));

    const result = await notifySponsorPayment(
      {
        id: "txn-2",
        amount: { toString: () => "20000.00", valueOf: () => 20000 },
        sponsorPurpose: "TITLE_SPONSOR",
      } as never,
      { id: "sponsor-1", name: "Big Sponsor" } as never
    );

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          transactionId: "txn-2",
          sponsorId: "sponsor-1",
        }),
      })
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("notifyRejection uses the default reason when notes are missing", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "system-user" });
    mockSendMessage.mockResolvedValue({ success: true });

    const result = await notifyRejection(
      {
        id: "approval-2",
        entityType: "TRANSACTION",
        notes: null,
      } as never,
      { id: "op-2", phone: "+919800000022", name: "Operator Two" }
    );

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(mockSendMessage).toHaveBeenCalledWith(
      "+919800000022",
      TEMPLATES.REJECTION.name,
      ["TRANSACTION", "No reason provided"]
    );
  });
});
