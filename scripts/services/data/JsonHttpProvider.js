import { DataProvider } from "./DataProvider.js";

// Shared fetch-and-parse plumbing for providers that read JSON over HTTP(S).
// `fetchFn` is injectable for tests and for non-browser hosts.
export class JsonHttpProvider extends DataProvider {
  constructor({ fetchFn = (...a) => globalThis.fetch(...a), headers = {} } = {}) {
    super();
    this.fetchFn = fetchFn;
    this.headers = headers;
  }

  async fetchJson(url) {
    const res = await this.fetchFn(url, { headers: this.headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Data request failed: ${url} (${res.status} ${res.statusText ?? ""})`);
    try {
      return await res.json();
    } catch (e) {
      throw new Error(`Data at ${url} is not valid JSON: ${e.message}`);
    }
  }
}
