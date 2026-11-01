import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DollarSign,
  Download,
  RefreshCw,
  Users,
  Building2,
  Truck,
  MapPin,
  Calculator,
  Shield,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { profitabilityService } from './profitabilityService.ts';
import { loadService } from '../loads/loadService.ts';
import {
  ProfitabilityFilters as FiltersType,
  ProfitabilitySummary,
  ProfitabilityLoadRow,
  ProfitabilityAlertItem,
  ClientProfitability,
  BrokerProfitability,
  TruckProfitability,
  DriverProfitability,
  LaneProfitability,
} from './profitabilityTypes.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { Client, Broker } from '../../types/domain.types.ts';
import { ProfitabilityKpiStrip } from './ProfitabilityKpiStrip.tsx';
import { ProfitabilityFilters } from './ProfitabilityFilters.tsx';
import { ProfitabilityOverview } from './ProfitabilityOverview.tsx';
import { LoadProfitabilityTable } from './LoadProfitabilityTable.tsx';
import { ClientProfitabilityTable } from './ClientProfitabilityTable.tsx';
import { BrokerProfitabilityTable } from './BrokerProfitabilityTable.tsx';
import { FleetProfitabilityTable } from './FleetProfitabilityTable.tsx';
import { LaneProfitabilityTable } from './LaneProfitabilityTable.tsx';
import { ProfitabilitySandbox } from './ProfitabilitySandbox.tsx';
import { ProfitabilityBreakdownModal } from './ProfitabilityBreakdownModal.tsx';

type WorkspaceTab = 'overview_loads' | 'clients' | 'brokers' | 'fleet' | 'lanes' | 'sandbox';

const DEFAULT_FILTERS: FiltersType = {
  dateRange: 'this_month',
  equipmentType: 'all',
  pipelineStatus: 'all',
  healthStatus: 'all',
};

