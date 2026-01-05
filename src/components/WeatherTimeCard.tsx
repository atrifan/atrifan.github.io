import { Component } from 'react';
import { View } from '@adobe/react-spectrum';

interface WeatherData {
  temp: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
}

interface WeatherTimeCardProps {
  userName?: string | null;
}

interface WeatherTimeCardState {
  currentTime: Date | null;
  location: string;
  coordinates: { lat: number; lon: number } | null;
  altitude: number | null; // in meters
  weather: WeatherData | null;
  loading: boolean;
  error: boolean;
  mounted: boolean;
  useCelsius: boolean;
  useKmh: boolean;
  useMeters: boolean;
}

export class WeatherTimeCard extends Component<WeatherTimeCardProps, WeatherTimeCardState> {
  private timerInterval: number | null = null;

  constructor(props: WeatherTimeCardProps) {
    super(props);
    this.state = {
      currentTime: null, // Don't set time in constructor to avoid hydration mismatch
      location: 'Loading...',
      coordinates: null,
      altitude: null,
      weather: null,
      loading: true,
      error: false,
      mounted: false,
      useCelsius: true,
      useKmh: true,
      useMeters: true,
    };
  }

  componentDidMount() {
    // Set initial time only on client side
    this.setState({ currentTime: new Date(), mounted: true });

    this.timerInterval = window.setInterval(() => {
      this.setState({ currentTime: new Date() });
    }, 1000);
    this.fetchLocationAndWeather();
  }

