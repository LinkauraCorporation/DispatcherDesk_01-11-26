import { loadService } from '../loads/loadService.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import {
  Client,
  Broker,
  Truck,
  Driver,
} from '../../types/domain.types.ts';
import { calculateProfitability } from '../../lib/calculations.ts';
import {
  ProfitabilityFilters,
  ProfitabilityLoadRow,
  ProfitabilitySummary,
  ClientProfitability,
  BrokerProfitability,
  TruckProfitability,
  DriverProfitability,
  LaneProfitability,
  ProfitabilityStatus,
  ProfitabilityAlertItem,
} from './profitabilityTypes.ts';

class ProfitabilityService {
  /**
   * Helper to determine if a load falls within the selected date range.
   */
  private isWithinDateRange(
    dateStr: string | null | undefined,
    fallbackDateStr: string,
    filters: ProfitabilityFilters
  ): boolean {
    if (filters.dateRange === 'all_time') return true;

    const targetDate = new Date(dateStr || fallbackDateStr);
    if (isNaN(targetDate.getTime())) return true;

    const now = new Date();

    switch (filters.dateRange) {
      case 'today': {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return targetDate >= startOfToday && targetDate <= endOfToday;
      }
      case 'last_7_days': {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return targetDate >= sevenDaysAgo && targetDate <= now;
      }
      case 'last_30_days': {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return targetDate >= thirtyDaysAgo && targetDate <= now;
      }
      case 'this_month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        return targetDate >= startOfMonth;
      }
      case 'custom': {
        if (!filters.customStartDate && !filters.customEndDate) return true;
        let valid = true;
        if (filters.customStartDate) {
          const customStart = new Date(`${filters.customStartDate}T00:00:00`);
          if (!isNaN(customStart.getTime())) {
            valid = valid && targetDate >= customStart;
          }
        }
        if (filters.customEndDate) {
          const customEnd = new Date(`${filters.customEndDate}T23:59:59.999`);
          if (!isNaN(customEnd.getTime())) {
            valid = valid && targetDate <= customEnd;
          }
        }
        return valid;
      }
      default:
        return true;
    }
  }

  /**
   * Evaluates health and flags for a single load row.
   */
  private buildLoadRow(load: LoadWithRelations): ProfitabilityLoadRow {
    const metrics = calculateProfitability({
      rate: Number(load.rate || 0),
      loadedMiles: Number(load.loaded_miles || 0),
      deadheadMiles: Number(load.deadhead_miles || 0),
      fuelExpense: Number(load.fuel_expense || 0),
      driverPay: Number(load.driver_pay || 0),
      otherExpenses: Number(load.other_expenses || 0),
    });

    let health: ProfitabilityStatus = 'healthy';
    if (metrics.profitMargin < 0) {
      health = 'loss';
    } else if (metrics.profitMargin < 15) {
      health = 'review';
    }

    const deadheadPercentage =
      metrics.totalMiles > 0
        ? Number(((metrics.deadheadMiles / metrics.totalMiles) * 100).toFixed(1))
        : 0;

    const isLossMaking = metrics.estimatedProfit < 0;

    // Check client minimum RPM threshold if configured, otherwise flag < $1.75
    const clientMinRpm = (load.client as any)?.minimum_rate_per_mile
      ? Number((load.client as any).minimum_rate_per_mile)
      : 0;
    const isLowRpm =
      metrics.totalMiles > 0 &&
      (clientMinRpm > 0 ? metrics.rpm < clientMinRpm : metrics.rpm < 1.75);

    // High deadhead threshold: > 20% of total route miles
    const isHighDeadhead = deadheadPercentage > 20 && metrics.deadheadMiles >= 30;

    const isMarginReview = metrics.profitMargin >= 0 && metrics.profitMargin < 15;

    return {
      load: load as any,
      metrics,
      health,
      deadheadPercentage,
      isLossMaking,
      isLowRpm,
      isHighDeadhead,
      isMarginReview,
    };
  }

  /**
   * Fetches and filters organization load profitability rows.
   */
  async getLoadProfitability(
    organizationId: string,
    filters: ProfitabilityFilters
  ): Promise<ProfitabilityLoadRow[]> {
    if (!organizationId) return [];

    const allLoads = await loadService.getLoads(organizationId);

    const rows: ProfitabilityLoadRow[] = [];

    for (const load of allLoads) {
      // Date filter (pickup_datetime preferred, fallback to created_at)
      if (!this.isWithinDateRange(load.pickup_datetime, load.created_at, filters)) {
        continue;
      }

      // Client filter
      if (filters.clientId && load.client_id !== filters.clientId) {
        continue;
      }

      // Broker filter
      if (filters.brokerId && load.broker_id !== filters.brokerId) {
        continue;
      }

      // Equipment filter
      if (
        filters.equipmentType &&
        filters.equipmentType !== 'all' &&
        load.equipment_type !== filters.equipmentType
      ) {
        continue;
      }

      // Pipeline status filter
      if (
        filters.pipelineStatus &&
        filters.pipelineStatus !== 'all' &&
        load.pipeline_status !== filters.pipelineStatus
      ) {
        continue;
      }

      const row = this.buildLoadRow(load);

      // Health status filter
      if (
        filters.healthStatus &&
        filters.healthStatus !== 'all' &&
        row.health !== filters.healthStatus
      ) {
        continue;
      }

      rows.push(row);
    }

    return rows;
  }

  /**
   * Calculates high-level aggregate summary metrics for the filtered loads.
   */
  async getProfitabilitySummary(
    organizationId: string,
    filters: ProfitabilityFilters,
    precomputedRows?: ProfitabilityLoadRow[]
  ): Promise<ProfitabilitySummary> {
    const rows =
      precomputedRows ??
      (await this.getLoadProfitability(organizationId, filters));

    if (rows.length === 0) {
      return {
        totalLoads: 0,
        grossRevenue: 0,
        totalFuelExpense: 0,
        totalDriverPay: 0,
        totalOtherExpenses: 0,
        totalEstimatedCost: 0,
        totalEstimatedProfit: 0,
        averageMargin: 0,
        totalMiles: 0,
        totalLoadedMiles: 0,
        totalDeadheadMiles: 0,
        deadheadPercentage: 0,
        averageRpm: 0,
        healthyCount: 0,
        reviewCount: 0,
        lossCount: 0,
        bestMargin: 0,
        worstMargin: 0,
      };
    }

    let grossRevenue = 0;
    let totalFuelExpense = 0;
    let totalDriverPay = 0;
    let totalOtherExpenses = 0;
    let totalEstimatedCost = 0;
    let totalLoadedMiles = 0;
    let totalDeadheadMiles = 0;
    let healthyCount = 0;
    let reviewCount = 0;
    let lossCount = 0;
    let bestMargin = -Infinity;
    let worstMargin = Infinity;

    for (const r of rows) {
      grossRevenue += r.metrics.grossRate;
      totalFuelExpense += r.metrics.fuelExpense;
      totalDriverPay += r.metrics.driverPay;
      totalOtherExpenses += r.metrics.otherExpenses;
      totalEstimatedCost += r.metrics.totalEstimatedCost;
      totalLoadedMiles += r.metrics.loadedMiles;
      totalDeadheadMiles += r.metrics.deadheadMiles;

      if (r.health === 'healthy') healthyCount++;
      else if (r.health === 'review') reviewCount++;
      else if (r.health === 'loss') lossCount++;

      if (r.metrics.profitMargin > bestMargin) bestMargin = r.metrics.profitMargin;
      if (r.metrics.profitMargin < worstMargin) worstMargin = r.metrics.profitMargin;
    }

    const totalMiles = totalLoadedMiles + totalDeadheadMiles;
    const totalEstimatedProfit = Number((grossRevenue - totalEstimatedCost).toFixed(2));
    const averageMargin = grossRevenue > 0 ? Number(((totalEstimatedProfit / grossRevenue) * 100).toFixed(2)) : 0;
    const deadheadPercentage = totalMiles > 0 ? Number(((totalDeadheadMiles / totalMiles) * 100).toFixed(1)) : 0;
    const averageRpm = totalMiles > 0 ? Number((grossRevenue / totalMiles).toFixed(2)) : 0;

    return {
      totalLoads: rows.length,
      grossRevenue: Number(grossRevenue.toFixed(2)),
      totalFuelExpense: Number(totalFuelExpense.toFixed(2)),
      totalDriverPay: Number(totalDriverPay.toFixed(2)),
      totalOtherExpenses: Number(totalOtherExpenses.toFixed(2)),
      totalEstimatedCost: Number(totalEstimatedCost.toFixed(2)),
      totalEstimatedProfit,
      averageMargin,
      totalMiles: Number(totalMiles.toFixed(2)),
      totalLoadedMiles: Number(totalLoadedMiles.toFixed(2)),
      totalDeadheadMiles: Number(totalDeadheadMiles.toFixed(2)),
      deadheadPercentage,
      averageRpm,
      healthyCount,
      reviewCount,
      lossCount,
      bestMargin: bestMargin === -Infinity ? 0 : bestMargin,
      worstMargin: worstMargin === Infinity ? 0 : worstMargin,
    };
  }

  /**
   * Aggregates profitability grouped by Client.
   */
  async getClientProfitability(
    organizationId: string,
    filters: ProfitabilityFilters,
    precomputedRows?: ProfitabilityLoadRow[]
  ): Promise<ClientProfitability[]> {
    const rows =
      precomputedRows ??
      (await this.getLoadProfitability(organizationId, filters));
    const map = new Map<string, { client: Client; rows: ProfitabilityLoadRow[] }>();

    for (const r of rows) {
      if (!r.load.client) continue;
      const cId = r.load.client.id;
      if (!map.has(cId)) {
        map.set(cId, { client: r.load.client as any, rows: [] });
      }
      map.get(cId)!.rows.push(r);
    }

    const results: ClientProfitability[] = [];
    for (const { client, rows: cRows } of map.values()) {
      let gross = 0;
      let miles = 0;
      let cost = 0;
      let driverPay = 0;

      for (const cr of cRows) {
        gross += cr.metrics.grossRate;
        miles += cr.metrics.totalMiles;
        cost += cr.metrics.totalEstimatedCost;
        driverPay += cr.metrics.driverPay;
      }

      const profit = Number((gross - cost).toFixed(2));
      const margin = gross > 0 ? Number(((profit / gross) * 100).toFixed(2)) : 0;
      const rpm = miles > 0 ? Number((gross / miles).toFixed(2)) : 0;

      results.push({
        client,
        loadCount: cRows.length,
        grossRevenue: Number(gross.toFixed(2)),
        totalMiles: Number(miles.toFixed(2)),
        averageRpm: rpm,
        totalEstimatedCost: Number(cost.toFixed(2)),
        estimatedProfit: profit,
        averageMargin: margin,
        totalDriverPay: Number(driverPay.toFixed(2)),
      });
    }

    return results.sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  /**
   * Aggregates profitability grouped by Broker.
   */
  async getBrokerProfitability(
    organizationId: string,
    filters: ProfitabilityFilters,
    precomputedRows?: ProfitabilityLoadRow[]
  ): Promise<BrokerProfitability[]> {
    const rows =
      precomputedRows ??
      (await this.getLoadProfitability(organizationId, filters));
    const map = new Map<string, { broker: Broker; rows: ProfitabilityLoadRow[] }>();

    for (const r of rows) {
      if (!r.load.broker) continue;
      const bId = r.load.broker.id;
      if (!map.has(bId)) {
        map.set(bId, { broker: r.load.broker as any, rows: [] });
      }
      map.get(bId)!.rows.push(r);
    }

    const results: BrokerProfitability[] = [];
    for (const { broker, rows: bRows } of map.values()) {
      let gross = 0;
      let miles = 0;
      let cost = 0;

      for (const br of bRows) {
        gross += br.metrics.grossRate;
        miles += br.metrics.totalMiles;
        cost += br.metrics.totalEstimatedCost;
      }

      const profit = Number((gross - cost).toFixed(2));
      const margin = gross > 0 ? Number(((profit / gross) * 100).toFixed(2)) : 0;
      const rpm = miles > 0 ? Number((gross / miles).toFixed(2)) : 0;

      results.push({
        broker,
        loadCount: bRows.length,
        grossRevenue: Number(gross.toFixed(2)),
        totalMiles: Number(miles.toFixed(2)),
        averageRpm: rpm,
        totalEstimatedCost: Number(cost.toFixed(2)),
        estimatedProfit: profit,
        averageMargin: margin,
      });
    }

    return results.sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  /**
   * Aggregates profitability grouped by Truck.
   */
  async getTruckProfitability(
    organizationId: string,
    filters: ProfitabilityFilters,
    precomputedRows?: ProfitabilityLoadRow[]
  ): Promise<TruckProfitability[]> {
    const rows =
      precomputedRows ??
      (await this.getLoadProfitability(organizationId, filters));
    const map = new Map<string, { truck: Truck; client?: Client | null; rows: ProfitabilityLoadRow[] }>();

    for (const r of rows) {
      if (!r.load.truck) continue;
      const tId = r.load.truck.id;
      if (!map.has(tId)) {
        map.set(tId, { truck: r.load.truck as any, client: r.load.client as any, rows: [] });
      }
      map.get(tId)!.rows.push(r);
    }

    const results: TruckProfitability[] = [];
    for (const { truck, client, rows: tRows } of map.values()) {
      let gross = 0;
      let miles = 0;
      let cost = 0;

      for (const tr of tRows) {
        gross += tr.metrics.grossRate;
        miles += tr.metrics.totalMiles;
        cost += tr.metrics.totalEstimatedCost;
      }

      const profit = Number((gross - cost).toFixed(2));
      const margin = gross > 0 ? Number(((profit / gross) * 100).toFixed(2)) : 0;
      const rpm = miles > 0 ? Number((gross / miles).toFixed(2)) : 0;

      results.push({
        truck,
        client,
        loadCount: tRows.length,
        grossRevenue: Number(gross.toFixed(2)),
        totalMiles: Number(miles.toFixed(2)),
        averageRpm: rpm,
        totalEstimatedCost: Number(cost.toFixed(2)),
        estimatedProfit: profit,
        averageMargin: margin,
      });
    }

    return results.sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  /**
   * Aggregates profitability grouped by Driver.
   */
  async getDriverProfitability(
    organizationId: string,
    filters: ProfitabilityFilters,
    precomputedRows?: ProfitabilityLoadRow[]
  ): Promise<DriverProfitability[]> {
    const rows =
      precomputedRows ??
      (await this.getLoadProfitability(organizationId, filters));
    const map = new Map<string, { driver: Driver; client?: Client | null; rows: ProfitabilityLoadRow[] }>();

    for (const r of rows) {
      if (!r.load.driver) continue;
      const dId = r.load.driver.id;
      if (!map.has(dId)) {
        map.set(dId, { driver: r.load.driver as any, client: r.load.client as any, rows: [] });
      }
      map.get(dId)!.rows.push(r);
    }

    const results: DriverProfitability[] = [];
    for (const { driver, client, rows: dRows } of map.values()) {
      let gross = 0;
      let miles = 0;
      let driverPay = 0;
      let cost = 0;

      for (const dr of dRows) {
        gross += dr.metrics.grossRate;
        miles += dr.metrics.totalMiles;
        driverPay += dr.metrics.driverPay;
        cost += dr.metrics.totalEstimatedCost;
      }

      const profit = Number((gross - cost).toFixed(2));
      const margin = gross > 0 ? Number(((profit / gross) * 100).toFixed(2)) : 0;

      results.push({
        driver,
        client,
        loadCount: dRows.length,
        grossRevenue: Number(gross.toFixed(2)),
        totalMiles: Number(miles.toFixed(2)),
        totalDriverPay: Number(driverPay.toFixed(2)),
        totalEstimatedCost: Number(cost.toFixed(2)),
        estimatedProfit: profit,
        averageMargin: margin,
      });
    }

    return results.sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  /**
   * Aggregates profitability grouped by Lane (Origin State → Destination State).
   */
  async getLaneProfitability(
    organizationId: string,
    filters: ProfitabilityFilters,
    precomputedRows?: ProfitabilityLoadRow[]
  ): Promise<LaneProfitability[]> {
    const rows =
      precomputedRows ??
      (await this.getLoadProfitability(organizationId, filters));
    const map = new Map<string, { originState: string; destState: string; rows: ProfitabilityLoadRow[] }>();

    for (const r of rows) {
      const originState = r.load.origin_state?.trim().toUpperCase() || 'UNK';
      const destState = r.load.dest_state?.trim().toUpperCase() || 'UNK';
      const laneKey = `${originState} → ${destState}`;

      if (!map.has(laneKey)) {
        map.set(laneKey, { originState, destState, rows: [] });
      }
      map.get(laneKey)!.rows.push(r);
    }

    const results: LaneProfitability[] = [];
    for (const [laneKey, { originState, destState, rows: lRows }] of map.entries()) {
      let gross = 0;
      let miles = 0;
      let cost = 0;

      for (const lr of lRows) {
        gross += lr.metrics.grossRate;
        miles += lr.metrics.totalMiles;
        cost += lr.metrics.totalEstimatedCost;
      }

      const profit = Number((gross - cost).toFixed(2));
      const margin = gross > 0 ? Number(((profit / gross) * 100).toFixed(2)) : 0;
      const rpm = miles > 0 ? Number((gross / miles).toFixed(2)) : 0;

      const isStrong = margin >= 15 && rpm >= 2.10;
      const isWeak = margin < 10 || rpm < 1.75;

      results.push({
        laneKey,
        originState,
        destState,
        loadCount: lRows.length,
        grossRevenue: Number(gross.toFixed(2)),
        totalMiles: Number(miles.toFixed(2)),
        averageRpm: rpm,
        totalEstimatedCost: Number(cost.toFixed(2)),
        estimatedProfit: profit,
        averageMargin: margin,
        isStrong,
        isWeak,
      });
    }

    return results.sort((a, b) => b.loadCount - a.loadCount || b.grossRevenue - a.grossRevenue);
  }

  /**
   * Generates actionable operational alerts for financial decision support.
   */
  async getOperationalAlerts(
    organizationId: string,
    filters: ProfitabilityFilters,
    precomputedRows?: ProfitabilityLoadRow[]
  ): Promise<ProfitabilityAlertItem[]> {
    const rows =
      precomputedRows ??
      (await this.getLoadProfitability(organizationId, filters));
    const alerts: ProfitabilityAlertItem[] = [];

    for (const r of rows) {
      if (r.isLossMaking) {
        alerts.push({
          id: `alert-loss-${r.load.id}`,
          category: 'loss',
          title: `Negative Profit: ${r.load.load_number}`,
          description: `Estimated loss of $${Math.abs(r.metrics.estimatedProfit).toFixed(2)} (${r.metrics.profitMargin}% margin). Total cost exceeds gross broker rate.`,
          severity: 'high',
          load: r.load,
          metrics: r.metrics,
        });
      } else if (r.isLowRpm) {
        const clientMin = (r.load.client as any)?.minimum_rate_per_mile;
        alerts.push({
          id: `alert-low-rpm-${r.load.id}`,
          category: 'low_rpm',
          title: `Low RPM Load: ${r.load.load_number}`,
          description: `Rate per mile is $${r.metrics.rpm.toFixed(2)}/mi${clientMin ? ` (below client minimum $${clientMin}/mi)` : ' (below $1.75/mi floor)'}.`,
          severity: 'warning',
          load: r.load,
          metrics: r.metrics,
        });
      } else if (r.isHighDeadhead) {
        alerts.push({
          id: `alert-deadhead-${r.load.id}`,
          category: 'high_deadhead',
          title: `Excessive Deadhead: ${r.load.load_number}`,
          description: `${r.metrics.deadheadMiles} deadhead miles represents ${r.deadheadPercentage}% of the total route.`,
          severity: 'warning',
          load: r.load,
          metrics: r.metrics,
        });
      } else if (r.isMarginReview) {
        alerts.push({
          id: `alert-review-${r.load.id}`,
          category: 'margin_review',
          title: `Thin Margin Review: ${r.load.load_number}`,
          description: `Margin is ${r.metrics.profitMargin}%, below target 15% threshold for sustainable operations.`,
          severity: 'info',
          load: r.load,
          metrics: r.metrics,
        });
      }
    }

    return alerts;
  }
}

export const profitabilityService = new ProfitabilityService();
