import {
  calculateProfitability,
  estimateDriverPay,
  calculateDriverCompensation,
} from '../../lib/calculations.ts';
import { parseRateConfirmationText } from '../documents/rateConParser.ts';
import { Driver } from '../../types/domain.types.ts';

/**
 * Focused Test Suite for Driver Compensation Contract & Live Profitability Engine
 * Verifies that Driver Pay is derived STRICTLY from existing driver master-data contracts,
 * NOT from RateCon documents.
 */
function runDriverCompensationTests() {
  console.log('======================================================================');
  console.log('RUNNING DRIVER COMPENSATION CONTRACT & PROFITABILITY ENGINE TESTS');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Driver with percentage contract (Gross $2,200, 25% -> Driver Pay $550)
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Driver with percentage contract ---');
  const driverPercentage: Partial<Driver> = {
    id: 'drv-pct-1',
    full_name: 'Marcus Vance',
    pay_type: 'percentage_gross',
    pay_rate: 25,
  };

  const compPct = calculateDriverCompensation(driverPercentage as Driver, 2200, 650, 0);
  if (!compPct.hasValidContract) throw new Error('Test 1 Failed: Expected valid contract');
  if (compPct.driverPay !== 550) throw new Error(`Test 1 Failed: Expected $550, got $${compPct.driverPay}`);
  if (compPct.basisLabel !== '25% of Gross') throw new Error(`Test 1 Failed: Unexpected basis: ${compPct.basisLabel}`);

  const profitPct = calculateProfitability({
    rate: 2200,
    loadedMiles: 650,
    deadheadMiles: 0,
    fuelExpense: 0,
    driverPay: compPct.driverPay,
    otherExpenses: 0,
  });
  if (profitPct.driverPay !== 550) throw new Error('Test 1 Failed: Profitability driverPay mismatch');
  if (profitPct.estimatedProfit !== 1650) throw new Error(`Test 1 Failed: Expected net profit $1,650, got $${profitPct.estimatedProfit}`);
  if (profitPct.profitMargin !== 75) throw new Error(`Test 1 Failed: Expected margin 75%, got ${profitPct.profitMargin}%`);
  console.log('  ✓ PASS: Gross $2,200 @ 25% = $550 driver pay');
  console.log('  ✓ PASS: Net Profit = $1,650, Margin = 75.00%');

  // -------------------------------------------------------------------------
  // TEST 2: Driver with per-mile contract (650 miles, $0.60/mi -> Driver Pay $390)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Driver with per-mile contract ---');
  const driverPerMile: Partial<Driver> = {
    id: 'drv-mile-1',
    full_name: 'Elena Rodriguez',
    pay_type: 'per_mile',
    pay_rate: 0.60,
  };

  const compMile = calculateDriverCompensation(driverPerMile as Driver, 2200, 650, 0);
  if (!compMile.hasValidContract) throw new Error('Test 2 Failed: Expected valid contract');
  if (compMile.driverPay !== 390) throw new Error(`Test 2 Failed: Expected $390, got $${compMile.driverPay}`);
  if (compMile.basisLabel !== '$0.60 / Loaded Mile') throw new Error(`Test 2 Failed: Unexpected basis: ${compMile.basisLabel}`);

  const profitMile = calculateProfitability({
    rate: 2200,
    loadedMiles: 650,
    deadheadMiles: 0,
    fuelExpense: 0,
    driverPay: compMile.driverPay,
    otherExpenses: 0,
  });
  if (profitMile.driverPay !== 390) throw new Error('Test 2 Failed: Profitability driverPay mismatch');
  if (profitMile.estimatedProfit !== 1810) throw new Error(`Test 2 Failed: Expected net profit $1,810, got $${profitMile.estimatedProfit}`);
  if (profitMile.profitMargin !== 82.27) throw new Error(`Test 2 Failed: Expected margin 82.27%, got ${profitMile.profitMargin}%`);
  console.log('  ✓ PASS: 650 loaded miles @ $0.60/mi = $390 driver pay');
  console.log('  ✓ PASS: Net Profit = $1,810, Margin = 82.27%');

  // -------------------------------------------------------------------------
  // TEST 3: Driver with fixed contract ($500 fixed -> Driver Pay $500)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Driver with fixed contract ---');
  const driverFixed: Partial<Driver> = {
    id: 'drv-fixed-1',
    full_name: 'Jackson Miller',
    pay_type: 'flat_rate',
    pay_rate: 500,
  };

  const compFixed = calculateDriverCompensation(driverFixed as Driver, 2200, 650, 0);
  if (!compFixed.hasValidContract) throw new Error('Test 3 Failed: Expected valid contract');
  if (compFixed.driverPay !== 500) throw new Error(`Test 3 Failed: Expected $500, got $${compFixed.driverPay}`);
  if (compFixed.basisLabel !== 'Fixed / Load') throw new Error(`Test 3 Failed: Unexpected basis: ${compFixed.basisLabel}`);

  const profitFixed = calculateProfitability({
    rate: 2200,
    loadedMiles: 650,
    deadheadMiles: 0,
    fuelExpense: 0,
    driverPay: compFixed.driverPay,
    otherExpenses: 0,
  });
  if (profitFixed.estimatedProfit !== 1700) throw new Error(`Test 3 Failed: Expected net profit $1,700, got $${profitFixed.estimatedProfit}`);
  if (profitFixed.profitMargin !== 77.27) throw new Error(`Test 3 Failed: Expected margin 77.27%, got ${profitFixed.profitMargin}%`);
  console.log('  ✓ PASS: Fixed $500 contract = $500 driver pay');
  console.log('  ✓ PASS: Net Profit = $1,700, Margin = 77.27%');

  // -------------------------------------------------------------------------
  // TEST 4: Changing Gross Rate updates percentage Driver Pay and margin
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Changing Gross Rate updates percentage Driver Pay and margin ---');
  const updatedGrossComp = calculateDriverCompensation(driverPercentage as Driver, 3000, 650, 0);
  if (updatedGrossComp.driverPay !== 750) throw new Error(`Test 4 Failed: Expected $750 on $3,000 gross, got $${updatedGrossComp.driverPay}`);

  const updatedGrossProfit = calculateProfitability({
    rate: 3000,
    loadedMiles: 650,
    deadheadMiles: 0,
    fuelExpense: 0,
    driverPay: updatedGrossComp.driverPay,
    otherExpenses: 0,
  });
  if (updatedGrossProfit.estimatedProfit !== 2250) throw new Error(`Test 4 Failed: Expected profit $2,250, got $${updatedGrossProfit.estimatedProfit}`);
  if (updatedGrossProfit.profitMargin !== 75) throw new Error(`Test 4 Failed: Expected margin 75%, got ${updatedGrossProfit.profitMargin}%`);
  console.log('  ✓ PASS: Gross updated to $3,000 -> Driver Pay updated to $750 (25%)');
  console.log('  ✓ PASS: Net Profit updated to $2,250, Margin = 75.00%');

  // -------------------------------------------------------------------------
  // TEST 5: Changing applicable miles updates per-mile Driver Pay and margin
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Changing applicable miles updates per-mile Driver Pay and margin ---');
  const updatedMilesComp = calculateDriverCompensation(driverPerMile as Driver, 2200, 800, 0);
  if (updatedMilesComp.driverPay !== 480) throw new Error(`Test 5 Failed: Expected $480 on 800 miles, got $${updatedMilesComp.driverPay}`);

  const updatedMilesProfit = calculateProfitability({
    rate: 2200,
    loadedMiles: 800,
    deadheadMiles: 0,
    fuelExpense: 0,
    driverPay: updatedMilesComp.driverPay,
    otherExpenses: 0,
  });
  if (updatedMilesProfit.estimatedProfit !== 1720) throw new Error(`Test 5 Failed: Expected profit $1,720, got $${updatedMilesProfit.estimatedProfit}`);
  if (updatedMilesProfit.profitMargin !== 78.18) throw new Error(`Test 5 Failed: Expected margin 78.18%, got ${updatedMilesProfit.profitMargin}%`);
  console.log('  ✓ PASS: Miles updated to 800 -> Driver Pay updated to $480 ($0.60 * 800)');
  console.log('  ✓ PASS: Net Profit updated to $1,720, Margin = 78.18%');

  // -------------------------------------------------------------------------
  // TEST 6: Changing selected Driver immediately switches Driver Pay
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Changing selected Driver switches contract immediately ---');
  let activeDriver: Partial<Driver> = driverPercentage;
  let comp = calculateDriverCompensation(activeDriver as Driver, 2200, 650, 0);
  if (comp.driverPay !== 550) throw new Error('Test 6 Failed: Initial driver pay mismatch');

  // Switch to Elena (per-mile)
  activeDriver = driverPerMile;
  comp = calculateDriverCompensation(activeDriver as Driver, 2200, 650, 0);
  if (comp.driverPay !== 390) throw new Error('Test 6 Failed: Per-mile switch failed');

  // Switch to Jackson (fixed)
  activeDriver = driverFixed;
  comp = calculateDriverCompensation(activeDriver as Driver, 2200, 650, 0);
  if (comp.driverPay !== 500) throw new Error('Test 6 Failed: Flat rate switch failed');
  console.log('  ✓ PASS: Switched dynamically from Marcus ($550) -> Elena ($390) -> Jackson ($500)');

  // -------------------------------------------------------------------------
  // TEST 7: Driver without compensation configuration shows warning and does not invent pay
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: Driver without compensation configuration ---');
  const unconfiguredDriver: Partial<Driver> = {
    id: 'drv-unconfigured',
    full_name: 'John Standby',
    pay_type: 'percentage_gross',
    pay_rate: 0,
  };

  const unconfiguredComp = calculateDriverCompensation(unconfiguredDriver as Driver, 2200, 650, 0);
  if (unconfiguredComp.hasValidContract !== false) throw new Error('Test 7 Failed: Expected hasValidContract to be false');
  if (unconfiguredComp.driverPay !== 0) throw new Error('Test 7 Failed: Expected driverPay 0, not invented value');
  if (!unconfiguredComp.basisLabel.includes('not configured')) throw new Error('Test 7 Failed: Expected warning label');

  const unconfiguredProfit = calculateProfitability({
    rate: 2200,
    loadedMiles: 650,
    deadheadMiles: 0,
    driverPay: unconfiguredComp.driverPay,
  });
  if (unconfiguredProfit.driverPay !== 0) throw new Error('Test 7 Failed: Profitability should treat unconfigured as 0');
  console.log('  ✓ PASS: Driver with pay_rate: 0 shows "⚠ Driver compensation not configured"');
  console.log('  ✓ PASS: No rate invented (driverPay = 0)');

  // -------------------------------------------------------------------------
  // TEST 8: No Driver selected does not falsely imply that $0 is driver's contract
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 8: No Driver selected ---');
  const noDriverComp = calculateDriverCompensation(null, 2200, 650, 0);
  if (noDriverComp.hasDriver !== false) throw new Error('Test 8 Failed: Expected hasDriver false');
  if (noDriverComp.hasValidContract !== false) throw new Error('Test 8 Failed: Expected hasValidContract false');
  if (noDriverComp.driverPay !== 0) throw new Error('Test 8 Failed: driverPay should be 0');
  if (noDriverComp.basisLabel !== 'No driver selected') throw new Error(`Test 8 Failed: Unexpected label ${noDriverComp.basisLabel}`);
  console.log('  ✓ PASS: When driver is null, basis is "No driver selected"');

  // -------------------------------------------------------------------------
  // TEST 9: Fuel Expense and Other Costs continue to reduce Net Profit
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 9: Fuel Expense and Other Costs reduce Net Profit ---');
  const fullCostProfit = calculateProfitability({
    rate: 2200,
    loadedMiles: 650,
    deadheadMiles: 0,
    driverPay: 550, // Marcus 25%
    fuelExpense: 300,
    otherExpenses: 100,
  });
  // Total costs = 550 + 300 + 100 = 950
  // Net profit = 2200 - 950 = 1250
  // Margin = (1250 / 2200) * 100 = 56.82%
  if (fullCostProfit.totalEstimatedCost !== 950) throw new Error(`Test 9 Failed: Expected total costs $950, got $${fullCostProfit.totalEstimatedCost}`);
  if (fullCostProfit.estimatedProfit !== 1250) throw new Error(`Test 9 Failed: Expected net profit $1,250, got $${fullCostProfit.estimatedProfit}`);
  if (fullCostProfit.profitMargin !== 56.82) throw new Error(`Test 9 Failed: Expected margin 56.82%, got ${fullCostProfit.profitMargin}%`);
  console.log('  ✓ PASS: Gross $2,200 - Fuel $300 - Driver $550 - Other $100 = Net Profit $1,250 (Margin 56.82%)');

  // -------------------------------------------------------------------------
  // TEST 10: Carrier Rate Con 1.pdf: Gross remains $1,450, Miles 430, Driver Pay is from Driver contract ONLY
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 10: Carrier Rate Con 1.pdf RateCon values vs Driver Pay ---');
  const rateConText = `
RATE CONFIRMATION & BROKER-CARRIER AGREEMENT
Apex Freight Logistics LLC | MC-987654 | DOT: 3829104
Carrier: Eagle Express Lines LLC | MC-459201
Driver: Marcus Vance | Phone: (555) 349-1188
Truck: Truck #208 | Trailer: Trailer #5388
Load #: AFL-2026-1090
Line Haul: 430 miles @ $2.80/mile = $1,204.00
Fuel Surcharge: $196.00
Driver Detention / Accessorial Reserve: $50.00
TOTAL CARRIER AGREED PAY: $1,450.00
  `;
  const parsed = parseRateConfirmationText(rateConText, 'Carrier Rate Con 1.pdf');
  if (parsed.load_info.rate !== 1450) throw new Error(`Expected Gross Rate $1,450, got ${parsed.load_info.rate}`);
  if (parsed.load_info.mileage !== 430) throw new Error(`Expected Loaded Miles 430, got ${parsed.load_info.mileage}`);
  if (parsed.financial_breakdown?.linehaul_rate !== 1204) throw new Error('Expected linehaul $1,204');
  if (parsed.financial_breakdown?.fuel_surcharge_amount !== 196) throw new Error('Expected FSC $196');
  if (parsed.financial_breakdown?.accessorial_reserve_amount !== 50) throw new Error('Expected reserve $50');

  // CRITICAL: Verify that the RateCon did NOT set driver pay to $50 or anything else!
  // Driver Pay is determined SOLELY by selected Driver Marcus Vance's contract (25%):
  const marcusContractComp = calculateDriverCompensation(driverPercentage as Driver, parsed.load_info.rate, parsed.load_info.mileage, 0);
  // 1450 * 0.25 = 362.50
  if ((marcusContractComp.driverPay as number) === 50) {
    throw new Error('CRITICAL FAILURE: Driver Pay was incorrectly set to $50 accessorial reserve!');
  }
  if (marcusContractComp.driverPay !== 362.50) {
    throw new Error(`Test 10 Failed: Expected driver pay $362.50, got $${marcusContractComp.driverPay}`);
  }
  console.log('  ✓ PASS: Carrier Rate Con 1.pdf: Gross = $1,450, Miles = 430');
  console.log('  ✓ PASS: $50 accessorial reserve is NOT treated as Driver Pay');
  console.log('  ✓ PASS: Driver Pay is $362.50, determined ONLY by Marcus Vance\'s master contract (25% of $1,450)');

  // -------------------------------------------------------------------------
  // TEST 11: Total miles including deadhead for per-mile contract
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 11: Deadhead miles handling for per-mile contract ---');
  // 650 loaded + 50 deadhead = 700 applicable miles @ $0.60/mi = $420
  const dhComp = calculateDriverCompensation(driverPerMile as Driver, 2200, 650, 50);
  if (dhComp.driverPay !== 420) throw new Error(`Test 11 Failed: Expected $420 on 700 total miles, got $${dhComp.driverPay}`);
  if (dhComp.basisLabel !== '$0.60 / Total Mile') throw new Error(`Test 11 Failed: Expected '$0.60 / Total Mile', got '${dhComp.basisLabel}'`);
  console.log('  ✓ PASS: 650 loaded + 50 DH = 700 miles @ $0.60/mi = $420.00 (basis: "$0.60 / Total Mile")');

  console.log('\n======================================================================');
  console.log('🎉 ALL 11 DRIVER COMPENSATION & PROFITABILITY TESTS PASSED! 🎉');
  console.log('======================================================================\n');
}

runDriverCompensationTests();
