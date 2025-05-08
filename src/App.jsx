import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Globe from "react-globe.gl";
import { geoContains } from "d3-geo";
import * as THREE from "three";

function App() {
  const globeRef = useRef();
  const [countries, setCountries] = useState([]);
  const [points, setPoints] = useState([]);
  const [borderPoints, setBorderPoints] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);

  const dotColor = "#8A2BE2";
  const borderColor = "#E0E0FF";

  useEffect(() => {
    const controller = new AbortController();
    fetch("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson", { signal: controller.signal })
      .then(res => res.json())
      .then(data => setCountries(data.features))
      .catch(err => {
        if (err.name !== 'AbortError') console.error("Failed to load countries:", err);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!countries.length) return;

    const generatePoints = () => {
      const countryPoints = [];
      const borders = [];
      const totalPoints = Math.min(15000, countries.length * 100);
      const countryPolygons = countries.map(c => ({ feature: c, id: c.id || c.properties.ISO_A3 || c.properties.name }));

      for (let i = 0; i < totalPoints; i++) {
        const phi = Math.acos(1 - 2 * (i / totalPoints));
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const x = Math.cos(theta) * Math.sin(phi);
        const y = Math.sin(theta) * Math.sin(phi);
        const z = Math.cos(phi);
        const lat = 90 - (Math.acos(z) * 180) / Math.PI;
        const lng = (((Math.atan2(y, x) * 180) / Math.PI + 270) % 360) - 180;

        let isInCountry = false;
        let isBorder = false;
        let countryId = null;
        let neighborCountryId = null;
        const borderBuffer = 0.3;

        for (const { feature, id } of countryPolygons) {
          try {
            if (geoContains(feature, [lng, lat])) {
              isInCountry = true;
              countryId = id;
              for (let dx = -borderBuffer; dx <= borderBuffer; dx += borderBuffer) {
                for (let dy = -borderBuffer; dy <= borderBuffer; dy += borderBuffer) {
                  if (dx === 0 && dy === 0) continue;
                  const checkLng = lng + dx;
                  const checkLat = lat + dy;
                  for (const { feature: neighborFeature, id: neighborId } of countryPolygons) {
                    if (id !== neighborId && geoContains(neighborFeature, [checkLng, checkLat])) {
                      isBorder = true;
                      neighborCountryId = neighborId;
                      break;
                    }
                  }
                  if (isBorder) break;
                }
                if (isBorder) break;
              }
              break;
            }
          } catch (e) { continue; }
        }

        if (isInCountry) {
          const isSelected = selectedCountry && (
            selectedCountry.id === countryId ||
            selectedCountry.properties.ISO_A3 === countryId ||
            selectedCountry.properties.name === countryId
          );

          const pointData = {
            lat,
            lng,
            size: isBorder ? 0.25 : 0.35,
            color: isBorder ? borderColor : (isSelected ? "#00FF00" : dotColor),
            altitude: isBorder ? 0.0015 : 0.001,
            countryId,
            neighborCountryId: isBorder ? neighborCountryId : undefined
          };

          if (isBorder) borders.push(pointData);
          else countryPoints.push(pointData);
        }
      }

      setPoints(countryPoints);
      setBorderPoints(borders);
    };

    generatePoints();
  }, [countries, dotColor, borderColor, selectedCountry]);

  const handleGlobeClick = useCallback(({ lat, lng }) => {
    let clickedCountry = null;
    for (const country of countries) {
      try {
        if (geoContains(country, [lng, lat])) {
          clickedCountry = country;
          break;
        }
      } catch (e) { continue; }
    }
    setSelectedCountry(clickedCountry);
  }, [countries]);

  const allPointsData = useMemo(() => [...points, ...borderPoints], [points, borderPoints]);

  const globeConfig = useMemo(() => ({
    backgroundColor: null,
    pointAltitude: "altitude",
    pointColor: "color",
    pointRadius: "size",
    pointsMerge: true,
    pointResolution: 3,
    pointsTransitionDuration: 0,
    onGlobeClick: handleGlobeClick,
    atmosphereColor: "#0a0a2a",
    atmosphereAltitude: 0.15,
    rendererConfig: {
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: true,
    }
  }), [handleGlobeClick]);

  return (
    <div style={{ width: "600px", height: "600px", backgroundColor: "transparent", position: "relative" }}>
      <Globe ref={globeRef} {...globeConfig} pointsData={allPointsData} />
    </div>
  );
}

export default App;
