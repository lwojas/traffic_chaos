// Event names emitted on the "game" EventBus by the traffic simulation.
// Presentation and statistics listen; the simulation never calls them directly.
export const TrafficEvents = {
  VEHICLE_SPAWNED: "G_TRAFFIC_VEHICLE_SPAWNED", // (vehicleEntity) injected from an input queue
  VEHICLE_COMPLETED: "G_TRAFFIC_VEHICLE_COMPLETED", // (vehicleEntity, outputGateEntity)
  VEHICLE_REMOVED: "G_TRAFFIC_VEHICLE_REMOVED", // (vehicleEntity), fired before removal
  DEMAND_ARRIVED: "G_TRAFFIC_DEMAND_ARRIVED", // (gateEntity, accepted: boolean)
  ENTRY_BLOCKED: "G_TRAFFIC_ENTRY_BLOCKED", // (vehicleEntity, connectorEntity)
  INCIDENT: "G_TRAFFIC_INCIDENT", // (vehicleA, vehicleB, junctionEntity, obstacleEntity, zone)
  OBSTACLE_STARTED: "G_TRAFFIC_OBSTACLE_STARTED", // (obstacleEntity)
  OBSTACLE_CLEARED: "G_TRAFFIC_OBSTACLE_CLEARED", // (obstacleEntity)
  JUNCTION_BLOCKED: "G_TRAFFIC_JUNCTION_BLOCKED", // (junctionEntity)
  CASH_EARNED: "G_TRAFFIC_CASH_EARNED", // (vehicleEntity, amount, release | null)
  FLOW_RELEASE: "G_TRAFFIC_FLOW_RELEASE", // (stream, release, clean: boolean) a held queue finished clearing
  FLOW_BROKEN: "G_TRAFFIC_FLOW_BROKEN", // (reason: "incident" | "poor-release" | "gridlock" | "timeout")
  TOW_CALLED: "G_TRAFFIC_TOW_CALLED", // (obstacleEntity, cost)
  GRIDLOCK: "G_TRAFFIC_GRIDLOCK", // (inputGateEntity) level failed
};
