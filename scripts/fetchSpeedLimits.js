const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const turf = require('@turf/turf');

// Output file path
const OUTPUT_FILE = path.join(__dirname, '../assets/data/speedLimits.json');

// Bounding box for the entire N1 route in Mozambique
// From the southern border to the northernmost point of N1
const BOUNDING_BOX = {
  minLon: 30.0,   // Westernmost point of N1 in Mozambique
  minLat: -26.9,  // Southern border (south of Maputo)
  maxLon: 35.0,   // Easternmost point of N1 in Mozambique
  maxLat: -10.5   // Northernmost point of N1 in Mozambique (near Rovuma River)
};

// Overpass API URL
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Query to get ways with speed limits in the bounding box
const overpassQuery = `
[out:json];
(
  way[highway][maxspeed](${BOUNDING_BOX.minLat},${BOUNDING_BOX.minLon},${BOUNDING_BOX.maxLat},${BOUNDING_BOX.maxLon});
  way[highway][highway=trunk][!maxspeed](${BOUNDING_BOX.minLat},${BOUNDING_BOX.minLon},${BOUNDING_BOX.maxLat},${BOUNDING_BOX.maxLon});
);
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
    console.log(`Found ${elements.length} road segments with speed limit data`);
    
    // Process each way
    const speedLimits = [];
    
    for (const element of elements) {
      if (element.type === 'way' && element.nodes && element.nodes.length > 1) {
        // Get speed limit from tags or use default based on road type
        let speedLimit = element.tags.maxspeed 
          ? parseSpeedLimit(element.tags.maxspeed)
          : null;
          
        // If no explicit speed limit, use default for the road type
        if (!speedLimit && element.tags.highway) {
          speedLimit = DEFAULT_SPEED_LIMITS[element.tags.highway] || 60; // Default to 60 if type not found
        }
        
        if (speedLimit) {
          // Store the way ID, coordinates, and speed limit
          speedLimits.push({
            id: element.id,
            type: element.tags.highway,
            name: element.tags.name || 'Unnamed Road',
            speedLimit: speedLimit,
            nodes: element.nodes,
            geometry: element.geometry || []
          });
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
