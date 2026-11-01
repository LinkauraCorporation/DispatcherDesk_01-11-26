/**
 * DispatchDesk - Deterministic Geographic Utilities
 * 
 * IMPORTANT LOCATION INTEGRITY POLICY:
 * - This provides deterministic city/state centroid approximations for operational dispatch visualization.
 * - This is NOT a live GPS tracking engine or road routing service.
 * - Any centroid-derived coordinates are marked with precision: 'city' | 'state'.
 * - Never represent centroid coordinates as live vehicle telemetry or real-time GPS coordinates.
 */

export interface GeoCoordinate {
  lat: number;
  lng: number;
  precision: 'exact' | 'city' | 'state' | 'fallback';
  locationName: string;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// 50 US States + DC + PR Centroids
export const US_STATE_CENTROIDS: Record<string, { lat: number; lng: number; name: string }> = {
  AL: { lat: 32.806671, lng: -86.791130, name: 'Alabama' },
  AK: { lat: 61.370716, lng: -152.404419, name: 'Alaska' },
  AZ: { lat: 33.729759, lng: -111.431221, name: 'Arizona' },
  AR: { lat: 34.969704, lng: -92.373123, name: 'Arkansas' },
  CA: { lat: 36.116203, lng: -119.681564, name: 'California' },
  CO: { lat: 39.059811, lng: -105.311104, name: 'Colorado' },
  CT: { lat: 41.597782, lng: -72.755371, name: 'Connecticut' },
  DE: { lat: 39.318523, lng: -75.507141, name: 'Delaware' },
  DC: { lat: 38.897438, lng: -77.026817, name: 'District of Columbia' },
  FL: { lat: 27.766279, lng: -81.686783, name: 'Florida' },
  GA: { lat: 33.040619, lng: -83.643074, name: 'Georgia' },
  HI: { lat: 21.094318, lng: -157.498337, name: 'Hawaii' },
  ID: { lat: 44.240459, lng: -114.478828, name: 'Idaho' },
  IL: { lat: 40.349457, lng: -88.986137, name: 'Illinois' },
  IN: { lat: 39.849426, lng: -86.258278, name: 'Indiana' },
  IA: { lat: 42.011539, lng: -93.210526, name: 'Iowa' },
  KS: { lat: 38.526600, lng: -96.726486, name: 'Kansas' },
  KY: { lat: 37.668140, lng: -84.670067, name: 'Kentucky' },
  LA: { lat: 31.169546, lng: -91.867805, name: 'Louisiana' },
  ME: { lat: 44.693947, lng: -69.381927, name: 'Maine' },
  MD: { lat: 39.063946, lng: -76.802101, name: 'Maryland' },
  MA: { lat: 42.230171, lng: -71.530106, name: 'Massachusetts' },
  MI: { lat: 43.326618, lng: -84.536095, name: 'Michigan' },
  MN: { lat: 45.694454, lng: -93.900192, name: 'Minnesota' },
  MS: { lat: 32.741646, lng: -89.678696, name: 'Mississippi' },
  MO: { lat: 38.456085, lng: -92.288368, name: 'Missouri' },
  MT: { lat: 46.921925, lng: -110.454353, name: 'Montana' },
  NE: { lat: 41.125370, lng: -98.268082, name: 'Nebraska' },
  NV: { lat: 38.313515, lng: -117.055374, name: 'Nevada' },
  NH: { lat: 43.452492, lng: -71.563896, name: 'New Hampshire' },
  NJ: { lat: 40.298904, lng: -74.521011, name: 'New Jersey' },
  NM: { lat: 34.840515, lng: -106.248482, name: 'New Mexico' },
  NY: { lat: 42.165726, lng: -74.948051, name: 'New York' },
  NC: { lat: 35.630066, lng: -79.806419, name: 'North Carolina' },
  ND: { lat: 47.528912, lng: -99.784012, name: 'North Dakota' },
  OH: { lat: 40.388783, lng: -82.764915, name: 'Ohio' },
  OK: { lat: 35.565342, lng: -96.928917, name: 'Oklahoma' },
  OR: { lat: 44.572021, lng: -122.070938, name: 'Oregon' },
  PA: { lat: 40.590752, lng: -77.209755, name: 'Pennsylvania' },
  RI: { lat: 41.680893, lng: -71.511780, name: 'Rhode Island' },
  SC: { lat: 33.856892, lng: -80.945007, name: 'South Carolina' },
  SD: { lat: 44.299782, lng: -99.438828, name: 'South Dakota' },
  TN: { lat: 35.747845, lng: -86.692345, name: 'Tennessee' },
  TX: { lat: 31.054487, lng: -97.563461, name: 'Texas' },
  UT: { lat: 40.150032, lng: -111.862434, name: 'Utah' },
  VT: { lat: 44.045876, lng: -72.710686, name: 'Vermont' },
  VA: { lat: 37.769337, lng: -78.169968, name: 'Virginia' },
  WA: { lat: 47.400902, lng: -121.490494, name: 'Washington' },
  WV: { lat: 38.491226, lng: -80.954453, name: 'West Virginia' },
  WI: { lat: 44.268543, lng: -89.616508, name: 'Wisconsin' },
  WY: { lat: 42.755966, lng: -107.302490, name: 'Wyoming' },
  PR: { lat: 18.220833, lng: -66.590149, name: 'Puerto Rico' },
};

// Major Freight Hubs & High-Volume Logistics Cities
export const US_MAJOR_CITIES: Record<string, { lat: number; lng: number }> = {
  // Texas
  'DALLAS,TX': { lat: 32.7767, lng: -96.7970 },
  'FORT WORTH,TX': { lat: 32.7555, lng: -97.3308 },
  'HOUSTON,TX': { lat: 29.7604, lng: -95.3698 },
  'SAN ANTONIO,TX': { lat: 29.4241, lng: -98.4936 },
  'AUSTIN,TX': { lat: 30.2672, lng: -97.7431 },
  'EL PASO,TX': { lat: 31.7619, lng: -106.4850 },
  'LAREDO,TX': { lat: 27.5036, lng: -99.5076 },
  'MCALLEN,TX': { lat: 26.2034, lng: -98.2300 },
  'AMARILLO,TX': { lat: 35.2220, lng: -101.8313 },
  'LUBBOCK,TX': { lat: 33.5779, lng: -101.8552 },
  'WACO,TX': { lat: 31.5493, lng: -97.1467 },

  // Illinois / Midwest
  'CHICAGO,IL': { lat: 41.8781, lng: -87.6298 },
  'JOLIET,IL': { lat: 41.5250, lng: -88.0817 },
  'ROCKFORD,IL': { lat: 42.2711, lng: -89.0940 },
  'PEORIA,IL': { lat: 40.6936, lng: -89.5890 },
  'SPRINGFIELD,IL': { lat: 39.7817, lng: -89.6501 },

  // Tennessee / Southeast Hub
  'MEMPHIS,TN': { lat: 35.1495, lng: -90.0490 },
  'NASHVILLE,TN': { lat: 36.1627, lng: -86.7816 },
  'KNOXVILLE,TN': { lat: 35.9606, lng: -83.9207 },
  'CHATTANOOGA,TN': { lat: 35.0456, lng: -85.3097 },

  // Georgia
  'ATLANTA,GA': { lat: 33.7490, lng: -84.3880 },
  'SAVANNAH,GA': { lat: 32.0809, lng: -81.0912 },
  'MACON,GA': { lat: 32.8407, lng: -83.6324 },
  'AUGUSTA,GA': { lat: 33.4735, lng: -82.0105 },

  // California
  'LOS ANGELES,CA': { lat: 34.0522, lng: -118.2437 },
  'ONTARIO,CA': { lat: 34.0633, lng: -117.6509 },
  'LONG BEACH,CA': { lat: 33.7701, lng: -118.1937 },
  'SAN DIEGO,CA': { lat: 32.7157, lng: -117.1611 },
  'SAN FRANCISCO,CA': { lat: 37.7749, lng: -122.4194 },
  'OAKLAND,CA': { lat: 37.8044, lng: -122.2712 },
  'SACRAMENTO,CA': { lat: 38.5816, lng: -121.4944 },
  'FRESNO,CA': { lat: 36.7468, lng: -119.7726 },
  'BAKERSFIELD,CA': { lat: 35.3733, lng: -119.0187 },
  'STOCKTON,CA': { lat: 37.9577, lng: -121.2908 },

  // Florida
  'MIAMI,FL': { lat: 25.7617, lng: -80.1918 },
  'JACKSONVILLE,FL': { lat: 30.3322, lng: -81.6557 },
  'ORLANDO,FL': { lat: 28.5383, lng: -81.3792 },
  'TAMPA,FL': { lat: 27.9506, lng: -82.4572 },
  'LAKELAND,FL': { lat: 28.0395, lng: -81.9498 },
  'TALLAHASSEE,FL': { lat: 30.4383, lng: -84.2807 },

  // North Carolina / South Carolina
  'CHARLOTTE,NC': { lat: 35.2271, lng: -80.8431 },
  'RALEIGH,NC': { lat: 35.7796, lng: -78.6382 },
  'GREENSBORO,NC': { lat: 36.0726, lng: -79.7920 },
  'WILMINGTON,NC': { lat: 34.2257, lng: -77.9447 },
  'COLUMBIA,SC': { lat: 34.0007, lng: -81.0348 },
  'CHARLESTON,SC': { lat: 32.7765, lng: -79.9311 },
  'GREENVILLE,SC': { lat: 34.8526, lng: -82.3940 },

  // Ohio / Indiana / Michigan / Kentucky
  'COLUMBUS,OH': { lat: 39.9612, lng: -82.9988 },
  'CINCINNATI,OH': { lat: 39.1031, lng: -84.5120 },
  'CLEVELAND,OH': { lat: 41.4993, lng: -81.6944 },
  'TOLEDO,OH': { lat: 41.6528, lng: -83.5379 },
  'AKRON,OH': { lat: 41.0814, lng: -81.5190 },
  'INDIANAPOLIS,IN': { lat: 39.7684, lng: -86.1581 },
  'FORT WAYNE,IN': { lat: 41.0793, lng: -85.1394 },
  'DETROIT,MI': { lat: 42.3314, lng: -83.0458 },
  'GRAND RAPIDS,MI': { lat: 42.9634, lng: -85.6681 },
  'LOUISVILLE,KY': { lat: 38.2527, lng: -85.7585 },
  'LEXINGTON,KY': { lat: 38.0406, lng: -84.5037 },

  // Pennsylvania / New York / New Jersey
  'PHILADELPHIA,PA': { lat: 39.9526, lng: -75.1652 },
  'PITTSBURGH,PA': { lat: 40.4406, lng: -79.9959 },
  'ALLENTOWN,PA': { lat: 40.6084, lng: -75.4902 },
  'HARRISBURG,PA': { lat: 40.2732, lng: -76.8867 },
  'NEW YORK,NY': { lat: 40.7128, lng: -74.0060 },
  'BUFFALO,NY': { lat: 42.8864, lng: -78.8784 },
  'ROCHESTER,NY': { lat: 43.1566, lng: -77.6088 },
  'SYRACUSE,NY': { lat: 43.0481, lng: -76.1474 },
  'ALBANY,NY': { lat: 42.6526, lng: -73.7562 },
  'NEWARK,NJ': { lat: 40.7357, lng: -74.1724 },
  'JERSEY CITY,NJ': { lat: 40.7178, lng: -74.0431 },

  // Missouri / Kansas / Iowa / Nebraska / Minnesota
  'KANSAS CITY,MO': { lat: 39.0997, lng: -94.5786 },
  'ST LOUIS,MO': { lat: 38.6270, lng: -90.1994 },
  'SPRINGFIELD,MO': { lat: 37.2090, lng: -93.2923 },
  'WICHITA,KS': { lat: 37.6872, lng: -97.3301 },
  'DES MOINES,IA': { lat: 41.5868, lng: -93.6250 },
  'CEDAR RAPIDS,IA': { lat: 41.9779, lng: -91.6656 },
  'OMAHA,NE': { lat: 41.2565, lng: -95.9345 },
  'LINCOLN,NE': { lat: 40.8136, lng: -96.7026 },
  'MINNEAPOLIS,MN': { lat: 44.9778, lng: -93.2650 },
  'ST PAUL,MN': { lat: 44.9537, lng: -93.0900 },

  // South / Gulf States
  'NEW ORLEANS,LA': { lat: 29.9511, lng: -90.0715 },
  'BATON ROUGE,LA': { lat: 30.4515, lng: -91.1871 },
  'SHREVEPORT,LA': { lat: 32.5252, lng: -93.7502 },
  'BIRMINGHAM,AL': { lat: 33.5186, lng: -86.8104 },
  'MOBILE,AL': { lat: 30.6954, lng: -88.0399 },
  'JACKSON,MS': { lat: 32.2988, lng: -90.1848 },
  'LITTLE ROCK,AR': { lat: 34.7465, lng: -92.2896 },
  'OKLAHOMA CITY,OK': { lat: 35.4676, lng: -97.5164 },
  'TULSA,OK': { lat: 36.1540, lng: -95.9928 },

  // Mountain & West
  'DENVER,CO': { lat: 39.7392, lng: -104.9903 },
  'COLORADO SPRINGS,CO': { lat: 38.8339, lng: -104.8214 },
  'PHOENIX,AZ': { lat: 33.4484, lng: -112.0740 },
  'TUCSON,AZ': { lat: 32.2226, lng: -110.9747 },
  'SALT LAKE CITY,UT': { lat: 40.7608, lng: -111.8910 },
  'LAS VEGAS,NV': { lat: 36.1699, lng: -115.1398 },
  'RENO,NV': { lat: 39.5296, lng: -119.8138 },
  'ALBUQUERQUE,NM': { lat: 35.0844, lng: -106.6504 },
  'BOISE,ID': { lat: 43.6150, lng: -116.2023 },
  'CHEYENNE,WY': { lat: 41.1400, lng: -104.8202 },
  'BILLINGS,MT': { lat: 45.7833, lng: -108.5007 },

  // Pacific Northwest & Others
  'SEATTLE,WA': { lat: 47.6062, lng: -122.3321 },
  'TACOMA,WA': { lat: 47.2529, lng: -122.4443 },
  'SPOKANE,WA': { lat: 47.6588, lng: -117.4260 },
  'PORTLAND,OR': { lat: 45.5152, lng: -122.6784 },
  'BOSTON,MA': { lat: 42.3601, lng: -71.0589 },
  'BALTIMORE,MD': { lat: 39.2904, lng: -76.6122 },
  'RICHMOND,VA': { lat: 37.5407, lng: -77.4360 },
  'NORFOLK,VA': { lat: 36.8508, lng: -76.2859 },
  'MILWAUKEE,WI': { lat: 43.0389, lng: -87.9065 },
  'GREEN BAY,WI': { lat: 44.5192, lng: -88.0198 },
};

/**
 * Clean and normalize city/state strings for key matching.
 */
export function normalizeLocationKey(city?: string | null, state?: string | null): string {
  const cleanCity = (city || '').trim().toUpperCase().replace(/[^A-Z0-9\s]/g, '');
  const cleanState = (state || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  return `${cleanCity},${cleanState}`;
}

/**
 * Returns deterministic latitude & longitude for a given city and state combination.
 * Guaranteed to produce stable, repeatable coordinates without external telemetry.
 */
export function getCoordinatesForLocation(
  city?: string | null,
  state?: string | null,
  providedLat?: number | null,
  providedLng?: number | null
): GeoCoordinate {
  // 1. If explicit coordinates are already provided (e.g. from dispatcher check-call entry)
  if (
    providedLat !== null &&
    providedLat !== undefined &&
    !isNaN(providedLat) &&
    providedLng !== null &&
    providedLng !== undefined &&
    !isNaN(providedLng) &&
    (providedLat !== 0 || providedLng !== 0)
  ) {
    const locName = city && state ? `${city}, ${state}` : `${providedLat.toFixed(4)}, ${providedLng.toFixed(4)}`;
    return {
      lat: providedLat,
      lng: providedLng,
      precision: 'exact',
      locationName: locName,
    };
  }

  const cleanState = (state || '').trim().toUpperCase();
  const cleanCity = (city || '').trim();
  const key = normalizeLocationKey(cleanCity, cleanState);

  // 2. Check major freight hubs dictionary
  if (US_MAJOR_CITIES[key]) {
    const cityCoords = US_MAJOR_CITIES[key];
    return {
      lat: cityCoords.lat,
      lng: cityCoords.lng,
      precision: 'city',
      locationName: `${cleanCity || 'City'}, ${cleanState}`,
    };
  }

  // 3. Fallback to state centroid with deterministic slight offset based on city name hash
  if (cleanState && US_STATE_CENTROIDS[cleanState]) {
    const stateInfo = US_STATE_CENTROIDS[cleanState];
    
    // Deterministic pseudo-offset so multiple different unlisted towns in the same state don't stack 100% identically
    let hash = 0;
    for (let i = 0; i < cleanCity.length; i++) {
      hash = (hash << 5) - hash + cleanCity.charCodeAt(i);
      hash |= 0;
    }
    const offsetLat = ((Math.abs(hash) % 100) - 50) * 0.003; // max ~0.15 deg offset
    const offsetLng = ((Math.abs(hash * 31) % 100) - 50) * 0.003;

    return {
      lat: stateInfo.lat + (cleanCity ? offsetLat : 0),
      lng: stateInfo.lng + (cleanCity ? offsetLng : 0),
      precision: 'state',
      locationName: `${cleanCity ? `${cleanCity}, ` : ''}${cleanState}`,
    };
  }

  // 4. Default Geographic center of the Continental US (Lebanon, KS)
  return {
    lat: 39.8283,
    lng: -98.5795,
    precision: 'fallback',
    locationName: `${cleanCity ? `${cleanCity}, ` : ''}${cleanState || 'USA'}`,
  };
}

/**
 * Calculates a bounding box encompassing an array of latitude/longitude coordinates.
 */
export function calculateBounds(points: { lat: number; lng: number }[]): MapBounds | null {
  if (!points || points.length === 0) return null;

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const pt of points) {
    if (isNaN(pt.lat) || isNaN(pt.lng)) continue;
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }

  if (minLat > maxLat) return null;

  // Add 10% padding
  const latPadding = Math.max((maxLat - minLat) * 0.15, 0.5);
  const lngPadding = Math.max((maxLng - minLng) * 0.15, 0.5);

  return {
    minLat: Math.max(minLat - latPadding, -85),
    maxLat: Math.min(maxLat + latPadding, 85),
    minLng: Math.max(minLng - lngPadding, -180),
    maxLng: Math.min(maxLng + lngPadding, 180),
  };
}

/**
 * Calculates rough straight-line operational distance (in miles) using Haversine formula.
 * Displayed with clear disclaimer that actual highway route miles may differ.
 */
export function calculateStraightLineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in statute miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
