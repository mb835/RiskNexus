export interface Vehicle {
  Code: string;
  Name: string;
  SPZ?: string;
  Speed: number;
  BatteryPercentage: number;
  /** Odometer reading in km returned by /vehicles/group/<groupCode> */
  Odometer?: number;
  LastPosition: {
    Latitude: string;
    Longitude: string;
  };
  LastPositionTimestamp: string;
}
