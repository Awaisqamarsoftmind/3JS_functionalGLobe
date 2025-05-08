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
  const dotColor = "#8A2BE2"; // Brighter purple for country dots
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

    // Create evenly distributed points using Fibonacci sphere pattern
    const generatePoints = () => {
      const countryPoints = [];
      const borders = [];

      // OPTIMIZATION: Significantly reduce point count for better performance
      const totalPoints = Math.min(15000, countries.length * 100);

      // Pre-compute country polygons for faster lookups
      const countryPolygons = countries.map((country) => ({
        feature: country,
        id: country.id || country.properties.ISO_A3,
      }));

      // Generate fibonacci sphere distribution for even coverage
      for (let i = 0; i < totalPoints; i++) {
        const phi = Math.acos(1 - 2 * (i / totalPoints));
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;

        const x = Math.cos(theta) * Math.sin(phi);
        const y = Math.sin(theta) * Math.sin(phi);
        const z = Math.cos(phi);

        // Convert to lat/lng
        const lat = 90 - (Math.acos(z) * 180) / Math.PI;
        const lng = (((Math.atan2(y, x) * 180) / Math.PI + 270) % 360) - 180;

        // Check if point is within any country or at a border
        let isInCountry = false;
        let isBorder = false;
        let countryId = null;
        let neighborCountryId = null;

        // OPTIMIZATION: Use buffer to check for borders
        // Points close to borders will be considered border points
        const borderBuffer = 0.3; // degrees

        for (const { feature, id } of countryPolygons) {
          try {
            if (geoContains(feature, [lng, lat])) {
              isInCountry = true;
              countryId = id;

              // Check if this point is near a border by checking neighboring points
              for (
                let dx = -borderBuffer;
                dx <= borderBuffer;
                dx += borderBuffer
              ) {
                for (
                  let dy = -borderBuffer;
                  dy <= borderBuffer;
                  dy += borderBuffer
                ) {
                  if (dx === 0 && dy === 0) continue; // Skip the center point

                  const checkLng = lng + dx;
                  const checkLat = lat + dy;

                  // Check if this neighbor point is in a different country
                  let foundDifferentCountry = false;

                  for (const {
                    feature: neighborFeature,
                    id: neighborId,
                  } of countryPolygons) {
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
            // Some geometries may cause errors, skip them
            continue;
          }
        }

        // Only add points that are within countries (land masses)
        if (isInCountry) {
          // Add to border array if it's a border point
          if (isBorder) {
            borders.push({
              lat,
              lng,
              size: 0.25, // Slightly smaller border dots
              color: borderColor,
              altitude: 0.0015, // Slightly above the surface
              countryId,
              neighborCountryId,
            });
          } else {
            // Add to regular country points
            countryPoints.push({
              lat,
              lng,
              size: 0.35, // MUCH larger dot size
              color: dotColor,
              altitude: 0.001, // Very close to surface
              countryId,
            });
          }
        }
      }

      setPoints(countryPoints);
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

    // Access the globe's Three.js scene
    const scene = globeRef.current.scene();
    if (!scene) return;

    // OPTIMIZATION: Simpler lighting setup for better performance
    // Add custom lighting for better visual appeal
    const ambientLight = new THREE.AmbientLight(0x444444); // Brighter ambient light
    scene.add(ambientLight);

    // Add just one directional light for better performance
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Add a subtle purple light for the dot color
    const purpleLight = new THREE.PointLight(0x9932cc, 0.8, 10);
    purpleLight.position.set(2, 2, 2);
    scene.add(purpleLight);

    // Initial camera position
    if (globeRef.current) {
      globeRef.current.pointOfView({ lat: 10, lng: 0, altitude: 2.5 });
    }

    // OPTIMIZATION: Tune controls for better performance
    const controls = globeRef.current.controls();
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.15; // Less dampening = less calculation
      controls.rotateSpeed = 0.6;
      controls.zoomSpeed = 0.7;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.3; // Slower rotation

      // OPTIMIZATION: Limit frame rate for performance
      controls.enableZoom = true;
      controls.minDistance = 101; // Prevent zooming too close
      controls.maxPolarAngle = Math.PI * 0.85; // Limit angle to improve performance
    }

    // OPTIMIZATION: Set up renderer for better performance
    const renderer = globeRef.current.renderer();
    if (renderer) {
      renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1.5 : 1);
    }

    return () => {
      // Clean up custom scene elements
      if (scene) {
        scene.remove(ambientLight);
        scene.remove(directionalLight);
        scene.remove(purpleLight);
      }
    };
  }, [globeRef.current]);

  // OPTIMIZATION: Use memo for globe configuration
  const globeConfig = useMemo(
    () => ({
      // globeImageUrl: "//unpkg.com/three-globe/example/img/earth-dark.jpg",
      backgroundColor: 'white', // ← ✅ REMOVE CANVAS BACKGROUND
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
      <Globe ref={globeRef} {...globeConfig} pointsData={allPointsData} />

      {/* Country info display */}
      {selectedCountry && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "20px",
            padding: "10px",
            backgroundColor: "rgba(0,0,0,0.7)",
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
          backgroundColor: "rgba(0,0,0,0.5)",
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
