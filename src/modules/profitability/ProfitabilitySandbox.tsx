import React, { useState } from 'react';
import {
  Calculator,
  RotateCcw,
  Fuel,
  UserCheck,
  Percent,
} from 'lucide-react';
import { LoadProfitabilityCard } from '../loads/LoadProfitabilityCard.tsx';
import {
  calculateProfitability,
  estimateDriverPay,
  estimateFuelCost,
  formatCurrency,
} from '../../lib/calculations.ts';

export const ProfitabilitySandbox: React.FC = () => {
  const [grossRate, setGrossRate] = useState<string>('3200');
  const [loadedMiles, setLoadedMiles] = useState<string>('1050');
  const [deadheadMiles, setDeadheadMiles] = useState<string>('75');
  const [driverPayType, setDriverPayType] = useState<'percentage_gross' | 'per_mile' | 'flat_rate'>('percentage_gross');
  const [driverRateVal, setDriverRateVal] = useState<string>('25');
  const [avgMpg, setAvgMpg] = useState<string>('6.5');
  const [dieselPrice, setDieselPrice] = useState<string>('3.90');
  const [otherTolls, setOtherTolls] = useState<string>('120');

  const rateNum = Math.max(0, parseFloat(grossRate) || 0);
  const loadedNum = Math.max(0, parseFloat(loadedMiles) || 0);
  const deadheadNum = Math.max(0, parseFloat(deadheadMiles) || 0);
  const totalMilesNum = loadedNum + deadheadNum;

  const calculatedFuel = estimateFuelCost(
    totalMilesNum,
    parseFloat(avgMpg) || 6.5,
    parseFloat(dieselPrice) || 3.90
  );

  const calculatedDriverPay = estimateDriverPay(
    driverPayType,
    parseFloat(driverRateVal) || 0,
    rateNum,
    loadedNum,
    deadheadNum
  );

  const metrics = calculateProfitability({
    rate: rateNum,
    loadedMiles: loadedNum,
    deadheadMiles: deadheadNum,
    fuelExpense: calculatedFuel,
    driverPay: calculatedDriverPay,
    otherExpenses: parseFloat(otherTolls) || 0,
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-400" />
          <div>
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Dispatcher Rate & Cost Scenario Sandbox
            </h2>
            <p className="text-xs text-slate-400">
              Simulate spot rates, equipment burn, and driver splits before booking loads with brokers.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setGrossRate('3200');
            setLoadedMiles('1050');
            setDeadheadMiles('75');
            setDriverRateVal('25');
            setDieselPrice('3.90');
            setAvgMpg('6.5');
            setOtherTolls('120');
          }}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Defaults</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        {/* Left Parameter Inputs */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Gross Broker Rate ($)</label>
              <input
                type="number"
                value={grossRate}
                onChange={(e) => setGrossRate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 font-bold font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Loaded Miles (mi)</label>
              <input
                type="number"
                value={loadedMiles}
                onChange={(e) => setLoadedMiles(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Deadhead Miles (mi)</label>
              <input
                type="number"
                value={deadheadMiles}
                onChange={(e) => setDeadheadMiles(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Fuel Modeling */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-[11px] uppercase">
              <Fuel className="w-4 h-4" />
              <span>Deterministic Fuel Modeling</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Average Truck MPG</label>
                <input
                  type="number"
                  step="0.1"
                  value={avgMpg}
                  onChange={(e) => setAvgMpg(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Diesel Price ($/gal)</label>
                <input
                  type="number"
                  step="0.01"
                  value={dieselPrice}
                  onChange={(e) => setDieselPrice(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono"
                />
              </div>
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>Gallons needed: {(totalMilesNum / (parseFloat(avgMpg) || 6.5)).toFixed(1)} gal</span>
              <span className="text-slate-200 font-bold font-mono">Calculated Fuel: {formatCurrency(calculatedFuel)}</span>
            </div>
          </div>

          {/* Driver Compensation */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold text-[11px] uppercase">
              <UserCheck className="w-4 h-4" />
              <span>Driver Compensation Model</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Contract Type</label>
                <select
                  value={driverPayType}
                  onChange={(e) => setDriverPayType(e.target.value as 'percentage_gross' | 'per_mile' | 'flat_rate')}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                >
                  <option value="percentage_gross">% of Gross Rate</option>
                  <option value="per_mile">Per Total Mile ($/mi)</option>
                  <option value="flat_rate">Flat Rate Per Load</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Rate Value</label>
                <input
                  type="number"
                  step="0.01"
                  value={driverRateVal}
                  onChange={(e) => setDriverRateVal(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono"
                />
              </div>
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>Driver Model: {driverPayType.replace('_', ' ')}</span>
              <span className="text-slate-200 font-bold font-mono">Calculated Pay: {formatCurrency(calculatedDriverPay)}</span>
            </div>
          </div>

          {/* Tolls & Accessorials */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">Tolls, Lumpers & Accessorials ($)</label>
            <input
              type="number"
              value={otherTolls}
              onChange={(e) => setOtherTolls(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 font-mono"
            />
          </div>
        </div>

        {/* Right Live Mathematical Breakdown */}
        <div>
          <LoadProfitabilityCard
            rate={rateNum}
            loadedMiles={loadedNum}
            deadheadMiles={deadheadNum}
            fuelExpense={calculatedFuel}
            driverPay={calculatedDriverPay}
            otherExpenses={parseFloat(otherTolls) || 0}
          />

          <div className="mt-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
            <h4 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
              Deterministic Formula Audit
            </h4>
            <ul className="space-y-1.5 text-slate-400 font-mono text-[11px]">
              <li>• Total Miles = {loadedNum} loaded + {deadheadNum} deadhead = <strong>{totalMilesNum} mi</strong></li>
              <li>• RPM = {formatCurrency(rateNum)} / {totalMilesNum} mi = <strong>${metrics.rpm.toFixed(3)}/mi</strong></li>
              <li>• Total Cost = {formatCurrency(calculatedFuel)} + {formatCurrency(calculatedDriverPay)} + {formatCurrency(parseFloat(otherTolls) || 0)} = <strong>{formatCurrency(metrics.totalEstimatedCost)}</strong></li>
              <li>• Est. Profit = {formatCurrency(rateNum)} - {formatCurrency(metrics.totalEstimatedCost)} = <strong className={metrics.estimatedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatCurrency(metrics.estimatedProfit)}</strong></li>
              <li>• Margin = ({formatCurrency(metrics.estimatedProfit)} / {formatCurrency(rateNum)}) × 100 = <strong className={metrics.profitMargin >= 15 ? 'text-emerald-400' : 'text-amber-400'}>{metrics.profitMargin}%</strong></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
