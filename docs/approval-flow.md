# Approval Flow

Quorum uses a universal approval system for all operator-submitted changes. Operators cannot directly modify production data — every change they submit is reviewed by an admin before being applied.

---

## Overview

```
Operator submits change
        |
        v
  Approval record created
  (status=PENDING, with before/after snapshots)
        |
        v
  WhatsApp notification sent to all admins + operators
        |
        v
  Admin reviews in /dashboard/approvals
        |
        +----> APPROVE ----> Change applied to target entity
        |                         |
        |                    Audit log + Activity log
        |                    WhatsApp confirmation to all parties
        |
        +----> REJECT  ----> No changes applied
                                  |
                             Audit log + Activity log
                             WhatsApp rejection notice to operator
```

A single admin approval is sufficient. The system supports multiple admins — any one of them can approve or reject.

---

## Entity Types

The `Approval.entityType` field identifies what kind of change is pending:

| Entity Type | Triggered by | What it controls |
|-------------|-------------|-----------------|
| `MEMBER_ADD` | Operator creates a new member | Whether the new member record is persisted |
| `MEMBER_EDIT` | Operator edits an existing member | Whether the updated fields are written to the Member table |
| `MEMBER_DELETE` | Operator requests member deletion | Whether the member is deactivated/removed |
| `TRANSACTION` | Operator enters a cash in/out entry | Whether the transaction is applied and counted in financials |
| `MEMBERSHIP` | Operator creates a membership payment period | Whether the membership period is activated |

---

## What Gets Stored

Every Approval record stores complete before/after snapshots:

```json
{
  "id": "uuid",
  "entityType": "MEMBER_EDIT",
  "entityId": "uuid-of-member",
  "action": "edit_member",
  "previousData": {
    "name": "Rajesh Mukherjee",
    "phone": "+919831234567",
    "address": "12 Lake Terrace, Kolkata 700029"
  },
  "newData": {
    "name": "Rajesh Mukherjee",
    "phone": "+919831234568",
    "address": "14 Lake Terrace, Kolkata 700029"
  },
  "requestedById": "operator-uuid",
  "status": "PENDING",
  "reviewedById": null,
  "notes": null,
  "createdAt": "2026-03-15T09:00:00.000Z"
}
```

The `previousData` field allows an admin to see exactly what was there before, and `newData` shows what the operator wants to change it to.

---

## Admin Flow (Approve)

1. Admin opens `/dashboard/approvals`
2. The queue shows all PENDING approvals, sorted by creation date
3. Admin clicks an approval to see the full before/after diff
4. Admin clicks **Approve** (optionally adds a note)
5. The backend (`POST /api/approvals/[id]/approve`):
   - Sets `Approval.status = APPROVED`
   - Reads `newData` and applies it to the target entity in the database
   - For MEMBER_ADD: creates the Member record
   - For MEMBER_EDIT: updates the specified fields on the Member record
   - For MEMBER_DELETE: deactivates (or removes) the Member record
   - For TRANSACTION: sets `Transaction.approvalStatus = APPROVED`, updates membership status if applicable
   - For MEMBERSHIP: activates the membership period
   - Writes to AuditLog (before/after snapshot)
   - Writes to ActivityLog (action + actor)
   - Sends WhatsApp confirmation to all admins, operators, and the affected member

---

## Admin Flow (Reject)

1. Admin views the approval and clicks **Reject**
2. Admin enters a reason in the notes field
3. The backend (`POST /api/approvals/[id]/reject`):
   - Sets `Approval.status = REJECTED`
   - Makes **no changes** to the target entity
   - Writes to AuditLog
   - Writes to ActivityLog
   - Sends WhatsApp rejection notice to the operator who submitted the request

---

## Operator Flow

When an operator submits a member add, edit, delete, transaction, or membership:

1. The API route detects `user.role === "OPERATOR"`
2. Instead of applying the change directly, it:
   - Creates the entity in a pending state (or stores the proposed change in `newData`)
   - Creates an `Approval` record with `status=PENDING`
3. A success response is returned to the operator with the approval ID
4. The operator sees a "Pending approval" state in the UI

Operators cannot approve or reject approvals — the `/api/approvals` endpoints require ADMIN role.

---

## Admin Bypass

Admins bypass the approval queue entirely. When an admin submits the same operation:

1. The change is applied directly to the database
2. The admin's action is logged directly to AuditLog and ActivityLog
3. No Approval record is created

---

## Razorpay Auto-Approval

Payments processed through Razorpay (UPI and bank transfer) are **auto-approved** — no admin review required:

- `Transaction.approvalStatus = APPROVED` immediately
- `Transaction.approvalSource = RAZORPAY_WEBHOOK`
- `Transaction.approvedById = null` (auto-approved, no human reviewer)

Razorpay auto-approved transactions **cannot be rejected** after the fact. If a reversal is needed, the admin creates a new `CASH_OUT` transaction with `category=EXPENSE` to record the refund.

---

## Approval Queue Rules

- Approvals are shown in the queue even if the target entity was later modified (the snapshot in `previousData`/`newData` represents the state at time of submission)
- Approvals do not expire — they remain PENDING until an admin acts
- Bulk approval is not supported — each item must be reviewed individually
- PENDING approvals block subsequent edits to the same entity (to prevent conflicting changes)

---

## Detailed Flow Diagram

### MEMBER_ADD approval

```
Operator: POST /api/members
  |
  [role = OPERATOR]
  |
  Create Member record (membershipStatus=PENDING_APPROVAL)
  Create Approval { entityType=MEMBER_ADD, entityId=member.id,
                    newData={ name, phone, email, ... }, status=PENDING }
  Send WhatsApp to admins
  |
  Return { approval: { id, status: "PENDING" } }

   ...Admin reviews...

Admin: POST /api/approvals/[id]/approve
  |
  Update Approval.status = APPROVED
  Update Member.membershipStatus = PENDING_PAYMENT (member can now pay)
  Write AuditLog entry
  Write ActivityLog entry
  Send WhatsApp confirmation to member + staff
  |
  Return { approval: { id, status: "APPROVED" } }
```

### TRANSACTION approval

```
Operator: POST /api/transactions  (paymentMode=CASH)
  |
  [role = OPERATOR]
  |
  Create Transaction { approvalStatus=PENDING, approvalSource=MANUAL }
  Create Approval { entityType=TRANSACTION, entityId=transaction.id,
                    newData={ amount, category, senderName, ... }, status=PENDING }
  Send WhatsApp to admins
  |
  Return { approval: { id, status: "PENDING" } }

   ...Admin reviews...

Admin: POST /api/approvals/[id]/approve
  |
  Update Transaction.approvalStatus = APPROVED
  If category=MEMBERSHIP_FEE: update Member.membershipStatus = ACTIVE
  If category=APPLICATION_FEE: update User.applicationFeePaid = true
  Update User.totalPaid += transaction.amount
  Write AuditLog entry
  Write ActivityLog entry
  Send WhatsApp confirmation
  |
  Return { approval: { id, status: "APPROVED" } }
```

---

## Notification Recipients

| Event | Recipients |
|-------|-----------|
| New approval pending | All admins + all operators |
| Approval approved | All admins + all operators + affected member (if applicable) |
| Approval rejected | Operator who submitted the request |
