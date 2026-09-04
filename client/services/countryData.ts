// Country and State Service with preloaded major datasets + dynamic API loading from countriesnow.space

export interface StateItem {
  name: string;
  state_code: string;
}

export interface CountryItem {
  name: string;
  iso2: string;
  phone_code?: string;
  states: StateItem[];
}

// Preloaded standard datasets so autocomplete works instantaneously offline or online
const PRELOADED_COUNTRIES: CountryItem[] = [
  {
    name: "United States",
    iso2: "US",
    phone_code: "+1",
    states: [
      { name: "Alabama", state_code: "AL" },
      { name: "Alaska", state_code: "AK" },
      { name: "Arizona", state_code: "AZ" },
      { name: "Arkansas", state_code: "AR" },
      { name: "California", state_code: "CA" },
      { name: "Colorado", state_code: "CO" },
      { name: "Connecticut", state_code: "CT" },
      { name: "Delaware", state_code: "DE" },
      { name: "Florida", state_code: "FL" },
      { name: "Georgia", state_code: "GA" },
      { name: "Hawaii", state_code: "HI" },
      { name: "Idaho", state_code: "ID" },
      { name: "Illinois", state_code: "IL" },
      { name: "Indiana", state_code: "IN" },
      { name: "Iowa", state_code: "IA" },
      { name: "Kansas", state_code: "KS" },
      { name: "Kentucky", state_code: "KY" },
      { name: "Louisiana", state_code: "LA" },
      { name: "Maine", state_code: "ME" },
      { name: "Maryland", state_code: "MD" },
      { name: "Massachusetts", state_code: "MA" },
      { name: "Michigan", state_code: "MI" },
      { name: "Minnesota", state_code: "MN" },
      { name: "Mississippi", state_code: "MS" },
      { name: "Missouri", state_code: "MO" },
      { name: "Montana", state_code: "MT" },
      { name: "Nebraska", state_code: "NE" },
      { name: "Nevada", state_code: "NV" },
      { name: "New Hampshire", state_code: "NH" },
      { name: "New Jersey", state_code: "NJ" },
      { name: "New Mexico", state_code: "NM" },
      { name: "New York", state_code: "NY" },
      { name: "North Carolina", state_code: "NC" },
      { name: "North Dakota", state_code: "ND" },
      { name: "Ohio", state_code: "OH" },
      { name: "Oklahoma", state_code: "OK" },
      { name: "Oregon", state_code: "OR" },
      { name: "Pennsylvania", state_code: "PA" },
      { name: "Rhode Island", state_code: "RI" },
      { name: "South Carolina", state_code: "SC" },
      { name: "South Dakota", state_code: "SD" },
      { name: "Tennessee", state_code: "TN" },
      { name: "Texas", state_code: "TX" },
      { name: "Utah", state_code: "UT" },
      { name: "Vermont", state_code: "VT" },
      { name: "Virginia", state_code: "VA" },
      { name: "Washington", state_code: "WA" },
      { name: "West Virginia", state_code: "WV" },
      { name: "Wisconsin", state_code: "WI" },
      { name: "Wyoming", state_code: "WY" },
      { name: "District of Columbia", state_code: "DC" },
    ]
  },
  {
    name: "United Kingdom",
    iso2: "GB",
    phone_code: "+44",
    states: [
      { name: "England", state_code: "ENG" },
      { name: "Scotland", state_code: "SCT" },
      { name: "Wales", state_code: "WLS" },
      { name: "Northern Ireland", state_code: "NIR" },
      { name: "Greater London", state_code: "GL" },
      { name: "Greater Manchester", state_code: "GM" },
      { name: "West Midlands", state_code: "WM" },
      { name: "West Yorkshire", state_code: "WY" },
    ]
  },
  {
    name: "Canada",
    iso2: "CA",
    phone_code: "+1",
    states: [
      { name: "Alberta", state_code: "AB" },
      { name: "British Columbia", state_code: "BC" },
      { name: "Manitoba", state_code: "MB" },
      { name: "New Brunswick", state_code: "NB" },
      { name: "Newfoundland and Labrador", state_code: "NL" },
      { name: "Nova Scotia", state_code: "NS" },
      { name: "Ontario", state_code: "ON" },
      { name: "Prince Edward Island", state_code: "PE" },
      { name: "Quebec", state_code: "QC" },
      { name: "Saskatchewan", state_code: "SK" },
      { name: "Northwest Territories", state_code: "NT" },
      { name: "Nunavut", state_code: "NU" },
      { name: "Yukon", state_code: "YT" },
    ]
  },
  {
    name: "Pakistan",
    iso2: "PK",
    phone_code: "+92",
    states: [
      { name: "Punjab", state_code: "PB" },
      { name: "Sindh", state_code: "SD" },
      { name: "Khyber Pakhtunkhwa", state_code: "KP" },
      { name: "Balochistan", state_code: "BA" },
      { name: "Islamabad Capital Territory", state_code: "IS" },
      { name: "Azad Jammu and Kashmir", state_code: "AJK" },
      { name: "Gilgit-Baltistan", state_code: "GB" },
    ]
  },
  {
    name: "Australia",
    iso2: "AU",
    phone_code: "+61",
    states: [
      { name: "New South Wales", state_code: "NSW" },
      { name: "Victoria", state_code: "VIC" },
      { name: "Queensland", state_code: "QLD" },
      { name: "Western Australia", state_code: "WA" },
      { name: "South Australia", state_code: "SA" },
      { name: "Tasmania", state_code: "TAS" },
      { name: "Australian Capital Territory", state_code: "ACT" },
      { name: "Northern Territory", state_code: "NT" },
    ]
  },
  {
    name: "Germany",
    iso2: "DE",
    phone_code: "+49",
    states: [
      { name: "Baden-Württemberg", state_code: "BW" },
      { name: "Bavaria", state_code: "BY" },
      { name: "Berlin", state_code: "BE" },
      { name: "Brandenburg", state_code: "BB" },
      { name: "Bremen", state_code: "HB" },
      { name: "Hamburg", state_code: "HH" },
      { name: "Hesse", state_code: "HE" },
      { name: "Lower Saxony", state_code: "NI" },
      { name: "North Rhine-Westphalia", state_code: "NW" },
      { name: "Rhineland-Palatinate", state_code: "RP" },
      { name: "Saarland", state_code: "SL" },
      { name: "Saxony", state_code: "SN" },
      { name: "Saxony-Anhalt", state_code: "ST" },
      { name: "Schleswig-Holstein", state_code: "SH" },
      { name: "Thuringia", state_code: "TH" },
    ]
  },
  {
    name: "France",
    iso2: "FR",
    phone_code: "+33",
    states: [
      { name: "Auvergne-Rhône-Alpes", state_code: "ARA" },
      { name: "Bourgogne-Franche-Comté", state_code: "BFC" },
      { name: "Brittany", state_code: "BRE" },
      { name: "Centre-Val de Loire", state_code: "CVL" },
      { name: "Corsica", state_code: "COR" },
      { name: "Grand Est", state_code: "GES" },
      { name: "Hauts-de-France", state_code: "HDF" },
      { name: "Île-de-France", state_code: "IDF" },
      { name: "Normandy", state_code: "NOR" },
      { name: "Nouvelle-Aquitaine", state_code: "NAQ" },
      { name: "Occitanie", state_code: "OCC" },
      { name: "Pays de la Loire", state_code: "PDL" },
      { name: "Provence-Alpes-Côte d'Azur", state_code: "PAC" },
    ]
  },
  {
    name: "United Arab Emirates",
    iso2: "AE",
    phone_code: "+971",
    states: [
      { name: "Abu Dhabi", state_code: "AZ" },
      { name: "Dubai", state_code: "DU" },
      { name: "Sharjah", state_code: "SH" },
      { name: "Ajman", state_code: "AJ" },
      { name: "Umm Al Quwain", state_code: "UQ" },
      { name: "Ras Al Khaimah", state_code: "RK" },
      { name: "Fujairah", state_code: "FU" },
    ]
  },
  {
    name: "Saudi Arabia",
    iso2: "SA",
    phone_code: "+966",
    states: [
      { name: "Riyadh", state_code: "01" },
      { name: "Makkah", state_code: "02" },
      { name: "Madinah", state_code: "03" },
      { name: "Eastern Province", state_code: "04" },
      { name: "Al-Qassim", state_code: "05" },
      { name: "Asir", state_code: "06" },
      { name: "Tabuk", state_code: "07" },
      { name: "Hail", state_code: "08" },
      { name: "Jazan", state_code: "09" },
      { name: "Najran", state_code: "10" },
    ]
  },
  {
    name: "India",
    iso2: "IN",
    phone_code: "+91",
    states: [
      { name: "Andhra Pradesh", state_code: "AP" },
      { name: "Delhi", state_code: "DL" },
      { name: "Gujarat", state_code: "GJ" },
      { name: "Karnataka", state_code: "KA" },
      { name: "Kerala", state_code: "KL" },
      { name: "Maharashtra", state_code: "MH" },
      { name: "Punjab", state_code: "PB" },
      { name: "Rajasthan", state_code: "RJ" },
      { name: "Tamil Nadu", state_code: "TN" },
      { name: "Telangana", state_code: "TG" },
      { name: "Uttar Pradesh", state_code: "UP" },
      { name: "West Bengal", state_code: "WB" },
    ]
  }
];

