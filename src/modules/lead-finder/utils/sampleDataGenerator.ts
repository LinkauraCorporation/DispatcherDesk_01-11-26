/**
 * Generator for authentic sample FMCSA Company Census CSV files.
 * Enables instant one-click testing of the extractor logic without needing
 * an external FMCSA file immediately.
 */

const SAMPLE_FIRST_NAMES = ['Robert', 'David', 'Michael', 'James', 'Thomas', 'Marcus', 'Carlos', 'Sarah', 'Jennifer', 'William', 'Jose', 'Kevin', 'Anthony', 'Daniel', 'Richard'];
const SAMPLE_LAST_NAMES = ['Johnson', 'Miller', 'Smith', 'Williams', 'Garcia', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Brown', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore'];
const SAMPLE_NOUNS = ['Freight', 'Logistics', 'Transport', 'Hauling', 'Express', 'Trucking', 'Lines', 'Cartage', 'Carriers', 'Trans', 'Dispatch', 'Transit', 'Motors', 'Hotshot'];
const SAMPLE_ADJECTIVES = ['Lone Star', 'Iron Mountain', 'Eagle Eye', 'Apex', 'Titan', 'Pinnacle', 'Red River', 'Great Lakes', 'Summit', 'Midwest', 'Vanguard', 'Patriot', 'Silverado', 'Cross Country', 'Blue Ridge', 'Silverline'];

const SAMPLE_LOCATIONS = [
  { city: 'Dallas', state: 'TX', zip: '75201', areaCode: '214' },
  { city: 'Houston', state: 'TX', zip: '77002', areaCode: '713' },
  { city: 'Atlanta', state: 'GA', zip: '30303', areaCode: '404' },
  { city: 'Chicago', state: 'IL', zip: '60601', areaCode: '312' },
  { city: 'Indianapolis', state: 'IN', zip: '46204', areaCode: '317' },
  { city: 'Columbus', state: 'OH', zip: '43215', areaCode: '614' },
  { city: 'Phoenix', state: 'AZ', zip: '85001', areaCode: '602' },
  { city: 'Charlotte', state: 'NC', zip: '28202', areaCode: '704' },
  { city: 'Memphis', state: 'TN', zip: '38103', areaCode: '901' },
  { city: 'Nashville', state: 'TN', zip: '37201', areaCode: '615' },
  { city: 'Omaha', state: 'NE', zip: '68102', areaCode: '402' },
  { city: 'Des Moines', state: 'IA', zip: '50309', areaCode: '515' },
  { city: 'Jacksonville', state: 'FL', zip: '32202', areaCode: '904' },
  { city: 'Kansas City', state: 'MO', zip: '64106', areaCode: '816' },
  { city: 'Denver', state: 'CO', zip: '80202', areaCode: '303' },
  { city: 'Salt Lake City', state: 'UT', zip: '84101', areaCode: '801' },
];

