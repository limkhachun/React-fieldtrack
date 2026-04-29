// src/pages/SchedulePlanner/SchedulePlanner.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, getDocs, getDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// FullCalendar Imports
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

// Icons
import { 
  CalendarOff, Calendar, List as ListIcon, Layers, BarChart2, X, CheckSquare 
} from 'lucide-react';

// Modals Component
import ScheduleModals from './components/ScheduleModals';

// Utility to normalize date to YYYY-MM-DD local
const getLocalTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function SchedulePlanner() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  // 1. View & UI States
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'[cite: 18]
  const [loading, setLoading] = useState(true);

  // 2. Data States[cite: 19]
  const [schedules, setSchedules] = useState([]);
  const [holidays, setHolidays] = useState({});
  const [leaves, setLeaves] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [presets, setPresets] = useState([]);

  // 3. List View States[cite: 18, 19]
  const [listSearch, setListSearch] = useState('');
  const [listDate, setListDate] = useState('');
  const [selectedListIds, setSelectedListIds] = useState(new Set());

  // 4. Analytics Sidebar States[cite: 18, 19]
  const [filterType, setFilterType] = useState('month'); // 'month', 'week', 'year'
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterWeek, setFilterWeek] = useState('');

  // 5. Modal States Manager[cite: 19]
  const [modals, setModals] = useState({
    dayManager: { isOpen: false, dateStr: null, filterIds: null },
    bulk: { isOpen: false },
    listEdit: { isOpen: false, selectedIds: new Set() },
    analytics: { isOpen: false, uid: null },
    singleEdit: { isOpen: false, shiftId: null },
    preset: { isOpen: false }
  });

  // ==========================================
  // Data Fetching
  // ==========================================
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        // Fetch Staff[cite: 19]
        const uSnap = await getDocs(query(collection(db, "users")));
        const sList = uSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => s.status !== 'disabled' && s.role !== 'manager');
        setStaffList(sList);

        // Fetch Holidays[cite: 19]
        const holSnap = await getDoc(doc(db, "settings", "holidays"));
        const hMap = {};
        if (holSnap.exists() && holSnap.data().holiday_list) {
          holSnap.data().holiday_list.forEach(h => hMap[h.date] = h.name);
        }
        setHolidays(hMap);

        // Fetch Presets[cite: 19]
        const pSnap = await getDoc(doc(db, "settings", "shift_presets"));
        if (pSnap.exists() && pSnap.data().presets) {
          setPresets(pSnap.data().presets);
        }
        setLoading(false);
      } catch (err) {
        console.error("Error fetching base data:", err);
        setLoading(false);
      }
    };

    fetchBaseData();

    // Listeners for Schedules & Leaves[cite: 19]
    const unsubSchedules = onSnapshot(collection(db, "schedules"), (snap) => {
      const data = snap.docs.map(d => {
        const s = d.data();
        const startDT = s.start?.toDate();
        const endDT = s.end?.toDate();
        let hrs = 0;
        if (startDT && endDT) {
          hrs = (endDT - startDT) / 3600000 - ((s.breakMins || 0) / 60);
          if (hrs < 0) hrs = 0;
        }
        return {
          id: d.id, ...s,
          start: startDT, end: endDT,
          clockIn: s.clockIn?.toDate(),
          hours: hrs,
          shiftType: startDT?.getHours() >= 13 ? 'Evening' : 'Morning'
        };
      });
      setSchedules(data);
    });

    const unsubLeaves = onSnapshot(query(collection(db, "leaves")), (snap) => {
      const lMap = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'Approved' && data.startDate && data.endDate) {
          let curr = new Date(data.startDate);
          const end = new Date(data.endDate);
          while (curr <= end) {
            lMap[`${data.uid}_${curr.toISOString().split('T')[0]}`] = data.type;
            curr.setDate(curr.getDate() + 1);
          }
        }
      });
      setLeaves(lMap);
    });

    return () => { unsubSchedules(); unsubLeaves(); };
  }, []);

  // ==========================================
  // Calendar Logic[cite: 19]
  // ==========================================
  const calendarEvents = useMemo(() => {
    const events = [];
    
    // Holiday Backgrounds
    Object.entries(holidays).forEach(([date, name]) => {
      events.push({ title: name, start: date, display: 'background', className: 'holiday-bg', allDay: true });
    });
    
    // Aggregated Shifts
    const groups = {};
    schedules.forEach(s => {
      if (!s.start || !s.end) return;
      const key = `${s.start.getTime()}-${s.end.getTime()}`;
      if (!groups[key]) {
        groups[key] = { id: key, start: s.start, end: s.end, count: 0, type: s.shiftType, date: s.date, ids: [] };
      }
      groups[key].count++;
      groups[key].ids.push(s.id);
    });

    Object.values(groups).forEach(g => {
      const timeStr = `${g.start.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} - ${g.end.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
      events.push({
        id: g.id, title: `${timeStr} (${g.count})`, start: g.start, end: g.end,
        className: g.type === 'Morning' ? 'agg-morning' : 'agg-evening',
        extendedProps: { dateStr: g.date, filterIds: g.ids }
      });
    });
    return events;
  }, [schedules, holidays]);

  // ==========================================
  // List View Logic[cite: 18, 19]
  // ==========================================
  const filteredList = useMemo(() => {
    return schedules.filter(s => 
      (s.empName || '').toLowerCase().includes(listSearch.toLowerCase()) && 
      (listDate ? s.date === listDate : true)
    ).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [schedules, listSearch, listDate]);

  const toggleSelectAllList = (checked) => {
    if (checked) setSelectedListIds(new Set(filteredList.map(s => s.id)));
    else setSelectedListIds(new Set());
  };

  const toggleListSelection = (id) => {
    const newSet = new Set(selectedListIds);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setSelectedListIds(newSet);
  };

  const handleDeleteSelectedList = async () => {
    if (selectedListIds.size === 0) return;
    
    const idsToDelete = Array.from(selectedListIds);
    const validDeletes = [];
    const blockedDeletes = [];
    
    idsToDelete.forEach(id => {
      const shift = schedules.find(s => s.id === id);
      if (shift) {
        if (shift.clockIn) blockedDeletes.push(shift.empName);
        else validDeletes.push(id);
      }
    });

    if (blockedDeletes.length > 0) alert(`⚠️ Skipped clocked-in staff:\n${blockedDeletes.join(', ')}`);
    if (validDeletes.length === 0) return;
    
    if (!window.confirm(`Delete ${validDeletes.length} selected shifts?`)) return;

    try {
      const batch = writeBatch(db);
      validDeletes.forEach(id => batch.delete(doc(db, "schedules", id)));
      await batch.commit();
      setSelectedListIds(new Set());
      alert('Selected shifts deleted.');
    } catch(e) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  // ==========================================
  // Analytics Logic[cite: 19]
  // ==========================================
  const analyticsData = useMemo(() => {
    let sF, eF;
    if (filterType === 'month' && filterMonth) {
      sF = new Date(`${filterMonth}-01`);
      eF = new Date(sF.getFullYear(), sF.getMonth() + 1, 0);
      eF.setHours(23, 59, 59, 999);
    } else if (filterType === 'year' && filterYear) {
      sF = new Date(filterYear, 0, 1);
      eF = new Date(filterYear, 11, 31);
      eF.setHours(23, 59, 59, 999);
    } else if (filterType === 'week' && filterWeek) {
      // Basic week calculation logic
      const [y, w] = filterWeek.split('-W');
      const simpleDate = new Date(y, 0, 1 + (w - 1) * 7);
      sF = simpleDate; 
      eF = new Date(simpleDate);
      eF.setDate(eF.getDate() + 6);
      eF.setHours(23, 59, 59, 999);
    }

    if (!sF || isNaN(sF)) return [];

    const stats = {};
    schedules.forEach(s => {
      const sd = new Date(s.date);
      if (sd >= sF && sd <= eF) {
        if (!stats[s.userId]) {
          stats[s.userId] = { uid: s.userId, name: s.empName, totalHours: 0, distinctDates: new Set(), shifts: [] };
        }
        stats[s.userId].totalHours += s.hours;
        stats[s.userId].distinctDates.add(s.date);
        stats[s.userId].shifts.push(s);
      }
    });

    return Object.values(stats).sort((a, b) => b.totalHours - a.totalHours);
  }, [schedules, filterType, filterMonth, filterYear, filterWeek]);


  if (loading) {
    return (
      <div className="text-center py-5 mt-5">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="fw-bold mt-3 text-muted">Loading Schedule Planner...</p>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100 animate__animated animate__fadeIn">
      
      {/* 🌟 Top Navbar[cite: 18] */}
      <div className="bg-white border-bottom py-2 px-4 d-flex justify-content-between align-items-center sticky-top" style={{ top: 0, zIndex: 990 }}>
        <div>
          <h6 className="fw-bold mb-0">Schedule Planner</h6>
          <span className="text-muted small">Day Manager & Analytics</span>
        </div>
        <div className="d-flex gap-2">
          {/* 这里可以通过 router 跳转，或通过 props 切换页面 */}
          <button className="btn btn-outline-secondary btn-sm d-flex align-items-center fw-bold" onClick={() => navigate('/holidays')}>
            <CalendarOff size={14} className="me-1"/> Holidays
          </button>
          <div className="btn-group shadow-sm">
            <button className={`btn btn-sm fw-bold ${viewMode === 'calendar' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setViewMode('calendar')}>
              <Calendar size={14} className="me-1 d-inline"/> Calendar
            </button>
            <button className={`btn btn-sm fw-bold ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setViewMode('list')}>
              <ListIcon size={14} className="me-1 d-inline"/> List
            </button>
          </div>
          <button className="btn btn-primary btn-sm d-flex align-items-center fw-bold shadow-sm" onClick={() => setModals({ ...modals, bulk: { isOpen: true } })}>
            <Layers size={14} className="me-1"/> Bulk Schedule
          </button>
        </div>
      </div>

      {/* 🌟 Main Content Layout */}
      <div className="d-flex flex-grow-1 p-3 gap-3 bg-light" style={{ minHeight: 'calc(100vh - 70px)' }}>
        
        {/* Left/Center Panel: Calendar or List */}
        <div className="card border-0 shadow-sm rounded-4 flex-grow-1 overflow-hidden bg-white d-flex flex-column">
          <div className="card-body p-3 overflow-auto flex-grow-1">
            {viewMode === 'calendar' ? (
              <FullCalendar
                plugins={[ dayGridPlugin, timeGridPlugin, interactionPlugin ]}
                initialView="dayGridMonth"
                headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
                events={calendarEvents}
                height="100%"
                selectable={true}
                dateClick={(info) => setModals({ ...modals, dayManager: { isOpen: true, dateStr: info.dateStr, filterIds: null }})}
                eventClick={(info) => {
                  if (info.event.display === 'background') return;
                  setModals({ ...modals, dayManager: { isOpen: true, dateStr: info.event.extendedProps.dateStr, filterIds: info.event.extendedProps.filterIds }});
                }}
              />
            ) : (
              <div>
                {/* List View Controls[cite: 18] */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="fw-bold text-muted small m-0">Detailed Shift List</h6>
                  <div className="d-flex gap-2">
                    <input type="date" className="form-control form-control-sm border-primary" style={{ width: '150px' }} value={listDate} onChange={e => setListDate(e.target.value)} />
                    <input type="text" className="form-control form-control-sm border-primary" placeholder="Search staff..." style={{ width: '200px' }} value={listSearch} onChange={e => setListSearch(e.target.value)} />
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => { setListSearch(''); setListDate(''); }}><X size={14}/></button>
                  </div>
                </div>

                {/* Bulk Action Bar for List */}
                {selectedListIds.size > 0 && (
                  <div className="bg-primary bg-opacity-10 p-2 mb-3 rounded d-flex justify-content-between align-items-center animate__animated animate__fadeIn">
                    <div className="d-flex align-items-center gap-2">
                      <CheckSquare size={16} className="text-primary"/>
                      <span className="text-primary fw-bold small">{selectedListIds.size} Selected</span>
                    </div>
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-light border text-primary fw-bold py-0" onClick={() => setModals({ ...modals, listEdit: { isOpen: true, selectedIds: selectedListIds } })}>Edit Time</button>
                      <button className="btn btn-sm btn-light border text-danger fw-bold py-0" onClick={handleDeleteSelectedList}>Delete</button>
                    </div>
                  </div>
                )}

                {/* Table */}
                <div className="table-responsive">
                  <table className="table table-hover table-sm align-middle" style={{ fontSize: '0.85rem' }}>
                    <thead className="table-light text-muted">
                      <tr>
                        <th style={{ width: '30px' }}>
                          <input type="checkbox" className="form-check-input" onChange={e => toggleSelectAllList(e.target.checked)} checked={selectedListIds.size === filteredList.length && filteredList.length > 0} />
                        </th>
                        <th>Date</th>
                        <th>Staff Name</th>
                        <th>Time</th>
                        <th>Break</th>
                        <th>Type</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredList.length === 0 ? (
                        <tr><td colSpan="7" className="text-center text-muted py-4">No data.</td></tr>
                      ) : (
                        filteredList.map(s => (
                          <tr key={s.id}>
                            <td>
                              <input type="checkbox" className="form-check-input" checked={selectedListIds.has(s.id)} onChange={() => toggleListSelection(s.id)} />
                            </td>
                            <td>{s.date}</td>
                            <td className="fw-bold">
                              {s.empName} 
                              {s.clockIn && <span className="badge bg-success bg-opacity-10 text-success border border-success px-1 ms-1">IN</span>}
                            </td>
                            <td className="font-monospace">
                              {s.start?.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} - {s.end?.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                            </td>
                            <td>{s.breakMins}m</td>
                            <td>{s.shiftType}</td>
                            <td className="text-muted small">{s.notes || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Workload Analytics Sidebar[cite: 18, 19] */}
        <div className="card border-0 shadow-sm rounded-4 p-3 bg-white d-flex flex-column" style={{ width: '300px', minWidth: '300px' }}>
          <div className="d-flex align-items-center gap-2 mb-3">
            <BarChart2 className="size-5 text-primary" size={20}/>
            <h6 className="fw-bold m-0 text-dark">Workload Analytics</h6>
          </div>
          
          <div className="filter-section mb-3">
            <div className="mb-2">
              <label className="form-label small fw-bold text-muted mb-1" style={{ fontSize: '0.7rem' }}>FILTER TYPE</label>
              <select className="form-select form-select-sm border-primary" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="month">Monthly</option>
                <option value="week">Weekly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
            <div>
              <label className="form-label small fw-bold text-muted mb-1" style={{ fontSize: '0.7rem' }}>SELECT PERIOD</label>
              {filterType === 'month' && <input type="month" className="form-control form-control-sm border-primary" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />}
              {filterType === 'week' && <input type="week" className="form-control form-control-sm border-primary" value={filterWeek} onChange={e => setFilterWeek(e.target.value)} />}
              {filterType === 'year' && (
                <select className="form-select form-select-sm border-primary" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
                  {[...Array(5)].map((_, i) => {
                    const y = new Date().getFullYear() - 2 + i;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
              )}
            </div>
          </div>

          <div className="d-flex justify-content-between align-items-center mb-2 px-1">
            <small className="text-muted fw-bold" style={{ fontSize: '0.7rem' }}>STAFF LIST (Click to View)</small>
          </div>
          
          <div className="overflow-auto flex-grow-1 pe-2" style={{ maxHeight: '0px', minHeight: '100%' }}>
            {analyticsData.length === 0 ? (
              <div className="text-center text-muted small py-4">No shifts for this period.</div>
            ) : (
              analyticsData.map(u => (
                <div key={u.uid} className="stat-item d-flex justify-content-between align-items-center p-2 border-bottom hover-bg-light cursor-pointer" onClick={() => setModals({ ...modals, analytics: { isOpen: true, uid: u.uid } })}>
                  <div className="d-flex align-items-center gap-2">
                    <div className="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold" style={{ width: '30px', height: '30px', fontSize: '0.75rem' }}>
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-dark small fw-bold">{u.name}</div>
                      <div className="text-muted" style={{ fontSize: '0.65rem' }}>Workload</div>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold text-primary small">
                      {u.distinctDates.size} <span style={{ fontSize: '0.7em', color: '#94a3b8' }}>Days</span>
                    </div>
                    <div className="fw-bold text-secondary" style={{ fontSize: '0.85rem' }}>
                      {u.totalHours.toFixed(1)} <span style={{ fontSize: '0.7em', color: '#94a3b8' }}>Hrs</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 🌟 Mount Modals[cite: 19] */}
      <ScheduleModals 
        modals={modals} 
        setModals={setModals} 
        schedules={schedules} 
        staffList={staffList} 
        presets={presets} 
        leaves={leaves}
        onClearListSelection={() => setSelectedListIds(new Set())}
      />

    </div>
  );
}