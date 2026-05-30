import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  // Vendored design prototypes, local caches, and Claude worktree copies are
  // reference material, not source.
  { ignores: ["docs/**", "node-compile-cache/**", ".claude/**"] },
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "import/no-anonymous-default-export": "off",
    },
  },
];

export default config;