export function createSampleFmcsaFile(rowCount = 3500): File {
  const headers = [
    'STATUS_CODE',
    'DOT_NUMBER',
    'PHONE',
    'COMPANY_OFFICER_1',
    'CARRIER_OPERATION',
    'TRUCK_UNITS',
    'POWER_UNITS',
    'TOTAL_DRIVERS',
    'LEGAL_NAME',
    'DBA_NAME',
    'PHY_CITY',
    'PHY_STATE',
    'PHY_ZIP',
    'EMAIL_ADDRESS',
    'DOCKET1PREFIX',
    'DOCKET1',
    'INTERSTATE_BEYOND_100_MILES',
    'INTERSTATE_WITHIN_100_MILES',
    'DOCKET1_STATUS_CODE',
    'ADD_DATE',
  ];

  const rows: string[] = [headers.join(',')];

  let baseDot = 2840000;
  let baseDocket = 824000;

  for (let i = 0; i < rowCount; i++) {
    baseDot += Math.floor(Math.random() * 8) + 1;
    baseDocket += Math.floor(Math.random() * 12) + 1;

    const loc = SAMPLE_LOCATIONS[i % SAMPLE_LOCATIONS.length];
    const adj = SAMPLE_ADJECTIVES[i % SAMPLE_ADJECTIVES.length];
    const noun = SAMPLE_NOUNS[(i * 3) % SAMPLE_NOUNS.length];
    const suffix = i % 3 === 0 ? 'LLC' : i % 3 === 1 ? 'INC' : 'TRANSPORTATION CORP';
    const legalName = `"${adj} ${noun} ${suffix}"`;
    const dba = i % 4 === 0 ? `"${adj} ${noun}"` : '';

    const officerFirst = SAMPLE_FIRST_NAMES[i % SAMPLE_FIRST_NAMES.length];
    const officerLast = SAMPLE_LAST_NAMES[(i * 2) % SAMPLE_LAST_NAMES.length];
    const officer = `"${officerFirst} ${officerLast}"`;

    // 75% active, 25% inactive
    const isActive = Math.random() < 0.85;
    const statusCode = isActive ? 'A' : 'I';

    // Carrier operation distribution:
    // A: 65% (Interstate For-Hire)
    // B: 15% (Exempt For-Hire)
    // C: 15% (Private Property)
    // D: 5% (Passenger)
    const opRand = Math.random();
    const carrierOp = opRand < 0.65 ? 'A' : opRand < 0.8 ? 'B' : opRand < 0.95 ? 'C' : 'D';

    // Truck units: realistic distribution with a peak in 5 to 25
    let trucks = 0;
    const sizeRoll = Math.random();
    if (sizeRoll < 0.2) {
      trucks = Math.floor(Math.random() * 4) + 1; // 1-4
    } else if (sizeRoll < 0.7) {
      trucks = Math.floor(Math.random() * 16) + 5; // 5-20 (Prime target!)
    } else if (sizeRoll < 0.9) {
      trucks = Math.floor(Math.random() * 25) + 21; // 21-45
    } else {
      trucks = Math.floor(Math.random() * 100) + 46; // 46-145
    }

    const powerUnits = trucks + (Math.random() < 0.3 ? 1 : 0);
    const drivers = Math.max(1, Math.floor(trucks * (0.9 + Math.random() * 0.3)));

    // Phone (90% valid phone)
    const hasPhone = Math.random() < 0.92;
    const phone = hasPhone
      ? `(${loc.areaCode}) ${String(Math.floor(Math.random() * 800) + 100)}-${String(Math.floor(Math.random() * 8999) + 1000)}`
      : '';

    // Email (80% valid email)
    const hasEmail = Math.random() < 0.82;
    const cleanDomain = adj.toLowerCase().replace(/[^a-z]/g, '') + noun.toLowerCase().replace(/[^a-z]/g, '') + '.com';
    const emailPrefix = Math.random() < 0.4 ? 'dispatch' : Math.random() < 0.7 ? 'safety' : 'info';
    const email = hasEmail ? `${emailPrefix}@${cleanDomain}` : '';

    // Docket / MC
    const hasMC = Math.random() < 0.88;
    const docketPrefix = hasMC ? 'MC' : '';
    const docket = hasMC ? String(baseDocket) : '';

    // Interstate flags
    const isInterstateFlag = carrierOp === 'A' || carrierOp === 'B' || Math.random() < 0.8;
    const interBeyond = isInterstateFlag ? 'Y' : 'N';
    const interWithin = isInterstateFlag && Math.random() < 0.5 ? 'Y' : 'N';
    const docketStatus = isActive && hasMC ? 'A' : 'REVOKED';

    // Generate ADD_DATE (e.g. 10 to 450 days ago)
    const now = new Date();
    // 35% in last 90 days, 25% in 91-180 days, 40% older
    const dayOffset =
      Math.random() < 0.35
        ? Math.floor(Math.random() * 85) + 5
        : Math.random() < 0.6
        ? Math.floor(Math.random() * 90) + 90
        : Math.floor(Math.random() * 300) + 180;
    const recDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset);
    const addDateStr = `${recDate.getFullYear()}-${String(recDate.getMonth() + 1).padStart(2, '0')}-${String(recDate.getDate()).padStart(2, '0')}`;

    const row = [
      statusCode,
      String(baseDot),
      phone,
      officer,
      carrierOp,
      String(trucks),
      String(powerUnits),
      String(drivers),
      legalName,
      dba,
      `"${loc.city}"`,
      loc.state,
      loc.zip,
      email,
      docketPrefix,
      docket,
      interBeyond,
      interWithin,
      docketStatus,
      addDateStr,
    ].join(',');

    rows.push(row);
  }

  const csvContent = rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  return new File([blob], `FMCSA_CENSUS_SAMPLE_${rowCount}_ROWS.csv`, {
    type: 'text/csv',
    lastModified: Date.now(),
  });
}
