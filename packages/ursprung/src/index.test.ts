import { expect, test } from "bun:test";

import { name, version } from "./index.ts";

test("exports the package name", () => {
  expect(name).toBe("ursprung");
});

test("exports a semver version", () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+/);
});
