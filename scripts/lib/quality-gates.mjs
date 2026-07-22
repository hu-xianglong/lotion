const npm = process.platform === "win32" ? "npm.cmd" : "npm";

export const COMMIT_QUALITY_GATES = [
  { label: "npm run typecheck", command: npm, args: ["run", "typecheck"] },
  { label: "npm run test:fast", command: npm, args: ["run", "test:fast"] },
  { label: "npm run test:coverage", command: npm, args: ["run", "test:coverage"] },
  { label: "git diff --check", command: "git", args: ["diff", "--check"] }
];

export const RELEASE_QUALITY_GATES = [
  { label: "npm run test:fast", command: npm, args: ["run", "test:fast"] },
  { label: "npm run typecheck", command: npm, args: ["run", "typecheck"] },
  { label: "npm run test:coverage", command: npm, args: ["run", "test:coverage"] },
  { label: "npm run test:ui-regression", command: npm, args: ["run", "test:ui-regression"] },
  { label: "npm run test:production-visual", command: npm, args: ["run", "test:production-visual"] },
  { label: "npm run build", command: npm, args: ["run", "build"] },
  { label: "git diff --check", command: "git", args: ["diff", "--check"] }
];
