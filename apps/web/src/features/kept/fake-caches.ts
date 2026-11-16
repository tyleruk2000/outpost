/**
 * For tests: a stand-in for the browser's Cache Storage, which jsdom does not have.
 * It keeps what the real one keeps (a response under an address, in named caches) and
 * no more. `installFakeCaches()` puts it where the app looks, on a secure origin.
 */
class FakeCache {
  readonly entries = new Map<string, { body: ArrayBuffer; headers: Array<[string, string]> }>();

  private key(request: RequestInfo | URL): string {
    const url = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
    return new URL(url, window.location.origin).pathname;
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const entry = this.entries.get(this.key(request));
    return entry ? new Response(entry.body.slice(0), { headers: entry.headers }) : undefined;
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(this.key(request), { body: await response.arrayBuffer(), headers: [...response.headers.entries()] });
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(this.key(request));
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((path) => new Request(new URL(path, window.location.origin)));
  }
}

export class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.caches.set(name, cache);
    }
    return cache;
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  /** The addresses filed in one cache, for assertions. */
  paths(name: string): string[] {
    return [...(this.caches.get(name)?.entries.keys() ?? [])].sort();
  }
}

/** Makes this test's window look like a browser that can keep things. Returns the storage, and a function that undoes it. */
export function installFakeCaches(): { storage: FakeCacheStorage; restore: () => void } {
  const storage = new FakeCacheStorage();
  const before = {
    caches: Object.getOwnPropertyDescriptor(window, "caches"),
    secure: Object.getOwnPropertyDescriptor(window, "isSecureContext"),
    worker: Object.getOwnPropertyDescriptor(navigator, "serviceWorker"),
  };
  Object.defineProperty(window, "caches", { configurable: true, value: storage });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { controller: null } });
  return {
    storage,
    restore() {
      const put = (target: object, name: string, descriptor: PropertyDescriptor | undefined) => {
        if (descriptor) Object.defineProperty(target, name, descriptor);
        else delete (target as Record<string, unknown>)[name];
      };
      put(window, "caches", before.caches);
      put(window, "isSecureContext", before.secure);
      put(navigator, "serviceWorker", before.worker);
    },
  };
}
