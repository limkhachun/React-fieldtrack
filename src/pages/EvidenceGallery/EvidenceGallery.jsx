import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase'; // Adjust path as needed
import { 
  Briefcase, ChevronLeft, ChevronRight, Hash, 
  User, Search, MapPin, FolderOpen, X 
} from 'lucide-react';

export default function EvidenceGallery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  
  // Filters
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchCase, setSearchCase] = useState('');
  const [searchClient, setSearchClient] = useState('');

  // Modal State
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // ==========================================
  // 1. Fetch Data from Firestore
  // ==========================================
  const fetchEvidence = async (dateVal) => {
    setLoading(true);
    setError(null);
    try {
      const startDate = new Date(dateVal);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateVal);
      endDate.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, "evidence_logs"),
        where("capturedAt", ">=", startDate),
        where("capturedAt", "<=", endDate),
        orderBy("capturedAt", "desc")
      );

      const snap = await getDocs(q);
      const fetchedLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(fetchedLogs);
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch when the date changes
  useEffect(() => {
    fetchEvidence(filterDate);
  }, [filterDate]);

  // ==========================================
  // 2. Grouping & Filtering Logic[cite: 15]
  // ==========================================
  const groupedEvidence = useMemo(() => {
    const grouped = {};
    const caseKeyword = searchCase.trim().toLowerCase();
    const clientKeyword = searchClient.trim().toLowerCase();

    logs.forEach(log => {
      const caseNo = log.caseNo || "Unknown Case";
      const clientName = log.clientName || "No Client Specified";

      // Text Filtering
      if (caseKeyword && !caseNo.toLowerCase().includes(caseKeyword)) return;
      if (clientKeyword && !clientName.toLowerCase().includes(clientKeyword)) return;

      // Grouping
      if (!grouped[caseNo]) {
        grouped[caseNo] = {
          clientName: clientName,
          staffName: log.staffName || "Unknown Staff",
          photos: []
        };
      }
      grouped[caseNo].photos.push(log);
    });

    return grouped;
  }, [logs, searchCase, searchClient]);

  // ==========================================
  // 3. UI Handlers[cite: 14]
  // ==========================================
  const handleDateChange = (days) => {
    const current = new Date(filterDate);
    current.setDate(current.getDate() + days);
    setFilterDate(current.toISOString().split('T')[0]);
  };

  return (
    <div className="container py-4 animate__animated animate__fadeIn">
      
      {/* Header & Controls[cite: 14] */}
      <div className="d-flex justify-content-between align-items-end flex-wrap gap-3 mb-4">
        <div>
          <h4 className="fw-bold m-0 text-dark d-flex align-items-center">
            <Briefcase className="me-2 text-primary" size={24} /> Case Evidence
          </h4>
          <div className="text-muted small mt-1">Grouped by Case No. & Client</div>
        </div>

        <div className="d-flex gap-2 align-items-center flex-wrap">
          {/* Date Picker */}
          <div className="input-group shadow-sm" style={{ width: 'auto' }}>
            <button className="btn btn-white border bg-white" onClick={() => handleDateChange(-1)}>
              <ChevronLeft size={16} />
            </button>
            <input 
              type="date" 
              className="form-control border fw-bold text-center text-primary" 
              style={{ width: '140px' }} 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
            <button className="btn btn-white border bg-white" onClick={() => handleDateChange(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          
          {/* Search Inputs */}
          <div className="position-relative">
            <Hash className="position-absolute top-50 start-0 translate-middle-y ms-2 text-muted" size={16} />
            <input 
              type="text" 
              className="form-control ps-4 shadow-sm fw-bold" 
              placeholder="Search Case No..." 
              style={{ width: '160px' }} 
              value={searchCase}
              onChange={(e) => setSearchCase(e.target.value)}
            />
          </div>

          <div className="position-relative">
            <User className="position-absolute top-50 start-0 translate-middle-y ms-2 text-muted" size={16} />
            <input 
              type="text" 
              className="form-control ps-4 shadow-sm fw-bold" 
              placeholder="Search Client..." 
              style={{ width: '160px' }} 
              value={searchClient}
              onChange={(e) => setSearchClient(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Gallery Container */}
      <div>
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status"></div>
            <p className="text-muted mt-2 fw-bold">Loading cases...</p>
          </div>
        ) : error ? (
          <div className="alert alert-danger mx-3 mt-3 shadow-sm border-danger">
            <b>Database Error:</b> {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <FolderOpen size={48} className="mb-3 opacity-50 mx-auto d-block" />
            <p>No case evidence found for this date.</p>
          </div>
        ) : Object.keys(groupedEvidence).length === 0 ? (
          <div className="text-center py-5 text-muted">
            <p>No cases match your search criteria.</p>
          </div>
        ) : (
          Object.entries(groupedEvidence).map(([caseNo, caseData]) => (
            <div key={caseNo} className="staff-section mb-4 border rounded-4 overflow-hidden shadow-sm">
              <div className="staff-header bg-primary bg-opacity-10 d-flex justify-content-between align-items-center p-3">
                <div className="d-flex align-items-center gap-3">
                  <div className="bg-primary text-white rounded p-2 shadow-sm d-flex align-items-center justify-content-center">
                    <Briefcase size={20} />
                  </div>
                  <div>
                    <h5 className="fw-bold m-0 text-primary">{caseNo}</h5>
                    <div className="text-dark small fw-bold mt-1">
                      Client: {caseData.clientName} <span className="text-muted fw-normal ms-2">| Handled by: {caseData.staffName}</span>
                    </div>
                  </div>
                </div>
                <div className="badge bg-white text-dark border shadow-sm fs-6 px-3 py-2">
                  {caseData.photos.length} Photos
                </div>
              </div>
              
              <div className="photo-grid bg-white p-3 d-flex flex-wrap gap-3">
                {caseData.photos.map(photo => {
                  const timeStr = photo.localTime ? photo.localTime.split(' ')[1] : "Unknown";
                  return (
                    <div 
                      key={photo.id} 
                      className="photo-card position-relative border rounded overflow-hidden cursor-pointer shadow-sm hover-scale"
                      style={{ width: '150px', flex: '0 0 auto' }}
                      onClick={() => setSelectedPhoto(photo)}
                    >
                      <span className="timestamp-badge position-absolute top-0 end-0 bg-dark text-white small px-2 py-1 m-1 rounded opacity-75">
                        {timeStr}
                      </span>
                      <img 
                        src={photo.photoUrl} 
                        alt="Evidence" 
                        className="photo-img w-100" 
                        loading="lazy" 
                        style={{ height: '150px', objectPosition: 'center', objectFit: 'cover' }} 
                      />
                      <div className="photo-info border-top p-2 bg-light">
                        <div className="location-text small text-truncate text-muted" title={photo.location}>
                          <MapPin size={12} className="me-1 d-inline" />{photo.location || 'GPS Only'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Image Modal[cite: 14] */}
      {selectedPhoto && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1" onClick={() => setSelectedPhoto(null)}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={e => e.stopPropagation()}>
              <div className="modal-content bg-transparent border-0">
                <div className="modal-header border-0 p-0 mb-2 justify-content-end">
                  <button type="button" className="btn btn-light rounded-circle p-2" onClick={() => setSelectedPhoto(null)}>
                    <X size={20} />
                  </button>
                </div>
                <div className="modal-body p-0 text-center">
                  <img 
                    src={selectedPhoto.photoUrl} 
                    alt="Full Evidence" 
                    className="img-fluid rounded shadow-lg" 
                    style={{ maxHeight: '80vh' }} 
                  />
                  <div className="bg-white p-3 rounded-bottom mt-0 text-start shadow">
                    <h6 className="fw-bold mb-1 text-dark">Case: {selectedPhoto.caseNo || 'Unknown'}</h6>
                    <div className="text-muted small mb-2">
                      <User size={14} className="me-1 d-inline" />
                      Client: {selectedPhoto.clientName || 'N/A'} | Staff: {selectedPhoto.staffName || 'N/A'}
                    </div>
                    <div className="d-flex justify-content-between text-muted small bg-light p-2 rounded">
                      <span className="fw-bold text-primary">{selectedPhoto.localTime}</span>
                      <span className="text-end" style={{ maxWidth: '60%' }}>{selectedPhoto.location || 'Unknown location'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}