export class BuildingComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.x = data.x;
    this.y = data.y;
    this.w = data.w;
    this.h = data.h;
    this.color = data.color ?? "#555a66";
    this.windows = data.windows ?? 0; // lit windows, for night lighting later
  }
}
