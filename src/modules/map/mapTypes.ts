import { LoadWithRelations } from '../loads/loadTypes.ts';
import { CheckCall } from '../checkcalls/checkCallTypes.ts';
import { PipelineStatus } from '../../types/domain.types.ts';

export type MapFilterStatus =
  | 'all_active'
  | 'booked'
  | 'in_transit'
  | 'dispatched'
  | 'all';

export interface MapFilterState {
  statusFilter: MapFilterStatus;
  search: string;
  clientId: string; // 'all' or client UUID
  driverId: string; // 'all' or driver UUID
  truckId: string; // 'all' or truck UUID
}

export type StopType = 'pickup' | 'delivery' | 'intermediate' | 'checkcall';

export interface MapStopPoint {
  id: string;
  loadId: string;
  loadNumber: string;
  type: StopType;
  sequenceNumber: number;
  label: string;
  locationName: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  precision: 'exact' | 'city' | 'state' | 'fallback';
  scheduledTime?: string | null;
  checkCall?: CheckCall;
  isLatestCheckCall?: boolean;
}

export interface MapLoadRoute {
  load: LoadWithRelations;
  stops: MapStopPoint[];
  latestCheckCall: CheckCall | null;
  originPoint: MapStopPoint;
  destinationPoint: MapStopPoint;
  checkCallPoint?: MapStopPoint | null;
  pathCoordinates: [number, number][]; // [lat, lng] array
}

export interface MapStats {
  totalActiveLoads: number;
  inTransitCount: number;
  bookedCount: number;
  withCheckCallsCount: number;
  exceptionCount: number;
}
