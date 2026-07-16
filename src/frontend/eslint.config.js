import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  // eslint-plugin-react-hooks v7's `flat.recommended` also enables the new
  // React Compiler rule set (set-state-in-effect, refs, purity, immutability,
  // …). We deliberately keep only the two classic rules that were active on
  // v5, so this bump is a pure maintenance upgrade with no change in lint
  // posture. The Compiler rules flag intentional, correct patterns here
  // (fetch-on-mount, matchMedia sync, reset-on-dependency-change) and one
  // false positive (useReveal returns `{ ref, shown }` where `shown` is
  // useState, not a ref) — adopting them is a separate, opt-in code-quality
  // task, not a side effect of a version bump.
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  }
);
