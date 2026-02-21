import React, { useState, useEffect, useMemo } from 'react';
import CustomTimeline from './CustomTimeline';

// Add Mapbox CSS and JS
const mapboxCSS = document.createElement('link');
mapboxCSS.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
mapboxCSS.rel = 'stylesheet';
document.head.appendChild(mapboxCSS);

const mapboxScript = document.createElement('script');
mapboxScript.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
document.head.appendChild(mapboxScript);

const CrashDashboard = () => {
  const [mapBounds, setMapBounds] = useState(null);
  const [data, setData] = useState([]);
  const [map, setMap] = useState(null);
  const [filteredData, setFilteredData] = useState([]);
  const [brushIndices, setBrushIndices] = useState({ startIndex: 0, endIndex: 0 });
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [searchValue, setSearchValue] = useState('');
  const [showMethodology, setShowMethodology] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load GeoJSON data
  useEffect(() => {
    const filePath = './output_2026-02-15.geojson';
    
    fetch(filePath)
      .then(res => res.json())
      .then(geojson => {
        const features = geojson.features.map(f => ({
          ...f.properties,
          coordinates: f.geometry.coordinates,
          timestamp: new Date(f.properties.date).getTime()
        }));
        setData(features);
      })
      .catch(err => console.error('Error loading data:', err));
  }, []);

  // Initialize Mapbox
  useEffect(() => {
    if (!map && data.length > 0 && window.mapboxgl) {
      window.mapboxgl.accessToken = 'pk.eyJ1Ijoiam9yam9uZTkwIiwiYSI6ImNrZ3R6M2FvdTBwbmwycXBibGRqM2w2enYifQ.BxjvFSGqefuC9yFCrXC-nQ';
      
      const mapInstance = new window.mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/light-v11',
        center: [43.5, 42.25],
        zoom: 6.75
      });

      mapInstance.on('load', () => {
        setMap(mapInstance);
        setMapBounds(mapInstance.getBounds());
        
        mapInstance.on('moveend', () => {
          setMapBounds(mapInstance.getBounds());
        });
      });
    }
  }, [data, map]);

  // Timeline data processing
  const timelineData = useMemo(() => {
    if (!data.length) return [];
    
    const grouped = {};
    data.forEach(d => {
      const date = new Date(d.timestamp);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
      grouped[dateStr] = (grouped[dateStr] || 0) + 1;
    });

    const result = Object.entries(grouped)
      .map(([date, count]) => {
        const parts = date.split('/');
        const timestamp = new Date(parts[2], parts[1] - 1, parts[0]).getTime();
        return {
          date,
          count,
          timestamp
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
    
    if (result.length > 0 && brushIndices.endIndex === 0) {
      setBrushIndices({ 
        startIndex: Math.max(0, result.length - 60), 
        endIndex: result.length - 1 
      });
    }
    
    return result;
  }, [data, brushIndices]);

  // Filter data based on brush selection AND map bounds
  useEffect(() => {
    if (timelineData.length === 0 || brushIndices.endIndex === 0) return;
    
    const startDate = timelineData[brushIndices.startIndex]?.timestamp;
    const endDate = timelineData[brushIndices.endIndex]?.timestamp;
    
    if (startDate && endDate) {
      let filtered = data.filter(d => 
        d.timestamp >= startDate && d.timestamp <= endDate + 86400000
      );
      
      if (mapBounds && map) {
        filtered = filtered.filter(d => {
          const [lng, lat] = d.coordinates;
          return (
            lng >= mapBounds.getWest() &&
            lng <= mapBounds.getEast() &&
            lat >= mapBounds.getSouth() &&
            lat <= mapBounds.getNorth()
          );
        });
      }
      
      setFilteredData(filtered);
    }
  }, [brushIndices, timelineData, data, mapBounds, map]);

  // Update map with filtered data
  useEffect(() => {
    if (!map || filteredData.length === 0) return;

    if (map.getSource('crashes')) {
      map.getSource('crashes').setData({
        type: 'FeatureCollection',
        features: filteredData.map(d => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: d.coordinates
          },
          properties: {
            time_of_day: d.time_of_day,
            weekday: d.weekday
          }
        }))
      });
    } else {
      map.addSource('crashes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: filteredData.map(d => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: d.coordinates
            },
            properties: {
              time_of_day: d.time_of_day,
              weekday: d.weekday
            }
          }))
        }
      });

      map.addLayer({
        id: 'crashes-heat',
        type: 'heatmap',
        source: 'crashes',
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': 1,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 255, 0)',
            0.2, 'rgb(65, 105, 225)',
            0.4, 'rgb(255, 215, 0)',
            0.6, 'rgb(255, 165, 0)',
            0.8, 'rgb(255, 69, 0)',
            1, 'rgb(178, 34, 34)'
          ],
          'heatmap-radius': 20,
          'heatmap-opacity': 0.7
        }
      });

      map.addLayer({
        id: 'crashes-circle',
        type: 'circle',
        source: 'crashes',
        minzoom: 14,
        paint: {
          'circle-radius': 4,
          'circle-color': '#ff6b6b',
          'circle-opacity': 0.8,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff'
        }
      });
    }
  }, [map, filteredData]);

  const handleBrushChange = (brushData) => {
    if (brushData && brushData.startIndex !== undefined && brushData.endIndex !== undefined) {
      setBrushIndices({
        startIndex: brushData.startIndex,
        endIndex: brushData.endIndex
      });
    }
  };

  // Translation function
  const translateTimeOfDay = (time) => {
    const translations = {
      'Dawn': 'განთიადი',
      'Morning': 'დილა',
      'Afternoon': 'შუადღე',
      'Evening': 'საღამო',
      'Night': 'ღამე',
      'N/A': 'N/A'
    };
    return translations[time] || time;
  };

  // Fetch city suggestions
  const fetchSuggestions = async (query) => {
    if (query.length < 3) {
      setCitySuggestions([]);
      return;
    }
    
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
        `country=GE&types=place&limit=5&access_token=${window.mapboxgl.accessToken}`
      );
      const data = await response.json();
      
      if (data.features) {
        setCitySuggestions(data.features.map(f => ({
          name: f.text,
          fullName: f.place_name,
          coordinates: f.center
        })));
      }
    } catch (error) {
      console.error('Suggestion error:', error);
    }
  };

  // Search city function
  const searchCity = (cityName, coordinates = null) => {
    if (!map) return;
    
    if (coordinates) {
      map.flyTo({
        center: coordinates,
        zoom: 12,
        duration: 2000
      });
      setCitySuggestions([]);
      setSearchValue('');
      return;
    }
    
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cityName)}.json?` +
      `country=GE&types=place&access_token=${window.mapboxgl.accessToken}`
    )
      .then(res => res.json())
      .then(data => {
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].center;
          map.flyTo({
            center: [lng, lat],
            zoom: 12,
            duration: 2000
          });
          setCitySuggestions([]);
          setSearchValue('');
        } else {
          alert('ქალაქი ვერ მოიძებნა');
        }
      })
      .catch(error => {
        console.error('Search error:', error);
        alert('ძიების შეცდომა');
      });
  };

  // Share functions
  const shareOnFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank');
  };

  const shareOnLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`, '_blank');
  };

  const shareViaEmail = () => {
    window.location.href = `mailto:?subject=საგზაო უსაფრთხოება საქართველოში&body=ნახეთ ეს დეშბორდი: ${window.location.href}`;
  };

  // Calculate insights
  const insights = useMemo(() => {
    if (!filteredData.length || !timelineData.length || brushIndices.endIndex === 0) return null;

    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const weekdayCrashes = filteredData.filter(d => weekdays.includes(d.weekday));
    const weekendCrashes = filteredData.filter(d => !weekdays.includes(d.weekday));
    
    const uniqueWeekdays = new Set(weekdayCrashes.map(d => 
      new Date(d.timestamp).toDateString()
    ));
    const uniqueWeekends = new Set(weekendCrashes.map(d => 
      new Date(d.timestamp).toDateString()
    ));

    const weekdayAvg = uniqueWeekdays.size > 0 ? 
      (weekdayCrashes.length / uniqueWeekdays.size).toFixed(1) : '0';
    const weekendAvg = uniqueWeekends.size > 0 ? 
      (weekendCrashes.length / uniqueWeekends.size).toFixed(1) : '0';

    const timeOfDayGroups = {};
    filteredData.forEach(d => {
      timeOfDayGroups[d.time_of_day] = (timeOfDayGroups[d.time_of_day] || 0) + 1;
    });
    const mostDangerousTime = Object.entries(timeOfDayGroups)
      .sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];

    const mostDangerousTimeOfDay = mostDangerousTime[0];
    const crashesInDangerousTime = filteredData.filter(d => d.time_of_day === mostDangerousTimeOfDay);
    const hourGroups = {};
    crashesInDangerousTime.forEach(d => {
      if (d.time_only) {
        const hour = d.time_only.split(':')[0] + ':00';
        hourGroups[hour] = (hourGroups[hour] || 0) + 1;
      }
    });
    const mostDangerousHour = Object.entries(hourGroups).length > 0 
      ? Object.entries(hourGroups).sort((a, b) => b[1] - a[1])[0][0]
      : null;

    const monthGroups = {};
    filteredData.forEach(d => {
      const date = new Date(d.timestamp);
      const georgianMonths = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 
                              'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
      const month = georgianMonths[date.getMonth()];
      monthGroups[month] = (monthGroups[month] || 0) + 1;
    });
    const peakMonth = Object.entries(monthGroups)
      .sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];

    const startDate = timelineData[brushIndices.startIndex]?.timestamp;
    const endDate = timelineData[brushIndices.endIndex]?.timestamp;
    const daysDifference = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    return {
      weekdayAvg,
      weekendAvg,
      mostDangerousTime,
      mostDangerousHour,
      peakMonth,
      totalCrashes: filteredData.length,
      dateRange: daysDifference,
      startDate,
      endDate
    };
  }, [filteredData, timelineData, brushIndices]);

  return (
    <div className="dashboard-container" style={{
      background: '#fff',
      color: '#e8e8e8',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '1rem',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Methodology Modal */}
      {showMethodology && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(10px)',
          background: 'rgba(0, 0, 0, 0.5)'
        }}
        onClick={() => setShowMethodology(false)}
        >
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '10px',
            padding: '2rem',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ 
              color: '#542788', 
              marginTop: 0,
              fontSize: '1.5rem', 
              fontFamily: '"BPG Nino Elite Caps", sans-serif',
            }}>მეთოდოლოგია</h2>
            <div style={{ color: '#333', lineHeight: '1.6' }}>
              <h3 style={{ fontFamily: '"BPG Nino Elite Caps", sans-serif', color: '#542788', fontSize: '1.2rem' }}>ვიზუალიზაცია</h3>
              <p style={{ fontFamily: '"ALK Rounded Nusx Med", sans-serif', }}>რუკაზე წარმოდგენილი სითბური ანალიზი, აჩვენებს შემთხვევების კონცენტრაციას. რუკაზე მიახლოების შემთხვევაში იხილავთ ინდივიდუალურ შემთხვევებსაც.</p>
              <p style={{ fontFamily: '"ALK Rounded Nusx Med", sans-serif', }}>საგზაო შემთხვევების ანალიტიკა საქართველოში. მონაცემები აერთიანებს მხოლოდ სსკ 276-ე მუხლით შეფასებულ დარღვევებს - 
                ტრანსპორტის მოძრაობის უსაფრთხოების ან ექპლუატაციის წესის დარღვევა.</p>

              <h3 style={{ fontFamily: '"BPG Nino Elite Caps", sans-serif', color: '#542788', fontSize: '1.2rem' }}>მონაცემთა წყარო</h3>
              <p style={{ fontFamily: '"ALK Rounded Nusx Med", sans-serif', }}>მონაცემები შეგროვებულია maps.police.ge პლატფორმიდან. მონაცემთა ანალიზი, დახარისხება და გადმოსაწერად მომზადება ხდება [თითქმის] ყოველკვირეულად.
                ბოლო განახლების თარიღი მითითებულია ქვემოთ.
              </p>
              
              <h3 style={{ fontFamily: '"BPG Nino Elite Caps", sans-serif', color: '#542788', fontSize: '1.2rem' }}>ფილტრაცია</h3>
              <p style={{ fontFamily: '"ALK Rounded Nusx Med", sans-serif', }}>მონაცემთა გასაფილტრად, შეგიძლიათ გამოიყენოთ რუკის ქვემოთ არსებული თაიმლაინი.</p>

              <h3 style={{ fontFamily: '"BPG Nino Elite Caps", sans-serif', color: '#542788', fontSize: '1.2rem' }}>ციტირება</h3>
              <p style={{ fontFamily: '"ALK Rounded Nusx Med", sans-serif', }}> მონაცემების გადმოწერის და გამოყენების შემთხვევაში, გთხოვთ, წყარო მიუთითოთ შესაბამის ფორმატში 
                - <i>საგზაო უსაფრთხოება საქართველოში - შსს, Z.axis (2026).</i></p>
            </div>
            <button 
              onClick={() => setShowMethodology(false)}
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 2rem',
                background: '#542788',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              დახურვა
            </button>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="main-layout" style={{
        display: 'flex',
        gap: '1.5rem',
        height: '75vh',
        minHeight: 0,
        marginBottom: '1rem'
      }}>
        {/* Left Column - Insights */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          width: '20%',
          flexShrink: 0
        }}>
          <div className="insight-cards" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            flex: 1
          }}>
            {insights && (
              <>
                <div className="insight-card" style={{
                  boxShadow: '0 10px 10px rgba(107, 107, 107, 0.15)',
                  padding: '1rem',
                  borderRadius: '2px',
                  position: 'relative',
                  overflow: 'hidden',
                  flex: 0.25
                }}>
                  <div style={{
                    fontSize: '1rem',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: '#666',
                    marginBottom: '.5rem',
                    fontFamily: '"BPG Nino Elite Caps", sans-serif'
                  }}>
                    <b>{insights.dateRange}-დღიან პერიოდში</b>
                  </div>
                  <div className="big-number" style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1.5rem', fontWeight: '300', color: '#542788', marginBottom: '0.5rem'}}>
                    {insights.totalCrashes} შემთხვევა
                  </div>
                  <div style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1rem', color: '#999', marginBottom: '0.3rem' }}>
                    {insights && (
                      <>
                        {(() => {
                          const georgianMonths = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 
                                                  'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
                          const startDate = new Date(insights.startDate);
                          const endDate = new Date(insights.endDate);
                          return `${startDate.getDate()} ${georgianMonths[startDate.getMonth()]} ${startDate.getFullYear()} - ${endDate.getDate()} ${georgianMonths[endDate.getMonth()]} ${endDate.getFullYear()}`;
                        })()}
                      </>
                    )}
                  </div>
                </div>

                <div className="insight-card" style={{
                  boxShadow: '0 10px 10px rgba(107, 107, 107, 0.15)',
                  padding: '1rem',
                  borderRadius: '2px',
                  position: 'relative',
                  overflow: 'hidden',
                  flex: 0.25
                }}>
                  <div style={{
                    fontSize: '1rem',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: '#4d4d4d',
                    marginBottom: '.5rem',
                    fontFamily: '"BPG Nino Elite Caps", sans-serif'
                  }}>
                    <b>ყოველდღიური საშუალო</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div>
                      <div className="big-number" style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1.5rem', fontWeight: '300', color: '#ff6b6b', marginBottom: '0.25rem' }}>
                        {insights.weekdayAvg}
                      </div>
                      <div style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1rem', color: '#999' }}>სამუშაო დღე</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="big-number" style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1.5rem', fontWeight: '300', color: '#4ecdc4', marginBottom: '0.25rem' }}>
                        {insights.weekendAvg}
                      </div>
                      <div style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1rem', color: '#999' }}>შაბათ-კვირა</div>
                    </div>
                  </div>
                </div>

                <div className="insight-card" style={{
                  boxShadow: '0 10px 10px rgba(107, 107, 107, 0.15)',
                  padding: '1rem',
                  borderRadius: '2px',
                  position: 'relative',
                  overflow: 'hidden',
                  flex: 0.25
                }}>
                  <div style={{
                    fontSize: '1rem',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: '#4d4d4d',
                    marginBottom: '.5rem',
                    fontFamily: '"BPG Nino Elite Caps", sans-serif'
                  }}>
                    <b>მაღალი რისკი</b>
                  </div>
                  <div className="big-number" style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1.5rem', fontWeight: '300', color: '#ffc107', marginBottom: '0.5rem' }}>
                    {translateTimeOfDay(insights.mostDangerousTime[0])}
                    {insights.mostDangerousHour && ` (${insights.mostDangerousHour})`}
                  </div>
                  <div style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1rem', color: '#999' }}>
                    {insights.mostDangerousTime[1]} შემთხვევა ({insights.totalCrashes > 0 ? ((insights.mostDangerousTime[1] / insights.totalCrashes) * 100).toFixed(1) : 0}%)
                  </div>
                </div>

                <div className="insight-card" style={{
                  boxShadow: '0 10px 10px rgba(107, 107, 107, 0.15)',
                  padding: '1rem',
                  borderRadius: '2px',
                  position: 'relative',
                  overflow: 'hidden',
                  flex: 0.25
                }}>
                  <div style={{
                    fontSize: '1rem',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: '#4d4d4d',
                    marginBottom: '.5rem',
                    fontFamily: '"BPG Nino Elite Caps", sans-serif'
                  }}>
                    <b>პიკური თვე</b>
                  </div>
                  <div className="big-number" style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1.5rem', fontWeight: '300', color: '#4ecdc4', marginBottom: '0.5rem' }}>
                    {insights.peakMonth[0]}
                  </div>
                  <div style={{ fontFamily: '"Fira Mono", sans-serif', fontSize: '1rem', color: '#999' }}>
                    {insights.peakMonth[1]} შემთხვევა
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="map-container" style={{
          background: '#0f0f0f',
          boxShadow: '0 15px 40px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          flex: 1,
          position: 'relative'
        }}>
          <div className="map-header" style={{
            position: 'absolute',
            left: '1.5rem',
            top: '1.5rem',
            zIndex: 1000,
            background: 'rgba(82, 81, 81, 0.5)',
            padding: '0.5rem 1rem',
            borderRadius: '10px',
            backdropFilter: 'blur(10px)',
            maxWidth: '700px'
          }}>
            <h1 style={{
              fontFamily: '"BPG Nino Elite Caps", sans-serif',
              fontSize: '1.25rem',
              fontWeight: '400',
              margin: '0',
              color: '#ffffff'
            }}>
              <b>საგზაო უსაფრთხოება საქართველოში</b>
            </h1>
          </div>

          {!isMobile && (
            <div className="social-buttons" style={{              
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              zIndex: 1000
            }}>
              <button 
                onClick={shareOnFacebook}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#1877f2',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                title="გაზიარება Facebook-ზე"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </button>
              
              <button 
                onClick={shareOnLinkedIn}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#0077b5',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                title="გაზიარება LinkedIn-ზე"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </button>
              
              <button 
                onClick={shareViaEmail}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#666',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                title="გაზიარება ელფოსტით"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
              </button>
            </div>
          )}

          {/* Search Bar - Right Side */}
          <div className={`map-search ${searchExpanded ? 'expanded' : ''}`} style={{
            position: 'absolute',
            right: '1.5rem',
            top: '1.5rem',
            zIndex: 1000,
            width: '250px'
          }}>
            <div style={{ position: 'relative' }}>
              {/* Search icon button - only visible on mobile when not expanded */}
              <button
                className="search-toggle-btn"
                onClick={() => setSearchExpanded(true)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.9)',
                  cursor: 'pointer',
                  display: 'none',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 2px rgba(0,0,0,0.1)'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              </button>

              {/* Search input */}
              <input
                className="search-input"
                type="text"
                placeholder="ქალაქის ძიება..."
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value);
                  fetchSuggestions(e.target.value);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && searchValue.trim()) {
                    searchCity(searchValue.trim());
                  }
                }}
                onBlur={() => {
                  if (window.innerWidth <= 768 && !searchValue) {
                    setTimeout(() => setSearchExpanded(false), 200);
                  }
                }}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(10px)',
                  fontSize: '0.9rem',
                  fontFamily: '"Noto Sans Georgian", sans-serif',
                  width: '100%',
                  boxSizing: 'border-box',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                }}
              />
              
              {citySuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '0.25rem',
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  zIndex: 1001
                }}>
                  {citySuggestions.map((city, index) => (
                    <div
                      key={index}
                      onClick={() => searchCity(city.name, city.coordinates)}
                      style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        borderBottom: index < citySuggestions.length - 1 ? '1px solid #eee' : 'none',
                        fontFamily: '"Noto Sans Georgian", sans-serif',
                        fontSize: '0.9rem',
                        color: '#333'
                      }}
                      onMouseEnter={(e) => e.target.style.background = 'rgba(84, 39, 136, 0.1)'}
                      onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                      {city.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        
          <div id="map" style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      {/* Timeline */}
      <div className="timeline-chart" style={{
        background: '#fff',
        borderRadius: '2px',
        padding: '.25rem',
        flexShrink: 0
      }}>
        {timelineData.length > 0 && (
          <CustomTimeline 
            data={timelineData}
            brushIndices={brushIndices}
            onBrushChange={handleBrushChange}
          />
        )}
      </div>

      {/* Footer */}
      <div className="footer" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 0 0 0',
        borderTop: '1px solid #2a2a2a',
        fontSize: '0.85rem',
        color: '#666',
        fontFamily: '"Fira Mono", sans-serif',
        flexShrink: 0
      }}>
        <div style={{
          fontSize: '0.85rem',
          color: '#666',
        }}>
          <span style={{ color: '#888' }}>ბოლო განახლება: </span>
          <b><span style={{ color: '#000' }}>
            {data.length > 0 && (() => {
              const georgianMonths = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 
                                      'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
              const date = new Date(data[data.length - 1].timestamp);
              return `${date.getDate()} ${georgianMonths[date.getMonth()]} ${date.getFullYear()}`;
            })()}
          </span></b>
        </div>

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          gap: '0.5rem',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)'
        }}>
          <a href="https://zaxis.ge" target="_blank" rel="noopener noreferrer">
            <img src="./black-logo.png" alt="Z.axis" style={{ width: '50px' }} />
          </a>
          <span style={{ fontSize: '10px', color: '#000' }}>© 2019-2026</span>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={() => setShowMethodology(true)}
            style={{
              background: 'transparent',
              border: '1px solid #2a2a2a',
              color: '#000',
              padding: '0.5rem 1rem',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontFamily: '"BPG Nino Elite Caps", sans-serif',
            }}
          >
            <b>მეთოდოლოგია</b>
          </button>
          
          <button 
            onClick={() => {
              const link = document.createElement('a');
              link.href = './output_2026-02-15.geojson';
              link.download = 'crash-data.geojson';
              link.click();
            }}
            style={{
              background: 'transparent',
              border: '1px solid #2a2a2a',
              color: '#000',
              padding: '0.5rem 1rem',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontFamily: '"BPG Nino Elite Caps", sans-serif',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <b>მონაცემები</b>
          </button>
        </div>

        {isMobile && (
          <div style={{
            position: 'absolute',
            bottom: '-4rem',
            left: '50%',
            display: 'flex',
            alignItems: 'center',
            flexDirection: 'row',
            gap: '20px',
            justifyContent: 'center'
          }}>
            <button 
              onClick={shareOnFacebook}
              style={{
                border: 'none',
                background: '#1877f2',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
              title="გაზიარება Facebook-ზე"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </button>
            
            <button 
              onClick={shareOnLinkedIn}
              style={{
                border: 'none',
                background: '#0077b5',
                color: '#fff',
                cursor: 'pointer',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
              title="გაზიარება LinkedIn-ზე"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </button>
            
            <button 
              onClick={shareViaEmail}
              style={{
                
                border: 'none',
                background: '#666',
                color: '#fff',
                cursor: 'pointer',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
              title="გაზიარება ელფოსტით"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </button>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Mono:wght@400;500;700&family=Noto+Sans+Georgian:wght@100..900&display=swap');
        @import url("//cdn.web-fonts.ge/fonts/bpg-nino-elite-caps/css/bpg-nino-elite-caps.min.css");
        @import url("//cdn.web-fonts.ge/fonts/alk-rounded-nusx-med/css/alk-rounded-nusx-med.min.css");

        body, html { margin: 0; padding: 0; overflow: hidden; }
        #root { height: 100vh; }
        * { outline: none !important; }
        *:focus { outline: none !important; }
        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }
        
        /* Social buttons - always right side, middle height */
        .social-buttons {
          position: fixed;
          right: 2rem;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          z-index: 1000;
        }
        
        @media (max-width: 768px) {
        body, html {
          overflow-y: auto !important;
          overflow-x: hidden !important;
        }
        
        .dashboard-container {
          padding: 0 !important;
          height: auto !important;
          min-height: 100vh !important;
          overflow: visible !important;
        }
        
        /* Fixed header at top */
        .map-header {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          transform: none !important;
          width: 100% !important;
          max-width: 100% !important;
          padding: 1rem !important;
          text-align: center !important;
          background: rgba(82, 81, 81, 0.95) !important;
          backdrop-filter: blur(20px) !important;
          z-index: 10001 !important;
          border-radius: 0 !important;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
        }

        .map-header h1 {
          font-size: 1rem !important;
          margin: 0 !important;
          text-align: center !important;
        }
        
        /* Main layout - vertical stack */
        .main-layout {
          flex-direction: column !important;
          height: auto !important;
          margin-bottom: 0 !important;
          gap: 0 !important;
          padding-top: 3.5rem !important;
        }
        
        /* Map first - full width */
        .main-layout > div:nth-child(2) {
          order: 1 !important;
          width: 100% !important;
          height: 50vh !important;
          min-height: 400px !important;
          margin: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        
        /* Search button - top right corner of map */
        .map-search {
          right: 1rem !important;
          top: 1rem !important;
          width: auto !important;
        }

        .search-toggle-btn {
          display: flex !important;
        }

        .search-input {
          display: none !important;
        }

        .map-search.expanded {
          width: calc(100% - 2rem) !important;
          max-width: 400px !important;
        }

        .map-search.expanded .search-toggle-btn {
          display: none !important;
        }

        .map-search.expanded .search-input {
          display: block !important;
        }        
        
        /* Insights second - full width cards */
        .main-layout > div:first-child {
          order: 2 !important;
          width: 100% !important;
          padding: 1rem !important;
          background: #f9f9f9 !important;
        }
        
        .insight-cards {
          flex-direction: column !important;
          overflow: hidden !important;
          padding: 0 !important;
        }
        
        .insight-card {
          width: 100% !important;
          border-radius: 8px !important;
          background: white !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
        }
        
        .insight-card b {
          font-size: 0.85rem !important;
        }
        
        .big-number {
          font-size: 1.5rem !important;
        }
        
        /* Timeline third */
        .timeline-chart {
          padding: 1rem !important;
          margin: 0 !important;
          background: white !important;
          border-top: 1px solid #eee !important;
        }
        
        /* Footer at bottom - logo centered */
        .footer {
          flex-direction: column !important;
          gap: 1rem !important;
          padding: 1.5rem 1rem 2rem 1rem !important;  /* Added bottom padding for social buttons */
          align-items: center !important;
          background: #fafafa !important;
          border-top: 1px solid #eee !important;
          margin: 0 !important;
          display: flex !important;
          position: relative !important;
        }

        /* Last update - first */
        .footer > div:first-child {
          position: static !important;
          transform: none !important;
          order: 1 !important;
          text-align: center !important;
        }

        /* Buttons (methodology/data) - second */
        .footer > div:nth-child(2) {
          position: static !important;
          transform: none !important;
          order: 2 !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 0.75rem !important;
          width: 100% !important;
        }

        .footer button {
          font-size: 0.8rem !important;
          padding: 0.75rem 1.5rem !important;
          width: 100% !important;
          max-width: 300px !important;
        }

        /* Logo and copyright - last */
        .footer > div:last-child {
          position: static !important;
          transform: none !important;
          order: 4 !important;
        }
      }

      @media (max-width: 480px) {
        body, html {
          overflow-y: auto !important;
          overflow-x: hidden !important;
        }
        
        .dashboard-container {
          padding: 0 !important;
          height: auto !important;
          min-height: 100vh !important;
          overflow: visible !important;
        }
        
        /* Fixed header at top */
        .map-header {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          transform: none !important;
          width: 100% !important;
          max-width: 100% !important;
          padding: 1rem !important;
          text-align: center !important;
          background: rgba(82, 81, 81, 0.95) !important;
          backdrop-filter: blur(20px) !important;
          z-index: 10001 !important;
          border-radius: 0 !important;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
        }

        .map-header h1 {
          font-size: 1rem !important;
          margin: 0 !important;
          text-align: center !important;
        }
        
        /* Main layout - vertical stack */
        .main-layout {
          flex-direction: column !important;
          height: auto !important;
          margin-bottom: 0 !important;
          gap: 0 !important;
          padding-top: 3.5rem !important;
        }
        
        /* Map first - full width */
        .main-layout > div:nth-child(2) {
          order: 1 !important;
          width: 100% !important;
          height: 50vh !important;
          min-height: 400px !important;
          margin: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        
        /* Move social buttons out of map on mobile */
        .main-layout > div:nth-child(2) .social-buttons {
          position: static !important;
          order: 3 !important;
        }
        
        /* Search button - top right corner of map */
        .map-search {
          right: 1rem !important;
          top: 1rem !important;
          width: auto !important;
        }

        .search-toggle-btn {
          display: flex !important;
        }

        .search-input {
          display: none !important;
        }

        .map-search.expanded {
          width: calc(100% - 2rem) !important;
          max-width: 400px !important;
        }

        .map-search.expanded .search-toggle-btn {
          display: none !important;
        }

        .map-search.expanded .search-input {
          display: block !important;
        }      
        
        /* Insights second - full width cards */
        .main-layout > div:first-child {
          order: 2 !important;
          width: 100% !important;
          background: #f9f9f9 !important;
        }
        
        .insight-cards {
          flex-direction: column !important;
          overflow: hidden !important;
          width: 100%;
        }
        
        .insight-card {
          border-radius: 8px !important;
          background: white !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
        }
        
        .insight-card b {
          font-size: 0.85rem !important;
        }
        
        .big-number {
          font-size: 1.5rem !important;
        }
        
        /* Timeline third */
        .timeline-chart {
          padding: 1rem !important;
          margin: 0 !important;
          background: white !important;
          border-top: 1px solid #eee !important;
        }
        
        /* Footer at bottom - logo centered */
        .footer {
          flex-direction: column !important;
          gap: 1rem !important;
          padding: 1.5rem 1rem 5rem 1rem !important;  /* Added bottom padding for social buttons */
          align-items: center !important;
          background: #fafafa !important;
          border-top: 1px solid #eee !important;
          margin: 0 !important;
          display: flex !important;
          position: relative !important;
        }

        /* Last update - first */
        .footer > div:first-child {
          position: static !important;
          transform: none !important;
          order: 1 !important;
          text-align: center !important;
        }

        /* Buttons (methodology/data) - second */
        .footer > div:nth-child(2) {
          position: static !important;
          transform: none !important;
          order: 2 !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 0.75rem !important;
          width: 100% !important;
        }

        .footer button {
          font-size: 0.8rem !important;
          padding: 0.75rem 1.5rem !important;
          width: 100% !important;
          max-width: 300px !important;
        }

        /* Logo and copyright - last */
        .footer > div:last-child {
          position: static !important;
          transform: none !important;
          order: 4 !important;
        }
        .footer button {
          font-size: 0.8rem !important;
          padding: 0.75rem 1.5rem !important;
          width: 100% !important;
          max-width: 300px !important;
        }
      }
        
      `}</style>
    </div>
  );
};

export default CrashDashboard;