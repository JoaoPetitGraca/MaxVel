import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import { point } from '@turf/helpers';
import * as Turf from '@turf/turf';
import Constants from 'expo-constants';

interface SpeedLimitSegment {
  id: string | number;
  name: string;
  type: string;
  speedLimit: number;
  nodes?: number[];
  geometry: [number, number][];
  properties?: Record<string, any>;
};

class SpeedLimitService {
  private segments: SpeedLimitSegment[] = [];
  private isInitialized = false;
  private readonly DATA_PATH = `${FileSystem.documentDirectory}speedLimits.json`;

  // Initialize the service by loading the speed limit data
  async initialize() {
    if (this.isInitialized) return true;

    try {
      // Always copy the bundled data to ensure we have the latest version
      await this.copyBundledData();
      
      // Load the data
      const data = await FileSystem.readAsStringAsync(this.DATA_PATH);
      const parsedData = JSON.parse(data);
      
      // Ensure we have valid segments with geometry
      this.segments = parsedData.filter((segment: any) => 
        segment.geometry && segment.geometry.length >= 2
      );
      
      // If no valid segments, use default data
      if (this.segments.length === 0) {
        console.warn('No valid segments found in speed limit data, using defaults');
        await this.createDefaultData();
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing speed limit service:', error);
      throw error;
    }
  }

  private async loadSpeedLimitData() {
    // First try to load from the app's document directory
    try {
      await this.loadFromDocuments();
    } catch (error) {
      console.log('Could not load from documents, trying bundled data...', error);
      // If that fails, copy the bundled data and try again
      await this.copyBundledData();
      await this.loadFromDocuments();
    }
  }

  private async loadFromDocuments() {
    if (!FileSystem.documentDirectory) {
      throw new Error('Document directory not available');
    }

    const fileUri = `${FileSystem.documentDirectory}speedLimits.json`;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    
    if (!fileInfo.exists) {
      throw new Error('Speed limit data file does not exist');
    }

    const content = await FileSystem.readAsStringAsync(fileUri);
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid speed limit data format');
    }

    this.segments = data;
    console.log(`Loaded ${data.length} speed limit segments from documents`);
  }

  // Copy the bundled data to the app's document directory
  private async copyBundledData() {
    try {
      console.log('Loading speed limit data from assets...');
      
      // Use require to load the bundled JSON file
      const data = require('../../assets/data/speedLimits.json');
      const speedLimitSegments = data.default || data;
      console.log(`Loaded ${speedLimitSegments.length} speed limit segments from assets`);
      
      // Filter out invalid segments
      const validSegments = speedLimitSegments.filter((seg: any) => 
        seg.geometry && seg.geometry.length >= 2
      );
      
      if (validSegments.length === 0) {
        console.warn('No valid segments found in bundled data, using defaults');
        return this.createDefaultData();
      }
      
      // Get the document directory
      const documentDir = FileSystem.documentDirectory;
      if (!documentDir) {
        throw new Error('Could not access document directory');
      }
      
      // Ensure the data directory exists
      const dataDir = `${documentDir}data`;
      await FileSystem.makeDirectoryAsync(dataDir, { intermediates: true });
      
      // Save valid segments to the document directory
      const dataFilePath = `${dataDir}/speedLimits.json`;
      const jsonData = JSON.stringify(validSegments);
      await FileSystem.writeAsStringAsync(dataFilePath, jsonData);
      console.log(`Saved ${validSegments.length} valid segments to ${dataFilePath}`);
      
      return validSegments;
      
    } catch (error) {
      console.error('Error loading speed limit data:', error);
      return this.createDefaultData();
    }
  }

  private async createDefaultData(): Promise<SpeedLimitSegment[]> {
    console.warn('Creating default speed limit data');
    const defaultSpeedLimits: SpeedLimitSegment[] = [
      // Chidenguele to Zandamela route
      {
        id: '1',
        type: 'trunk',
        name: 'EN1',
        speedLimit: 100,
        geometry: [
          [34.71, -24.52],  // [lon, lat] - Near Chidenguele
          [34.715, -24.53],
          [34.72, -24.55],
          [34.725, -24.58],
          [34.73, -24.63]   // Near Zandamela
        ]
      },
      // Additional test segments
      {
        id: '2',
        type: 'residential',
        name: 'Rua Principal',
        speedLimit: 60,
        geometry: [
          [34.73, -24.63],
          [34.74, -24.63]
        ]
      },
      {
        id: '3',
        type: 'primary',
        name: 'Avenida 24 de Julho',
        speedLimit: 80,
        geometry: [
          [34.73, -24.63],
          [34.72, -24.64]
        ]
      }
    ];
    
    // Save to document directory if available
    if (FileSystem.documentDirectory) {
      try {
        const dataDir = `${FileSystem.documentDirectory}data`;
        await FileSystem.makeDirectoryAsync(dataDir, { intermediates: true });
        const filePath = `${dataDir}/speedLimits.json`;
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify(defaultSpeedLimits));
        console.log('Saved default speed limit data to', filePath);
      } catch (error) {
        console.error('Error saving default speed limit data:', error);
        // Continue execution even if save fails
      }
    }
    
