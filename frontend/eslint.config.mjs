import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["build/**", "dist/**", "node_modules/**"] },
  // CommonJS config files
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "script", globals: globals.node },
  },
  {
    files: ["**/*.{js,mjs,ts,mts,jsx,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
  },
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    plugins: { "react-hooks": pluginReactHooks },
    rules: pluginReactHooks.configs.recommended.rules,
  },
  {
    settings: { react: { version: "detect" } },
    rules: {
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // React Compiler rules — not applicable to this project
      "react-hooks/preserve-manual-memoization": "off",
      // setState in effects is a common valid pattern for syncing external state
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
