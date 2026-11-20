import { JsonHttpProvider } from "./JsonHttpProvider.js";

// Loads the same data from a data/asset server. Endpoint layout is a placeholder
// until the server contract is settled; only this class needs to change.
//   GET {baseUrl}/config   GET {baseUrl}/levels   GET {baseUrl}/levels/{id}
// Not exercised against a real server yet: tests use an injected fetch.
export class RemoteDataProvider extends JsonHttpProvider {
  constructor({ baseUrl, ...rest }) {
    super(rest);
    if (!baseUrl) throw new Error("RemoteDataProvider requires a baseUrl");
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  getGameConfig() {
    return this.fetchJson(`${this.baseUrl}/config`);
  }

  getManifest() {
    return this.fetchJson(`${this.baseUrl}/levels`);
  }

  getLevel(id) {
    return this.fetchJson(`${this.baseUrl}/levels/${encodeURIComponent(id)}`);
  }
}
