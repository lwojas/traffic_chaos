export class RouteComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.stepIds = data.steps;
    this.steps = []; // lane/connector entities, resolved by the instantiator
  }
}
