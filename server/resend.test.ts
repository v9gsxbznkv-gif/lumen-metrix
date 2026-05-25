import { describe, it, expect } from "vitest";
import { Resend } from "resend";

describe("Resend API Key Validation", () => {
  it("should have a valid Resend API key that can list domains", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey).toBeTruthy();
    expect(apiKey!.startsWith("re_")).toBe(true);

    const resend = new Resend(apiKey);
    // List domains is a lightweight call to validate the key
    const { data, error } = await resend.domains.list();
    
    // If key is valid, we should get data (even if empty array) and no auth error
    expect(error).toBeNull();
    expect(data).toBeDefined();
  });
});