// Global in-memory cache
let countriesCache: CountryItem[] = [...PRELOADED_COUNTRIES];
let isFetchingApi = false;
let hasLoadedApi = false;

// Async loader to fetch remaining world countries without blocking UI
export async function loadWorldCountries(): Promise<CountryItem[]> {
  if (hasLoadedApi) return countriesCache;
  if (isFetchingApi) return countriesCache;

  isFetchingApi = true;
  try {
    const cached = localStorage.getItem('world_countries_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 50) {
        countriesCache = parsed;
        hasLoadedApi = true;
        isFetchingApi = false;
        return countriesCache;
      }
    }

    const res = await fetch('https://countriesnow.space/api/v0.1/countries/states');
    if (!res.ok) throw new Error('API fetch failed');
    const json = await res.json();
    if (json && json.data && Array.isArray(json.data)) {
      const loaded: CountryItem[] = json.data.map((c: any) => ({
        name: c.name,
        iso2: c.iso2 || '',
        states: (c.states || []).map((s: any) => ({
          name: s.name,
          state_code: s.state_code || s.name.substring(0, 3).toUpperCase(),
        })),
      }));

      // Merge with preloaded data (preserving accurate state codes)
      const map = new Map<string, CountryItem>();
      for (const item of loaded) {
        if (item.name && item.iso2) {
          map.set(item.iso2.toUpperCase(), item);
        }
      }
      for (const pre of PRELOADED_COUNTRIES) {
        map.set(pre.iso2.toUpperCase(), pre);
      }

      countriesCache = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      hasLoadedApi = true;
      try {
        localStorage.setItem('world_countries_cache', JSON.stringify(countriesCache));
      } catch {
        // Ignore localStorage quota errors
      }
    }
  } catch (err) {
    console.warn('Could not load dynamic country list from API, using built-in datasets:', err);
  } finally {
    isFetchingApi = false;
  }
  return countriesCache;
}

