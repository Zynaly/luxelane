// Address, City, and Postal Code Lookup Service using freely available OpenStreetMap, Photon, and Zippopotam APIs

export interface AddressSuggestion {
  label: string;
  street: string;
  city: string;
  state: string;
  state_code?: string;
  postal_code: string;
  country: string;
  country_code: string;
}

export interface PostalLookupResult {
  city: string;
  state: string;
  state_code: string;
  country: string;
  country_code: string;
}

/**
 * Autocomplete full street addresses using Photon (Komoot / OpenStreetMap)
 */
export async function searchAddressSuggestions(
  query: string,
  countryCode?: string
): Promise<AddressSuggestion[]> {
  if (!query || query.trim().length < 3) return [];

  const cleanQuery = encodeURIComponent(query.trim());
  let url = `https://photon.komoot.io/api/?q=${cleanQuery}&limit=6`;
  if (countryCode) {
    url += `&osm_tag=place&osm_tag=building`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Photon request failed');
    const data = await res.json();

    if (!data || !Array.isArray(data.features)) return [];

    const suggestions: AddressSuggestion[] = [];

    for (const f of data.features) {
      const p = f.properties || {};
      const streetPart = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
      const city = p.city || p.town || p.district || p.locality || p.county || '';
      const state = p.state || '';
      const country = p.country || '';
      const country_code = (p.countrycode || countryCode || '').toUpperCase();
      const postal_code = p.postcode || '';

      if (streetPart || city) {
        const label = [streetPart, city, state, postal_code, country].filter(Boolean).join(', ');
        suggestions.push({
          label,
          street: streetPart || p.name || query,
          city,
          state,
          state_code: p.state_code || (state.length <= 3 ? state.toUpperCase() : undefined),
          postal_code,
          country,
          country_code,
        });
      }
    }

    return suggestions.slice(0, 6);
  } catch (err) {
    console.warn('Address autocomplete error, falling back:', err);
    return [];
  }
}

/**
 * Lookup City and State by Postal / ZIP Code using Zippopotam with OpenStreetMap fallback
 */
export async function lookupPostalCode(
  postalCode: string,
  countryCode: string = 'US'
): Promise<PostalLookupResult | null> {
  const cleanZip = postalCode.trim();
  if (!cleanZip || cleanZip.length < 3) return null;

  const cCode = countryCode.trim().toLowerCase() || 'us';

  // 1. Try Zippopotam.us (instant & extremely accurate for US, CA, DE, FR, GB, etc.)
  try {
    const zipRes = await fetch(`https://api.zippopotam.us/${cCode}/${encodeURIComponent(cleanZip)}`);
    if (zipRes.ok) {
      const data = await zipRes.json();
      if (data && data.places && data.places.length > 0) {
        const place = data.places[0];
        return {
          city: place['place name'] || '',
          state: place['state'] || '',
          state_code: place['state abbreviation'] || '',
          country: data.country || '',
          country_code: (data['country abbreviation'] || cCode).toUpperCase(),
        };
      }
    }
  } catch {
    // Continue to Nominatim fallback
  }

  // 2. Fallback to OpenStreetMap Nominatim for postal codes
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(
      cleanZip
    )}&countrycodes=${cCode}&format=json&addressdetails=1&limit=1`;
    const nomRes = await fetch(nomUrl, {
      headers: {
        'Accept-Language': 'en',
      },
    });

    if (nomRes.ok) {
      const results = await nomRes.json();
      if (Array.isArray(results) && results.length > 0) {
        const addr = results[0].address || {};
        const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
        const state = addr.state || '';
        return {
          city,
          state,
          state_code: (addr['ISO3166-2-lvl4'] || '').split('-')[1] || state.substring(0, 3).toUpperCase(),
          country: addr.country || '',
          country_code: (addr.country_code || cCode).toUpperCase(),
        };
      }
    }
  } catch (err) {
    console.warn('Nominatim postal code lookup error:', err);
  }

  return null;
}

/**
 * Search cities for a given state & country using Photon / OpenStreetMap
 */
export async function searchCitiesForState(
  cityQuery: string,
  stateName: string,
  countryName: string = 'United States'
): Promise<string[]> {
  const query = [cityQuery.trim(), stateName.trim(), countryName.trim()].filter(Boolean).join(' ');
  if (!query) return [];

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    if (!data || !Array.isArray(data.features)) return [];

    const citySet = new Set<string>();
    for (const f of data.features) {
      const p = f.properties || {};
      const cityName = p.city || p.town || (p.type === 'city' ? p.name : undefined);
      if (cityName) {
        // If stateName is specified, ensure it belongs to this state
        if (!stateName || !p.state || p.state.toLowerCase().includes(stateName.toLowerCase()) || stateName.toLowerCase().includes(p.state.toLowerCase())) {
          citySet.add(cityName);
        }
      }
    }

    return Array.from(citySet).slice(0, 6);
  } catch (err) {
    console.warn('City lookup error:', err);
    return [];
  }
}
