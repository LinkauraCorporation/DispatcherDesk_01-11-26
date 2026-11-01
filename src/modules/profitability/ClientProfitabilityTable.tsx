import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Users } from 'lucide-react';
import { ClientProfitability } from './profitabilityTypes.ts';
import { formatCurrency, formatMiles, formatRPM } from '../../lib/calculations.ts';

interface ClientProfitabilityTableProps {
  clientsData: ClientProfitability[];
}

type SortField = 'client' | 'loads' | 'gross' | 'miles' | 'rpm' | 'profit' | 'margin';

export const ClientProfitabilityTable: React.FC<ClientProfitabilityTableProps> = ({ clientsData }) => {
  const [sortField, setSortField] = useState<SortField>('gross');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedData = useMemo(() => {
    return [...clientsData].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'client':
          comparison = a.client.company_name.localeCompare(b.client.company_name);
          break;
        case 'loads':
          comparison = a.loadCount - b.loadCount;
          break;
        case 'gross':
          comparison = a.grossRevenue - b.grossRevenue;
          break;
        case 'miles':
          comparison = a.totalMiles - b.totalMiles;
          break;
        case 'rpm':
          comparison = a.averageRpm - b.averageRpm;
          break;
        case 'profit':
          comparison = a.estimatedProfit - b.estimatedProfit;
          break;
        case 'margin':
          comparison = a.averageMargin - b.averageMargin;
          break;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [clientsData, sortField, sortDir]);

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

  if (clientsData.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
        <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <h4 className="text-xs font-semibold text-slate-300">No Client Data</h4>
        <p className="text-[11px] text-slate-500 mt-1">No client loads in the selected timeframe.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Carrier Client Financial Performance ({clientsData.length})
          </h3>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">Sorted by {sortField} ({sortDir})</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
              <th
                onClick={() => handleSort('client')}
                className="py-3 px-4 cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  <span>Carrier Client</span>
                  {renderSortIcon('client')}
                </div>
              </th>
              <th
                onClick={() => handleSort('loads')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Loads</span>
                  {renderSortIcon('loads')}
                </div>
              </th>
              <th
                onClick={() => handleSort('gross')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Gross Revenue</span>
                  {renderSortIcon('gross')}
                </div>
              </th>
              <th
                onClick={() => handleSort('miles')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Total Miles</span>
                  {renderSortIcon('miles')}
                </div>
              </th>
              <th
                onClick={() => handleSort('rpm')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Avg RPM</span>
                  {renderSortIcon('rpm')}
                </div>
              </th>
              <th
                onClick={() => handleSort('profit')}
                className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Est. Net Profit</span>
                  {renderSortIcon('profit')}
                </div>
              </th>
              <th
                onClick={() => handleSort('margin')}
                className="py-3 px-4 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Avg Margin</span>
                  {renderSortIcon('margin')}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {sortedData.map((item) => (
              <tr key={item.client.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="py-2.5 px-4 whitespace-nowrap">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-100">{item.client.company_name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Type: {item.client.client_type.replace('_', ' ')} • {item.client.contact_name || 'No Contact'}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                  {item.loadCount}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-100">
                  {formatCurrency(item.grossRevenue)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                  {formatMiles(item.totalMiles)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-400">
                  {formatRPM(item.averageRpm)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold">
                  <span className={item.estimatedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {formatCurrency(item.estimatedProfit)}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-right font-mono font-bold">
                  <span
                    className={
                      item.averageMargin >= 15
                        ? 'text-emerald-400'
                        : item.averageMargin >= 0
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }
                  >
                    {item.averageMargin.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
