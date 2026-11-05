import { isAllowedNavigationUrl } from '../config/validateConfig';

export const VISITED_FLAG_KEY = 'dr.visited';

export type Navigator = (url: string) => void;

export interface HandoffOptions {
  portfolioUrl: string;
  allowedOrigins: readonly string[];
  /** Injected for tests; defaults to location.assign. */
  navigate?: Navigator;
  storage?: Pick<Storage, 'setItem'> | null;
}

/**
 * Owns the one and only navigation to the real portfolio (ARCHITECTURE.md §7).
 * navigate() is latched: Skip + timeline end, double clicks, etc. produce exactly one navigation.
 */
export class PortfolioHandoff {
  private navigated = false;
  private readonly url: string;
  private readonly doNavigate: Navigator;
  private readonly storage: Pick<Storage, 'setItem'> | null;
  private reachable: boolean | null = null;

  constructor(options: HandoffOptions) {
    if (!isAllowedNavigationUrl(options.portfolioUrl, options.allowedOrigins)) {
      throw new Error('Portfolio URL is not an allowed https destination');
    }
    this.url = options.portfolioUrl;
    this.doNavigate = options.navigate ?? ((u) => window.location.assign(u));
    this.storage = options.storage === undefined ? safeSessionStorage() : options.storage;
  }

  get destination(): string {
    return this.url;
  }

  get hasNavigated(): boolean {
    return this.navigated;
  }

  /** Result of the last reachability check: true, false, or null when unknown. */
  get isReachable(): boolean | null {
    return this.reachable;
  }

  /**
   * Warms the destination so the final navigation is fast: prerender where Speculation Rules are
   * supported (Chromium), plus a plain prefetch hint everywhere else.
   */
  warmUp(doc: Document = document): void {
    if (doc.querySelector('link[data-dr-prefetch]')) return;
    const link = doc.createElement('link');
    link.rel = 'prefetch';
    link.href = this.url;
    link.dataset.drPrefetch = '';
    doc.head.appendChild(link);
    const supportsRules = typeof HTMLScriptElement !== 'undefined' &&
      'supports' in HTMLScriptElement && (HTMLScriptElement as unknown as { supports(t: string): boolean }).supports('speculationrules');
    // prerender only works same-origin (true in production: both live on ahshika.github.io)
    const sameOrigin = new URL(this.url).origin === doc.location?.origin;
    if (supportsRules && sameOrigin) {
      const script = doc.createElement('script');
      script.type = 'speculationrules';
      script.dataset.drPrefetch = '';
      script.textContent = JSON.stringify({ prerender: [{ source: 'list', urls: [this.url] }] });
      doc.head.appendChild(script);
    }
  }

  /** HEAD request to know whether the portfolio is reachable before sending the visitor there. */
  async checkReachable(fetchImpl: typeof fetch = fetch, timeoutMs = 8000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(this.url, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
      this.reachable = res.ok;
    } catch {
      this.reachable = false;
    } finally {
      clearTimeout(timer);
    }
    return this.reachable;
  }

  /** Navigates once. Returns false if a navigation was already issued. */
  navigate(): boolean {
    if (this.navigated) return false;
    this.navigated = true;
    try {
      this.storage?.setItem(VISITED_FLAG_KEY, '1');
    } catch {
      // storage may be unavailable (private mode); the ending screen is optional
    }
    this.doNavigate(this.url);
    return true;
  }
}

export function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
