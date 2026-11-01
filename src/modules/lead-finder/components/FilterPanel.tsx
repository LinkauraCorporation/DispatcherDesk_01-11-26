import React, { useState } from 'react';
import { Filter, SlidersHorizontal, RotateCcw, HelpCircle, Check, Calendar, Flame } from 'lucide-react';
import { FmcsaFilterConfig, AuthorityDateOption } from '../types/fmcsa';
import { US_STATES } from '../utils/fmcsaParser';
import { resolveDateFilterRange } from '../utils/dateUtils';

interface FilterPanelProps {
  filters: FmcsaFilterConfig;
  onChange: (filters: FmcsaFilterConfig) => void;
  onReset: () => void;
  disabled: boolean;
  discoveredOps: Record<string, number>;
  dateFieldName?: string;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onChange,
  onReset,
  disabled,
  discoveredOps,
  dateFieldName = 'ADD_DATE',
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customOpInput, setCustomOpInput] = useState(filters.forHireCodes.join(', '));

  const handleMinTrucksChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
    onChange({ ...filters, minTrucks: val });
  };

  const handleMaxTrucksChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
    onChange({ ...filters, maxTrucks: val });
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filters, selectedState: e.target.value });
  };

  const toggleCheckbox = (
    key: keyof Pick<
      FmcsaFilterConfig,
      'activeOnly' | 'interstateOnly' | 'forHireOnly' | 'phoneRequired' | 'emailRequired'
    >
  ) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  const toggleDiscoveredCode = (code: string) => {
    const current = filters.forHireCodes.map((c) => c.toUpperCase());
    const codeUpper = code.toUpperCase();
    let updated: string[];
    if (current.includes(codeUpper)) {
      updated = current.filter((c) => c !== codeUpper);
    } else {
      updated = [...current, codeUpper];
    }
    setCustomOpInput(updated.join(', '));
    onChange({ ...filters, forHireCodes: updated });
  };

  const handleCustomOpBlur = () => {
    const codes = customOpInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    onChange({ ...filters, forHireCodes: codes });
  };

  const handleDateOptionChange = (option: AuthorityDateOption) => {
    onChange({ ...filters, authorityDateOption: option });
  };

  // Section 7: New Carrier Leads Campaign Preset
  const handleApplyNewCarrierPreset = () => {
    onChange({
      ...filters,
      authorityDateOption: 'LAST_90',
      activeOnly: true,
      interstateOnly: true,
      forHireOnly: true,
      minTrucks: 5,
      maxTrucks: 20,
      phoneRequired: true,
      emailRequired: true,
      deduplicateDot: true,
    });
  };

  const currentRange = resolveDateFilterRange(
    filters.authorityDateOption,
    filters.customStartDate,
    filters.customEndDate
  );

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
      {/* Header & Quick Campaign Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-800 gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Prospect Filters</h2>
          <span className="text-xs text-neutral-400">· FMCSA Census Parameters</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Section 7 Preset: New Carrier Leads */}
          <button
            type="button"
            onClick={handleApplyNewCarrierPreset}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap cursor-pointer shadow-xs"
            title="Applies: Last 90 Days (ADD_DATE) + Active + Interstate + For-Hire + 5-20 Trucks + Phone & Email + USDOT Deduplication"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
            <span>🔥 New Carrier Leads (90 Days)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showAdvanced ? 'Simple View' : 'Configure Codes'}</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
            title="Reset filters to default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Grid: Columns 1, 2, 3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Fleet Size, State & Encoding */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Fleet Size (Truck Units)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-neutral-400 block mb-1">Min Trucks</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={filters.minTrucks}
                  onChange={handleMinTrucksChange}
                  disabled={disabled}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50"
                />
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 block mb-1">Max Trucks</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={filters.maxTrucks}
                  onChange={handleMaxTrucksChange}
                  disabled={disabled}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50"
                />
              </div>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1.5">
              Standard sweet spot: 5 to 20 power units.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Target State (PHY_STATE)
            </label>
            <select
              value={filters.selectedState}
              onChange={handleStateChange}
              disabled={disabled}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {US_STATES.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.code === 'ALL' ? st.name : `${st.name} (${st.code})`}
                </option>
              ))}
            </select>
          </div>

          {/* Fix 4: Encoding Selector */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Character Encoding
            </label>
            <select
              value={filters.encoding}
              onChange={(e) => onChange({ ...filters, encoding: e.target.value as any })}
              disabled={disabled}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <option value="auto">Auto-Detect (UTF-8 / Windows-1252)</option>
              <option value="utf-8">UTF-8 (Modern Standard)</option>
              <option value="windows-1252">Windows-1252 / ANSI (Legacy FMCSA)</option>
            </select>
          </div>
        </div>

        {/* Column 2: Required Flags & Conditions */}
        <div className="space-y-3">
          <label className="block text-xs font-medium text-neutral-300">
            Prospect Qualification Flags
          </label>

          <div className="space-y-2.5">
            <label className="flex items-center gap-3 p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 cursor-pointer hover:bg-neutral-800/30 transition-colors">
              <input
                type="checkbox"
                checked={filters.activeOnly}
                onChange={() => toggleCheckbox('activeOnly')}
                disabled={disabled}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-neutral-950 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-medium text-white block">Active only</span>
                <span className="text-[11px] text-neutral-400">STATUS_CODE = 'A' (excludes inactive carriers)</span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 cursor-pointer hover:bg-neutral-800/30 transition-colors">
              <input
                type="checkbox"
                checked={filters.interstateOnly}
                onChange={() => toggleCheckbox('interstateOnly')}
                disabled={disabled}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-neutral-950 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-medium text-white block">Interstate only</span>
                <span className="text-[11px] text-neutral-400">Operating across state lines (beyond/within 100mi)</span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 cursor-pointer hover:bg-neutral-800/30 transition-colors">
              <input
                type="checkbox"
                checked={filters.forHireOnly}
                onChange={() => toggleCheckbox('forHireOnly')}
                disabled={disabled}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-neutral-950 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-medium text-white block">For-Hire only</span>
                <span className="text-[11px] text-neutral-400">Commercial freight haulers (Codes: {filters.forHireCodes.join(', ') || 'None'})</span>
              </div>
            </label>

            {/* Fix 3: Deduplicate by USDOT */}
            <label className="flex items-center gap-3 p-2 rounded-lg bg-neutral-950/60 border border-emerald-500/30 cursor-pointer hover:bg-neutral-800/30 transition-colors">
              <input
                type="checkbox"
                checked={filters.deduplicateDot}
                onChange={() => onChange({ ...filters, deduplicateDot: !filters.deduplicateDot })}
                disabled={disabled}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-neutral-950 cursor-pointer"
              />
              <div className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-white">Deduplicate by USDOT</span>
                  <span className="text-[10px] text-emerald-400 font-mono font-medium">(Default: ON)</span>
                </div>
                <span className="text-[11px] text-neutral-400">Keep active/most complete record; remove duplicate filings</span>
              </div>
            </label>
          </div>
        </div>

        {/* Column 3: Contact Channels */}
        <div className="space-y-3">
          <label className="block text-xs font-medium text-neutral-300">
            Contact Verification
          </label>

          <div className="space-y-2.5">
            <label className="flex items-center gap-3 p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 cursor-pointer hover:bg-neutral-800/30 transition-colors">
              <input
                type="checkbox"
                checked={filters.phoneRequired}
                onChange={() => toggleCheckbox('phoneRequired')}
                disabled={disabled}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-neutral-950 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-medium text-white block">Phone required</span>
                <span className="text-[11px] text-neutral-400">Must have valid non-empty telephone</span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 cursor-pointer hover:bg-neutral-800/30 transition-colors">
              <input
                type="checkbox"
                checked={filters.emailRequired}
                onChange={() => toggleCheckbox('emailRequired')}
                disabled={disabled}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-neutral-950 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-medium text-white block">Email required</span>
                <span className="text-[11px] text-neutral-400">Must have valid email address (@domain)</span>
              </div>
            </label>
          </div>

          <div className="p-2.5 bg-neutral-950/40 border border-neutral-800/60 rounded-lg text-[11px] text-neutral-400 space-y-1">
            <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
              <HelpCircle className="w-3.5 h-3.5 text-neutral-400" />
              <span>FMCSA Census Semantics</span>
            </div>
            <div>Raw CARRIER_OPERATION values are preserved untouched in CSV exports.</div>
          </div>
        </div>
      </div>

      {/* SECTION 2: New Carrier Leads Filter (Census Record Date - ADD_DATE) */}
      <div className="pt-4 border-t border-neutral-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-white">
              New Carrier Leads — based on USDOT Census Registration Date ({dateFieldName})
            </h3>
            <span className="text-[11px] text-neutral-400 font-mono">
              · {currentRange.label}
            </span>
          </div>
          <span className="text-[11px] text-neutral-400">
            Source: <span className="font-mono text-neutral-300 font-semibold">{dateFieldName}</span> (USDOT Census Record Creation Date)
          </span>
        </div>

        {/* Date Options Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-neutral-950 border border-neutral-800 rounded-lg">
          {(
            [
              { id: 'ALL', label: 'All Dates' },
              { id: 'LAST_30', label: 'Last 30 Days' },
              { id: 'LAST_90', label: 'Last 90 Days' },
              { id: 'LAST_180', label: 'Last 180 Days' },
              { id: 'LAST_365', label: 'Last 1 Year' },
              { id: 'CUSTOM', label: 'Custom Range' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleDateOptionChange(opt.id)}
              disabled={disabled}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                filters.authorityDateOption === opt.id
                  ? 'bg-neutral-800 text-emerald-400 border border-emerald-500/30'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom Date Range Inputs */}
        {filters.authorityDateOption === 'CUSTOM' && (
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-lg flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-neutral-400">From:</span>
              <input
                type="date"
                value={filters.customStartDate || ''}
                onChange={(e) => onChange({ ...filters, customStartDate: e.target.value })}
                disabled={disabled}
                className="bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-neutral-400">To:</span>
              <input
                type="date"
                value={filters.customEndDate || ''}
                onChange={(e) => onChange({ ...filters, customEndDate: e.target.value })}
                disabled={disabled}
                className="bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <span className="text-[11px] text-neutral-400">
              Both start and end dates are inclusive (calendar date based, no timezone shift).
            </span>
          </div>
        )}

        {/* Transparency note regarding field meaning */}
        <div className="text-[11px] text-neutral-400 bg-neutral-950/40 p-2.5 rounded-lg border border-neutral-800/60 leading-relaxed">
          <span className="font-semibold text-neutral-300">Record Date ({dateFieldName}) — USDOT Census Registration Date: </span>
          The Company Census File records <code className="text-neutral-200">{dateFieldName}</code> (the date the carrier registered its USDOT record in the MCMIS Census database). Note that in official FMCSA records, this represents the initial census entry date rather than the separate Licensing &amp; Insurance (L&amp;I) MC operating authority grant date.
        </div>
      </div>

      {/* Advanced / Configurable Operation Codes Section */}
      {showAdvanced && (
        <div className="pt-4 border-t border-neutral-800/80 space-y-4">
          <div className="bg-neutral-950/80 border border-neutral-800 rounded-lg p-4 space-y-3">
            <div>
              <div className="text-xs font-semibold text-white">
                Configurable For-Hire Operation Codes
              </div>
              <div className="text-[11px] text-neutral-400">
                FMCSA standard: 'A' = Interstate Authorized For-Hire, 'B' = Exempt For-Hire. Modify codes or click discovered codes below.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="w-full sm:w-72">
                <input
                  type="text"
                  value={customOpInput}
                  onChange={(e) => setCustomOpInput(e.target.value)}
                  onBlur={handleCustomOpBlur}
                  disabled={disabled}
                  placeholder="e.g. A, B"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500/80"
                />
              </div>
              <span className="text-[11px] text-neutral-400">
                Comma-separated codes to match against raw CARRIER_OPERATION
              </span>
            </div>

            {/* Dynamic Discovered Codes */}
            {Object.keys(discoveredOps).length > 0 ? (
              <div className="space-y-1.5 pt-2 border-t border-neutral-800/60">
                <div className="text-[11px] font-medium text-neutral-300">
                  Discovered Codes in Source CSV (click to toggle inclusion):
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(discoveredOps).map(([code, count]) => {
                    const isSelected = filters.forHireCodes
                      .map((c) => c.toUpperCase())
                      .includes(code.toUpperCase());
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => toggleDiscoveredCode(code)}
                        disabled={disabled}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-all ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                        <span className="font-mono font-semibold">{code}</span>
                        <span className="text-[10px] text-neutral-500 font-mono">({count.toLocaleString()})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-neutral-500 italic">
                Discovered CARRIER_OPERATION values from your CSV will appear here once scanning begins.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
