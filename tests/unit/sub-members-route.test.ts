/**
 * Unit tests for /api/members/[id]/sub-members route handlers.
 *
 * Covers:
 *   - GET: list sub-members (auth, role, service delegation)
 *   - POST: add sub-member (validation, 201/202 for admin/operator)
 *   - PUT: update sub-member (validation, empty update guard)
 *   - DELETE: remove sub-member (validation, service delegation)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  getAuthSession: vi.fn(),
}));

vi.mock("@/lib/services/member-service", () => ({
  listSubMembers: vi.fn(),
  addSubMember: vi.fn(),
  updateSubMember: vi.fn(),
  removeSubMember: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { getAuthSession } from "@/lib/auth";
import {
  listSubMembers,
  addSubMember,
  updateSubMember,
  removeSubMember,
} from "@/lib/services/member-service";
import { GET, POST, PUT, DELETE } from "@/app/api/members/[id]/sub-members/route";

const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockListSubMembers = listSubMembers as ReturnType<typeof vi.fn>;
const mockAddSubMember = addSubMember as ReturnType<typeof vi.fn>;
const mockUpdateSubMember = updateSubMember as ReturnType<typeof vi.fn>;
const mockRemoveSubMember = removeSubMember as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adminSession = {
  user: {
    id: "admin-1",
    email: "admin@test.com",
    name: "Admin",
    role: "ADMIN",
    memberId: "DPS-001",
    isTempPassword: false,
    isSubMember: false,
  },
};

const memberSession = {
  user: {
    id: "member-1",
    email: "member@test.com",
    name: "Member",
    role: "MEMBER",
    memberId: "DPS-002",
    isTempPassword: false,
    isSubMember: false,
  },
};

const tempPasswordSession = {
  user: {
    ...adminSession.user,
    isTempPassword: true,
  },
};

function makeRequest(method: string, body?: unknown): NextRequest {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest("http://localhost/api/members/parent-1/sub-members", init);
}

const routeParams = { params: { id: "parent-1" } };

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/members/[id]/sub-members", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"), routeParams);
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await GET(makeRequest("GET"), routeParams);
    expect(res.status).toBe(403);
  });

  it("returns 403 for temp password", async () => {
    mockGetAuthSession.mockResolvedValue(tempPasswordSession);
    const res = await GET(makeRequest("GET"), routeParams);
    expect(res.status).toBe(403);
  });

  it("returns sub-members on success", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockListSubMembers.mockResolvedValue({
      success: true,
      data: [{ id: "sub-1", name: "Sub" }],
    });
    const res = await GET(makeRequest("GET"), routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST /api/members/[id]/sub-members", () => {
  const validBody = {
    name: "Sub Person",
    email: "sub@example.com",
    phone: "+919876543210",
    relation: "SPOUSE",
  };

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await POST(makeRequest("POST", validBody), routeParams);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(makeRequest("POST", { name: "" }), routeParams);
    expect(res.status).toBe(400);
  });

  it("returns 201 for admin direct create", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockAddSubMember.mockResolvedValue({
      success: true,
      data: { subMemberId: "sub-new" },
      action: "direct",
      status: 201,
    });
    const res = await POST(makeRequest("POST", validBody), routeParams);
    expect(res.status).toBe(201);
  });

  it("returns 202 for operator pending approval", async () => {
    mockGetAuthSession.mockResolvedValue({
      user: { ...adminSession.user, role: "OPERATOR" },
    });
    mockAddSubMember.mockResolvedValue({
      success: true,
      data: { approvalId: "apr-1" },
      action: "pending_approval",
    });
    const res = await POST(makeRequest("POST", validBody), routeParams);
    expect(res.status).toBe(202);
  });

  it("forwards service error", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockAddSubMember.mockResolvedValue({
      success: false,
      error: "Maximum of 3 sub-members",
      status: 400,
    });
    const res = await POST(makeRequest("POST", validBody), routeParams);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe("PUT /api/members/[id]/sub-members", () => {
  it("returns 400 for empty update", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await PUT(
      makeRequest("PUT", { subMemberId: "550e8400-e29b-41d4-a716-446655440000" }),
      routeParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful update", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockUpdateSubMember.mockResolvedValue({
      success: true,
      data: {},
      action: "direct",
    });
    const res = await PUT(
      makeRequest("PUT", { subMemberId: "550e8400-e29b-41d4-a716-446655440000", name: "Updated" }),
      routeParams
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/members/[id]/sub-members", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest("DELETE", { subMemberId: "550e8400-e29b-41d4-a716-446655440000" }),
      routeParams
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 on successful remove", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockRemoveSubMember.mockResolvedValue({
      success: true,
      data: {},
      action: "direct",
    });
    const res = await DELETE(
      makeRequest("DELETE", { subMemberId: "550e8400-e29b-41d4-a716-446655440000" }),
      routeParams
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for missing subMemberId", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await DELETE(
      makeRequest("DELETE", {}),
      routeParams
    );
    expect(res.status).toBe(400);
  });
});
