export const LightState = { RED: 0, YELLOW: 1, GREEN: 2 };

// One independently controllable stream of movements (e.g. "NS straight").
// The player requests green or red; TrafficSignalSystem is the only writer of
// `state`. Vehicles and presentation only read it.
export class SignalGroupComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.junctionId = data.junction;
    this.label = data.label ?? data.levelId;
    this.yellowTime = data.yellowTime ?? 2;
    this.wantGreen = data.initial === "green";
    this.state = this.wantGreen ? LightState.GREEN : LightState.RED;
    this.timeInState = 0;
    this.movements = []; // connector lane entities, resolved by the instantiator
  }
}
