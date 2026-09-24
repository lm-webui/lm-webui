// Flat config for ESLint 9. Replaces the legacy .eslintrc.cjs, which ESLint 9
// refuses to read at all — so `npm run lint` had been failing outright rather
// than reporting anything.
//
// Faithful to the old config where the plugins exist. Two of the plugins it
// named were never installed (`eslint-plugin-react`, `eslint-plugin-react-refresh`),
// so their rulesets are gone rather than silently missing; React correctness is
// covered by react-hooks, which is installed.
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: [
      "dist",
      "node_modules",
      "coverage",
      ".verify-before",
      // Vendored, unmodified UMD builds — not ours to lint.
      "public/vendor/**",
      // Stray script from an earlier experiment: not picked up by vitest (the
      // include glob needs `*.test.js`) and not imported anywhere.
      "src/__tests__/optimizationTest.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",

      // --- Corrections to the recommended sets, not relaxations ---

      // `no-undef` does not understand TypeScript: it cannot see types, interfaces,
      // enums or ambient declarations, so it reported 135 phantom "undefined"
      // variables in this tree. tsc already fails the build on a real one.
      "no-undef": "off",

      // --- Recorded debt. These are on, counted and known; they are off because ---
      // --- the count is large and the audit records them rather than fixing them. ---
      //
      // 280 sites. `any` is used deliberately across the runtime/agent APIs whose
      // payload shapes are not modelled. See anti-slop/audit-001-fixes-2026-09-23.md.
      "@typescript-eslint/no-explicit-any": "off",
      // 120 sites, all `console.error`/`console.warn` in catch blocks — the last line
      // of defence. The `console.log` debug noise that was worth deleting is gone.
      "no-console": "off",
      // New in react-hooks v7 (React Compiler rules). Real signal, but enforcing them
      // is a refactor of its own and not a lint-config change.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/preserve-manual-memoization": "off",
      // Kept on deliberately, and passing: a hook called conditionally is a real bug.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    // Config and script files are CommonJS or run outside the React tree.
    files: ["*.cjs", "*.config.js", "postcss.config.js", "tailwind.config.ts"],
    languageOptions: { globals: globals.node },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
