import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Server code (server/: agents, database, API) runs only on the Next.js server. Pages and components reach it
    // through src/lib/backend.ts, which is marked "server-only"; elsewhere import it with `import type` only, so a
    // client component can never pull the database driver or the Claude client into the browser bundle.
    ignores: ["src/lib/backend.ts", "server/**", "test/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [{ group: ["@api/*", "**/server/**"], allowTypeImports: true, message: "Use src/lib/backend.ts, or `import type`." }],
      }],
    },
  },
  {
    // Test harness (test/): response bodies and trace lines are parsed JSON that the tests assert on field by field,
    // so they stay `any` there. Everything the app ships keeps the rule.
    files: ["test/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
