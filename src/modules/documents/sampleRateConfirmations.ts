export interface SampleRateConDoc {
  id: string;
  title: string;
  brokerName: string;
  lane: string;
  rate: number;
  equipment: string;
  description: string;
  rawText: string;
  simulatedFileName: string;
}

export const SAMPLE_RATE_CONFIRMATIONS: SampleRateConDoc[] = [
  {
    id: 'sample-apex-chicago-dallas',
    title: 'Apex Freight Solutions — 53ft Dry Van (Chicago to Dallas)',
    brokerName: 'Apex Freight Solutions LLC',
    lane: 'Chicago, IL → Dallas, TX',
    rate: 3150.0,
    equipment: "53' Dry Van",
    description: 'General freight rate confirmation with separate linehaul ($2,800) and fuel surcharge ($350), 1,125 miles, strict appointments and full accessorial schedule.',
    simulatedFileName: 'US_Trucking_Rate_Confirmation_APX-78421.pdf',
    rawText: `================================================================================
RATE CONFIRMATION & BROKER-CARRIER AGREEMENT
APEX FREIGHT SOLUTIONS LLC
MC: MC-892140 | DOT: 3108924
200 West Madison St, Suite 1400, Chicago, IL 60606
Phone: (800) 555-0142 | Email: dispatch@apex-freight-solutions.test
Broker Agent: Sarah Jenkins (Midwest Fleet Division)

Carrier: BlueLine Transport LLC
Carrier MC: MC-654321 | Carrier DOT: 3210984
================================================================================
LOAD / ORDER NUMBER: APX-78421
Reference / PO #: PO-458921
Booking Date: Today
Payment Terms: Net 30 Days

FINANCIAL BREAKDOWN & SETTLEMENT:
Linehaul: $2,800.00 USD
Fuel Surcharge: $350.00 USD
TOTAL AGREED CARRIER COMPENSATION: $3,150.00 USD

EQUIPMENT & SHIPMENT SPECIFICATIONS:
Equipment: 53' Dry Van (Air-Ride, Clean & Odor Free)
Commodity: General Freight (Palletized)
Total Weight: 42,500 lbs
Mileage: 1,125 miles
Pallet Count: 26 Standard Pallets

STOP 1 - PICKUP (ORIGIN):
Facility: Midwest Distribution Center
Address: 4800 S Central Ave
City/State/Zip: Chicago, IL 60632
Date / Time: Sept 5, 2026, 08:00 AM CST
Contact / Phone: Shipping Office (312) 555-0182
Pickup Instructions: Check in at Gate 2 with PO #PO-458921. Driver must ensure seal #APX-9941 is verified and recorded on BOL.

STOP 2 - DELIVERY (DESTINATION):
Facility: Texas Distribution Hub
Address: 5200 Mountain Creek Pkwy
City/State/Zip: Dallas, TX 75236
Date / Time: Sept 6, 2026, 02:00 PM CST
Contact / Phone: Receiving Inbound (214) 555-0199
Delivery Instructions: Unload at Docks 32-36. Driver assist not required. Signed clear POD required for payment processing.

ACCESSORIAL RATES & TERMS:
- Detention: $75/hour after 2 free hours (Signed BOL with in/out timestamps mandatory)
- Layover: $300/day
- TONU: $250
- Lumper: 100% reimbursement with receipt
================================================================================`,
  },
  {
    id: 'sample-horizon-reefer',
    title: 'Horizon Express — 53ft Reefer (Memphis to Charlotte)',
    brokerName: 'Horizon Express Logistics',
    lane: 'Memphis, TN → Charlotte, NC',
    rate: 2850.0,
    equipment: '53ft Reefer (36°F)',
    description: 'Chilled dairy & specialty greek yogurt freight with continuous 36°F temperature log requirement, 630 miles.',
    simulatedFileName: 'Horizon_RateConfirmation_HZ-44910.pdf',
    rawText: `================================================================================
BROKER-CARRIER RATE CONFIRMATION
HORIZON EXPRESS LOGISTICS
MC: MC-561230 | DOT: 774109
100 North Main Building, Memphis, TN 38103
Phone: (877) 555-0193 | Fax: (877) 555-0194
Dispatcher: Amanda Cross | Email: loads@horizon-logistics.test
================================================================================
LOAD CONFIRMATION NUMBER: HZ-44910
Reference / PO #: PO-991204
Booking Date: Today
Payment Terms: Net 21 Days Standard

FINANCIAL COMPENSATION:
Linehaul: $2,850.00 USD
Fuel Surcharge: Included
TOTAL AGREED CARRIER COMPENSATION: $2,850.00 USD

EQUIPMENT / SHIPMENT DETAILS:
Equipment Type: 53ft Refrigerated Trailer (Reefer)
Temperature Setting: MAINTAIN 36°F CONTINUOUS (NO CYCLE SENTRY)
Commodity: Chilled Dairy & Specialty Greek Yogurt
Total Gross Weight: 41,200 lbs
Mileage: 630 miles

STOP 1 - PICKUP (ORIGIN):
Facility: Delta Cold Storage & Distribution
Address: 2200 Riverport Road, Door 8
City/State/Zip: Memphis, TN 38103
Date / Time: Sept 8, 2026, 08:00 AM CST
Contact: Receiving Office (901) 555-0177

STOP 2 - DELIVERY (DESTINATION):
Facility: Piedmont Grocers Distribution Center
Address: 5400 Statesville Rd
City/State/Zip: Charlotte, NC 28202
Date / Time: Sept 9, 2026, 10:00 AM EST
Contact: Produce Inbound Desk (704) 555-0144

SPECIAL PROVISIONS & ACCESSORIALS:
- Detention: $65/hour after 2.0 hrs free time. Must request authorization within 1 hour.
- Layover: $250/day
- TONU: $200
- Lumper: Reimbursed only with receipt
================================================================================`,
  },
  {
    id: 'sample-blueridge-flatbed',
    title: 'Blue Ridge Freight — 48ft Flatbed (Chicago to Dallas)',
    brokerName: 'Blue Ridge Freight Brokerage, Inc.',
    lane: 'Chicago, IL → Dallas, TX',
    rate: 3200.0,
    equipment: '48ft Flatbed',
    description: 'Heavy structural steel beams with 8ft tarps and transport chains specification, 920 miles.',
    simulatedFileName: 'BlueRidge_RateCon_BR-89412.pdf',
    rawText: `================================================================================
RATE CONFIRMATION & DISPATCH INSTRUCTIONS
BLUE RIDGE FREIGHT BROKERAGE, INC.
MC: MC-347592 | DOT: 556102
500 East Main St, Blue Ridge Building, Knoxville, TN 37902
Carrier Line: (800) 555-0188 | Broker Agent: Brandon Cole
================================================================================
LOAD / ORDER NUMBER: BR-89412
Reference / PO #: PO-338192
Date: Today
Payment Terms: Net 30 Days

SETTLEMENT SUMMARY:
Linehaul: $3,050.00 USD
Fuel Surcharge: $150.00 USD
TOTAL AGREED CARRIER COMPENSATION: $3,200.00 USD

LOAD SPECIFICATIONS:
Trailer: 48' Flatbed
Commodity: Fabricated Structural Steel Beams & Angle Iron
Weight: 46,000 lbs (Heavy Haul - Scale ticket recommended)
Mileage: 920 miles
Securement: Minimum 8 Grade-70 3/8" Transport Chains & Binders + 8ft Drop Tarps

STOP 1 - PICKUP (ORIGIN):
Facility: Midwest Steel Processing Plant #4
Address: 1400 Industrial Parkway, Bay B
City/State/Zip: Chicago, IL 60611
Date / Time: Sept 10, 2026, 07:00 AM CDT
Contact: Shipping Bay 4 (312) 555-0149

STOP 2 - DELIVERY (DESTINATION):
Facility: Lone Star Commercial Construction Yard
Address: 8800 Trinity Blvd, Gate 3
City/State/Zip: Dallas, TX 75207
Date / Time: Sept 12, 2026, 08:00 AM CDT
Contact: Site Foreman (214) 555-0176

ACCESSORIAL CLAUSES:
- Tarp fee is fully factored into linehaul gross.
- Detention: $75/hour after 2 hours free time with time-stamped BOL.
- Layover: $300/day
- TONU: $250
================================================================================`,
  },
];
