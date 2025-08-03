import { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, Platform, Switch, Animated, ActivityIndicator, TouchableOpacity, Modal, Dimensions } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { speedLimitService } from '../services/speedLimitService';

const { width, height } = Dimensions.get('window');

export default function SpeedLimitScreen() {
  const [speed, setSpeed] = useState<number | null>(null);
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState<boolean>(true);
  const [showMap, setShowMap] = useState<boolean>(false);
  const [tappedLocation, setTappedLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const debugInterval = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mapRef = useRef<MapView>(null);

  // Initialize speed limit service when component mounts
  useEffect(() => {
    const init = async () => {
      try {
        console.log('Initializing speed limit service...');
        await speedLimitService.initialize();
        console.log('Speed limit service initialized');
        
        // Set initial speed for debug mode
        if (debugMode) {
          setSpeed(50); // Default speed for debug mode
        }
        
        // Set a default location in Maputo for initial load
        const getAndUpdateSpeedLimit = async () => {
          try {
            const limit = await speedLimitService.getSpeedLimitAtLocation({
              coords: {
                latitude: -25.9667,
                longitude: 32.5833,
                altitude: null,
                accuracy: 10,
                altitudeAccuracy: null,
                heading: null,
                speed: null
              },
              timestamp: Date.now()
            });
            setSpeedLimit(limit || 60);
          } catch (error) {
            console.error('Error getting initial speed limit:', error);
            setSpeedLimit(60);
          }
        };
        
        await getAndUpdateSpeedLimit();
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to initialize speed limit service:', error);
        setErrorMsg('Using default location. ' + (error as Error).message);
        setSpeedLimit(60);
        if (debugMode) setSpeed(50);
        setIsLoading(false);
      }
    };
    
    init();
  }, [debugMode]);

  // Get speed limit at a specific location
  const getSpeedLimitAtLocation = useCallback(async (location: { latitude: number; longitude: number }) => {
    try {
      console.log('Getting speed limit for location:', location);
      const limit = await speedLimitService.getSpeedLimitAtLocation({
        coords: { 
          latitude: location.latitude, 
          longitude: location.longitude,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      });
      return limit;
    } catch (error) {
      console.error('Error getting speed limit:', error);
      return 60; // Default speed limit
    }
  }, []);

  // Update speed limit based on location
  const updateSpeedLimit = useCallback(async (lat: number, lon: number) => {
    try {
      console.log('Updating speed limit for location:', { latitude: lat, longitude: lon });
      const speedLimit = await speedLimitService.getSpeedLimitAtLocation({
        coords: { 
          latitude: lat, 
          longitude: lon, 
          altitude: null, 
          accuracy: 10, 
          altitudeAccuracy: null, 
          heading: null, 
          speed: null 
        },
        timestamp: Date.now()
      });
      
      console.log('Got speed limit:', speedLimit);
      setSpeedLimit(speedLimit);
    } catch (error) {
      console.error('Error updating speed limit:', error);
      setSpeedLimit(60); // Default to 60 km/h on error
    }
  }, [getSpeedLimitAtLocation]);

  // Handle map region changes
  const handleRegionChange = useCallback(async (region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => {
    if (!debugMode) return; // Only update from map in debug mode
    
    console.log('=== Map Region Changed ===');
    console.log('Center:', region.latitude.toFixed(6), region.longitude.toFixed(6));
    console.log('Delta:', region.latitudeDelta.toFixed(6), region.longitudeDelta.toFixed(6));
    
    try {
      await updateSpeedLimit(region.latitude, region.longitude);
      console.log('Speed limit updated successfully');
    } catch (error) {
      console.error('Error updating speed limit:', error);
    }
  }, [debugMode, updateSpeedLimit]);

  // Debug mode: Simulate variable speeds
  useEffect(() => {
    if (!debugMode) {
      if (debugInterval.current) {
        clearInterval(debugInterval.current as unknown as number);
        debugInterval.current = null;
      }
      return;
    }

    let currentSpeed = 40;
    let increasing = true;

    // Set initial speed
    setSpeed(currentSpeed);

    // Cycle speed between 40 and 80 km/h
    debugInterval.current = setInterval(() => {
      if (increasing) {
        currentSpeed += 5;
        if (currentSpeed >= 80) increasing = false;
      } else {
        currentSpeed -= 5;
        if (currentSpeed <= 40) increasing = true;
      }
      
      setSpeed(currentSpeed);
      
      console.log('Debug:', {
        speed: currentSpeed,
        limit: speedLimit
      });
    }, 2000) as unknown as NodeJS.Timeout;

    return () => {
      if (debugInterval.current) {
        clearInterval(debugInterval.current as unknown as number);
        debugInterval.current = null;
      }
    };
  }, [debugMode, speedLimit]);

  // Real location tracking
  useEffect(() => {
    if (debugMode || isLoading) return; // Skip if in debug mode or still loading

    (async () => {
      // Request location permissions
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      // Start watching location
      const locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10, // Update every 10 meters (more efficient)
        },
        (newLocation) => {
          // Convert from m/s to km/h and round to whole number
          const speedKmh = newLocation.coords.speed !== null 
            ? Math.round(newLocation.coords.speed * 3.6) 
            : null;
          setSpeed(speedKmh);
          
          // Update speed limit based on new location
          updateSpeedLimit(newLocation.coords.latitude, newLocation.coords.longitude);
          
          console.log('Speed:', speedKmh, 'km/h, Limit:', speedLimit, 'km/h');
        }
      );

      return () => {
        if (locationSubscription) {
          locationSubscription.remove();
        }
      };
    })();
  }, [debugMode, isLoading, updateSpeedLimit, speedLimit]);

  // Check if current speed exceeds the speed limit
  const isSpeeding = speed !== null && speedLimit !== null && speed > speedLimit;

  // Start/stop pulse animation based on speeding state
  useEffect(() => {
    if (isSpeeding) {
      // Create a pulsing animation
      const pulse = Animated.loop(
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
      );
      
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSpeeding, pulseAnim]);

  // Test speed limits at specific points
  const testSpeedLimits = useCallback(async () => {
    console.log('=== Testing Speed Limits ===');
    
    // Points along the Chidenguele to Zandamela route
    const testPoints = [
      { name: 'Near Chidenguele', lat: -24.52, lon: 34.71 },
      { name: 'Midpoint 1', lat: -24.55, lon: 34.72 },
      { name: 'Near Zandamela', lat: -24.63, lon: 34.73 },
      { name: 'Off Route', lat: -24.5, lon: 34.7 }  // Should be far from any segment
    ];
    
    for (const point of testPoints) {
      try {
        const limit = await getSpeedLimitAtLocation({ latitude: point.lat, longitude: point.lon });
        console.log(`Speed limit at ${point.name} (${point.lat}, ${point.lon}): ${limit} km/h`);
      } catch (error) {
        console.error(`Error testing point ${point.name}:`, error);
      }
    }
  }, [getSpeedLimitAtLocation]);

  // Toggle debug mode
  const toggleDebugMode = useCallback(() => {
    const newDebugMode = !debugMode;
    setDebugMode(newDebugMode);
    console.log('Debug mode:', newDebugMode);
    
    if (newDebugMode) {
      // Run tests when entering debug mode
      testSpeedLimits();
      
      // Also test the current map center if map is available
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.getCamera().then(camera => {
            const { center } = camera;
            updateSpeedLimit(center.latitude, center.longitude);
          }).catch(error => {
            console.error('Error getting camera position:', error);
          });
        }
      }, 500);
    }
  }, [debugMode, testSpeedLimits, updateSpeedLimit]);

  // Handle map press in debug mode
  const handleMapPress = useCallback(async (event: any) => {
    if (!debugMode) return;
    
    const { coordinate } = event.nativeEvent;
    setTappedLocation(coordinate);
    
    // Get speed limit at tapped location
    const limit = await getSpeedLimitAtLocation(coordinate);
    console.log('Speed limit at tapped location:', limit);
    
    // Update the speed limit display
    setSpeedLimit(limit);
  }, [debugMode, getSpeedLimitAtLocation]);

  return (
    <View style={styles.container}>
      {/* Debug Toggle in Top Left */}
      <View style={styles.header}>
        <View style={styles.debugToggleContainer}>
          <Text style={styles.debugLabel}>Debug Mode</Text>
          <Switch
            value={debugMode}
            onValueChange={setDebugMode}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={debugMode ? '#f5dd4b' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Speed Display */}
      <View style={styles.speedDisplay}>
        <View style={styles.speedLimitContainer}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text style={styles.loadingText}>Loading speed limits...</Text>
            </View>
          ) : speedLimit === null ? (
            <View style={styles.speedLimitCircle}>
              <Text style={styles.speedLimitText}>--</Text>
              <Text style={styles.kmhText}>km/h</Text>
              <Text style={styles.noDataText}>
                {debugMode ? 'Tap on map to test locations' : 'No speed limit data'}
              </Text>
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
                {speedLimit}
              </Text>
              <Text style={[
                styles.kmhText,
                isSpeeding && styles.speedingText
              ]}>
                km/h
              </Text>
            </View>
          )}
          
          <View style={styles.currentSpeedContainer}>
            <Text style={styles.currentSpeedLabel}>
              Current Speed:
            </Text>
            <Text style={styles.currentSpeedText}>
              {speed !== null ? `${speed} km/h` : '--'}
            </Text>
          </View>

          {isSpeeding && (
            <Animated.Text 
              style={[
                styles.warningText,
                { transform: [{ scale: pulseAnim }] }
              ]}
            >
              SLOW DOWN!
            </Animated.Text>
          )}

          {errorMsg && (
            <Text style={styles.errorText}>{errorMsg}</Text>
          )}
        </View>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: -25.9667,  // Maputo coordinates
            longitude: 32.5833,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
          onRegionChangeComplete={handleRegionChange}
          onPress={debugMode ? handleMapPress : undefined}
          showsUserLocation={!debugMode}
          loadingEnabled={true}
          loadingIndicatorColor="#666666"
          loadingBackgroundColor="#f5f5f5"
          rotateEnabled={false}
          scrollEnabled={true}
          zoomEnabled={true}
          zoomTapEnabled={true}
        >
          {/* OpenStreetMap Tile Layer */}
          <UrlTile
            urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
          />
          
          {tappedLocation && debugMode && (
            <Marker coordinate={tappedLocation}>
              <View style={styles.marker}>
                <Text style={styles.markerText}>
                  {speedLimit || '--'} km/h
                </Text>
              </View>
            </Marker>
          )}
        </MapView>
        {debugMode && (
          <View style={styles.mapOverlay}>
            <Text style={styles.mapOverlayText}>
              {tappedLocation 
                ? `Location: ${tappedLocation.latitude.toFixed(4)}, ${tappedLocation.longitude.toFixed(4)}`
                : 'Tap on map to test locations'}
            </Text>
          </View>
        )}
      </View>


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  debugToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  speedDisplay: {
    height: height * 0.6, // 60% of screen height
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mapButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#2196F3',
    padding: 10,
    borderRadius: 5,
    zIndex: 1,
  },
  mapButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  mapContainer: {
    width: '100%',
    height: height * 0.4, // 40% of screen height
    borderTopWidth: 1,
    borderTopColor: '#eee',
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
    minHeight: 300, // Ensure minimum height for the map
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
      android: {
        flex: 1,
      },
      ios: {
        flex: 1,
      },
    }),
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    alignItems: 'center',
  },
  mapOverlayText: {
    color: 'white',
    fontWeight: 'bold',
  },
  marker: {
    backgroundColor: 'white',
    padding: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  markerText: {
    fontWeight: 'bold',
  },
  closeButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
  },
  closeButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  speedLimitContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  speedLimitCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: 'red',
    marginBottom: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  speedingCircle: {
    backgroundColor: 'red',
    transform: [{ scale: 1.05 }],
  },
  speedLimitText: {
    fontSize: 80,
    fontWeight: 'bold',
    color: 'black',
  },
  speedingText: {
    color: 'white',
  },
  loadingContainer: {
    width: 250,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  noDataText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  locationText: {
    marginTop: 10,
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  kmhText: {
    fontSize: 24,
    color: 'black',
    fontWeight: '600',
    marginTop: -15,
  },
  currentSpeedContainer: {
    alignItems: 'center',
    marginTop: 20,
    minHeight: 100, // Ensure consistent spacing
  },
  currentSpeedLabel: {
    fontSize: 18,
    color: '#333',
    marginBottom: 5,
  },
  currentSpeedText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'black',
    marginBottom: 10,
  },
  warningText: {
    color: 'red',
    fontSize: 36,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    marginTop: 15,
    letterSpacing: 1,
  },
  errorText: {
    color: 'red',
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  debugContainer: {
    marginTop: 30,
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    width: '100%',
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  debugLabel: {
    marginRight: 10,
    fontWeight: '600',
    color: '#333',
  },
  debugText: {
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    fontSize: 12,
  },
});
