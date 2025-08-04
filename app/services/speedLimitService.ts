import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import * as Turf from '@turf/turf';

interface SpeedLimitSegment {
  id: string | number;
  name: string;
  type: string;
  speedLimit: number;
  geometry: [number, number][];
  properties?: Record<string, any>;
  tags?: Record<string, string>;
}

class SpeedLimitService {
  private segments: SpeedLimitSegment[] = [];
  private isInitialized = false;
  private readonly DATA_PATH = `${FileSystem.documentDirectory}speedLimits.json`;
  private readonly DEFAULT_SPEED_LIMIT = 10; // km/h - distinct from normal speed limits (60/100)
  private readonly MAX_DISTANCE_KM = 0.015; // 15 meters for high accuracy matching
  
  // Test coordinates center point (your test location)
  private readonly TEST_CENTER = {
    lat: -24.71778,
    lng: 34.456075
  };
  
  private parseSpeedLimit(tags: Record<string, string>): number {
    // First check for maxspeed:forward, then maxspeed
    const speedStr = tags?.['maxspeed:forward'] || tags?.['maxspeed'];
    if (!speedStr) return 10; // Default to 10 km/h if no speed specified

    // Parse the speed value (handling formats like '60', '60 km/h', etc.)
    const match = speedStr.match(/(\d+)/);
    if (!match) return 10; // Default to 10 km/h if can't parse

    const speed = parseInt(match[1], 10);
    return isNaN(speed) ? 10 : speed; // Ensure we always return a number
  }

  async initialize() {
    console.log('🚀 Initializing speed limit service...');
    
    if (this.isInitialized) {
      console.log('ℹ️ Speed limit service already initialized');
      return true;
    }

    try {
      console.log('🔍 Loading bundled speed limit data...');
      const bundledData = await this.loadBundledData();
      
      if (bundledData.length > 0) {
        this.segments = bundledData;
        console.log(`✅ Loaded ${this.segments.length} segments from bundled data`);
        console.log('Sample segment:', JSON.stringify(this.segments[0], null, 2));
      } else {
        console.warn('⚠️ No valid segments in bundled data, using default data');
        this.segments = this.createDefaultData();
        console.log('ℹ️ Using default segments:', JSON.stringify(this.segments, null, 2));
      }
      
      this.isInitialized = true;
      console.log('🎉 Speed limit service initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing speed limit service:', error);
      // Fall back to default data
      this.segments = this.createDefaultData();
      this.isInitialized = true;
      return true;
    }
  }

