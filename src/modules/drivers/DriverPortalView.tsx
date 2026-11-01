import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import {
  Truck,
  Package,
  Calendar,
  MapPin,
  Clock,
  ShieldCheck,
  LogOut,
  RefreshCw,
  AlertCircle,
  FileText,
  Building2,
  ChevronRight,
  Info,
  MessageSquare,
} from 'lucide-react';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { communicationService } from '../communication/communicationService.ts';
import { DriverChatView } from './components/DriverChatView.tsx';
import { formatInTimezone, DEFAULT_OPERATIONAL_TIMEZONE } from '../../lib/timezones.ts';

export interface DriverAssignedLoad {
  id: string;
  organization_id: string;
  load_number: string;
  pipeline_status: string;
  equipment_type: string | null;
  commodity: string | null;
  weight_lbs: number | null;
  origin_city: string | null;
  origin_state: string | null;
  origin_zip: string | null;
  pickup_datetime: string | null;
  origin_address: string | null;
  origin_facility_name: string | null;
  dest_city: string | null;
  dest_state: string | null;
  dest_zip: string | null;
  delivery_datetime: string | null;
  destination_address: string | null;
  destination_facility_name: string | null;
  special_instructions: string | null;
  driver_id: string | null;
  truck_id: string | null;
  created_at: string;
  updated_at: string;
}

