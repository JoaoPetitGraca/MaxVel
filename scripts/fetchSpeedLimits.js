const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const turf = require('@turf/turf');

// Output file path
const OUTPUT_FILE = path.join(__dirname, '../assets/data/speedLimits.json');

// Overpass API URL
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Query to get specifically the N1 highway in Mozambique
const overpassQuery = `
[out:json][timeout:180];
area["ISO3166-1"="MZ"][admin_level=2]->.mozambique;

// First get all N1 ways
(
  way["highway"]["ref"="N1"](area.mozambique);
  way["highway"]["name"~"N1"](area.mozambique);
)->.n1_ways;

// Get nodes of N1 ways
(
  node(w.n1_ways);
  way(bn);
  way["highway"="trunk"](bn);
);

// Output the results
out body;
>;
out skel qt;
`;

// Default speed limits for different road types (in km/h)
const DEFAULT_SPEED_LIMITS = {
  motorway: 120,
  trunk: 100,
  primary: 80,
  secondary: 80,
  tertiary: 60,
  unclassified: 50,
  residential: 40,
  service: 30,
  motorway_link: 80,
  trunk_link: 60,
  primary_link: 60,
  secondary_link: 50,
  tertiary_link: 50
};

// Parse speed limit value (handles formats like "80", "80 km/h", "80 mph", etc.)
function parseSpeedLimit(value) {
  if (!value) return null;
  
  // Handle numeric values
  const numericValue = parseFloat(value);
  if (!isNaN(numericValue)) return numericValue;
  
  // Handle strings with units
  const match = value.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  
  return null;
}

// Process OSM data and extract speed limits
async function processSpeedLimits() {
  try {
    console.log('Fetching speed limit data from OpenStreetMap...');
    
    const response = await axios.get(OVERPASS_URL, {
      params: { data: overpassQuery }
    });
    
    const elements = response.data.elements || [];
    console.log(`Found ${elements.length} total elements from Overpass API`);

    // Create a map of nodes with their coordinates for quick lookup
    const nodes = {};
    for (const element of elements) {
      if (element.type === 'node') {
        nodes[element.id] = [element.lon, element.lat];
      }
    }
    console.log(`Mapped ${Object.keys(nodes).length} nodes`);

    // Process each way to build segments with full geometry
    const speedLimits = [];
    for (const element of elements) {
      if (element.type === 'way' && element.nodes && element.nodes.length > 1) {
        let speedLimit = element.tags.maxspeed
          ? parseSpeedLimit(element.tags.maxspeed)
          : null;

        if (!speedLimit && element.tags.highway) {
          speedLimit = DEFAULT_SPEED_LIMITS[element.tags.highway] || 60;
        }

        if (speedLimit) {
          const geometry = element.nodes
            .map(nodeId => nodes[nodeId])
            .filter(coord => coord); // Filter out any missing nodes

          if (geometry.length > 1) {
            speedLimits.push({
              id: element.id,
              type: element.tags.highway,
              name: element.tags.name || 'Unnamed Road',
              speedLimit: speedLimit,
              tags: element.tags,
              geometry: geometry,
            });
          }
        }
      }
    }
    
    console.log(`Processed ${speedLimits.length} road segments with valid speed limits`);
    
    // Create output directory if it doesn't exist
    await fs.ensureDir(path.dirname(OUTPUT_FILE));
    
    // Save to file
    await fs.writeJson(OUTPUT_FILE, speedLimits, { spaces: 2 });
    console.log(`Speed limit data saved to ${OUTPUT_FILE}`);
    
    return speedLimits;
  } catch (error) {
    console.error('Error fetching or processing speed limit data:', error.message);
    throw error;
  }
}

// Run the script
processSpeedLimits()
  .then(() => console.log('Speed limit processing complete!'))
  .catch(console.error);
