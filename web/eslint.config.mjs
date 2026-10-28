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
    // The API contract lives in backend/src/api/types.ts (tsconfig alias "@api/*"). Type-only imports are erased
    // before bundling, so the bundler never reaches outside web/; a value import would need turbopack.root widened
    // to the whole repo. To get a constant's literal type, `import type { X }` and use `typeof X`.
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [{ group: ["@api/*"], allowTypeImports: true, message: "Import the API contract with `import type` only." }],
      }],
    },
  },
]);

export default eslintConfig;
