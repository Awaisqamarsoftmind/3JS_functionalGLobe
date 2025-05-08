import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

const inputFile = 'worldcities.csv';
const outputFile = 'cities-us.json';
const features = [];

fs.createReadStream(inputFile)
  .pipe(csv())
  .on('data', (row) => {
    const lat = parseFloat(row.lat);
    const lng = parseFloat(row.lng);
    const name = row.city;
    const country = row.country;
    const population = parseInt(row.population);

    // ✅ Only include cities from the United States
    if (
      country === 'United States' &&
      !isNaN(lat) &&
      !isNaN(lng)
    ) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        properties: {
          name,
          country,
          population,
        },
      });
    }
  })
  .on('end', () => {
    fs.writeFileSync(outputFile, JSON.stringify(features, null, 2));
    console.log(`✅ Saved ${features.length} US cities to ${outputFile}`);
  });
