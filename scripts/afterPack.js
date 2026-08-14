const { execFileSync } = require('child_process')
const path = require('path')

/**
 * We have no Apple Developer ID, so electron-builder skips code signing
 * entirely and ships a completely unsigned .app. Ad-hoc signing (no
 * identity, no cost) doesn't change Gatekeeper's verdict — an ad-hoc
 * signature has no team identity, so it's blocked identically to a fully
 * unsigned app ("...is damaged and can't be opened", see README's macOS
 * install section for the actual workaround). Kept anyway since it gives
 * the app a stable code identity for TCC/permission prompts and other
 * signature-dependent macOS APIs.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath])
}
