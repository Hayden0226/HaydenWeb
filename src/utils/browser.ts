// Shared Puppeteer launch helper with stealth plugin

let stealthRegistered = false;

const BROWSER_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean) as string[];

async function findBrowserExecutable(): Promise<string | undefined> {
  try {
    const { existsSync } = await import('node:fs');
    return BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
  } catch {
    return undefined;
  }
}

/**
 * Launch a headless browser with puppeteer-extra stealth plugin.
 * Handles dynamic import, one-time plugin registration, and common launch args.
 */
export async function launchStealthBrowser(extraArgs: string[] = []) {
  const puppeteer = await import('puppeteer-extra');
  if (!stealthRegistered) {
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
    puppeteer.default.use(StealthPlugin());
    stealthRegistered = true;
  }

  const executablePath = await findBrowserExecutable();

  return puppeteer.default.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      ...extraArgs,
    ],
  });
}
