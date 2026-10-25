import type { GpxWaypoint } from '../gpx/parseGpx';
import type { LonLat, LonLatBounds } from '../map/geo';

/** An imported trail, saved on the phone so it's there with no signal. */
export interface SavedRoute {
  id: string;
  name: string;
  lines: LonLat[][];
  /** Elevation of each point in `lines`, from the GPX file. Missing on routes imported before this was added. */
  elevations?: (number | null)[][];
  waypoints: GpxWaypoint[];
  bounds: LonLatBounds;
  /** Total length of all lines, worked out once at import. */
  lengthMeters: number;
  importedAt: number;
}
