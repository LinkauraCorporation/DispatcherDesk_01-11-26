import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Truck as TruckIcon, UserCheck, Users } from 'lucide-react';
import { TruckProfitability, DriverProfitability } from './profitabilityTypes.ts';
import { formatCurrency, formatMiles, formatRPM } from '../../lib/calculations.ts';

interface FleetProfitabilityTableProps {
  trucksData: TruckProfitability[];
  driversData: DriverProfitability[];
}

export const FleetProfitabilityTable: React.FC<FleetProfitabilityTableProps> = ({
  trucksData,
  driversData,
}) => {
  const [subTab, setSubTab] = useState<'trucks' | 'drivers'>('trucks');

  const [truckSortField, setTruckSortField] = useState<'number' | 'loads' | 'gross' | 'miles' | 'rpm' | 'profit' | 'margin'>('gross');
  const [truckSortDir, setTruckSortDir] = useState<'asc' | 'desc'>('desc');

  const [driverSortField, setDriverSortField] = useState<'driver' | 'loads' | 'gross' | 'pay' | 'profit' | 'margin'>('gross');
  const [driverSortDir, setDriverSortDir] = useState<'asc' | 'desc'>('desc');

  const handleTruckSort = (field: typeof truckSortField) => {
    if (truckSortField === field) {
      setTruckSortDir(truckSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setTruckSortField(field);
      setTruckSortDir('desc');
    }
  };

  const handleDriverSort = (field: typeof driverSortField) => {
    if (driverSortField === field) {
      setDriverSortDir(driverSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setDriverSortField(field);
      setDriverSortDir('desc');
    }
  };

  const sortedTrucks = useMemo(() => {
    return [...trucksData].sort((a, b) => {
      let comparison = 0;
      switch (truckSortField) {
        case 'number':
          comparison = a.truck.truck_number.localeCompare(b.truck.truck_number);
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
      return truckSortDir === 'asc' ? comparison : -comparison;
    });
  }, [trucksData, truckSortField, truckSortDir]);

  const sortedDrivers = useMemo(() => {
    return [...driversData].sort((a, b) => {
      let comparison = 0;
      switch (driverSortField) {
        case 'driver':
          comparison = a.driver.full_name.localeCompare(b.driver.full_name);
          break;
        case 'loads':
          comparison = a.loadCount - b.loadCount;
          break;
        case 'gross':
          comparison = a.grossRevenue - b.grossRevenue;
          break;
        case 'pay':
          comparison = a.totalDriverPay - b.totalDriverPay;
          break;
        case 'profit':
          comparison = a.estimatedProfit - b.estimatedProfit;
          break;
        case 'margin':
          comparison = a.averageMargin - b.averageMargin;
          break;
      }
      return driverSortDir === 'asc' ? comparison : -comparison;
    });
  }, [driversData, driverSortField, driverSortDir]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden space-y-0">
      {/* Tab Switcher Header */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setSubTab('trucks')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                subTab === 'trucks'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TruckIcon className="w-3.5 h-3.5" />
              <span>Truck Fleet Units ({trucksData.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('drivers')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                subTab === 'drivers'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Drivers & Operators ({driversData.length})</span>
            </button>
          </div>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          Fleet assets mapped to operating margins
        </span>
      </div>

      {/* Trucks View */}
      {subTab === 'trucks' && (
        <div className="overflow-x-auto">
          {sortedTrucks.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No truck data available in this timeframe.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
                  <th
                    onClick={() => handleTruckSort('number')}
                    className="py-3 px-4 cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Truck Unit #</span>
                      {truckSortField === 'number' && (truckSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th className="py-3 px-3 whitespace-nowrap">Carrier Client</th>
                  <th
                    onClick={() => handleTruckSort('loads')}
                    className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Loads</span>
                      {truckSortField === 'loads' && (truckSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => handleTruckSort('gross')}
                    className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Gross Revenue</span>
                      {truckSortField === 'gross' && (truckSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => handleTruckSort('miles')}
                    className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Total Miles</span>
                      {truckSortField === 'miles' && (truckSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => handleTruckSort('rpm')}
                    className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Avg RPM</span>
                      {truckSortField === 'rpm' && (truckSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => handleTruckSort('profit')}
                    className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Est. Net Profit</span>
                      {truckSortField === 'profit' && (truckSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => handleTruckSort('margin')}
                    className="py-3 px-4 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Avg Margin</span>
                      {truckSortField === 'margin' && (truckSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {sortedTrucks.map((item) => (
                  <tr key={item.truck.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-slate-100">
                          Unit {item.truck.truck_number}
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase">
                          {item.truck.equipment_type.replace('_', ' ')} {item.truck.vin ? `• VIN: ...${item.truck.vin.slice(-6)}` : ''}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="text-slate-300 font-medium flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-500" />
                        {item.client?.company_name || 'Fleet Shared'}
                      </span>
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
          )}
        </div>
      )}

      {/* Drivers View */}
      {subTab === 'drivers' && (
        <div className="overflow-x-auto">
          {sortedDrivers.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No driver data available in this timeframe.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
                  <th
                    onClick={() => handleDriverSort('driver')}
                    className="py-3 px-4 cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Driver Full Name</span>
                      {driverSortField === 'driver' && (driverSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th className="py-3 px-3 whitespace-nowrap">Carrier Client</th>
                  <th
                    onClick={() => handleDriverSort('loads')}
                    className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Loads</span>
                      {driverSortField === 'loads' && (driverSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => handleDriverSort('gross')}
                    className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Gross Revenue</span>
                      {driverSortField === 'gross' && (driverSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => handleDriverSort('pay')}
                    className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Driver Pay</span>
                      {driverSortField === 'pay' && (driverSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => handleDriverSort('profit')}
                    className="py-3 px-3 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Carrier Net Profit</span>
                      {driverSortField === 'profit' && (driverSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => handleDriverSort('margin')}
                    className="py-3 px-4 text-right cursor-pointer group hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Carrier Margin</span>
                      {driverSortField === 'margin' && (driverSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {sortedDrivers.map((item) => (
                  <tr key={item.driver.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-100">{item.driver.full_name}</span>
                        <span className="text-[10px] text-slate-400">
                          {item.driver.phone || 'No phone'} • Pay: {item.driver.pay_type.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="text-slate-300 font-medium flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-500" />
                        {item.client?.company_name || 'Fleet Shared'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                      {item.loadCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-100">
                      {formatCurrency(item.grossRevenue)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-400">
                      {formatCurrency(item.totalDriverPay)}
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
          )}
        </div>
      )}
    </div>
  );
};
