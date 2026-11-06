import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ACTIVE_STAFF_GATE_AUDIT_SQL } from "@anchor-nights/kit/auth/sql";

/**
 * supabase/tests/auth-checks.sh carries a copy of the kit's gate audit query
 * so the database CI job needs no npm install. This fails if the two drift.
 */
describe("the gate audit query in the replay checks", () => {
  test("is the kit's ACTIVE_STAFF_GATE_AUDIT_SQL, unchanged", () => {
    const script = readFileSync(path.join(process.cwd(), "supabase/tests/auth-checks.sh"), "utf8");
    const match = script.match(/GATE_AUDIT_SQL="([\s\S]*?)"\n/);
    expect(match, "GATE_AUDIT_SQL not found in auth-checks.sh").not.toBeNull();
    expect(match?.[1].trim()).toBe(ACTIVE_STAFF_GATE_AUDIT_SQL.trim());
  });
});
