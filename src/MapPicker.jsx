import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PixiComponent } from "./PixiComponent";

const isValidPoint = (point) =>
  Number.isFinite(point.lat) && Number.isFinite(point.lon);

export const MapPicker = ({
  startAndDestination,
  onPick,
  osmData,
  bounds,
  replayCount,
  algorithm,
  onResult,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const lockedRef = useRef(false);
  const [routeReady, setRouteReady] = useState(false);

  useEffect(() => {
    //whole, even pixel sizes keep the tiles from showing seams
    const container = containerRef.current;
    const even = (size) => 2 * Math.floor(size / 2);
    container.style.width = `${even(
      Math.min(1280, window.innerWidth * 0.9),
    )}px`;
    container.style.height = `${even(
      Math.min(720, window.innerHeight * 0.7),
    )}px`;

    const map = L.map(container);
    //esri's dark gray map: a plain base with a place names layer on top
    const esriUrl = "https://server.arcgisonline.com/ArcGIS/rest/services";
    ["World_Dark_Gray_Base", "World_Dark_Gray_Reference"].forEach((name) =>
      L.tileLayer(`${esriUrl}/Canvas/${name}/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 19,
        //esri has no tiles past zoom 16, leaflet scales those up
        maxNativeZoom: 16,
        attribution:
          'Tiles &copy; Esri, roads &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map),
    );

    const points = startAndDestination.filter(isValidPoint);
    if (points.length > 0) {
      map.fitBounds(
        points.map((point) => [point.lat, point.lon]),
        { padding: [100, 100], maxZoom: 15 },
      );
    } else {
      map.setView([0, 0], 2);
    }

    //start is green, destination is red
    markersRef.current = ["#4ade80", "#ff4d6d"].map((color) =>
      L.circleMarker([0, 0], { radius: 8, color, fillOpacity: 0.8 }),
    );

    //first click picks the start, second the destination, then start again
    let nextIndex = 0;
    map.on("click", (e) => {
      if (lockedRef.current) return;
      onPickRef.current(nextIndex, { lat: e.latlng.lat, lon: e.latlng.lng });
      nextIndex = 1 - nextIndex;
    });

    mapRef.current = map;
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  //once the roads are loaded: lock the map on the loaded area and
  //let the pixi overlay draw on top
  useEffect(() => {
    if (!osmData) return;
    const map = mapRef.current;
    const handlers = [
      map.dragging,
      map.scrollWheelZoom,
      map.doubleClickZoom,
      map.touchZoom,
      map.boxZoom,
      map.keyboard,
    ].filter(Boolean);

    lockedRef.current = true;
    handlers.forEach((handler) => handler.disable());
    map.zoomControl.remove();

    const loadedArea = [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ];
    //pan+zoom -> wait 1s -> roads fade in -> search
    let stepTimer;
    const afterPan = () => {
      clearTimeout(fallback);
      stepTimer = setTimeout(() => setRouteReady(true), 1000);
    };
    map.once("moveend", afterPan);
    //the timeout covers the cases where the view doesn't need to move or the
    //animation never finishes
    const fallback = setTimeout(() => {
      map.off("moveend", afterPan);
      map.fitBounds(loadedArea, { animate: false });
      afterPan();
    }, 1000);
    map.fitBounds(loadedArea);

    return () => {
      clearTimeout(fallback);
      clearTimeout(stepTimer);
      setRouteReady(false);
      if (!mapRef.current) return;
      map.off("moveend", afterPan);
      lockedRef.current = false;
      handlers.forEach((handler) => handler.enable());
      map.zoomControl.addTo(map);
    };
  }, [osmData]);

  //keeping markers in sync with the coordinates, the pixi overlay draws its
  //own start/end nodes so they are hidden while it is up
  useEffect(() => {
    startAndDestination.forEach((point, index) => {
      const marker = markersRef.current[index];
      if (isValidPoint(point) && !routeReady) {
        marker.setLatLng([point.lat, point.lon]).addTo(mapRef.current);
      } else {
        marker.remove();
      }
    });
  }, [startAndDestination, routeReady]);

  return (
    <>
      <div ref={containerRef}></div>
      {routeReady && osmData && (
        <PixiComponent
          map={mapRef.current}
          osmData={osmData}
          startAndDestination={startAndDestination}
          replayCount={replayCount}
          algorithm={algorithm}
          onResult={onResult}
        />
      )}
    </>
  );
};
