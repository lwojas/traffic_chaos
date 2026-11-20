export class JunctionComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.bounds = data.bounds;
    this.connectors = []; // connector lane entities, resolved by the instantiator
    this.zones = []; // compiled conflict zones (plain objects, see compileLevel)
    // Runtime state
    this.occupants = 0;
    this.blocked = false;
    this.blockedTime = 0;
    this.usedTime = 0;
    this.blockedEvents = 0;
  }
}