// Get all countries currently available
export function getCountries(): CountryItem[] {
  return countriesCache;
}

// Find a country by name or iso2 code
export function findCountry(query: string): CountryItem | undefined {
  if (!query) return undefined;
  const q = query.trim().toLowerCase();
  return countriesCache.find(
    (c) => c.name.toLowerCase() === q || c.iso2.toLowerCase() === q
  );
}

// Filter countries matching search query
export function searchCountries(query: string): CountryItem[] {
  if (!query.trim()) return countriesCache.slice(0, 30);
  const q = query.toLowerCase().trim();
  return countriesCache
    .filter((c) => c.name.toLowerCase().includes(q) || c.iso2.toLowerCase().includes(q))
    .slice(0, 30);
}

// Get states for a selected country
export function getStatesForCountry(countryNameOrCode: string): StateItem[] {
  const country = findCountry(countryNameOrCode);
  if (!country) return [];
  return country.states || [];
}

// Filter states matching search query within a country
export function searchStates(countryNameOrCode: string, query: string): StateItem[] {
  const states = getStatesForCountry(countryNameOrCode);
  if (!query.trim()) return states.slice(0, 40);
  const q = query.toLowerCase().trim();
  return states
    .filter((s) => s.name.toLowerCase().includes(q) || s.state_code.toLowerCase().includes(q))
    .slice(0, 40);
}
