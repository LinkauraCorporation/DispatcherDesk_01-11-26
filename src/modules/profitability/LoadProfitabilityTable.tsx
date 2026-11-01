import React, { useState, useMemo } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Route,
  Truck as TruckIcon,
  Building2,
  Users,
} from 'lucide-react';
import { ProfitabilityLoadRow } from './profitabilityTypes.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { formatCurrency, formatMiles, formatRPM } from '../../lib/calculations.ts';

interface LoadProfitabilityTableProps {
  rows: ProfitabilityLoadRow[];
  onSelectLoad: (load: LoadWithRelations) => void;
}

type SortField =
  | 'load_number'
  | 'gross'
  | 'miles'
  | 'rpm'
  | 'fuel'
  | 'driver_pay'
  | 'other'
  | 'net_profit'
  | 'margin'
  | 'pickup_date';

type SortDirection = 'asc' | 'desc';

export const LoadProfitabilityTable: React.FC<LoadProfitabilityTableProps> = ({
  rows,
  onSelectLoad,
}) => {
  const [sortField, setSortField] = useState<SortField>('pickup_date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'load_number':
          comparison = a.load.load_number.localeCompare(b.load.load_number);
          break;
        case 'gross':
          comparison = a.metrics.grossRate - b.metrics.grossRate;
          break;
        case 'miles':
          comparison = a.metrics.totalMiles - b.metrics.totalMiles;
          break;
        case 'rpm':
          comparison = a.metrics.rpm - b.metrics.rpm;
          break;
        case 'fuel':
          comparison = a.metrics.fuelExpense - b.metrics.fuelExpense;
          break;
        case 'driver_pay':
          comparison = a.metrics.driverPay - b.metrics.driverPay;
          break;
        case 'other':
          comparison = a.metrics.otherExpenses - b.metrics.otherExpenses;
          break;
        case 'net_profit':
          comparison = a.metrics.estimatedProfit - b.metrics.estimatedProfit;
          break;
        case 'margin':
          comparison = a.metrics.profitMargin - b.metrics.profitMargin;
          break;
        case 'pickup_date': {
          const dateA = new Date(a.load.pickup_datetime || a.load.created_at).getTime();
          const dateB = new Date(b.load.pickup_datetime || b.load.created_at).getTime();
          comparison = dateA - dateB;
          break;
        }
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [rows, sortField, sortDir]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 group-hover:opacity-100" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-400" />
    );
  };

  if (rows.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
        <Route className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">No Loads Found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          No dispatch loads match the current filter criteria or date window. Adjust your filters to inspect load economics.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
              <th
                onClick={() => handleSort('load_number')}
                className="py-3 px-3.5 cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  <span>Load #</span>
                  {renderSortIcon('load_number')}
                </div>
              </th>
              <th className="py-3 px-3 whitespace-nowrap">Client / Broker</th>
              <th className="py-3 px-3 whitespace-nowrap">Route (O → D)</th>
              <th className="py-3 px-3 whitespace-nowrap">Equip / Unit</th>
              <th
                onClick={() => handleSort('gross')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Gross</span>
                  {renderSortIcon('gross')}
                </div>
              </th>
              <th
                onClick={() => handleSort('miles')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Miles</span>
                  {renderSortIcon('miles')}
                </div>
              </th>
              <th
                onClick={() => handleSort('rpm')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>RPM</span>
                  {renderSortIcon('rpm')}
                </div>
              </th>
              <th
                onClick={() => handleSort('fuel')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Est Fuel</span>
                  {renderSortIcon('fuel')}
                </div>
              </th>
              <th
                onClick={() => handleSort('driver_pay')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Driver Pay</span>
                  {renderSortIcon('driver_pay')}
                </div>
              </th>
              <th
                onClick={() => handleSort('other')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Other</span>
                  {renderSortIcon('other')}
                </div>
              </th>
              <th
                onClick={() => handleSort('net_profit')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Net Profit</span>
                  {renderSortIcon('net_profit')}
                </div>
              </th>
              <th
                onClick={() => handleSort('margin')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Margin</span>
                  {renderSortIcon('margin')}
                </div>
              </th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Health</th>
              <th className="py-3 px-3 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {sortedRows.map((r) => {
              const isProfitPositive = r.metrics.estimatedProfit >= 0;
              return (
                <tr
                  key={r.load.id}
                  id={`load-profit-row-${r.load.id}`}
                  onClick={() => onSelectLoad(r.load)}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                >
                  {/* Load Number & Stage */}
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-mono font-bold text-slate-100 group-hover:text-indigo-400 transition-colors">
                        {r.load.load_number}
                      </span>
                      <span className="text-[10px] text-slate-500 capitalize">
                        {r.load.pipeline_status.replace('_', ' ')}
                      </span>
                    </div>
                  </td>

                  {/* Client & Broker */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex flex-col max-w-[150px] truncate">
                      <span className="text-slate-200 truncate flex items-center gap-1 font-medium">
                        <Users className="w-3 h-3 text-slate-400 shrink-0" />
                        {r.load.client?.company_name || '—'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                        <Building2 className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                        {r.load.broker?.company_name || '—'}
                      </span>
                    </div>
                  </td>

                  {/* Route (Origin -> Destination) */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex flex-col max-w-[160px]">
                      <span className="text-slate-200 truncate">
                        {r.load.origin_city}, {r.load.origin_state}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        &rarr; {r.load.dest_city}, {r.load.dest_state}
                      </span>
                    </div>
                  </td>

                  {/* Equipment / Truck */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex flex-col text-[11px]">
                      <span className="text-slate-300 uppercase font-mono text-[10px]">
                        {r.load.equipment_type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                        <TruckIcon className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                        {r.load.truck ? `Unit ${r.load.truck.truck_number}` : 'Unassigned'}
                      </span>
                    </div>
                  </td>

                  {/* Gross Revenue */}
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-100 whitespace-nowrap">
                    {formatCurrency(r.metrics.grossRate)}
                  </td>

                  {/* Total Miles (Loaded / Deadhead) */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono">
                    <div className="flex flex-col items-end">
                      <span className="text-slate-200">{formatMiles(r.metrics.totalMiles)}</span>
                      {r.metrics.deadheadMiles > 0 && (
                        <span className="text-[10px] text-amber-400">
                          +{r.metrics.deadheadMiles} dh
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Rate Per Mile */}
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-400 whitespace-nowrap">
                    {formatRPM(r.metrics.rpm)}
                  </td>

                  {/* Fuel Expense */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                    {formatCurrency(r.metrics.fuelExpense)}
                  </td>

                  {/* Driver Compensation */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                    {formatCurrency(r.metrics.driverPay)}
                  </td>

                  {/* Other Expenses */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-400 whitespace-nowrap">
                    {formatCurrency(r.metrics.otherExpenses)}
                  </td>

                  {/* Net Profit */}
                  <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                    <span className={isProfitPositive ? 'text-emerald-400' : 'text-rose-400'}>
                      {formatCurrency(r.metrics.estimatedProfit)}
                    </span>
                  </td>

                  {/* Profit Margin */}
                  <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                    <span
                      className={
                        r.metrics.profitMargin >= 15
                          ? 'text-emerald-400'
                          : r.metrics.profitMargin >= 0
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }
                    >
                      {r.metrics.profitMargin.toFixed(1)}%
                    </span>
                  </td>

                  {/* Health Badge */}
                  <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                    <StatusBadge status={r.health} type="profitability" size="sm" />
                  </td>

                  {/* Action */}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLoad(r.load);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                      title="Inspect Financial Breakdown"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
