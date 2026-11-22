import { describe, it, expect } from "vitest";
import { hasVerifiedEmail, shouldShowEmailNotice, memberLabel } from "../accountEmail";
import { memberView } from "../adminMembers";

const verified = { emailAddresses: [{ verification: { status: "verified" } }] };
const unverified = { emailAddresses: [{ verification: { status: "unverified" } }] };

describe("username-only accounts", () => {
  it("detects verified email", () => {
    expect(hasVerifiedEmail(verified)).toBe(true);
    expect(hasVerifiedEmail(unverified)).toBe(false);
    expect(hasVerifiedEmail({ emailAddresses: [] })).toBe(false);
    expect(hasVerifiedEmail(null)).toBe(false);
  });
  it("shows the notice only to signed-in users without verified email, off auth pages", () => {
    expect(shouldShowEmailNotice({ emailAddresses: [] }, true, "/workflow")).toBe(true);
    expect(shouldShowEmailNotice(unverified, true, "/")).toBe(true);
    expect(shouldShowEmailNotice(verified, true, "/")).toBe(false);
    expect(shouldShowEmailNotice({ emailAddresses: [] }, false, "/")).toBe(false);
    expect(shouldShowEmailNotice({ emailAddresses: [] }, true, "/sign-up")).toBe(false);
  });
  it("labels members with a username fallback", () => {
    expect(memberLabel({ id: "u1", email: "a@x.com", name: "A", username: "a" })).toBe("a@x.com");
    expect(memberLabel({ id: "u1", email: "", name: "", username: "atlas_user" })).toBe("atlas_user");
    expect(memberLabel({ id: "u1" })).toBe("u1");
  });
  it("memberView works with no email and exposes username", () => {
    const v = memberView({ id: "u1", username: "atlas_user", emailAddresses: [], primaryEmailAddressId: null, privateMetadata: {} }, 1);
    expect(v.email).toBe("");
    expect(v.name).toBe("atlas_user");
    expect(v.username).toBe("atlas_user");
  });
});
