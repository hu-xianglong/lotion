const hasDeveloperId = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const hasNotarizationCredentials = Boolean(
  (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
  || (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)
  || process.env.APPLE_KEYCHAIN_PROFILE
);

module.exports = {
  appId: "com.huxianglong.lotion",
  productName: "Lotion",
  artifactName: "Lotion-${version}-macOS-${arch}.${ext}",
  asar: true,
  asarUnpack: [
    "**/*.node",
    "node_modules/@vscode/ripgrep-*/bin/*"
  ],
  directories: {
    output: "artifacts/production-release"
  },
  files: [
    "dist/**/*",
    "dist-electron/**/*",
    "package.json"
  ],
  mac: {
    category: "public.app-category.productivity",
    icon: "resources/macos/Lotion.icns",
    minimumSystemVersion: "12.0",
    target: [
      "dmg",
      "zip"
    ],
    identity: hasDeveloperId ? undefined : "-",
    hardenedRuntime: hasDeveloperId,
    entitlements: "resources/macos/entitlements.mac.plist",
    entitlementsInherit: "resources/macos/entitlements.mac.plist",
    gatekeeperAssess: false,
    notarize: hasDeveloperId && hasNotarizationCredentials
  }
};
