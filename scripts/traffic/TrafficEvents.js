// Event names emitted on the "game" EventBus by the traffic simulation.
// Presentation and statistics listen; the simulation never calls them directly.
export const TrafficEvents = {
  VEHICLE_SPAWNED: "G_TRAFFIC_VEHICLE_SPAWNED", // (vehicleEntity) injected from an input queue
  VEHICLE_COMPLETED: "G_TRAFFIC_VEHICLE_COMPLETED", // (vehicleEntity, outputGateEntity, { points, cash, multiplier }) the reward event
  VEHICLE_REMOVED: "G_TRAFFIC_VEHICLE_REMOVED", // (vehicleEntity), fired before removal
  DEMAND_ARRIVED: "G_TRAFFIC_DEMAND_ARRIVED", // (gateEntity, accepted: boolean)
  ENTRY_BLOCKED: "G_TRAFFIC_ENTRY_BLOCKED", // (vehicleEntity, connectorEntity)
  INCIDENT: "G_TRAFFIC_INCIDENT", // (vehicleA, vehicleB, junctionEntity, obstacleEntity, zone)
  OBSTACLE_STARTED: "G_TRAFFIC_OBSTACLE_STARTED", // (obstacleEntity)
  OBSTACLE_CLEARED: "G_TRAFFIC_OBSTACLE_CLEARED", // (obstacleEntity)
  JUNCTION_BLOCKED: "G_TRAFFIC_JUNCTION_BLOCKED", // (junctionEntity)
  TOW_CALLED: "G_TRAFFIC_TOW_CALLED", // (obstacleEntity, cost)
  GRIDLOCK: "G_TRAFFIC_GRIDLOCK", // (inputGateEntity) level failed
};
