import { useEffect, useState, useRef, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  Switch, 
  Animated, 
  ActivityIndicator, 
  TouchableOpacity, 
  Dimensions,
  SafeAreaView,
  Platform,
  Linking
} from 'react-native';
import * as Location from 'expo-location';
import { speedLimitService } from '../services/speedLimitService';

const { width, height } = Dimensions.get('window');

// Format speed for display
const formatSpeed = (speed: number | null): string => {
  if (speed === null) return '--';
  return Math.round(speed).toString();
};

export interface SpeedLimitSegment {
  id: string | number;
  name: string;
  type: string;
  speedLimit: number;
  geometry: [number, number][];
  properties?: Record<string, any>;
  tags?: Record<string, string>;
  source?: string;
  maxspeed?: string | number;
  ref?: string;
  highway?: string;
};

export default function SpeedLimitScreen() {
  const [speed, setSpeed] = useState<number | null>(null);
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [tappedLocation, setTappedLocation] = useState<Location.LocationObject | null>(null);
  const [currentSegment, setCurrentSegment] = useState<SpeedLimitSegment | null>(null);
  const [distanceToSegment, setDistanceToSegment] = useState<number | null>(null);
  const debugInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Update speed limit based on location
  const updateSpeedLimit = useCallback(async (lat: number, lng: number) => {
    if (!speedLimitService.isReady) {
      console.log('⏳ Speed limit service not ready, skipping update');
      return;
    }
    console.log(`🔄 Updating speed limit for ${lat}, ${lng}`);
    const location = { coords: { latitude: lat, longitude: lng } } as Location.LocationObject;
    const result = await speedLimitService.getSpeedLimitAtLocationWithInfo(location);
    if (result) {
      setSpeedLimit(result.speedLimit);
      setCurrentSegment(result.segment);
      setDistanceToSegment(result.distance);
      console.log(`✅ Found speed limit: ${result.speedLimit} km/h at ${result.distance.toFixed(2)}m`);
    } else {
      setSpeedLimit(10); // Default speed limit when no segment is found
      setCurrentSegment(null);
      setDistanceToSegment(null);
      console.log('🤷 No matching segment found, using default speed limit');
    }
  }, []);

  // Effect for one-time initialization and setting initial location
  useEffect(() => {
    const init = async () => {
      console.log('🏁 Component mounted, initializing...');
      setIsLoading(true);
      try {
        await speedLimitService.initialize();
        console.log('✅ Speed limit service initialized.');

        if (!debugMode) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            setErrorMsg('Permission to access location was denied');
            setIsLoading(false);
            return;
          }

          // Set initial default location near Chidenguele
          const initialLocation = {
            coords: {
              latitude: -24.912038,
              longitude: 34.198707,
              altitude: null, accuracy: 5, altitudeAccuracy: null, heading: null, speed: 0,
            },
            timestamp: Date.now(),
          } as Location.LocationObject;

          console.log('📍 Setting initial location:', initialLocation.coords);
          setTappedLocation(initialLocation);
          await updateSpeedLimit(initialLocation.coords.latitude, initialLocation.coords.longitude);
        }
      } catch (error) {
        console.error('❌ Error during initialization:', error);
        setErrorMsg('Failed to initialize speed limit service');
      } finally {
        setIsLoading(false);
        console.log('✅ Initialization complete.');
      }
    };

    init();
  }, [debugMode, updateSpeedLimit]); // Reruns only when debugMode changes

  // Effect for managing the location watcher
  useEffect(() => {
    if (debugMode) {
      // Handle debug mode simulation if needed, or clear watcher
      return;
    }

    let locationSubscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      console.log('🛰️ Starting location watcher...');
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 1, // More sensitive updates
          timeInterval: 1000,
        },
        (newLocation) => {
          console.log('📍 Location updated:', newLocation.coords);
          if (newLocation.coords.speed !== null && newLocation.coords.speed >= 0) {
            const speedInKmh = newLocation.coords.speed * 3.6;
            setSpeed(speedInKmh);
          }
          setTappedLocation(newLocation);
          updateSpeedLimit(newLocation.coords.latitude, newLocation.coords.longitude);
        }
      );
    };

    startWatching();

    // Cleanup function to remove the watcher
    return () => {
      if (locationSubscription) {
        console.log('🧹 Stopping location watcher...');
        locationSubscription.remove();
      }
    };
  }, [debugMode, updateSpeedLimit]); // Reruns when debugMode or the update function changes

  // Debug mode: Simulate variable speeds and watch for location changes
  useEffect(() => {
    if (!debugMode) return;
    
    // Initial debug location in San Francisco (near Golden Gate Park)
    const initialLocation: Location.LocationObject = {
      coords: {
        latitude: 37.7694,
        longitude: -122.4862,
        altitude: 50,
        accuracy: 10,
        altitudeAccuracy: 5,
        heading: 0,
        speed: 15,
      },
      timestamp: Date.now(),
    };
    
    setTappedLocation(initialLocation);
    updateSpeedLimit(initialLocation.coords.latitude, initialLocation.coords.longitude);
    
    // Set up interval to change location along a path
    debugInterval.current = setInterval(() => {
      // Simulate moving along a path near Golden Gate Park
      const baseLat = 37.7694;
      const baseLng = -122.4862;
      const lat = baseLat + (Math.random() * 0.01 - 0.005);
      const lng = baseLng + (Math.random() * 0.01 - 0.005);
      
      const newLocation: Location.LocationObject = {
        coords: {
          latitude: lat,
          longitude: lng,
          altitude: 50 + (Math.random() * 10 - 5),
          accuracy: 5 + Math.random() * 10,
          altitudeAccuracy: 5,
          heading: Math.random() * 360,
          speed: 10 + Math.random() * 10,
        },
        timestamp: Date.now(),
      };
      
      console.log('📍 Simulated location update:', { lat, lng });
      setTappedLocation(newLocation);
      updateSpeedLimit(lat, lng);
    }, 5000);
    
    return () => {
      if (debugInterval.current) {
        clearInterval(debugInterval.current);
      }
    };
  }, [debugMode, updateSpeedLimit]);

  // Animation for warning text when speeding
  useEffect(() => {
    if (speed && speedLimit && speed > speedLimit) {
      // Pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [speed, speedLimit, pulseAnim]);

  const isSpeeding = speed !== null && speedLimit !== null && speed > speedLimit;

  return (
    <SafeAreaView style={styles.container}>
      {/* Debug Toggle in Top Right */}
      <View style={styles.debugContainer}>
        <View style={styles.debugToggleContainer}>
          <Text style={styles.debugText}>Debug Mode</Text>
          <Switch
            value={debugMode}
            onValueChange={setDebugMode}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={debugMode ? '#f5dd4b' : '#f4f3f4'}
          />
        </View>
        <TouchableOpacity 
          style={styles.debugButton}
          onPress={() => speedLimitService.debugSegments()}
        >
          <Text style={styles.debugButtonText}>Debug Info</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.contentContainer}>
        {/* Speed Limit Display */}
        <View style={styles.speedLimitContainer}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading speed limits...</Text>
            </View>
          ) : (
            <View style={[
              styles.speedLimitCircle,
              isSpeeding && styles.speedingCircle
            ]}>
              <Text style={[
                styles.speedLimitText,
                isSpeeding && styles.speedingText
              ]}>
                {speedLimit !== null ? speedLimit : '--'}
              </Text>
              <Text style={[
                styles.kmhText,
                isSpeeding && styles.speedingText
              ]}>
                km/h
              </Text>
            </View>
          )}
        </View>
        
        {/* Current Speed Display */}
        <View style={styles.currentSpeedContainer}>
          <Text style={styles.currentSpeedLabel}>CURRENT SPEED</Text>
          <Text style={styles.currentSpeedText}>
            {formatSpeed(speed)}
            <Text style={styles.unitText}> km/h</Text>
          </Text>
          
          {speedLimit !== null && speed !== null && (
            <View style={styles.speedDifferenceContainer}>
              <Text style={[
                styles.speedDifferenceText,
                speed > speedLimit ? styles.overSpeedText : styles.underSpeedText
              ]}>
                {speed > speedLimit ? '+' : ''}{speed - speedLimit} km/h
              </Text>
              <Text style={styles.speedDifferenceLabel}>
                {speed > speedLimit ? 'Over Limit' : 'Under Limit'}
              </Text>
            </View>
          )}
        </View>
        
        {/* Warning Message */}
        {isSpeeding && (
          <Animated.View 
            style={[
              styles.warningContainer,
              { transform: [{ scale: pulseAnim }] }
            ]}
          >
            <Text style={styles.warningText}>SLOW DOWN!</Text>
            <Text style={styles.warningSubtext}>Speed limit exceeded</Text>
          </Animated.View>
        )}
        
        {/* Location and OSM Info */}
        <View style={styles.infoContainer}>
          {tappedLocation && (
            <View style={styles.coordinateContainer}>
              <Text style={styles.coordinateText}>
                🌍 {tappedLocation.coords.latitude.toFixed(6)}, {tappedLocation.coords.longitude.toFixed(6)}
              </Text>
              <View style={styles.mapLinksContainer}>
                <TouchableOpacity
                  style={styles.mapLinkButton}
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${tappedLocation.coords.latitude},${tappedLocation.coords.longitude}`)}>
                  <Text style={styles.mapLinkText}>Open in Google Maps</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mapLinkButton}
                  onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${tappedLocation.coords.latitude}&mlon=${tappedLocation.coords.longitude}#map=18/${tappedLocation.coords.latitude}/${tappedLocation.coords.longitude}`)}>
                  <Text style={styles.mapLinkText}>Open in OpenStreetMap</Text>
                </TouchableOpacity>
              </View>
              {debugMode && (
                <View style={styles.debugInfoContainer}>
                  <Text style={styles.debugInfoText}>
                    <Text style={styles.debugInfoLabel}>Accuracy: </Text>
                    {tappedLocation.coords.accuracy ? `${tappedLocation.coords.accuracy.toFixed(1)}m` : 'N/A'}
                  </Text>
                  <Text style={styles.debugInfoText}>
                    <Text style={styles.debugInfoLabel}>Altitude: </Text>
                    {tappedLocation.coords.altitude ? `${tappedLocation.coords.altitude.toFixed(1)}m` : 'N/A'}
                  </Text>
                  <Text style={styles.debugInfoText}>
                    <Text style={styles.debugInfoLabel}>Heading: </Text>
                    {tappedLocation.coords.heading ? `${tappedLocation.coords.heading.toFixed(1)}°` : 'N/A'}
                  </Text>
                  <Text style={styles.debugInfoText}>
                    <Text style={styles.debugInfoLabel}>Speed: </Text>
                    {tappedLocation.coords.speed ? `${(tappedLocation.coords.speed * 3.6).toFixed(1)} km/h` : 'N/A'}
                  </Text>
                </View>
              )}
            </View>
          )}
          
          {currentSegment && (
            <View style={styles.segmentInfo}>
              <Text style={styles.segmentTitle}>ROAD INFORMATION</Text>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Road Name:</Text>
                <Text style={styles.infoValue}>
                  {currentSegment.name || currentSegment.ref || 'Unnamed Road'}
                </Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Road Type:</Text>
                <Text style={styles.infoValue}>
                  {currentSegment.highway || currentSegment.type || 'Unknown'}
                </Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Speed Limit:</Text>
                <Text style={styles.infoValue}>
                  {currentSegment.speedLimit} km/h
                  {currentSegment.maxspeed && currentSegment.maxspeed !== String(currentSegment.speedLimit) && 
                    ` (OSM: ${currentSegment.maxspeed})`}
                </Text>
              </View>
              
              {distanceToSegment !== null && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Distance to Segment:</Text>
                  <Text style={styles.infoValue}>
                    {(distanceToSegment * 1000).toFixed(0)} meters
                  </Text>
                </View>
              )}
              
              {debugMode && currentSegment.properties && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Segment Properties:</Text>
                  <Text style={styles.infoValue}>
                    {JSON.stringify(currentSegment.properties, null, 2)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  debugContainer: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 100,
  },
  debugToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  debugInfoLabel: {
    fontWeight: 'bold',
    color: '#3498db',
    fontSize: 12,
    marginRight: 5,
  },
  debugText: {
    color: 'white',
    marginRight: 8,
    fontSize: 12,
  },
  debugButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  debugButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  contentContainer: {
    width: '100%',
    alignItems: 'center',
  },
  speedLimitContainer: {
    marginBottom: 40,
    alignItems: 'center',
  },
  speedLimitCircle: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 12,
    borderColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  speedLimitText: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  speedingCircle: {
    borderColor: '#e74c3c',
    backgroundColor: '#e74c3c',
  },
  kmhText: {
    fontSize: 24,
    color: '#2c3e50',
    marginTop: -8,
    fontWeight: '600',
  },
  speedingText: {
    color: 'white',
  },
  currentSpeedContainer: {
    backgroundColor: 'white',
    padding: 25,
    borderRadius: 20,
    width: '90%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  currentSpeedLabel: {
    fontSize: 16,
    color: '#7f8c8d',
    marginBottom: 5,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  currentSpeedText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  unitText: {
    fontSize: 24,
    color: '#95a5a6',
    fontWeight: '500',
  },
  speedDifferenceContainer: {
    marginTop: 15,
    alignItems: 'center',
  },
  speedDifferenceText: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  overSpeedText: {
    color: '#e74c3c',
  },
  underSpeedText: {
    color: '#2ecc71',
  },
  speedDifferenceLabel: {
    fontSize: 14,
    color: '#95a5a6',
    marginTop: 2,
    fontWeight: '500',
  },
  
  warningContainer: {
    marginTop: 30,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
  },
  
  warningText: {
    color: '#e74c3c',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  
  warningSubtext: {
    color: '#e74c3c',
    fontSize: 14,
    marginTop: 5,
    fontWeight: '500',
  },
  
  infoContainer: {
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  
  coordinateContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  
  coordinateText: {
    fontSize: 14,
    color: '#2c3e50',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 10,
  },
  mapLinksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 10,
  },
  mapLinkButton: {
    backgroundColor: '#3498db',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  mapLinkText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  
  segmentInfo: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  
  segmentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  
  infoLabel: {
    fontSize: 15,
    color: '#7f8c8d',
    flex: 1,
  },
  
  infoValue: {
    fontSize: 15,
    color: '#2c3e50',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  
  tagsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  
  tagsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: 8,
  },
  
  tagRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  
  tagKey: {
    fontSize: 12,
    color: '#7f8c8d',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    width: 120,
  },
  
  tagValue: {
    fontSize: 12,
    color: '#2c3e50',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  
  debugInfoContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  
  debugInfoText: {
    color: '#7f8c8d',
    fontSize: 12,
    fontFamily: 'monospace',
    marginVertical: 2,
  },
  
  errorContainer: {
    marginTop: 20,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    padding: 15,
    borderRadius: 10,
    alignSelf: 'stretch',
    marginHorizontal: 20,
  },
  
  errorText: {
    color: '#e74c3c',
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '500',
  },
});
