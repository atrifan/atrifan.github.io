import { Component } from 'react';
import { View } from '@adobe/react-spectrum';

interface WeatherData {
  temp: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
}

interface WeatherTimeCardState {
  currentTime: Date;
  location: string;
  weather: WeatherData | null;
  loading: boolean;
  error: boolean;
}

export class WeatherTimeCard extends Component<{}, WeatherTimeCardState> {
  private timerInterval: number | null = null;

  constructor(props: {}) {
    super(props);
    this.state = {
      currentTime: new Date(),
      location: 'Loading...',
      weather: null,
      loading: true,
      error: false,
    };
  }

  componentDidMount() {
    this.timerInterval = window.setInterval(() => {
      this.setState({ currentTime: new Date() });
    }, 1000);
    this.fetchLocationAndWeather();
  }

  componentWillUnmount() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  private fetchLocationAndWeather = async () => {
    try {
      // Get location from IP-based geolocation (free, no API key needed)
      const geoRes = await fetch('https://ipapi.co/json/');
      const geoData = await geoRes.json();
      const city = geoData.city || 'Unknown';
      const country = geoData.country_name || '';
      this.setState({ location: country ? `${city}, ${country}` : city });

      // Fetch weather from Open-Meteo (free, no API key)
      const lat = geoData.latitude;
      const lon = geoData.longitude;
      if (lat && lon) {
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
        );
        const weatherData = await weatherRes.json();
        const current = weatherData.current;
        this.setState({
          weather: {
            temp: Math.round(current.temperature_2m),
            condition: this.getWeatherCondition(current.weather_code),
            icon: this.getWeatherIcon(current.weather_code),
            humidity: current.relative_humidity_2m,
            windSpeed: Math.round(current.wind_speed_10m),
          },
          loading: false,
        });
      }
    } catch {
      this.setState({ loading: false, error: true, location: 'Your Location' });
    }
  };

  private getWeatherCondition = (code: number): string => {
    const conditions: Record<number, string> = {
      0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Foggy', 51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
      61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
      77: 'Snow Grains', 80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
      85: 'Snow Showers', 86: 'Heavy Snow Showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
    };
    return conditions[code] || 'Unknown';
  };

  private getWeatherIcon = (code: number): string => {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 55) return '🌧️';
    if (code <= 65) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    if (code <= 86) return '🌨️';
    return '⛈️';
  };

  private getDayPhase = (hour: number): { phase: string; emoji: string; gradient: string } => {
    if (hour >= 5 && hour < 12) return { phase: 'Morning', emoji: '🌅', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)' };
    if (hour >= 12 && hour < 17) return { phase: 'Afternoon', emoji: '☀️', gradient: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)' };
    if (hour >= 17 && hour < 21) return { phase: 'Evening', emoji: '🌆', gradient: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' };
    return { phase: 'Night', emoji: '🌙', gradient: 'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 100%)' };
  };

  private getGreeting = (hour: number): string => {
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    if (hour >= 17 && hour < 21) return 'Good Evening';
    return 'Good Night';
  };

  render() {
    const { currentTime, location, weather, loading } = this.state;
    const hour = currentTime.getHours();
    const { phase, emoji, gradient } = this.getDayPhase(hour);
    const greeting = this.getGreeting(hour);
    const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    return (
      <View UNSAFE_style={{ width: '100%', maxWidth: '600px', margin: '0 auto 2rem' }}>
        <div style={{ background: gradient, borderRadius: '24px', padding: '1.5rem 2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)' }}>
          {/* Greeting & Time */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {emoji} {greeting}!
              </p>
              <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.8)', margin: '0.25rem 0 0' }}>📍 {location}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', margin: 0, fontFamily: 'monospace' }}>{timeStr}</p>
              <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', margin: '0.25rem 0 0' }}>{dateStr}</p>
            </div>
          </div>

          {/* Weather & Day Phase */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '1rem 1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '2.5rem' }}>{loading ? '⏳' : weather?.icon || '🌡️'}</span>
              <div>
                {weather && <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0 }}>{weather.temp}°C</p>}
                <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', margin: 0 }}>{loading ? 'Loading...' : weather?.condition || 'Weather unavailable'}</p>
              </div>
            </div>
            {weather && (
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Humidity</p>
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: 0 }}>💧 {weather.humidity}%</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Wind</p>
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: 0 }}>💨 {weather.windSpeed} km/h</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Phase</p>
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: 0 }}>{phase}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </View>
    );
  }
}