  private async loadBundledData(): Promise<SpeedLimitSegment[]> {
    try {
      console.log('Loading bundled speed limit data...');
      
      // In Expo, we need to use require for bundled assets
      const data = require('../../assets/data/speedLimits.json');
      const segments = Array.isArray(data) ? data : data.default || [];
      
      console.log(`Found ${segments.length} segments in the data file`);
      
      // If no segments found, return empty array to trigger default data
      if (segments.length === 0) {
        console.warn('No segments found in the data file');
        return [];
      }
      
      // Validate and filter segments
      const validSegments = [];
      let invalidCount = 0;
      const maxInvalidLogs = 10; // Limit the number of invalid segment logs
      
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        try {
          if (!segment) continue;
          
          // Check if geometry is valid (either array of coordinates or GeoJSON format)
          const hasValidGeometry = segment.geometry && 
            (Array.isArray(segment.geometry) || 
             (typeof segment.geometry === 'object' && 
              segment.geometry.type === 'LineString' && 
              Array.isArray(segment.geometry.coordinates)));
          
          const speedLimit = this.parseSpeedLimit(segment.tags);
          if (speedLimit === null) {
            console.warn(`⚠️ No valid speed limit found for segment ${segment.id}, using default 10 km/h`);
            segment.speedLimit = 10; // Set default
          } else {
            segment.speedLimit = speedLimit;
          }
          
          if (hasValidGeometry) {
            // Normalize the segment format
            const normalizedSegment: SpeedLimitSegment = {
              id: segment.id || `segment-${i}`,
              name: segment.name || `Segment ${i}`,
              type: segment.type || 'unclassified',
              speedLimit: segment.speedLimit || 10, // Ensure speedLimit is set
              geometry: Array.isArray(segment.geometry) 
                ? segment.geometry 
                : segment.geometry?.coordinates || [],
              properties: segment.properties || {},
              tags: segment.tags || {}
            };
            
            // Additional validation for geometry coordinates
            if (normalizedSegment.geometry.length >= 2) {
              validSegments.push(normalizedSegment);
            } else if (invalidCount < maxInvalidLogs) {
              console.warn(`Skipping segment ${i}: insufficient geometry points (${normalizedSegment.geometry.length})`);
              invalidCount++;
            } else if (invalidCount === maxInvalidLogs) {
              console.warn('Too many invalid segments, suppressing further warnings...');
              invalidCount++;
            }
          } else if (invalidCount < maxInvalidLogs) {
            console.warn(`Skipping invalid segment ${i}:`, { 
              hasValidGeometry,
              geometryType: segment.geometry?.type || 'none'
            });
            invalidCount++;
          } else if (invalidCount === maxInvalidLogs) {
            console.warn('Too many invalid segments, suppressing further warnings...');
            invalidCount++;
          }
        } catch (error) {
          if (invalidCount < maxInvalidLogs) {
            console.error(`Error processing segment ${i}:`, error);
            invalidCount++;
          }
        }
      }
      
      console.log(`Loaded ${validSegments.length} valid segments out of ${segments.length} total`);
      
      // If no valid segments, return empty array to trigger default data
      if (validSegments.length === 0) {
        console.warn('No valid segments found in the data file');
        return [];
      }
      
      return validSegments;
    } catch (error) {
      console.error('Error loading bundled data:', error);
      return [];
    }
  }

  private createDefaultData(): SpeedLimitSegment[] {
    console.log('Creating default speed limit data');
    return [
      // N1 Highway - Chidenguele to Zandamela
      {
        id: 'n1-chidenguele-zandamela',
        name: 'N1 - Chidenguele to Zandamela',
        type: 'trunk',
        speedLimit: 100, // This will be overridden by parseSpeedLimit
        tags: {
          highway: 'trunk',
          'maxspeed:forward': '100',
          ref: 'N1',
          source: 'osm',
          surface: 'asphalt'
        },
        geometry: [
          [34.44, -24.72],  // Near Chidenguele
          [34.45, -24.72],  // Approaching test location
          [34.456075, -24.71778],  // Test location
          [34.46, -24.71],  // Continuing toward Zandamela
          [34.47, -24.70]   // Toward Zandamela
        ]
      },
      // Urban Area - Chidenguele
      {
        id: 'chidenguele-urban',
        name: 'Chidenguele Urban Area',
        type: 'residential',
        speedLimit: 60, // This will be overridden by parseSpeedLimit
        tags: {
          highway: 'residential',
          'maxspeed': '60',
          source: 'osm',
          'place': 'Chidenguele'
        },
        geometry: [
          [34.44, -24.73],
          [34.445, -24.725],
          [34.45, -24.72]
        ]
      },
      // Urban Area - Zandamela
      {
        id: 'zandamela-urban',
        name: 'Zandamela Urban Area',
        type: 'residential',
        speedLimit: 60, // This will be overridden by parseSpeedLimit
        tags: {
          highway: 'residential',
          'maxspeed': '60',
          source: 'osm',
          'place': 'Zandamela'
        },
        geometry: [
          [34.47, -24.71],
          [34.465, -24.705],
          [34.46, -24.70]
        ]
      }
    ];
  }

  async getSpeedLimitAtLocation(location: Location.LocationObject): Promise<number> {
    const result = await this.getSpeedLimitAtLocationWithInfo(location);
    return result.speedLimit;
  }

  async getSpeedLimitAtLocationWithInfo(
    location: Location.LocationObject
  ): Promise<{
    speedLimit: number;
    segment: SpeedLimitSegment | null;
    distance: number;
  }> {
    console.log('🔍 getSpeedLimitAtLocationWithInfo called with location:', JSON.stringify(location, null, 2));
    
    try {
      if (!this.isInitialized) {
        console.log('ℹ️ Service not initialized, initializing now...');
        await this.initialize();
      }

      if (!location?.coords) {
        console.warn('⚠️ Invalid location object:', location);
        return {
          speedLimit: this.DEFAULT_SPEED_LIMIT,
          segment: null,
          distance: Infinity
        };
      }

      const { latitude, longitude } = location.coords;
      console.log(`\n📍 Speed limit lookup at: ${latitude}, ${longitude}`);
      
      if (this.segments.length === 0) {
        console.warn('⚠️ No speed limit segments available');
        return {
          speedLimit: this.DEFAULT_SPEED_LIMIT,
          segment: null,
          distance: Infinity
        };
      }
      
      console.log(`ℹ️ Checking against ${this.segments.length} segments`);
      console.log(`ℹ️ Current location: ${latitude}, ${longitude}`);

      const point = Turf.point([longitude, latitude]);
      let closestDistance = Infinity;
      let closestSpeedLimit = this.DEFAULT_SPEED_LIMIT;
      let closestSegment: SpeedLimitSegment | null = null;
      let closestSegmentId = '';

    for (const segment of this.segments) {
      try {
        const line = {
          type: 'LineString' as const,
          coordinates: segment.geometry
        };

        const distance = Turf.pointToLineDistance(point, line, { units: 'kilometers' });
        
        console.log(`Segment ${segment.id} (${segment.name}): ` +
                   `${distance.toFixed(4)}km, speed: ${segment.speedLimit}km/h`);
        
        if (distance < closestDistance) {
          console.log(`✅ New closest segment: ${segment.id} (${segment.name}) - ${distance.toFixed(4)}km`);
          closestDistance = distance;
          closestSpeedLimit = segment.speedLimit;
          closestSegment = segment;
          closestSegmentId = String(segment.id);
        } else {
          console.log(`❌ Segment too far: ${segment.id} - ${distance.toFixed(4)}km`);
        }
      } catch (error) {
        console.error(`Error processing segment ${segment.id}:`, error);
      }
    }

    console.log(`Closest segment: ${closestSegmentId}, ` +
               `Distance: ${closestDistance.toFixed(4)}km, ` +
               `Speed Limit: ${closestSpeedLimit}km/h`);

    if (closestDistance > this.MAX_DISTANCE_KM) {
      console.log(`No segments within ${this.MAX_DISTANCE_KM}km, using default speed limit`);
      return {
        speedLimit: this.DEFAULT_SPEED_LIMIT,
        segment: null,
        distance: closestDistance
      };
    }

    return {
      speedLimit: closestSpeedLimit,
      segment: closestSegment,
      distance: closestDistance
    };
    } catch (error) {
      console.error('❌ Error in getSpeedLimitAtLocationWithInfo:', error);
      return {
        speedLimit: this.DEFAULT_SPEED_LIMIT,
        segment: null,
        distance: Infinity
      };
    }
  }

  // Debug method to check loaded segments
  debugSegments() {
    console.log(`Loaded ${this.segments.length} segments`);
    this.segments.forEach((segment, index) => {
      console.log(`Segment ${index + 1}:`, {
        id: segment.id,
        name: segment.name,
        type: segment.type,
        speedLimit: segment.speedLimit,
        geometryLength: segment.geometry?.length || 0,
        tags: segment.tags || {}
      });
    });
    console.log('=== End of segments ===\n');
  }
}

// Export a singleton instance
export const speedLimitService = new SpeedLimitService();
