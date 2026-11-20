// Road surface geometry. Used by presentation only; lanes carry the driving data.
export class RoadComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.points = data.points;
    this.width = data.width;
  }
}