export const DriverPortalView: React.FC = () => {
  const { user, profile, activeOrganization, driverProfile, signOut } = useAuth();
  const driverOrgId =
    driverProfile?.organization_id ||
    (activeOrganization?.id && activeOrganization.id !== 'demo-org-1'
      ? activeOrganization.id
      : null);
  const [loads, setLoads] = useState<DriverAssignedLoad[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedLoad, setSelectedLoad] = useState<DriverAssignedLoad | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dispatches' | 'messages'>('dispatches');
  const [chatInitialConversationId, setChatInitialConversationId] = useState<string | null>(null);
  const [openingChatLoadId, setOpeningChatLoadId] = useState<string | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);

  // Global unread messages count polling for driver
  useEffect(() => {
    if (!driverOrgId || !user?.id) {
      setUnreadMessagesCount(0);
      return;
    }

    let isMounted = true;

    const fetchDriverUnread = async () => {
      try {
        const driverId =
          driverProfile?.id ||
          (await communicationService.resolveCurrentDriverId(driverOrgId));

        if (!driverId || !isMounted) return;

        const summary = await communicationService.getUnreadMessageCountForDriver(
          driverOrgId,
          driverId,
          user.id
        );

        if (isMounted) {
          setUnreadMessagesCount(summary.total);
        }
      } catch (err) {
        console.warn('[DriverPortal] Failed to fetch unread messages count:', err);
      }
    };

    fetchDriverUnread();
    const intervalId = setInterval(fetchDriverUnread, 20000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [driverOrgId, driverProfile?.id, user?.id]);

  const handleOpenLoadChat = async (load: DriverAssignedLoad) => {
    const targetOrgId = driverOrgId || (isSupabaseConfigured ? null : activeOrganization?.id);
    if (!targetOrgId) return;
    setOpeningChatLoadId(load.id);
    try {
      const conv = await communicationService.createCurrentDriverLoadConversation(
        targetOrgId,
        load.id
      );
      setChatInitialConversationId(conv.id);
      setActiveTab('messages');
    } catch (err) {
      console.warn('[DriverPortal] createCurrentDriverLoadConversation fallback:', err);
      try {
        const driverId = await communicationService.resolveCurrentDriverId(targetOrgId);
        if (driverId) {
          const convs = await communicationService.listConversations(targetOrgId, {
            driverId,
            loadId: load.id,
          });
          if (convs.length > 0) {
            setChatInitialConversationId(convs[0].id);
          }
        }
      } catch {
        // non-fatal
      }
      setActiveTab('messages');
    } finally {
      setOpeningChatLoadId(null);
    }
  };

  const fetchAssignedLoads = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (isSupabaseConfigured) {
        if (!driverOrgId) {
          setLoads([]);
          return;
        }

        // Authoritative Driver Operational Projection RPC
        const { data, error } = await (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: any; error: any }>)(
          'get_driver_assigned_loads',
          { p_organization_id: driverOrgId }
        );

        if (error) {
          console.warn('[DriverPortal] RPC error, verifying with verify_driver_load_access fallback:', error);
          // If RPC fails (or returns empty), fallback to driver-filtered query
          const { data: loadRows, error: queryErr } = await supabase
            .from('loads')
            .select(`
              id,
              organization_id,
              load_number,
              pipeline_status,
              equipment_type,
              commodity,
              weight_lbs,
              origin_city,
              origin_state,
              origin_zip,
              pickup_datetime,
              origin_address,
              origin_facility_name,
              dest_city,
              dest_state,
              dest_zip,
              delivery_datetime,
              dest_address,
              dest_facility_name,
              special_instructions,
              driver_id,
              truck_id,
              created_at,
              updated_at
            `)
            .eq('organization_id', driverOrgId)
            .eq('driver_id', driverProfile?.id || '')
            .order('pickup_datetime', { ascending: true });

          if (queryErr) {
            throw queryErr;
          }

          const mapped: DriverAssignedLoad[] = (loadRows || []).map((l: any) => ({
            ...l,
            destination_address: l.dest_address,
            destination_facility_name: l.dest_facility_name,
          }));
          setLoads(mapped);
          return;
        }

        setLoads(Array.isArray(data) ? (data as DriverAssignedLoad[]) : []);
        return;
      }

      // Demo Mode / Local Storage fallback
      const orgId = activeOrganization?.id || 'demo-org-1';
      const LOADS_KEY = `dispatchdesk_demo_loads_${orgId}`;
      const rawLoads = localStorage.getItem(LOADS_KEY);
      let localLoads: any[] = [];
      if (rawLoads) {
        try {
          localLoads = JSON.parse(rawLoads);
        } catch {
          localLoads = [];
        }
      }

      const driverId = driverProfile?.id || 'demo-driver-1';
      const filtered = localLoads
        .filter((l) => l.driver_id === driverId)
        .map((l) => ({
          id: l.id,
          organization_id: l.organization_id || orgId,
          load_number: l.load_number,
          pipeline_status: l.pipeline_status || 'booked',
          equipment_type: l.equipment_type || 'Dry Van',
          commodity: l.commodity || 'Freight',
          weight_lbs: l.weight_lbs || null,
          origin_city: l.origin_city,
          origin_state: l.origin_state,
          origin_zip: l.origin_zip,
          pickup_datetime: l.pickup_datetime,
          origin_address: l.origin_address,
          origin_facility_name: l.origin_facility_name,
          dest_city: l.dest_city,
          dest_state: l.dest_state,
          dest_zip: l.dest_zip,
          delivery_datetime: l.delivery_datetime,
          destination_address: l.destination_address || l.dest_address,
          destination_facility_name: l.destination_facility_name || l.dest_facility_name,
          special_instructions: l.special_instructions,
          driver_id: l.driver_id,
          truck_id: l.truck_id,
          created_at: l.created_at || new Date().toISOString(),
          updated_at: l.updated_at || new Date().toISOString(),
        }));

      setLoads(filtered);
    } catch (err: any) {
      console.error('[DriverPortal] Error loading assigned loads:', err);
      setErrorMessage(err.message || 'Unable to load assigned dispatches.');
    } finally {
      setIsLoading(false);
    }
  }, [driverOrgId, activeOrganization?.id, driverProfile?.id]);

  useEffect(() => {
    fetchAssignedLoads();
  }, [fetchAssignedLoads]);

  const carrierName = driverProfile?.client?.name || 'Carrier Partner';
  const driverName = driverProfile?.full_name || profile?.full_name || user?.email || 'Driver';

  return (
    <div id="driver-portal-container" className="h-dvh min-h-0 bg-slate-950 text-slate-100 flex flex-col w-full min-w-0 overflow-hidden">
      {/* Top Mobile/Desktop Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 w-full min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-600/30 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm sm:text-base text-white tracking-tight block leading-tight truncate">
              {driverName}
            </span>
            <span className="text-[11px] text-indigo-400 font-medium flex items-center gap-1 min-w-0">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{carrierName}</span>
              <span className="hidden sm:inline text-indigo-400/80 shrink-0">• Driver Portal</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="driver-portal-refresh-btn"
            type="button"
            onClick={fetchAssignedLoads}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            title="Refresh assigned loads"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            id="driver-portal-signout-btn"
            type="button"
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 hover:text-red-300 text-xs text-slate-300 font-medium border border-slate-700 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        className={`flex-1 min-h-0 flex flex-col max-w-4xl w-full min-w-0 mx-auto ${
          activeTab === 'messages'
            ? 'p-0 sm:p-4 overflow-hidden'
            : 'p-3 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto'
        }`}
      >
        {/* Navigation Tab Switcher */}
        {activeTab !== 'messages' && (
          <div className="flex items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-xl w-full min-w-0 shrink-0">
            <button
              id="driver-portal-tab-dispatches"
              type="button"
              onClick={() => setActiveTab('dispatches')}
              className="min-h-[44px] flex-1 min-w-0 py-2 px-2.5 sm:px-4 rounded-lg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer bg-indigo-600 text-white shadow-sm"
            >
              <Package className="w-4 h-4 shrink-0" />
              <span className="truncate">Dispatches ({loads.length})</span>
            </button>
            <button
              id="driver-portal-tab-messages"
              type="button"
              onClick={() => setActiveTab('messages')}
              className="min-h-[44px] flex-1 min-w-0 py-2 px-2.5 sm:px-4 rounded-lg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate">Messages</span>
              {unreadMessagesCount > 0 && (
                <span
                  id="driver-portal-messages-unread-badge"
                  className="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded-full bg-indigo-600 text-white min-w-[1.125rem] text-center shrink-0 leading-none"
                >
                  {unreadMessagesCount}
                </span>
              )}
            </button>
          </div>
        )}

        {activeTab === 'messages' ? (
          <DriverChatView
            loads={loads}
            initialConversationId={chatInitialConversationId}
            onClearInitialConversation={() => setChatInitialConversationId(null)}
            onBackToDispatches={() => setActiveTab('dispatches')}
          />
        ) : (
          <>
            {/* Identity & Account Permanence Banner */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-900/60 rounded-xl p-3.5 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Persistent Driver Identity Active
                  </span>
                  <span className="text-xs text-slate-400">
                    {activeOrganization?.name || 'Dispatcher Organization'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                  Your login is securely bound to your driver profile. Future dispatches assigned to you by your dispatcher will appear here automatically without any repeated invitations or registration flows.
                </p>
              </div>
              <div className="text-[11px] text-slate-400 shrink-0 bg-slate-950/60 px-3 py-1.5 sm:py-2 rounded-lg border border-slate-800">
                Status: <strong className="text-emerald-400 capitalize">{driverProfile?.status || 'Active'}</strong>
              </div>
            </div>

            {/* Financial Data Firewall Indicator */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
              <Info className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                <strong>Data Firewall Notice:</strong> Driver operational view strictly projects load stops, times, and cargo instructions. Financial rates and billing data are withheld.
              </span>
            </div>

            {/* Error Alert */}
            {errorMessage && (
              <div className="bg-red-950/50 border border-red-800/70 text-red-200 p-4 rounded-xl text-xs flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Assigned Loads List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-400" />
                  <span>Assigned Dispatches ({loads.length})</span>
                </h2>
                <span className="text-xs text-slate-400">
                  {loads.filter((l) => l.pipeline_status === 'in_transit').length} active in-transit
                </span>
              </div>

              {isLoading ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                  <p className="text-xs text-slate-400">Loading your assigned dispatches...</p>
                </div>
              ) : loads.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl py-12 px-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <Truck className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200">No Loads Currently Assigned</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    You currently have no active load dispatches assigned to your driver profile. When your dispatch team assigns your next load, it will instantly display here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {loads.map((load) => (
                    <div
                      key={load.id}
                      id={`driver-load-card-${load.id}`}
                      onClick={() => setSelectedLoad(load)}
                      className="bg-slate-900/90 border border-slate-800 hover:border-indigo-600/60 rounded-xl p-4 sm:p-5 transition cursor-pointer space-y-3.5 shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800/70 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-base text-white tracking-tight">
                            {load.load_number}
                          </span>
                          <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-indigo-400 font-medium hover:underline">
                          <span>View Stop Details</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Route Summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {/* Origin */}
                        <div className="space-y-1 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/50">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>PICKUP (ORIGIN)</span>
                          </div>
                          <div className="font-medium text-slate-100">
                            {load.origin_city}, {load.origin_state} {load.origin_zip}
                          </div>
                          {load.origin_facility_name && (
                            <div className="text-slate-400 text-[11px] truncate">
                              {load.origin_facility_name}
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>
                              {load.pickup_datetime
                                ? formatInTimezone(load.pickup_datetime, DEFAULT_OPERATIONAL_TIMEZONE, {
                                    includeDate: true,
                                    includeTime: true,
                                    includeTimezoneCode: true,
                                  })
                                : 'TBD'}
                            </span>
                          </div>
                        </div>

                        {/* Destination */}
                        <div className="space-y-1 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/50">
                          <div className="flex items-center gap-1.5 text-rose-400 font-semibold text-[11px]">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>DELIVERY (DESTINATION)</span>
                          </div>
                          <div className="font-medium text-slate-100">
                            {load.dest_city}, {load.dest_state} {load.dest_zip}
                          </div>
                          {load.destination_facility_name && (
                            <div className="text-slate-400 text-[11px] truncate">
                              {load.destination_facility_name}
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>
                              {load.delivery_datetime
                                ? formatInTimezone(load.delivery_datetime, DEFAULT_OPERATIONAL_TIMEZONE, {
                                    includeDate: true,
                                    includeTime: true,
                                    includeTimezoneCode: true,
                                  })
                                : 'TBD'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Commodity & Cargo details + Chat Action */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[11px] text-slate-400 border-t border-slate-800/60 mt-1">
                        <div className="flex flex-wrap items-center gap-3">
                          {load.commodity && (
                            <span className="flex items-center gap-1 bg-slate-800/60 px-2 py-1 rounded">
                              <Package className="w-3 h-3 text-slate-500" />
                              Commodity: <strong className="text-slate-200">{load.commodity}</strong>
                            </span>
                          )}
                          {load.weight_lbs && (
                            <span className="flex items-center gap-1 bg-slate-800/60 px-2 py-1 rounded">
                              Weight: <strong className="text-slate-200">{load.weight_lbs.toLocaleString()} lbs</strong>
                            </span>
                          )}
                          {load.equipment_type && (
                            <span className="flex items-center gap-1 bg-slate-800/60 px-2 py-1 rounded">
                              Equipment: <strong className="text-slate-200">{load.equipment_type}</strong>
                            </span>
                          )}
                        </div>
                        <button
                          id={`driver-load-chat-btn-${load.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenLoadChat(load);
                          }}
                          disabled={openingChatLoadId === load.id}
                          className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer shrink-0 ml-auto sm:ml-0"
                        >
                          {openingChatLoadId === load.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <MessageSquare className="w-3.5 h-3.5" />
                          )}
                          <span>Chat Dispatch</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Stop Details & Operational Modal */}
      {selectedLoad && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            id="driver-load-detail-modal"
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[11px] text-indigo-400 font-semibold uppercase tracking-wider block">
                  Dispatch Manifest
                </span>
                <h3 className="text-lg font-bold text-white">
                  Load #{selectedLoad.load_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLoad(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400">Current Pipeline Status:</span>
                <StatusBadge status={selectedLoad.pipeline_status} type="pipeline" size="sm" />
              </div>

              {/* Shipper Origin Details */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                  <MapPin className="w-4 h-4" />
                  <span>Pickup Facility & Address</span>
                </div>
                <div className="font-semibold text-slate-100 text-sm">
                  {selectedLoad.origin_facility_name || 'Shipper Facility'}
                </div>
                <div className="text-slate-300">
                  {selectedLoad.origin_address || 'Address on dispatch file'}
                </div>
                <div className="text-slate-300">
                  {selectedLoad.origin_city}, {selectedLoad.origin_state} {selectedLoad.origin_zip}
                </div>
                <div className="text-indigo-300 font-medium pt-1">
                  Scheduled Pickup: {selectedLoad.pickup_datetime ? formatInTimezone(selectedLoad.pickup_datetime, DEFAULT_OPERATIONAL_TIMEZONE, { includeDate: true, includeTime: true, includeTimezoneCode: true }) : 'TBD'}
                </div>
              </div>

              {/* Receiver Destination Details */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                  <MapPin className="w-4 h-4" />
                  <span>Delivery Facility & Address</span>
                </div>
                <div className="font-semibold text-slate-100 text-sm">
                  {selectedLoad.destination_facility_name || 'Receiver Facility'}
                </div>
                <div className="text-slate-300">
                  {selectedLoad.destination_address || 'Address on dispatch file'}
                </div>
                <div className="text-slate-300">
                  {selectedLoad.dest_city}, {selectedLoad.dest_state} {selectedLoad.dest_zip}
                </div>
                <div className="text-indigo-300 font-medium pt-1">
                  Scheduled Delivery: {selectedLoad.delivery_datetime ? formatInTimezone(selectedLoad.delivery_datetime, DEFAULT_OPERATIONAL_TIMEZONE, { includeDate: true, includeTime: true, includeTimezoneCode: true }) : 'TBD'}
                </div>
              </div>

              {/* Special Instructions */}
              {selectedLoad.special_instructions && (
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                  <span className="font-semibold text-amber-400 text-xs flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Special Driver Instructions:
                  </span>
                  <p className="text-slate-300 leading-relaxed text-xs whitespace-pre-wrap">
                    {selectedLoad.special_instructions}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                id="driver-modal-chat-btn"
                type="button"
                onClick={() => {
                  const currentLoad = selectedLoad;
                  setSelectedLoad(null);
                  handleOpenLoadChat(currentLoad);
                }}
                className="min-h-[44px] flex-1 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Chat Dispatch for this Load</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedLoad(null)}
                className="min-h-[44px] py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer"
              >
                Close Manifest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
