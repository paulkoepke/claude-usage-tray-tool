const { execFileSync } = require('child_process')
const path = require('path')

/**
 * We have no Apple Developer ID, so electron-builder skips code signing
 * entirely and ships a completely unsigned .app. On modern macOS,
 * Gatekeeper reacts to a fully unsigned, quarantined app with
 * "...is damaged and can't be opened" instead of the milder "unidentified
 * developer" prompt that right-click → Open can bypass. Ad-hoc signing
 * (no identity, no cost) is enough to get the milder prompt back.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath])
}
