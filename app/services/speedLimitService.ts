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

  public get isReady(): boolean {
    return this.isInitialized;
  }

  private readonly DATA_PATH = `${FileSystem.documentDirectory}speedLimits.json`;
  private readonly DEFAULT_SPEED_LIMIT = 10; // km/h
  private readonly MAX_DISTANCE_KM = 0.015; // 15 meters

  async initialize(): Promise<boolean> {
    console.log('🚀 Initializing speed limit service...');
    if (this.isInitialized) {
      console.log('ℹ️ Speed limit service already initialized');
      return true;
    }

    try {
      const bundledData = await this.loadBundledData();
      if (bundledData.length > 0) {
        this.segments = bundledData;
        console.log(`✅ Loaded ${this.segments.length} segments from bundled data`);
      } else {
        console.warn('⚠️ No valid segments in bundled data, using default data');
        this.segments = this.createDefaultData();
      }
      this.isInitialized = true;
      console.log('🎉 Speed limit service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing speed limit service:', error);
      this.segments = this.createDefaultData(); // Fallback
      this.isInitialized = true;
      return false;
    }
  }

  private async loadBundledData(): Promise<SpeedLimitSegment[]> {
    try {
      const data = require('../../assets/data/speedLimits.json');
      const segments = Array.isArray(data) ? data : data.default || [];
      console.log(`🔍 Found ${segments.length} segments in the data file`);

      if (segments.length === 0) {
        return [];
      }

      const validSegments: SpeedLimitSegment[] = [];
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (!s || !s.geometry) continue;

        const hasValidSpeed = typeof s.speedLimit === 'number' && !isNaN(s.speedLimit);
        const coords = Array.isArray(s.geometry) ? s.geometry : s.geometry.coordinates;
        const hasValidCoords = Array.isArray(coords) && coords.length >= 2;

        if (hasValidSpeed && hasValidCoords) {
          validSegments.push({
            id: s.id || `segment-${i}`,
            name: s.name || s.tags?.name || 'Unnamed Road',
            type: s.type || s.tags?.highway || 'unclassified',
            speedLimit: s.speedLimit,
            geometry: coords,
            properties: s.properties || {},
            tags: s.tags || {},
          });
        }
      }
      console.log(`✅ Loaded ${validSegments.length} valid segments`);
      return validSegments;
    } catch (error) {
      console.error('❌ Error loading bundled data:', error);
      return [];
    }
  }

  private createDefaultData(): SpeedLimitSegment[] {
    console.log('ℹ️ Creating default speed limit data for N1 highway...');
    return [
      {
        id: 'n1-chidenguele-zandamela',
        name: 'N1 - Chidenguele to Zandamela',
        type: 'trunk',
        speedLimit: 100,
        tags: { highway: 'trunk', ref: 'N1' },
        geometry: [
          [34.267, -24.833], // Start point near user's test location
          [34.277, -24.823]  // End point along N1
        ],
      },
      {
        id: 'chidenguele-urban',
        name: 'Chidenguele Urban Area',
        type: 'residential',
        speedLimit: 60,
        tags: { highway: 'residential' },
        geometry: [
          [34.19, -24.98],
          [34.20, -24.97]
        ],
      },
      {
        id: 'zandamela-urban',
        name: 'Zandamela Urban Area',
        type: 'residential',
        speedLimit: 60,
        tags: { highway: 'residential' },
        geometry: [
          [34.35, -24.75],
          [34.36, -24.74]
        ],
      },
    ];
  }

  async getSpeedLimitAtLocation(location: Location.LocationObject): Promise<number | null> {
    const { speedLimit } = await this.getSpeedLimitAtLocationWithInfo(location);
    return speedLimit;
  }

  async getSpeedLimitAtLocationWithInfo(
    location: Location.LocationObject
  ): Promise<{ speedLimit: number | null; segment: SpeedLimitSegment | null; distance: number }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!location?.coords) {
      console.warn('⚠️ Invalid location object');
      return { speedLimit: null, segment: null, distance: Infinity };
    }

    const { latitude, longitude } = location.coords;
    if (this.segments.length === 0) {
      console.warn('⚠️ No speed limit segments available');
      return { speedLimit: null, segment: null, distance: Infinity };
    }

    const point = Turf.point([longitude, latitude]);
    let closestDistance = Infinity;
    let closestSegment: SpeedLimitSegment | null = null;

    for (const segment of this.segments) {
      try {
        const line = Turf.lineString(segment.geometry);
        const distance = Turf.pointToLineDistance(point, line, { units: 'kilometers' });
        if (distance < closestDistance) {
          closestDistance = distance;
          closestSegment = segment;
        }
      } catch (error) {
        console.error(`❌ Error processing segment ${segment.id}:`, error);
      }
    }

    if (closestSegment && closestDistance <= this.MAX_DISTANCE_KM) {
      return {
        speedLimit: closestSegment.speedLimit,
        segment: closestSegment,
        distance: closestDistance,
      };
    }

    return { speedLimit: null, segment: null, distance: closestDistance };
  }

  debugSegments() {
    console.log(`Loaded ${this.segments.length} segments`);
    this.segments.forEach((s, i) => console.log(`Segment ${i + 1}:`, s));
  }
}

export const speedLimitService = new SpeedLimitService();
