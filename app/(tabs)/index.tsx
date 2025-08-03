import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, Platform, Switch } from 'react-native';
import * as Location from 'expo-location';

export default function SpeedLimitScreen() {
  const [speed, setSpeed] = useState<number | null>(null);
  const [speedLimit] = useState<number>(60); // Default speed limit
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState<boolean>(true);
  const debugInterval = useRef<NodeJS.Timeout | null>(null);

  // Debug mode: Simulate variable speeds
  useEffect(() => {
    if (!debugMode) {
      if (debugInterval.current) {
        clearInterval(debugInterval.current);
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
      console.log('Debug speed:', currentSpeed, 'km/h');
    }, 2000); // Change speed every 2 seconds

    return () => {
      if (debugInterval.current) {
        clearInterval(debugInterval.current);
        debugInterval.current = null;
      }
    };
  }, [debugMode]);

  // Real location tracking
  useEffect(() => {
    if (debugMode) return; // Skip real location in debug mode

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
          distanceInterval: 1, // Update every 1 meter
        },
        (newLocation) => {
          // Convert from m/s to km/h and round to whole number
          const speedKmh = newLocation.coords.speed !== null 
            ? Math.round(newLocation.coords.speed * 3.6) 
            : null;
          setSpeed(speedKmh);
          console.log('Speed:', speedKmh, 'km/h');
        }
      );

      return () => {
        if (locationSubscription) {
          locationSubscription.remove();
        }
      };
    })();
  }, [debugMode]);

  // Check if current speed exceeds the speed limit
  const isSpeeding = speed !== null && speed > speedLimit;

  return (
    <View style={styles.container}>
      <View style={styles.speedLimitContainer}>
        <View style={[
          styles.speedLimitCircle,
          isSpeeding && styles.speedingCircle
        ]}>
          <Text style={styles.speedLimitText}>{speedLimit}</Text>
          <Text style={styles.kmhText}>km/h</Text>
        </View>
        
        <View style={styles.currentSpeedContainer}>
          <Text style={styles.currentSpeedLabel}>
            {speed !== null ? 'Current Speed:' : 'Getting speed...'}
          </Text>
          {speed !== null && (
            <Text style={styles.currentSpeedText}>
              {speed} km/h
            </Text>
          )}
          {isSpeeding && (
            <Text style={styles.warningText}>Slow down!</Text>
          )}
        </View>
        
        {errorMsg && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}
        
        {/* Debug controls */}
        <View style={styles.debugContainer}>
          <View style={styles.debugRow}>
            <Text style={styles.debugLabel}>Debug Mode:</Text>
            <Switch
              value={debugMode}
              onValueChange={setDebugMode}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={debugMode ? '#f5dd4b' : '#f4f3f4'}
            />
          </View>
          <Text style={styles.debugText}>
            {debugMode 
              ? 'Debug mode: Speed cycling between 40-80 km/h'
              : Platform.OS === 'android' 
                ? 'Use Extended Controls > Location to simulate movement'
                : 'Use Features > Location to simulate movement'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedLimitContainer: {
    alignItems: 'center',
    padding: 20,
  },
  speedLimitCircle: {
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#000',
    marginBottom: 30,
  },
  speedingCircle: {
    backgroundColor: '#ff0000',
    transform: [{ scale: 1.05 }],
  },
  speedLimitText: {
    fontSize: 120,
    fontWeight: 'bold',
    color: 'white',
  },
  kmhText: {
    fontSize: 24,
    color: 'white',
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  warningText: {
    color: 'red',
    fontSize: 20,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
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