    return defaultSpeedLimits;
  }

  // Find the speed limit for a given location
  async getSpeedLimitAtLocation(location: Location.LocationObject): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const DEFAULT_SPEED_LIMIT = 60;
    const MAX_DISTANCE_KM = 0.5; // 500 meters

    // Ensure we have valid coordinates
    if (!location?.coords) {
      console.warn('Invalid location object provided');
      return DEFAULT_SPEED_LIMIT;
    }

    const { latitude, longitude } = location.coords;
    
    // Create a point from the current location
    const point = Turf.point([longitude, latitude]);
    
    let closestDistance = Infinity;
    let closestSpeedLimit = DEFAULT_SPEED_LIMIT;
    let closestSegmentId: string | number | null = null;
    let closestSegmentName = 'unknown';
    
    // Track segments within a reasonable distance for debugging
    const nearbySegments: Array<{
      id: string | number;
      name: string;
      type: string;
      distance: number;
      speed: number;
    }> = [];

    // Find the closest segment
    for (const segment of this.segments) {
      try {
        // Create a line string from the segment's geometry
        const line = {
          type: 'LineString' as const,
          coordinates: segment.geometry.map((p: any) => [p.lon, p.lat])
        };
        
        // Calculate distance from point to line
        const distance = Turf.pointToLineDistance(point, line, { units: 'kilometers' });
        
        // Track segments within 1km for debugging
        if (distance < 1) {  // 1km radius
          nearbySegments.push({
            id: segment.id,
            name: segment.name || 'unnamed',
            type: segment.type,
            distance,
            speed: segment.speedLimit
          });
        }
        
        // Update closest segment if this one is closer
        if (distance < closestDistance) {
          closestDistance = distance;
          closestSpeedLimit = segment.speedLimit;
          closestSegmentId = segment.id;
          closestSegmentName = segment.name || 'unnamed';
        }
      } catch (error) {
        console.warn(`Error processing segment ${segment.id}:`, error);
      }
    }

    // Log debug information
    console.log(`\n--- Speed Limit Lookup ---`);
    console.log(`Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    console.log(`Closest segment: ${closestSegmentName} (ID: ${closestSegmentId})`);
    console.log(`Distance: ${closestDistance.toFixed(4)} km, Speed: ${closestSpeedLimit} km/h`);
    
    // If the closest segment is too far away, use default
    if (closestDistance > MAX_DISTANCE_KM) {
      console.log(`\n🚨 Closest segment is too far (${closestDistance.toFixed(4)} km > ${MAX_DISTANCE_KM} km)`);
      console.log('Using default speed limit:', DEFAULT_SPEED_LIMIT, 'km/h');
      return DEFAULT_SPEED_LIMIT;
    }
    
    // Log nearby segments for debugging
    if (nearbySegments.length > 0) {
      console.log('\nNearby segments:');
      nearbySegments
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3) // Show top 3 closest
        .forEach((seg, i) => {
          console.log(`${i+1}. ${seg.name} (${seg.type}): ${seg.speed} km/h - ${seg.distance.toFixed(4)} km`);
        });
    }
    
    console.log('-----------------------\n');
    
    // Convert closestSegmentId to string for consistent type comparison
    const closestSegmentIdStr = String(closestSegmentId);
    
    // If the closest segment is too far away, use default
    if (closestDistance > MAX_DISTANCE_KM) {
      console.log(`\n🚨 Closest segment is too far (${closestDistance.toFixed(4)} km > ${MAX_DISTANCE_KM} km)`);
      console.log(`Using default speed limit of ${DEFAULT_SPEED_LIMIT} km/h\n`);
      return DEFAULT_SPEED_LIMIT;
    }
    
    console.log(`✅ Using speed limit from ${closestSegmentName}: ${closestSpeedLimit} km/h\n`);
    return closestSpeedLimit;
  }

  // Get all speed limit segments (for debugging)
  getAllSegments(): SpeedLimitSegment[] {
    return this.segments;
  }
}

export const speedLimitService = new SpeedLimitService();
