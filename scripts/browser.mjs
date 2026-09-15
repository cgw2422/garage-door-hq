import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

/**
 * Launch the Chromium that is actually on this machine.
 *
 * Playwright pins a browser revision to its own version, so a routine `npm
 * install` that moves the package leaves the scripts pointing at a download
 * that is not there. On a machine with a pre-installed Chromium — CI images,
 * this development container — the browser is fine and only the path is wrong.
 *
 * So: use `PLAYWRIGHT_CHROMIUM_PATH` when it is set, fall back to the
 * conventional pre-installed location, and otherwise let Playwright find its
 * own. Nothing here downloads anything.
 */
const CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean)

export function launchChromium(options = {}) {
  const executablePath = CANDIDATES.find((path) => existsSync(path))
  return chromium.launch(executablePath ? { ...options, executablePath } : options)
}
