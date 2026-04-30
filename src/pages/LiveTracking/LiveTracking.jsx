// src/pages/LiveTracking/LiveTracking.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getDatabase, ref as rtdbRef, onValue } from 'firebase/database';
import { db } from '../../services/firebase';
import { 
  Crosshair, Play, Square, MapPin, Search, Clock, Navigation 
} from 'lucide-react';

const STORE_LOCATION = { lat: 4.5975, lng: 101.0901 }; 
const STORE_RADIUS_METERS = 500; 

export default function LiveTracking() {
  // ==========================================
  // 1. React States
  // ==========================================
  const [loading, setLoading] = useState(true);
  const [usersMap, setUsersMap] = useState({});
  const [drivers, setDrivers] = useState([]);
  
  // Filters
  const [dateFilter, setDateFilter] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [searchTerm, setSearchTerm] = useState('');
  
  // Selection & Overlay State
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [overlayData, setOverlayData] = useState({
    speed: 0, timeText: '-', statusText: 'No Record', statusClass: 'badge bg-secondary'
  });
  const [isReplaying, setIsReplaying] = useState(false);

  // ==========================================
  // 2. React Refs (For Google Maps & Intervals)
  // ==========================================
  const mapDivRef = useRef(null);
  const mapInstance = useRef(null);
  const currentMarker = useRef(null);
  const startMarker = useRef(null);
  const routePolylines = useRef([]);
  const storeCircle = useRef(null);
  
  const currentRouteLogs = useRef([]);
  const replayInterval = useRef(null);
  const lastKnownPosition = useRef(null);

  // ==========================================
  // 3. Initial Setup: Fetch Users & Init Map
  // ==========================================
  useEffect(() => {
    let isMounted = true;

    const fetchBaseData = async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const uMap = {};
        snap.forEach(docSnap => {
          const d = docSnap.data();
          const displayName = d.personal?.shortName || d.personal?.name || d.name || "Staff";
          uMap[docSnap.id] = displayName;
          if (d.authUid) uMap[d.authUid] = displayName;
        });
        if (isMounted) setUsersMap(uMap);
      } catch (e) {
        console.error("Initialization Error:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const initGoogleMap = () => {
      if (window.google && window.google.maps && mapDivRef.current && !mapInstance.current) {
        mapInstance.current = new window.google.maps.Map(mapDivRef.current, {
          center: STORE_LOCATION,
          zoom: 12,
          disableDefaultUI: false,
          styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }]
        });

        storeCircle.current = new window.google.maps.Circle({
          strokeColor: "#F59E0B", strokeOpacity: 0.8, strokeWeight: 2,
          fillColor: "#F59E0B", fillOpacity: 0.1,
          map: mapInstance.current, center: STORE_LOCATION, radius: STORE_RADIUS_METERS,
        });
      }
    };

    fetchBaseData().then(() => {
      // Check if Google Maps is already loaded
      if (window.google && window.google.maps) {
        initGoogleMap();
      } else {
        // Dynamically inject the Google Maps script if it doesn't exist
        window.initMap = initGoogleMap;
        
        // Prevent injecting multiple scripts if the component re-mounts quickly
        if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
          const script = document.createElement('script');
          // Using your original API key and parameters
          script.src = "https://maps.googleapis.com/maps/api/js?key=AIzaSyAjzPJ-_ZAVl56i3cW3EU4yAyi_WjzdEfk&libraries=geometry&callback=initMap";
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }
      }
    });

    return () => {
      isMounted = false;
      window.initMap = null; // Cleanup global callback
    };
  }, []);

  // ==========================================
  // 4. Load Drivers List based on Date[cite: 24]
  // ==========================================
  useEffect(() => {
    if (Object.keys(usersMap).length === 0) return;
    
    // Cleanup previous map state when date changes
    resetMapState();
    setSelectedDriver(null);
    let rtdbUnsub = null;

    const loadDrivers = async () => {
      const todayStr = new Date().toLocaleDateString('en-CA');
      
      if (dateFilter === todayStr) {
        // Live RTDB Listener[cite: 24]
        const database = getDatabase();
        const liveRef = rtdbRef(database, 'live_locations');
        rtdbUnsub = onValue(liveRef, (snapshot) => {
          const data = snapshot.val();
          if (!data) return setDrivers([]);

          const loadedDrivers = [];
          Object.entries(data).forEach(([uid, val]) => {
            const lastUpdate = new Date(val.lastUpdate);
            if (lastUpdate.toLocaleDateString('en-CA') !== todayStr) return;

            const realName = usersMap[uid] || `User (${uid.substring(0, 5)})`;
            const diffMins = (new Date() - lastUpdate) / 60000;
            
            let status = 'Active';
            if (val.isTracking === false || diffMins >= 15) status = 'Offline';
            else if (diffMins >= 5) status = 'Weak';

            loadedDrivers.push({ uid, name: realName, time: lastUpdate.toLocaleTimeString(), status });
          });
          setDrivers(loadedDrivers);
        });
      } else {
        // History from Firestore[cite: 24]
        try {
          const snap = await getDocs(query(collection(db, "tracking_batches"), where("date", "==", dateFilter)));
          const uids = new Set();
          snap.forEach(d => uids.add(d.data().uid));

          const loadedDrivers = Array.from(uids).map(uid => ({
            uid, 
            name: usersMap[uid] || `Staff (${uid.substring(0, 5)})`, 
            time: "Archived Data", 
            status: "History"
          }));
          setDrivers(loadedDrivers);
        } catch (e) {
          console.error("History loading error", e);
          setDrivers([]);
        }
      }
    };

    loadDrivers();
    return () => { if (rtdbUnsub) rtdbUnsub(); };
  }, [dateFilter, usersMap]);

  // ==========================================
  // 5. Load Selected Driver's Route[cite: 24]
  // ==========================================
  useEffect(() => {
    let rtdbUnsub = null;

    const loadRoute = async () => {
      if (!selectedDriver) return;
      resetMapState();
      
      const { uid, name } = selectedDriver;
      const todayStr = new Date().toLocaleDateString('en-CA');

      // Setup Live tracking if today
      if (dateFilter === todayStr) {
        const database = getDatabase();
        const singleRef = rtdbRef(database, `live_locations/${uid}`);
        rtdbUnsub = onValue(singleRef, (snapshot) => {
          const val = snapshot.val();
          if (val && !isReplaying) {
            updateCarMarker(val, name, false);
          }
        });
      }

      // Fetch points from batches
      try {
        const snap = await getDocs(query(collection(db, "tracking_batches"), where("uid", "==", uid), where("date", "==", dateFilter)));
        let allPoints = [];
        const batches = snap.docs.map(d => d.data()).sort((a, b) => (a.uploadedAt?.seconds || 0) - (b.uploadedAt?.seconds || 0));
        batches.forEach(b => {
          if (b.points) b.points.forEach(p => allPoints.push({ lat: p.lat, lng: p.lng, timestamp: p.ts }));
        });

        if (allPoints.length > 0) {
          await drawRouteEngine(allPoints, name, dateFilter === todayStr);
          setTimeout(() => { if (lastKnownPosition.current && !isReplaying) handleFocus(); }, 600);
        } else if (dateFilter !== todayStr) {
          setOverlayData({ speed: 0, timeText: "No Data", statusText: "No Record", statusClass: "badge bg-secondary" });
        }
      } catch (e) { console.error(e); }
    };

    loadRoute();
    return () => { if (rtdbUnsub) rtdbUnsub(); };
  }, [selectedDriver, dateFilter]); // Do not include isReplaying to prevent refetch loops

  // ==========================================
  // 6. Map Helper Functions (Anti-Detour Engine)[cite: 24]
  // ==========================================
  const resetMapState = () => {
    if (currentMarker.current) { currentMarker.current.setMap(null); currentMarker.current = null; }
    if (startMarker.current) { startMarker.current.setMap(null); startMarker.current = null; }
    routePolylines.current.forEach(p => p.setMap(null));
    routePolylines.current = [];
    
    if (replayInterval.current) {
      clearInterval(replayInterval.current);
      replayInterval.current = null;
    }
    setIsReplaying(false);
    currentRouteLogs.current = [];
    lastKnownPosition.current = null;
  };

  const drawRouteEngine = async (rawLogs, realName, isToday) => {
    if (!window.google) return;
    const geometry = window.google.maps.geometry.spherical;

    // Filter 1: Distance & Speed
    let tempLogs = [rawLogs[0]];
    let lastValidPoint = rawLogs[0];
    for (let i = 1; i < rawLogs.length; i++) {
      let currentPoint = rawLogs[i];
      let p1 = new window.google.maps.LatLng(lastValidPoint.lat, lastValidPoint.lng);
      let p2 = new window.google.maps.LatLng(currentPoint.lat, currentPoint.lng);
      let dist = geometry.computeDistanceBetween(p1, p2);
      
      if (dist < 30) continue;
      let timeDiff = Math.abs(currentPoint.timestamp - lastValidPoint.timestamp) / 1000;
      if (timeDiff <= 0 || (dist / timeDiff) > 33.33) continue; // Skip teleportation
      
      tempLogs.push(currentPoint);
      lastValidPoint = currentPoint;
    }

    // Filter 2: Ping-Pong Spike Filter
    let logs = [];
    if (tempLogs.length > 2) {
      for (let i = 0; i < tempLogs.length; i++) {
        if (i === 0 || i === tempLogs.length - 1) { logs.push(tempLogs[i]); continue; }
        let prev = tempLogs[i - 1], curr = tempLogs[i], next = tempLogs[i + 1];
        let dPrevCurr = geometry.computeDistanceBetween(new window.google.maps.LatLng(prev.lat, prev.lng), new window.google.maps.LatLng(curr.lat, curr.lng));
        let dCurrNext = geometry.computeDistanceBetween(new window.google.maps.LatLng(curr.lat, curr.lng), new window.google.maps.LatLng(next.lat, next.lng));
        let dPrevNext = geometry.computeDistanceBetween(new window.google.maps.LatLng(prev.lat, prev.lng), new window.google.maps.LatLng(next.lat, next.lng));
        
        if (dPrevCurr > 100 && dCurrNext > 100 && dPrevNext < dPrevCurr * 0.5) continue;
        logs.push(curr);
      }
    } else { logs = tempLogs; }

    if (logs.length < 2) return;
    currentRouteLogs.current = logs;

    // Start Marker
    const firstLog = logs[0];
    startMarker.current = new window.google.maps.Marker({
      position: { lat: firstLog.lat, lng: firstLog.lng }, map: mapInstance.current,
      label: { text: "Start", color: "white", fontSize: "10px", fontWeight: "bold" },
      icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: "#10b981", fillOpacity: 1, strokeWeight: 2, strokeColor: "white" },
      zIndex: 100 
    });

    const lastLog = logs[logs.length - 1];
    if (!isToday) {
      updateCarMarker({ lat: lastLog.lat, lng: lastLog.lng, lastUpdate: lastLog.timestamp, speed: 0 }, realName, false);
    }

    // Draw Routes using Directions API
    const directionsService = new window.google.maps.DirectionsService();
    const CHUNK_SIZE = 25; 
    let promises = [];

    for (let i = 0; i < logs.length - 1; i += CHUNK_SIZE - 1) {
      let chunk = logs.slice(i, i + CHUNK_SIZE);
      if (chunk.length < 2) continue;

      let origin = new window.google.maps.LatLng(chunk[0].lat, chunk[0].lng);
      let destination = new window.google.maps.LatLng(chunk[chunk.length - 1].lat, chunk[chunk.length - 1].lng);
      let waypoints = chunk.slice(1, -1).map(c => ({ location: new window.google.maps.LatLng(c.lat, c.lng), stopover: false }));

      let request = { origin, destination, waypoints, travelMode: window.google.maps.TravelMode.DRIVING };

      let p = new Promise((resolve) => {
        directionsService.route(request, (result, status) => {
          let currentPath, color = "#2563eb", weight = 5;
          if (status === window.google.maps.DirectionsStatus.OK) {
            let straightDist = geometry.computeDistanceBetween(origin, destination);
            let routeDist = result.routes[0].legs.reduce((acc, leg) => acc + leg.distance.value, 0);
            
            // Anti-Detour API fallback
            if (straightDist > 0 && (routeDist / straightDist > 2.5) && routeDist > 300) {
              currentPath = chunk.map(c => new window.google.maps.LatLng(c.lat, c.lng));
              color = "#64748b"; weight = 4;
            } else {
              currentPath = result.routes[0].overview_path;
            }
          } else {
            currentPath = chunk.map(c => new window.google.maps.LatLng(c.lat, c.lng));
            color = "#64748b"; weight = 4;
          }

          let polyline = new window.google.maps.Polyline({
            path: currentPath, geodesic: true, strokeColor: color, strokeOpacity: 0.8, strokeWeight: weight,
            icons: [{ icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5, strokeColor: "#ffffff", fillOpacity: 1 }, offset: "20px", repeat: "100px" }],
            map: mapInstance.current
          });
          routePolylines.current.push(polyline);
          resolve();
        });
      });
      promises.push(p);
      await new Promise(r => setTimeout(r, 150)); 
    }
    await Promise.all(promises);
  };

  const updateCarMarker = (data, realName, replayMode) => {
    if (!window.google) return;
    const pos = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
    lastKnownPosition.current = pos; 
    
    let mColor = "#ef4444", mOpacity = 1, sText = "On Field", sClass = "badge bg-primary";
    const isToday = dateFilter === new Date().toLocaleDateString('en-CA');
    
    if (isToday && !replayMode && data.lastUpdate) {
      const diffMins = (new Date() - new Date(data.lastUpdate)) / 60000;
      if (data.isTracking === false || diffMins >= 15) {
        mColor = "#9ca3af"; mOpacity = 0.5; sText = "Signal Lost"; sClass = "badge bg-secondary";
      } else if (diffMins >= 5) {
        mColor = "#f59e0b"; sText = "Weak Signal"; sClass = "badge bg-warning text-dark";
      }
    }

    if (!currentMarker.current) {
      currentMarker.current = new window.google.maps.Marker({
        position: pos, map: mapInstance.current, title: realName,
        label: { text: "End", color: "white", fontSize: "10px", fontWeight: "bold" },
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: mColor, fillOpacity: mOpacity, strokeWeight: 2, strokeColor: "white" },
        zIndex: 200 
      });
    } else {
      currentMarker.current.setIcon({ path: window.google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: mColor, fillOpacity: mOpacity, strokeWeight: 2, strokeColor: "white" });
      currentMarker.current.setPosition(pos);
    }
    
    const rawSpeed = data.speed || 0;
    const finalSpeed = rawSpeed > 0 ? (rawSpeed * 3.6).toFixed(1) : 0;
    const timeTxt = data.lastUpdate ? new Date(data.lastUpdate).toLocaleTimeString() : '-';

    if (replayMode) {
      setOverlayData({ speed: finalSpeed, timeText: timeTxt, statusText: "Replaying", statusClass: "badge bg-info text-dark" });
    } else if (isToday && !replayMode && (sText === "Signal Lost" || sText === "Weak Signal")) {
      setOverlayData({ speed: finalSpeed, timeText: timeTxt, statusText: sText, statusClass: sClass });
    } else {
      const dist = window.google.maps.geometry.spherical.computeDistanceBetween(new window.google.maps.LatLng(pos.lat, pos.lng), new window.google.maps.LatLng(STORE_LOCATION.lat, STORE_LOCATION.lng));
      if (dist > STORE_RADIUS_METERS) {
        setOverlayData({ speed: finalSpeed, timeText: timeTxt, statusText: "On Field", statusClass: "badge bg-primary" });
      } else {
        setOverlayData({ speed: finalSpeed, timeText: timeTxt, statusText: "Near Store", statusClass: "badge bg-warning text-dark" });
      }
    }
  };

  // ==========================================
  // 7. Interactions[cite: 23, 24]
  // ==========================================
  const handleFocus = () => {
    if (lastKnownPosition.current && mapInstance.current) {
      mapInstance.current.panTo(lastKnownPosition.current);
      mapInstance.current.setZoom(17);
    }
  };

  const handleToggleReplay = () => {
    if (isReplaying) {
      clearInterval(replayInterval.current);
      setIsReplaying(false);
      const last = currentRouteLogs.current[currentRouteLogs.current.length - 1];
      if (last) updateCarMarker({ lat: last.lat, lng: last.lng, lastUpdate: last.timestamp, speed: 0 }, selectedDriver.name, false);
      return;
    }

    if (currentRouteLogs.current.length < 2) return;
    setIsReplaying(true);
    let rIndex = 0;
    if (mapInstance.current) mapInstance.current.setZoom(16);

    replayInterval.current = setInterval(() => {
      if (rIndex >= currentRouteLogs.current.length) {
        handleToggleReplay();
        return;
      }
      const point = currentRouteLogs.current[rIndex];
      let simSpeed = 0;
      if (rIndex > 0) {
        const prev = currentRouteLogs.current[rIndex - 1];
        const dMeters = window.google.maps.geometry.spherical.computeDistanceBetween(
          new window.google.maps.LatLng(prev.lat, prev.lng), new window.google.maps.LatLng(point.lat, point.lng)
        );
        const tDiff = Math.abs(point.timestamp - prev.timestamp) / 1000;
        if (tDiff > 0) simSpeed = dMeters / tDiff;
      }

      updateCarMarker({ lat: point.lat, lng: point.lng, speed: simSpeed, lastUpdate: point.timestamp }, selectedDriver.name, true);
      if (mapInstance.current) mapInstance.current.panTo({ lat: point.lat, lng: point.lng });
      rIndex++;
    }, 400);
  };

  // Filter local drivers for sidebar
  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [drivers, searchTerm]);

  return (
    <div className="d-flex w-100 flex-grow-1 animate__animated animate__fadeIn" style={{ height: 'calc(100vh - 60px)' }}>
      
      {/* Sidebar[cite: 23] */}
      <div className="bg-white border-end d-flex flex-column shadow-sm" style={{ width: '320px', zIndex: 10 }}>
        <div className="p-3 border-bottom bg-light">
          <div className="d-flex align-items-center gap-2 mb-3">
            <Navigation className="text-primary" size={20}/>
            <h6 className="fw-bold m-0 text-dark">Live Tracking</h6>
          </div>
          <input 
            type="date" 
            className="form-control form-control-sm border-primary mb-2 fw-bold" 
            value={dateFilter} 
            onChange={e => setDateFilter(e.target.value)} 
          />
          <div className="position-relative">
            <Search className="position-absolute top-50 start-0 translate-middle-y ms-2 text-muted" size={14}/>
            <input 
              type="text" 
              className="form-control form-control-sm ps-4" 
              placeholder="Search staff..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
        </div>
        
        <div className="flex-grow-1 overflow-auto bg-white">
          {loading ? (
            <div className="text-center text-muted small py-4">Syncing...</div>
          ) : filteredDrivers.length === 0 ? (
            <div className="text-center text-muted small py-4">No active drivers found.</div>
          ) : (
            filteredDrivers.map(d => (
              <div 
                key={d.uid} 
                className={`p-3 border-bottom cursor-pointer hover-bg-light transition-all ${selectedDriver?.uid === d.uid ? 'bg-primary bg-opacity-10 border-primary' : ''}`}
                onClick={() => setSelectedDriver(d)}
              >
                <div className="d-flex align-items-center gap-3">
                  <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold shadow-sm" style={{ width: '36px', height: '36px', fontSize: '0.8rem' }}>
                    {d.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <div className="fw-bold text-dark text-truncate">{d.name}</div>
                    <div className="small text-muted d-flex align-items-center mt-1">
                      <Clock size={12} className="me-1"/> {d.time}
                    </div>
                  </div>
                  <div>
                    {d.status === 'Offline' && <span className="badge bg-secondary bg-opacity-10 text-secondary border" style={{fontSize: '10px'}}>Offline / Lost</span>}
                    {d.status === 'Weak' && <div className="d-flex align-items-center gap-1"><span className="bg-warning rounded-circle" style={{width:8, height:8}}></span> <small className="text-warning fw-bold" style={{fontSize:'10px'}}>Weak</small></div>}
                    {d.status === 'Active' && <div className="d-flex align-items-center gap-1"><span className="bg-success rounded-circle" style={{width:8, height:8}}></span> <small className="text-success fw-bold" style={{fontSize:'10px'}}>Active</small></div>}
                    {d.status === 'History' && <span className="badge bg-light text-secondary border" style={{fontSize: '10px'}}>History</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Map Area[cite: 23] */}
      <div className="flex-grow-1 position-relative">
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }}></div>
        
        {/* Overlay Card[cite: 23] */}
        {selectedDriver && (
          <div className="position-absolute top-0 end-0 m-3 bg-white p-3 rounded-4 shadow-lg border" style={{ width: '280px', zIndex: 100 }}>
            <div className="d-flex justify-content-between align-items-start mb-3">
              <div>
                <div className="text-muted fw-bold mb-1" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>CURRENTLY VIEWING</div>
                <h6 className="fw-bold m-0 text-dark">{selectedDriver.name}</h6>
              </div>
              <span className={overlayData.statusClass}>{overlayData.statusText}</span>
            </div>
            
            <div className="d-flex align-items-center gap-2 mb-3">
              <div className="bg-light rounded p-2 flex-fill text-center border">
                <div className="text-muted fw-bold mb-1" style={{ fontSize: '10px' }}>SPEED</div>
                <div className="fw-bold text-dark fs-5 lh-1">{overlayData.speed} <small className="fs-6 text-muted fw-normal">km/h</small></div>
              </div>
              <div className="bg-light rounded p-2 flex-fill text-center border">
                <div className="text-muted fw-bold mb-1" style={{ fontSize: '10px' }}>LAST UPDATE</div>
                <div className="fw-bold text-dark small lh-1 mt-1">{overlayData.timeText}</div>
              </div>
            </div>

            {currentRouteLogs.current.length >= 2 && (
              <button 
                className={`btn w-100 btn-sm fw-bold mb-2 shadow-sm ${isReplaying ? 'btn-danger' : 'btn-outline-primary'}`} 
                onClick={handleToggleReplay}
              >
                {isReplaying ? <><Square size={14} className="me-2 d-inline"/> Stop Replay</> : <><Play size={14} className="me-2 d-inline"/> Route Replay</>}
              </button>
            )}
            
            <button className="btn btn-primary w-100 btn-sm fw-bold shadow-sm" onClick={handleFocus}>
              <Crosshair size={14} className="me-2 d-inline" /> Focus Location
            </button>
          </div>
        )}
      </div>

    </div>
  );
}