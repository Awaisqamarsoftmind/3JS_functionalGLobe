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

  // Colors for visualization
  const dotColor = "#D927C2"; // Brighter purple for country dots
  const borderColor = "#E0E0FF"; // Light color for borders

  // Load countries data
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    fetch(
      "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
      { signal }
    )
      .then((res) => res.json())
      .then((data) => {
        // Store countries for operations
        setCountries(data.features);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to load countries:", err);
        }
      });

    return () => controller.abort(); // Cleanup fetch requests
  }, []);

  // Generate globe points with LARGER dots - OPTIMIZED
useEffect(() => {
  if (!countries.length) return;

  const generatePoints = () => {
    const countryPoints = [];
    const borders = [];
    const seaPoints = [];

    // const totalPoints = Math.min(15000, countries.length * 100);
    const totalPoints = 12000; // Decrease slightly to create spacing


    const countryPolygons = countries.map((country) => ({
      feature: country,
      id: country.id || country.properties.ISO_A3,
    }));

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

                let foundDifferentCountry = false;

                for (const { feature: neighborFeature, id: neighborId } of countryPolygons) {
                  if (
                    id !== neighborId &&
                    geoContains(neighborFeature, [checkLng, checkLat])
                  ) {
                    foundDifferentCountry = true;
                    neighborCountryId = neighborId;
                    break;
                  }
                }

                if (foundDifferentCountry) {
                  isBorder = true;
                  break;
                }
              }
              if (isBorder) break;
            }

            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (isInCountry) {
    
          countryPoints.push({
            lat,
            lng,
            size: 0.2, // Smaller dot
            color: dotColor,
            altitude: 0.001,
            countryId,
          });
        
      } else {
        // 🌊 Sea dot
        seaPoints.push({
          lat,
          lng,
          size: 0.05, // Smaller water dot
          color: "#60a5fa", // Light blue
          altitude: 0.0007,
        });
      }
      
    }

    // Combine all for rendering
    setPoints([...countryPoints, ...seaPoints]);
    setBorderPoints(borders);
  };

  generatePoints();
}, [countries, dotColor, borderColor]);


  // Handle globe click to zoom to the country - OPTIMIZED
  const handleGlobeClick = useCallback(
    ({ lat, lng }) => {
      // Use a more efficient country lookup
      let clickedCountry = null;

      // OPTIMIZATION: Use memoized centroids if we have them
      for (const country of countries) {
        try {
          if (geoContains(country, [lng, lat])) {
            clickedCountry = country;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (clickedCountry) {
        setSelectedCountry(clickedCountry);

        // OPTIMIZATION: Use pre-computed centroids if available
        if (clickedCountry.properties.centroid) {
          const { lat: centerLat, lng: centerLng } =
            clickedCountry.properties.centroid;

          // Zoom to the country
          if (globeRef.current) {
            const altitude = clickedCountry.properties.recommendedZoom || 1.5;

            globeRef.current.pointOfView(
              { lat: centerLat, lng: centerLng, altitude: altitude },
              800 // Faster animation for better responsiveness
            );
          }
        } else {
          // Calculate the center of the country
          const polygon = clickedCountry.geometry;
          let centerLat = 0,
            centerLng = 0,
            count = 0;

          // Calculate the centroid of the country's coordinates (more efficient algorithm)
          if (
            polygon.type === "Polygon" &&
            polygon.coordinates &&
            polygon.coordinates.length > 0
          ) {
            // Only use the outer ring (first array) for centroid calculation
            const coords = polygon.coordinates[0];
            // OPTIMIZATION: Sample fewer points for large polygons
            const stride = Math.max(1, Math.floor(coords.length / 100));

            for (let i = 0; i < coords.length; i += stride) {
              centerLng += coords[i][0];
              centerLat += coords[i][1];
              count++;
            }
          } else if (polygon.type === "MultiPolygon" && polygon.coordinates) {
            // OPTIMIZATION: Only use the largest polygon for centroid calculation
            let largestPolyIndex = 0;
            let largestPolySize = 0;

            for (let i = 0; i < polygon.coordinates.length; i++) {
              const polySize = polygon.coordinates[i][0].length;
              if (polySize > largestPolySize) {
                largestPolySize = polySize;
                largestPolyIndex = i;
              }
            }

            const coords = polygon.coordinates[largestPolyIndex][0];
            const stride = Math.max(1, Math.floor(coords.length / 100));

            for (let i = 0; i < coords.length; i += stride) {
              centerLng += coords[i][0];
              centerLat += coords[i][1];
              count++;
            }
          }

          if (count > 0) {
            centerLat /= count;
            centerLng /= count;

            // Cache the centroid for future use
            clickedCountry.properties.centroid = {
              lat: centerLat,
              lng: centerLng,
            };

            // Zoom to the country
            if (globeRef.current) {
              // OPTIMIZATION: Simplified size calculation
              const size = Math.sqrt(count) / 20;
              const altitude = Math.max(0.5, Math.min(1.8, 2.5 / size));

              // Cache the recommended zoom
              clickedCountry.properties.recommendedZoom = altitude;

              globeRef.current.pointOfView(
                { lat: centerLat, lng: centerLng, altitude: altitude },
                800 // Faster animation for better responsiveness
              );
            }
          }
        }
      } else {
        // If clicked outside any country, zoom out
        if (globeRef.current) {
          globeRef.current.pointOfView({ lat, lng, altitude: 2.5 }, 800);
        }
      }
    },
    [countries]
  );

  // OPTIMIZED scene setup
  useEffect(() => {
    if (!globeRef.current) return;
  
    const scene = globeRef.current.scene();
    if (!scene) return;
  
    // 🎯 Set globe color by traversing to the globe mesh and adjusting material
    scene.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.uniforms) {
        // 🌍 Replace shiny material with matte
        obj.material = new THREE.MeshBasicMaterial({
          color: new THREE.Color("#1d1c4c"), // your matte base color
        });
      }
    });
  
    // 💡 Lighting
    const ambientLight = new THREE.AmbientLight(0x444444);
    scene.add(ambientLight);
  
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
  
    const purpleLight = new THREE.PointLight(0x9932cc, 0.8, 10);
    purpleLight.position.set(2, 2, 2);
    scene.add(purpleLight);
  
    // 🎥 Initial camera POV
    globeRef.current.pointOfView({ lat: 10, lng: 0, altitude: 2.5 });
  
    // 🎛️ Controls
    const controls = globeRef.current.controls();
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.15;
      controls.rotateSpeed = 0.6;
      controls.zoomSpeed = 0.7;
      controls.autoRotate = false;
      controls.autoRotateSpeed = 0.3;
      controls.enableZoom = true;
      controls.minDistance = 101;
      controls.maxPolarAngle = Math.PI * 0.85;
    }
  
    // ⚙️ Renderer
    const renderer = globeRef.current.renderer();
    if (renderer) {
      renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1.5 : 1);
    }
  
    return () => {
      // 🧹 Cleanup
      scene.remove(ambientLight);
      scene.remove(directionalLight);
      scene.remove(purpleLight);
    };
  }, [countries]); // ✅ dependency: globe is built after countries are loaded
  

  // OPTIMIZATION: Use memo for globe configuration
  const globeConfig = useMemo(
    () => ({
      // globeImageUrl: "//unpkg.com/three-globe/example/img/earth-dark.jpg",
      backgroundColor: '#240c48', // ← ✅ REMOVE CANVAS BACKGROUND
      pointAltitude: "altitude",
      pointColor: "color",
      pointRadius: "size",
      pointsMerge: true,
      pointResolution: 12,
      pointsTransitionDuration: 0,
      onGlobeClick: handleGlobeClick,
      
      atmosphereColor: "#0a0a2a",
      atmosphereAltitude: 0.15,
      rendererConfig: {
        alpha: true, // ← ✅ ENABLE TRANSPARENCY
        antialias: false,
        powerPreference: "high-performance",
        logarithmicDepthBuffer: true,
      },
    }),
    [handleGlobeClick]
  );

  // Get both regular and border points combined for rendering
  const allPointsData = useMemo(() => {
    // Combine both points arrays into one for better performance
    return [...points, ...borderPoints];
  }, [points, borderPoints]);

  return (
    <div
      className="globe-container"
      style={{
        position: "relative",
        width: "600px", // or any size you want
        height: "600px",
        backgroundColor: "transparent", // ✅ No background fill
      }}
    >
      {/* OPTIMIZATION: Use a single globe instance with all points for better performance */}
      <Globe globeImageUrl={'/bg.png'}  ref={globeRef} {...globeConfig} pointsData={allPointsData} />

      {/* Country info display */}
      {selectedCountry && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "20px",
            padding: "10px",
            backgroundColor: "rgba(208, 10, 10, 0.7)",
            color: "#fff",
            borderRadius: "4px",
            fontSize: "16px",
          }}
        >
          {selectedCountry.properties.NAME || selectedCountry.properties.name}
        </div>
      )}

      {/* Performance indicator */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          color: "#fff",
          fontSize: "12px",
          backgroundColor: "rgba(212, 41, 41, 0.5)",
          padding: "5px",
          borderRadius: "3px",
        }}
      >
        {points.length.toLocaleString()} purple dots |{" "}
        {borderPoints.length.toLocaleString()} border points
      </div>
      <style>
        {`
        .globe-wrapper {
  width: 500px;
  height: 500px;
  position: relative;
  overflow: hidden;
  background: transparent;
}

.globe-wrapper canvas {
  position: absolute !important;
  top: 0;
  left: 0;
  width: 100% !important;
  height: 100% !important;
  background: transparent !important;
  z-index: 0;
}

        `}
      </style>
    </div>
  );
}

export default App;
