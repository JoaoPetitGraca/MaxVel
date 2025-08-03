import { StyleSheet, View, Text } from 'react-native';

export default function SpeedLimitScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.speedLimitContainer}>
        <View style={styles.speedLimitCircle}>
          <Text style={styles.speedLimitText}>60</Text>
          <Text style={styles.kmhText}>km/h</Text>
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
});
