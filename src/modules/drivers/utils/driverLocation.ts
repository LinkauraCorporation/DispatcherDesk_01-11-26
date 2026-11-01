export interface DriverGpsCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Minimal safe helper for one-time driver GPS capture on explicit quick actions.
 * Never throws, catches all errors, enforces timeout, and returns null when unavailable/denied.
 */
export async function getCurrentDriverGps(timeoutMs: number = 3000): Promise<DriverGpsCoordinates | null> {
  if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    let settled = false;

    // Safety fallback timer in case device GPS driver hangs beyond options.timeout
    const safetyTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs + 200);

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!settled) {
            settled = true;
            clearTimeout(safetyTimer);
            if (
              pos &&
              pos.coords &&
              typeof pos.coords.latitude === 'number' &&
              typeof pos.coords.longitude === 'number' &&
              Number.isFinite(pos.coords.latitude) &&
              Number.isFinite(pos.coords.longitude) &&
              pos.coords.latitude >= -90 &&
              pos.coords.latitude <= 90 &&
              pos.coords.longitude >= -180 &&
              pos.coords.longitude <= 180
            ) {
              resolve({
                latitude: Number(pos.coords.latitude.toFixed(6)),
                longitude: Number(pos.coords.longitude.toFixed(6)),
              });
            } else {
              resolve(null);
            }
          }
        },
        (_error) => {
          if (!settled) {
            settled = true;
            clearTimeout(safetyTimer);
            resolve(null);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 60000,
        }
      );
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(safetyTimer);
        resolve(null);
      }
    }
  });
}
