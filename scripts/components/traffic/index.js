import { LaneComponent } from "./LaneComponent.js";
import { JunctionComponent } from "./JunctionComponent.js";
import { SignalGroupComponent } from "./SignalGroupComponent.js";
import { InputGateComponent } from "./InputGateComponent.js";
import { OutputGateComponent } from "./OutputGateComponent.js";
import { ObstacleComponent } from "./ObstacleComponent.js";
import { RouteComponent } from "./RouteComponent.js";
import { RoadComponent } from "./RoadComponent.js";
import { BuildingComponent } from "./BuildingComponent.js";
import { VehicleComponent } from "./VehicleComponent.js";
import { VehicleStateComponent } from "./VehicleStateComponent.js";
import { SimulationComponent } from "./SimulationComponent.js";
import { TrafficStatsComponent } from "./TrafficStatsComponent.js";

// Merged into services/ComponentClasses.js. Keys must equal the class names.
export const trafficComponentClasses = {
  LaneComponent,
  JunctionComponent,
  SignalGroupComponent,
  InputGateComponent,
  OutputGateComponent,
  ObstacleComponent,
  RouteComponent,
  RoadComponent,
  BuildingComponent,
  VehicleComponent,
  VehicleStateComponent,
  SimulationComponent,
  TrafficStatsComponent,
};
