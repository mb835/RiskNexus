export interface Vehicle {
  Code: string;
  Name: string;
  SPZ?: string;
  Speed: number;
  BatteryPercentage: number;
  LastPosition: {
    Latitude: string;
    Longitude: string;
  };
  LastPositionTimestamp: string;
}
