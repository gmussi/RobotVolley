/**
 * electron-builder afterSign hook — notarize macOS builds via App Store Connect
 * API key (notarytool). Skipped when APPLE_API_KEY / APPLE_API_KEY_ID are unset
 * so unsigned local builds still work.
 *
 * Env (Option B — API key):
 *   APPLE_API_KEY      absolute path to AuthKey_XXXX.p8
 *   APPLE_API_KEY_ID   10-char Key ID
 *   APPLE_API_ISSUER   Issuer UUID (Team keys — required; omit for Individual keys)
 */
const { notarize } = require("@electron/notarize");

module.exports = async function notarizeMac(context) {
  if (context.electronPlatformName !== "darwin") return;

  const keyPath = process.env.APPLE_API_KEY;
  const keyId = process.env.APPLE_API_KEY_ID;
  const issuer = process.env.APPLE_API_ISSUER;

  if (!keyPath || !keyId) {
    console.log(
      "[notarize] Skipped — set APPLE_API_KEY (path to .p8) and APPLE_API_KEY_ID to notarize.",
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  console.log(`[notarize] Submitting ${appPath}…`);

  const opts = { appPath, appleApiKey: keyPath, appleApiKeyId: keyId };
  if (issuer) opts.appleApiIssuer = issuer;

  await notarize(opts);
  console.log("[notarize] Accepted.");
};
