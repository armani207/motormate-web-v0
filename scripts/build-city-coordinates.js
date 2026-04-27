import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import cityCoords from '../src/utils/cityCoords.json' assert { type: 'json' };

const OUTPUT_FILE = path.resolve('src/utils/mergedCityCoords.json');

async function fetchMissingCoords() {
  const mergedCoords = { ...cityCoords };
  const citiesToFetch = [
    // add any city entries you know are missing from cityCoords
    { city: 'Toronto', state: 'ON', country: 'Canada' },
    { city: 'Mexico City', state: 'CDMX', country: 'Mexico' },
  ];

  for (const { city, state, country } of citiesToFetch) {
    const key = `${city.trim()}, ${state.trim()}, ${country.trim()}`;
    if (mergedCoords[key]) continue; // already have it

    console.log(`Fetching ${key} from Nominatim...`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&format=json`
    );
    const results = await res.json();
    if (results.length > 0) {
      mergedCoords[key] = {
        lat: parseFloat(results[0].lat),
        lon: parseFloat(results[0].lon),
      };
      console.log(`Added ${key}: ${mergedCoords[key].lat}, ${mergedCoords[key].lon}`);
    } else {
      console.warn(`No results for ${key}`);
    }

    // rate-limit Nominatim politely
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mergedCoords, null, 2));
  console.log(`✅ Merged city coordinates written to ${OUTPUT_FILE}`);
}

fetchMissingCoords().catch(console.error);