export const ProfitabilityView: React.FC = () => {
  const { activeOrganization, userRole } = useAuth();
  const orgId = activeOrganization?.id || '';

  // Workspace sub-tab
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview_loads');

  // Filter state
  const [filters, setFilters] = useState<FiltersType>(DEFAULT_FILTERS);

  // Entities for filter dropdowns
  const [clients, setClients] = useState<Client[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);

  // Data states
  const [summary, setSummary] = useState<ProfitabilitySummary>({
    grossRevenue: 0,
    totalMiles: 0,
    totalLoadedMiles: 0,
    totalDeadheadMiles: 0,
    deadheadPercentage: 0,
    averageRpm: 0,
    totalEstimatedCost: 0,
    totalFuelExpense: 0,
    totalDriverPay: 0,
    totalOtherExpenses: 0,
    totalEstimatedProfit: 0,
    averageMargin: 0,
    healthyCount: 0,
    reviewCount: 0,
    lossCount: 0,
    totalLoads: 0,
    bestMargin: 0,
    worstMargin: 0,
  });

  const [rows, setRows] = useState<ProfitabilityLoadRow[]>([]);
  const [alerts, setAlerts] = useState<ProfitabilityAlertItem[]>([]);
  const [clientsData, setClientsData] = useState<ClientProfitability[]>([]);
  const [brokersData, setBrokersData] = useState<BrokerProfitability[]>([]);
  const [trucksData, setTrucksData] = useState<TruckProfitability[]>([]);
  const [driversData, setDriversData] = useState<DriverProfitability[]>([]);
  const [lanesData, setLanesData] = useState<LaneProfitability[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [selectedLoad, setSelectedLoad] = useState<LoadWithRelations | null>(null);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);

  // Load all analytics data
  const loadWorkspaceData = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);

    try {
      // 1. Fetch dropdown options (clients and brokers)
      const [fetchedClients, fetchedBrokers] = await Promise.all([
        loadService.getClients(orgId),
        loadService.getBrokers(orgId),
      ]);
      setClients(fetchedClients);
      setBrokers(fetchedBrokers);

      // 2. Fetch load profitability exactly ONCE
      const calculatedRows = await profitabilityService.getLoadProfitability(orgId, filters);

      // 3. Compute secondary datasets using the SAME calculatedRows
      const [
        calculatedSummary,
        calculatedAlerts,
        calculatedClients,
        calculatedBrokers,
        calculatedTrucks,
        calculatedDrivers,
        calculatedLanes,
      ] = await Promise.all([
        profitabilityService.getProfitabilitySummary(
          orgId,
          filters,
          calculatedRows
        ),
        profitabilityService.getOperationalAlerts(
          orgId,
          filters,
          calculatedRows
        ),
        profitabilityService.getClientProfitability(
          orgId,
          filters,
          calculatedRows
        ),
        profitabilityService.getBrokerProfitability(
          orgId,
          filters,
          calculatedRows
        ),
        profitabilityService.getTruckProfitability(
          orgId,
          filters,
          calculatedRows
        ),
        profitabilityService.getDriverProfitability(
          orgId,
          filters,
          calculatedRows
        ),
        profitabilityService.getLaneProfitability(
          orgId,
          filters,
          calculatedRows
        ),
      ]);

      setRows(calculatedRows);
      setSummary(calculatedSummary);
      setAlerts(calculatedAlerts);
      setClientsData(calculatedClients);
      setBrokersData(calculatedBrokers);
      setTrucksData(calculatedTrucks);
      setDriversData(calculatedDrivers);
      setLanesData(calculatedLanes);
    } catch (err) {
      console.error('Error computing profitability workspace data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, filters]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Compute number of active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateRange !== 'this_month') count++;
    if (filters.clientId) count++;
    if (filters.brokerId) count++;
    if (filters.equipmentType && filters.equipmentType !== 'all') count++;
    if (filters.pipelineStatus && filters.pipelineStatus !== 'all') count++;
    if (filters.healthStatus && filters.healthStatus !== 'all') count++;
    return count;
  }, [filters]);

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // Export CSV handler
  const handleExportCsv = () => {
    if (rows.length === 0) return;

    const headers = [
      'Load #',
      'Status',
      'Client',
      'Broker',
      'Origin City',
      'Origin State',
      'Dest City',
      'Dest State',
      'Equipment',
      'Gross Rate ($)',
      'Loaded Miles',
      'Deadhead Miles',
      'Total Miles',
      'RPM ($/mi)',
      'Fuel Expense ($)',
      'Driver Pay ($)',
      'Other Costs ($)',
      'Total Est Cost ($)',
      'Net Profit ($)',
      'Margin (%)',
      'Health',
    ];

    const csvRows = rows.map((r) => [
      `"${r.load.load_number}"`,
      `"${r.load.pipeline_status}"`,
      `"${r.load.client?.company_name || ''}"`,
      `"${r.load.broker?.company_name || ''}"`,
      `"${r.load.origin_city}"`,
      `"${r.load.origin_state}"`,
      `"${r.load.dest_city}"`,
      `"${r.load.dest_state}"`,
      `"${r.load.equipment_type}"`,
      r.metrics.grossRate.toFixed(2),
      r.metrics.loadedMiles,
      r.metrics.deadheadMiles,
      r.metrics.totalMiles,
      r.metrics.rpm.toFixed(3),
      r.metrics.fuelExpense.toFixed(2),
      r.metrics.driverPay.toFixed(2),
      r.metrics.otherExpenses.toFixed(2),
      r.metrics.totalEstimatedCost.toFixed(2),
      r.metrics.estimatedProfit.toFixed(2),
      r.metrics.profitMargin.toFixed(1),
      `"${r.health}"`,
    ]);

    const csvContent = [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `dispatchdesk_profitability_${activeOrganization?.slug || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSelectLoad = (load: LoadWithRelations) => {
    setSelectedLoad(load);
    setIsBreakdownModalOpen(true);
  };

  const roleLabel = useMemo(() => {
    switch (userRole) {
      case 'owner_admin':
        return { label: 'Owner / Admin (Full Visibility)', color: 'text-purple-400 bg-purple-950/60 border-purple-800/60' };
      case 'dispatcher':
        return { label: 'Dispatcher (Operational Visibility)', color: 'text-indigo-400 bg-indigo-950/60 border-indigo-800/60' };
      default:
        return { label: 'Staff (Read-Only Financials)', color: 'text-slate-400 bg-slate-800/60 border-slate-700/60' };
    }
  }, [userRole]);

  return (
    <div id="profitability-workspace" className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Top Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-400" />
              Profitability & Financial Workspace
            </h1>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${roleLabel.color}`}
            >
              <Shield className="w-3 h-3" />
              {roleLabel.label}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time deterministic revenue, net margins, RPM calculations, and route efficiency for{' '}
            <span className="font-semibold text-slate-200">{activeOrganization?.name || 'Organization'}</span>
          </p>
        </div>

        {/* Global Header Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            id="btn-refresh-profitability"
            onClick={loadWorkspaceData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg text-xs font-semibold text-slate-300 hover:text-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh calculations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            id="btn-export-profitability-csv"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Export calculations to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <ProfitabilityKpiStrip summary={summary} />

      {/* Filter Control Bar */}
      <ProfitabilityFilters
        filters={filters}
        onFilterChange={setFilters}
        clients={clients}
        brokers={brokers}
        activeFilterCount={activeFilterCount}
        resultCount={rows.length}
        onClearFilters={handleClearFilters}
      />

      {/* Workspace Sub-Tab Navigation */}
      <div className="flex border-b border-slate-800 overflow-x-auto gap-1">
        <button
          type="button"
          id="tab-overview-loads"
          onClick={() => setActiveTab('overview_loads')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'overview_loads'
              ? 'border-indigo-500 text-indigo-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Loads Matrix & Health ({rows.length})</span>
        </button>

        <button
          type="button"
          id="tab-carrier-clients"
          onClick={() => setActiveTab('clients')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'clients'
              ? 'border-indigo-500 text-indigo-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Carrier Clients ({clientsData.length})</span>
        </button>

        <button
          type="button"
          id="tab-freight-brokers"
          onClick={() => setActiveTab('brokers')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'brokers'
              ? 'border-indigo-500 text-indigo-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Freight Brokers ({brokersData.length})</span>
        </button>

        <button
          type="button"
          id="tab-fleet-performance"
          onClick={() => setActiveTab('fleet')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'fleet'
              ? 'border-indigo-500 text-indigo-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Fleet & Drivers ({trucksData.length + driversData.length})</span>
        </button>

        <button
          type="button"
          id="tab-lane-analytics"
          onClick={() => setActiveTab('lanes')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'lanes'
              ? 'border-indigo-500 text-indigo-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Lane Analytics ({lanesData.length})</span>
        </button>

        <button
          type="button"
          id="tab-rate-sandbox"
          onClick={() => setActiveTab('sandbox')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'sandbox'
              ? 'border-indigo-500 text-indigo-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Rate & Cost Sandbox</span>
        </button>
      </div>

      {/* Tab Content Panes */}
      <div className="space-y-6">
        {activeTab === 'overview_loads' && (
          <>
            <ProfitabilityOverview
              summary={summary}
              alerts={alerts}
              onSelectLoad={handleSelectLoad}
            />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Dispatch Load Economics ({rows.length})
                </h3>
                <span className="text-[11px] text-slate-400">
                  Click any row to audit mathematical breakdown
                </span>
              </div>
              <LoadProfitabilityTable rows={rows} onSelectLoad={handleSelectLoad} />
            </div>
          </>
        )}

        {activeTab === 'clients' && <ClientProfitabilityTable clientsData={clientsData} />}

        {activeTab === 'brokers' && <BrokerProfitabilityTable brokersData={brokersData} />}

        {activeTab === 'fleet' && (
          <FleetProfitabilityTable trucksData={trucksData} driversData={driversData} />
        )}

        {activeTab === 'lanes' && <LaneProfitabilityTable lanesData={lanesData} />}

        {activeTab === 'sandbox' && <ProfitabilitySandbox />}
      </div>

      {/* Load Profitability Breakdown Audit Modal */}
      <ProfitabilityBreakdownModal
        load={selectedLoad}
        isOpen={isBreakdownModalOpen}
        onClose={() => {
          setIsBreakdownModalOpen(false);
          setSelectedLoad(null);
        }}
      />
    </div>
  );
};