  componentWillUnmount() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  private fetchLocationAndWeather = async () => {
    // Try HTML5 Geolocation first (more accurate), fall back to IP-based
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        // Success - user granted permission
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const altitude = position.coords.altitude; // May be null if not available
          this.setState({
            coordinates: { lat, lon },
            altitude: altitude !== null ? Math.round(altitude) : null
          });
          await this.fetchWeatherAndCity(lat, lon);
        },
        // Error or denied - fall back to IP-based
        async () => {
          await this.fetchLocationByIP();
        },
        { timeout: 5000, enableHighAccuracy: true } // Enable high accuracy to get altitude
      );
    } else {
      // Geolocation not supported - use IP-based
      await this.fetchLocationByIP();
    }
  };

  private fetchLocationByIP = async () => {
    try {
      const geoRes = await fetch('https://ipapi.co/json/');
      const geoData = await geoRes.json();
      const lat = geoData.latitude;
      const lon = geoData.longitude;
      const city = geoData.city || 'Unknown';
      const country = geoData.country_name || '';
      this.setState({
        location: country ? `${city}, ${country}` : city,
        coordinates: lat && lon ? { lat, lon } : null
      });
      if (lat && lon) {
        // Fetch weather and elevation in parallel
        await Promise.all([
          this.fetchWeather(lat, lon),
          this.fetchElevation(lat, lon)
        ]);
      }
    } catch {
      this.setState({ loading: false, error: true, location: 'Your Location' });
    }
  };

  private fetchWeatherAndCity = async (lat: number, lon: number) => {
    try {
      // Reverse geocode to get city name from coordinates
      const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const geoData = await geoRes.json();
      const city = geoData.city || geoData.locality || 'Your Location';
      const country = geoData.countryName || '';
      this.setState({ location: country ? `${city}, ${country}` : city });
      // Fetch weather and elevation in parallel
      await Promise.all([
        this.fetchWeather(lat, lon),
        this.fetchElevation(lat, lon)
      ]);
    } catch {
      // If reverse geocoding fails, still try to get weather
      this.setState({ location: 'Your Location' });
      await this.fetchWeather(lat, lon);
    }
  };

  private fetchElevation = async (lat: number, lon: number) => {
    // Skip if we already have GPS altitude
    if (this.state.altitude !== null) return;

    try {
      // Use Open-Meteo's elevation API (free, no key required)
      const elevRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
      const elevData = await elevRes.json();
      if (elevData.elevation && Array.isArray(elevData.elevation) && elevData.elevation.length > 0) {
        const elevation = elevData.elevation[0];
        if (typeof elevation === 'number') {
          this.setState({ altitude: Math.round(elevation) });
        }
      }
    } catch {
      // Silently fail - altitude is optional
    }
  };

  private fetchWeather = async (lat: number, lon: number) => {
    try {
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
    } catch {
      this.setState({ loading: false, error: true });
    }
  };

  private getWeatherCondition = (code: number): string => {
    if (code === null || code === undefined) return 'No data';
    const conditions: Record<number, string> = {
      0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Rime Fog',
      51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
      56: 'Freezing Drizzle', 57: 'Heavy Freezing Drizzle',
      61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
      66: 'Freezing Rain', 67: 'Heavy Freezing Rain',
      71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
      77: 'Snow Grains', 80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
      85: 'Snow Showers', 86: 'Heavy Snow Showers',
      95: 'Thunderstorm', 96: 'Thunderstorm w/ Hail', 99: 'Heavy Thunderstorm',
    };
    return conditions[code] || `Code ${code}`;
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
    // Using same emojis as Dashboard for consistency
    if (hour >= 5 && hour < 12) return { phase: 'Morning', emoji: '☀️', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)' };
    if (hour >= 12 && hour < 17) return { phase: 'Afternoon', emoji: '🌞', gradient: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)' };
    if (hour >= 17 && hour < 21) return { phase: 'Evening', emoji: '🌙', gradient: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' };
    return { phase: 'Night', emoji: '⭐', gradient: 'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 100%)' };
  };

  private getMoonPhase = (date: Date): { name: string; icon: string } => {
    // Calculate moon phase using a simplified algorithm
    // Based on the synodic month (29.53 days)
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // Calculate days since known new moon (Jan 6, 2000)
    const knownNewMoon = new Date(2000, 0, 6, 18, 14); // Jan 6, 2000 at 18:14 UTC
    const diffMs = date.getTime() - knownNewMoon.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Synodic month is ~29.53 days
    const synodicMonth = 29.53058867;
    const moonAge = ((diffDays % synodicMonth) + synodicMonth) % synodicMonth;

    // Determine phase based on moon age (0-29.53 days)
    if (moonAge < 1.85) return { name: 'New Moon', icon: '🌑' };
    if (moonAge < 5.53) return { name: 'Waxing Crescent', icon: '🌒' };
    if (moonAge < 9.22) return { name: 'First Quarter', icon: '🌓' };
    if (moonAge < 12.91) return { name: 'Waxing Gibbous', icon: '🌔' };
    if (moonAge < 16.61) return { name: 'Full Moon', icon: '🌕' };
    if (moonAge < 20.30) return { name: 'Waning Gibbous', icon: '🌖' };
    if (moonAge < 23.99) return { name: 'Last Quarter', icon: '🌗' };
    if (moonAge < 27.68) return { name: 'Waning Crescent', icon: '🌘' };
    return { name: 'New Moon', icon: '🌑' };
  };

  private getGreeting = (hour: number): string => {
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    if (hour >= 17 && hour < 21) return 'Good Evening';
    return 'Good Night';
  };

  private formatCoordinate = (value: number, isLat: boolean): string => {
    const direction = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    return `${Math.abs(value).toFixed(4)}°${direction}`;
  };

  render() {
    const { currentTime, location, coordinates, altitude, weather, loading, mounted } = this.state;

    // Show loading skeleton until mounted on client
    if (!mounted || !currentTime) {
      return (
        <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', margin: '0 auto 2rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)',
            borderRadius: '24px',
            padding: '1.5rem 2rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.2)',
            minHeight: '150px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem' }}>⏳ Loading...</p>
          </div>
        </View>
      );
    }

    const hour = currentTime.getHours();
    const { phase, emoji, gradient } = this.getDayPhase(hour);
    const moonPhase = this.getMoonPhase(currentTime);
    const greeting = this.getGreeting(hour);
    const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    return (
      <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', margin: '0 auto 2rem' }}>
        <div style={{
          background: gradient,
          borderRadius: '24px',
          padding: 'clamp(1rem, 4vw, 1.5rem) clamp(1rem, 4vw, 2rem)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          {/* Top Section: Greeting + Time/Date */}
          <div style={{
            marginBottom: '1rem',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: '12px',
            padding: '1rem',
          }}>
            {/* Greeting */}
            <p style={{
              fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
              fontWeight: 700,
              color: '#fff',
              margin: '0 0 0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}>
              {emoji} {greeting}{this.props.userName ? `, ${this.props.userName}` : ''}!
            </p>

            {/* Time & Date - Stacked on mobile, inline on desktop */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              marginBottom: '0.5rem',
            }}>
              <p style={{
                fontSize: 'clamp(1.75rem, 6vw, 2.25rem)',
                fontWeight: 800,
                color: '#fff',
                margin: 0,
                fontFamily: 'monospace',
                letterSpacing: '-0.02em',
                textShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }}>
                {timeStr}
              </p>
              <p style={{
                fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
                color: '#fff',
                margin: 0,
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}>
                {dateStr}
              </p>
            </div>

            {/* Location */}
            <p style={{
              fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)',
              color: '#fff',
              margin: 0,
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }}>
              📍 {location}
            </p>
            {coordinates && (
              <p style={{
                fontSize: 'clamp(0.65rem, 2vw, 0.75rem)',
                color: 'rgba(255,255,255,0.9)',
                margin: '0.15rem 0 0',
                fontFamily: 'monospace',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}>
                🌐 {this.formatCoordinate(coordinates.lat, true)}, {this.formatCoordinate(coordinates.lon, false)}
                {altitude !== null && (
                  <span
                    onClick={(e) => { e.stopPropagation(); this.setState({ useMeters: !this.state.useMeters }); }}
                    style={{ cursor: 'pointer' }}
                    title="Click to switch m/ft"
                  >
                    {this.state.useMeters
                      ? ` • ▲ ${altitude}m`
                      : ` • ▲ ${Math.round(altitude * 3.28084)}ft`}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Weather Section */}
          <div style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '16px',
            padding: 'clamp(0.75rem, 3vw, 1rem) clamp(0.75rem, 3vw, 1.25rem)',
          }}>
            {/* Weather Main */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: weather ? '0.75rem' : 0,
            }}>
              <span style={{ fontSize: 'clamp(2rem, 6vw, 2.5rem)' }}>
                {loading ? '⏳' : weather?.icon || '🌡️'}
              </span>
              <div>
                {weather && (
                  <p
                    onClick={() => this.setState({ useCelsius: !this.state.useCelsius })}
                    style={{
                      fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
                      fontWeight: 800,
                      color: '#fff',
                      margin: 0,
                      textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      cursor: 'pointer',
                      transition: 'opacity 0.2s',
                    }}
                    title="Click to switch °C/°F"
                  >
                    {this.state.useCelsius
                      ? `${weather.temp}°C`
                      : `${Math.round(weather.temp * 9/5 + 32)}°F`}
                  </p>
                )}
                <p style={{
                  fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
                  color: '#fff',
                  margin: 0,
                  fontWeight: 600,
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}>
                  {loading ? 'Loading...' : weather?.condition || 'Weather unavailable'}
                </p>
              </div>
            </div>

            {/* Weather Stats Grid */}
            {weather && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 'clamp(0.5rem, 2vw, 1rem)',
                borderTop: '2px solid rgba(255,255,255,0.4)',
                paddingTop: '0.75rem',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', color: 'rgba(255,255,255,0.9)', margin: 0, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>Humidity</p>
                  <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', fontWeight: 700, color: '#fff', margin: 0, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>💧 {weather.humidity}%</p>
                </div>
                <div
                  style={{ textAlign: 'center', cursor: 'pointer' }}
                  onClick={() => this.setState({ useKmh: !this.state.useKmh })}
                  title="Click to switch km/h / mph"
                >
                  <p style={{ fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', color: 'rgba(255,255,255,0.9)', margin: 0, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>Wind</p>
                  <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', fontWeight: 700, color: '#fff', margin: 0, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                    💨 {this.state.useKmh
                      ? `${weather.windSpeed} km/h`
                      : `${Math.round(weather.windSpeed * 0.621371)} mph`}
                  </p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', color: 'rgba(255,255,255,0.9)', margin: 0, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>Phase</p>
                  <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', fontWeight: 700, color: '#fff', margin: 0, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{phase}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', color: 'rgba(255,255,255,0.9)', margin: 0, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>Moon</p>
                  <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', fontWeight: 700, color: '#fff', margin: 0, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{moonPhase.icon}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </View>
    );
  }
}

