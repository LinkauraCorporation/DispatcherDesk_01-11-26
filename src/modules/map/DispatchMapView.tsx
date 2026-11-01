import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { loadService } from '../loads/loadService.ts';
import { checkCallService } from '../checkcalls/checkCallService.ts';
import { clientService } from '../clients/clientService.ts';
import { driverService } from '../drivers/driverService.ts';
import { truckService } from '../trucks/truckService.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { CheckCall } from '../checkcalls/checkCallTypes.ts';
import { Client, Driver, Truck, PipelineStatus } from '../../types/domain.types.ts';
import {
  MapFilterState,
  MapFilterStatus,
  MapLoadRoute,
  MapStats,
  MapStopPoint,
} from './mapTypes.ts';
import { getCoordinatesForLocation } from './utils/geoUtils.ts';
import { MapCanvas } from './components/MapCanvas.tsx';
import { MapControlPanel } from './components/MapControlPanel.tsx';
import { LoadDetailModal } from '../loads/LoadDetailModal.tsx';
import {
  Navigation,
  Map as MapIcon,
  ListFilter,
  RefreshCw,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface DispatchMapViewProps {
  onNewLoadClick?: () => void;
}

export const DispatchMapView: React.FC<DispatchMapViewProps> = ({ onNewLoadClick }) => {
  const { activeOrganization, userRole, user } = useAuth();
  const orgId = activeOrganization?.id || 'demo-organization-default';

  // Raw Data State
  const [loads, setLoads] = useState<LoadWithRelations[]>([]);
  const [checkCalls, setCheckCalls] = useState<CheckCall[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Selection State
  const [filters, setFilters] = useState<MapFilterState>({
    statusFilter: 'all_active',
    search: '',
    clientId: 'all',
    driverId: 'all',
    truckId: 'all',
  });

  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);

  // Mobile View Toggle: 'map' | 'list'
  const [mobileTab, setMobileTab] = useState<'map' | 'list'>('map');

  // Load Detail Modal
  const [selectedLoadForDetail, setSelectedLoadForDetail] = useState<LoadWithRelations | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Fetch all domain data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedLoads, fetchedCheckCalls, fetchedClients, fetchedDrivers, fetchedTrucks] =
        await Promise.all([
          loadService.getLoads(orgId, { userRole: userRole || undefined, currentUserId: user?.id }),
          checkCallService.getCheckCalls(orgId),
          clientService.getClients(orgId),
          driverService.getDrivers(orgId),
          truckService.getTrucks(orgId),
        ]);

      setLoads(fetchedLoads);
      setCheckCalls(fetchedCheckCalls);
      setClients(fetchedClients);
      setDrivers(fetchedDrivers);
      setTrucks(fetchedTrucks);

      // Auto-select first active load if none selected
      if (!selectedLoadId && fetchedLoads.length > 0) {
        const firstActive = fetchedLoads.find(
          (l) => l.pipeline_status === 'in_transit' || l.pipeline_status === 'booked'
        );
        if (firstActive) {
          setSelectedLoadId(firstActive.id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load dispatch map data:', err);
      setError(err?.message || 'Failed to load dispatch operations data');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, selectedLoadId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Construct Map Routes from domain data
  const allRoutes: MapLoadRoute[] = useMemo(() => {
    return loads.map((load) => {
      // 1. Origin Stop
      const originCoord = getCoordinatesForLocation(load.origin_city, load.origin_state);
      const originStop: MapStopPoint = {
        id: `${load.id}-origin`,
        loadId: load.id,
        loadNumber: load.load_number,
        type: 'pickup',
        sequenceNumber: 1,
        label: `PU: ${load.origin_city}, ${load.origin_state}`,
        locationName: `${load.origin_city}, ${load.origin_state}`,
        city: load.origin_city,
        state: load.origin_state,
        lat: originCoord.lat,
        lng: originCoord.lng,
        precision: originCoord.precision,
        scheduledTime: load.pickup_datetime,
      };

      // 2. Destination Stop
      const destCoord = getCoordinatesForLocation(load.dest_city, load.dest_state);
      const destStop: MapStopPoint = {
        id: `${load.id}-dest`,
        loadId: load.id,
        loadNumber: load.load_number,
        type: 'delivery',
        sequenceNumber: 2,
        label: `DEL: ${load.dest_city}, ${load.dest_state}`,
        locationName: `${load.dest_city}, ${load.dest_state}`,
        city: load.dest_city,
        state: load.dest_state,
        lat: destCoord.lat,
        lng: destCoord.lng,
        precision: destCoord.precision,
        scheduledTime: load.delivery_datetime,
      };

      // 3. Latest Check Call (if recorded for this load)
      const loadCheckCalls = checkCalls.filter((c) => c.load_id === load.id);
      let latestCheckCall: CheckCall | null = null;
      let checkCallPoint: MapStopPoint | null = null;

      if (loadCheckCalls.length > 0) {
        // Sort descending by created_at
        const sorted = [...loadCheckCalls].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        latestCheckCall = sorted[0];

        const ccCity = latestCheckCall.location_city || load.origin_city;
        const ccState = latestCheckCall.location_state || load.origin_state;
        const ccCoord = getCoordinatesForLocation(
          ccCity,
          ccState,
          latestCheckCall.latitude,
          latestCheckCall.longitude
        );

        checkCallPoint = {
          id: `${load.id}-checkcall-${latestCheckCall.id}`,
          loadId: load.id,
          loadNumber: load.load_number,
          type: 'checkcall',
          sequenceNumber: 1.5,
          label: `Last reported: ${ccCity}, ${ccState}`,
          locationName: `${ccCity}, ${ccState}`,
          city: ccCity,
          state: ccState,
          lat: ccCoord.lat,
          lng: ccCoord.lng,
          precision: ccCoord.precision,
          checkCall: latestCheckCall,
          isLatestCheckCall: true,
        };
      }

      // Assemble stop array in operational order
      const stops: MapStopPoint[] = [originStop];
      const pathCoordinates: [number, number][] = [[originStop.lat, originStop.lng]];

      // If load is currently in transit or has active check call
      if (checkCallPoint && (load.pipeline_status === 'in_transit' || latestCheckCall?.call_type !== 'delivered')) {
        stops.push(checkCallPoint);
        pathCoordinates.push([checkCallPoint.lat, checkCallPoint.lng]);
      }

      stops.push(destStop);
      pathCoordinates.push([destStop.lat, destStop.lng]);

      return {
        load,
        stops,
        latestCheckCall,
        originPoint: originStop,
        destinationPoint: destStop,
        checkCallPoint,
        pathCoordinates,
      };
    });
  }, [loads, checkCalls]);

  // Compute Statistics
  const stats: MapStats = useMemo(() => {
    let totalActiveLoads = 0;
    let inTransitCount = 0;
    let bookedCount = 0;
    let withCheckCallsCount = 0;
    let exceptionCount = 0;

    allRoutes.forEach((route) => {
      const status = route.load.pipeline_status;
      if (status === 'booked' || status === 'in_transit' || status === 'sourced' || status === 'negotiating') {
        totalActiveLoads++;
      }
      if (status === 'in_transit') inTransitCount++;
      if (status === 'booked') bookedCount++;
      if (route.latestCheckCall) withCheckCallsCount++;
    });

    return {
      totalActiveLoads,
      inTransitCount,
      bookedCount,
      withCheckCallsCount,
      exceptionCount,
    };
  }, [allRoutes]);

  // Apply User Filters
  const filteredRoutes = useMemo(() => {
    return allRoutes.filter((route) => {
      const { load } = route;

      // Status filter
      if (filters.statusFilter === 'all_active') {
        const activeStatuses: PipelineStatus[] = ['booked', 'in_transit', 'sourced', 'negotiating'];
        if (!activeStatuses.includes(load.pipeline_status)) return false;
      } else if (filters.statusFilter === 'booked') {
        if (load.pipeline_status !== 'booked') return false;
      } else if (filters.statusFilter === 'in_transit') {
        if (load.pipeline_status !== 'in_transit') return false;
      } else if (filters.statusFilter === 'dispatched') {
        if (load.pipeline_status !== 'booked' && load.pipeline_status !== 'in_transit') return false;
      }
      // 'all' includes delivered, invoiced, paid, etc.

      // Carrier / Client filter
      if (filters.clientId !== 'all' && load.client_id !== filters.clientId) {
        return false;
      }

      // Driver filter
      if (filters.driverId !== 'all' && load.driver_id !== filters.driverId) {
        return false;
      }

      // Search query filter
      if (filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        const matchesLoadNumber = load.load_number.toLowerCase().includes(q);
        const matchesOriginCity = load.origin_city.toLowerCase().includes(q);
        const matchesOriginState = load.origin_state.toLowerCase().includes(q);
        const matchesDestCity = load.dest_city.toLowerCase().includes(q);
        const matchesDestState = load.dest_state.toLowerCase().includes(q);
        const matchesClient = load.client?.company_name?.toLowerCase().includes(q);
        const matchesDriver = load.driver?.full_name?.toLowerCase().includes(q);
        const matchesCommodity = load.commodity?.toLowerCase().includes(q);

        if (
          !matchesLoadNumber &&
          !matchesOriginCity &&
          !matchesOriginState &&
          !matchesDestCity &&
          !matchesDestState &&
          !matchesClient &&
          !matchesDriver &&
          !matchesCommodity
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allRoutes, filters]);

  const handleFilterChange = (updates: Partial<MapFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const handleResetFilters = () => {
    setFilters({
      statusFilter: 'all_active',
      search: '',
      clientId: 'all',
      driverId: 'all',
      truckId: 'all',
    });
  };

  const handleOpenLoadDetail = (load: LoadWithRelations) => {
    setSelectedLoadForDetail(load);
    setIsDetailModalOpen(true);
  };

  const handleStatusChange = async (loadId: string, newStatus: PipelineStatus) => {
    try {
      await loadService.updateLoad(orgId, loadId, { pipeline_status: newStatus });
      await fetchData();
    } catch (err) {
      console.error('Failed to update load status from map:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Loading Dispatch Operations Map...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-rose-950/30 border border-rose-800/60 text-rose-300 text-center max-w-lg mx-auto mt-12 space-y-3">
        <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-slate-100">Unable to load map data</h3>
        <p className="text-xs text-rose-300/80">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-rose-900/60 hover:bg-rose-900 border border-rose-700/60 rounded-lg text-xs font-semibold text-rose-100 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div id="dispatch-map-view" className="space-y-4">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Dispatch Operations Map
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 font-mono uppercase">
              V1 Visualizer
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Deterministic stop sequence and last reported check-call operational visualizer.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile View Toggle Tabs */}
          <div className="flex sm:hidden p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              onClick={() => setMobileTab('map')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                mobileTab === 'map' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>
            <button
              onClick={() => setMobileTab('list')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                mobileTab === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Loads ({filteredRoutes.length})</span>
            </button>
          </div>

          <button
            onClick={fetchData}
            title="Refresh map data"
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left Control Panel + Right Map Canvas */}
      <div className="h-[calc(100vh-12rem)] min-h-[580px] w-full rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden flex flex-col sm:flex-row shadow-2xl">
        {/* Left Control / Loads List Panel (Desktop: fixed 390px, Mobile: conditional) */}
        <div
          className={`sm:w-[390px] sm:min-w-[390px] sm:max-w-[400px] h-full ${
            mobileTab === 'list' ? 'flex w-full' : 'hidden sm:flex'
          }`}
        >
          <MapControlPanel
            routes={allRoutes}
            filteredRoutes={filteredRoutes}
            clients={clients}
            drivers={drivers}
            trucks={trucks}
            stats={stats}
            filters={filters}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            selectedLoadId={selectedLoadId}
            onSelectLoad={(id) => {
              setSelectedLoadId(id);
              // On mobile, auto switch to map view when clicking a load card
              if (window.innerWidth < 640) {
                setMobileTab('map');
              }
            }}
            onOpenLoadDetail={handleOpenLoadDetail}
          />
        </div>

        {/* Right Map Canvas Viewport (Desktop: flex-1, Mobile: conditional) */}
        <div
          className={`flex-1 h-full min-w-0 ${
            mobileTab === 'map' ? 'block w-full' : 'hidden sm:block'
          }`}
        >
          <MapCanvas
            routes={filteredRoutes}
            selectedLoadId={selectedLoadId}
            onSelectLoad={setSelectedLoadId}
            onOpenLoadDetail={handleOpenLoadDetail}
          />
        </div>
      </div>

      {/* Existing Shared LoadDetailModal */}
      {selectedLoadForDetail && (
        <LoadDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedLoadForDetail(null);
          }}
          load={selectedLoadForDetail}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
};
