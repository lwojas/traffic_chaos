// Data provider contract. The game depends on this shape only, so local files,
// a remote asset/data server or an in-memory fixture are interchangeable.
//
//   getGameConfig()  -> Promise<object>   global game configuration
//   getManifest()    -> Promise<{ levels: [{ id, name, ... }] }>
//   getLevel(id)     -> Promise<object>   one level definition (raw JSON)
//
// Providers return raw data. Validation happens in the game, at the data boundary.
export class DataProvider {
  async getGameConfig() {
    throw new Error(`${this.constructor.name}.getGameConfig is not implemented`);
  }
  async getManifest() {
    throw new Error(`${this.constructor.name}.getManifest is not implemented`);
  }
  async getLevel(id) {
    throw new Error(`${this.constructor.name}.getLevel("${id}") is not implemented`);
  }
}
