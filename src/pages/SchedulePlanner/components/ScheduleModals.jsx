// src/pages/SchedulePlanner/components/ScheduleModals.jsx
import React, { useState, useEffect } from 'react';
import { collection, doc, writeBatch, deleteDoc, updateDoc, setDoc, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../context/AuthContext';
import { 
  X, Plus, Settings, Layers, Trash2, Edit2, Lock, Info, CheckSquare, BarChart2, Calendar 
} from 'lucide-react';

// ============================================================================
// 1. Day Manager Modal (单日排班管理)
// ============================================================================
function DayManagerModal({ isOpen, dateStr, filterIds, schedules, staffList, leaves, presets, onClose, openSingleEdit }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ staffIds: [], presetIdx: '', start: '', end: '', breakMins: 60, notes: '' });

  if (!isOpen || !dateStr) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const isPast = dateStr < todayStr;
  
  let dayShifts = schedules.filter(s => s.date === dateStr);
  if (filterIds) dayShifts = dayShifts.filter(s => filterIds.includes(s.id));
  dayShifts.sort((a, b) => a.start - b.start);

  const scheduledUids = schedules.filter(s => s.date === dateStr).map(s => String(s.userId).trim());
  const availableStaff = staffList.filter(s => {
    const cleanId = String(s.id).trim();
    return !scheduledUids.includes(cleanId) && !leaves[`${cleanId}_${dateStr}`];
  });

  const handleApplyPreset = (idx) => {
    setFormData({ ...formData, presetIdx: idx });
    if (idx === "") return;
    const p = presets[idx];
    if (p?.schedule) {
      const dayIdx = new Date(dateStr).getDay();
      const rule = p.schedule[String(dayIdx)];
      if (rule?.active) {
        setFormData(prev => ({ ...prev, start: rule.start, end: rule.end, breakMins: rule.break || 0 }));
      } else {
        alert("This preset has no hours set for " + new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' }));
      }
    }
  };

  const handleAddShift = async () => {
    const { staffIds, start, end, breakMins, notes } = formData;
    if (staffIds.length === 0 || !start || !end) return alert("Please select staff and time.");
    
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const startDT = new Date(`${dateStr}T${start}:00`);
      const endDT = new Date(`${dateStr}T${end}:00`);

      staffIds.forEach(uid => {
        const staff = staffList.find(s => s.id === uid);
        const ref = doc(collection(db, "schedules"));
        batch.set(ref, {
          userId: uid, empName: staff.personal?.name || staff.name,
          date: dateStr, start: Timestamp.fromDate(startDT), end: Timestamp.fromDate(endDT),
          breakMins: parseInt(breakMins) || 0, notes,
          createdAt: Timestamp.now(), createdBy: currentUser.uid
        });
      });
      await batch.commit();
      setFormData({ ...formData, staffIds: [] });
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const handleDeleteShift = async (shift) => {
    if (shift.clockIn) return alert(`Cannot delete: ${shift.empName} has already clocked in.`);
    if (isPast && prompt(`⚠️ SECURITY WARNING\nDeleting PAST schedule for ${shift.empName}.\nType "DELETE" to confirm:`) !== "DELETE") return;
    if (!isPast && !window.confirm(`Delete schedule for ${shift.empName}?`)) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, "schedules", shift.id));
    } catch (e) { alert("Failed to delete."); } finally { setLoading(false); }
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-lg modal-dialog-centered">
          <div className="modal-content border-0 shadow-lg overflow-hidden">
            <div className="modal-header py-3 bg-light border-0">
              <h6 className="modal-title fw-bold">
                {filterIds ? `Shift Details ` : `Manage Schedule: ${dateStr}`}
                {filterIds && <span className="badge bg-primary ms-2">{filterIds.length} Staff</span>}
                {isPast && <span className="badge bg-secondary ms-2">Read Only</span>}
              </h6>
              <button className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-0">
              <div className="row g-0">
                <div className="col-md-7 border-end p-3 bg-white">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="fw-bold text-dark m-0">Current Roster</h6>
                    <span className="badge bg-light text-dark border">{dayShifts.length} Staff</span>
                  </div>
                  <div className="overflow-auto pe-2" style={{ maxHeight: '400px' }}>
                    {dayShifts.length === 0 ? <div className="text-center text-muted small py-5">No shifts found.</div> : 
                      dayShifts.map(s => (
                        <div key={s.id} className="d-flex justify-content-between align-items-center p-2 border-bottom hover-bg-light">
                          <div>
                            <div className="fw-bold text-dark small">{s.empName} {s.clockIn && <span className="badge bg-success bg-opacity-10 text-success border border-success ms-1" style={{ fontSize: '0.6rem' }}>IN</span>}</div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                              {s.start?.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} - {s.end?.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                              <span className="ms-1 badge bg-secondary bg-opacity-10 text-secondary border text-xs">-{s.breakMins}m</span>
                              {s.notes && <span className="ms-2 text-info">({s.notes})</span>}
                            </div>
                          </div>
                          <div className="d-flex gap-1">
                            {s.clockIn ? (
                              <button className="btn btn-xs text-secondary border-0" disabled title="Clocked In"><Lock size={14}/></button>
                            ) : (
                              <>
                                <button className="btn btn-xs text-primary border-0" onClick={() => openSingleEdit(s.id)}><Edit2 size={14}/></button>
                                <button className="btn btn-xs text-danger border-0" onClick={() => handleDeleteShift(s)}><Trash2 size={14}/></button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <div className="col-md-5 p-3 bg-light" style={{ opacity: isPast ? 0.5 : 1, pointerEvents: isPast ? 'none' : 'auto' }}>
                  <h6 className="fw-bold text-primary mb-3">Add Staff</h6>
                  <div className="mb-2">
                    <label className="form-label small fw-bold text-muted mb-1">PRESET</label>
                    <select className="form-select form-select-sm border-primary" value={formData.presetIdx} onChange={e => handleApplyPreset(e.target.value)}>
                      <option value="">Custom</option>
                      {presets.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="form-label small fw-bold text-muted mb-1">AVAILABLE STAFF</label>
                    <select className="form-select form-select-sm border-primary" multiple size="5" value={formData.staffIds} onChange={e => setFormData({...formData, staffIds: Array.from(e.target.selectedOptions, o => o.value)})}>
                      {availableStaff.map(s => <option key={s.id} value={s.id}>{s.personal?.name || s.name}</option>)}
                    </select>
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-4"><label className="form-label small fw-bold text-muted mb-1">START</label><input type="time" className="form-control form-control-sm" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} /></div>
                    <div className="col-4"><label className="form-label small fw-bold text-muted mb-1">END</label><input type="time" className="form-control form-control-sm" value={formData.end} onChange={e => setFormData({...formData, end: e.target.value})} /></div>
                    <div className="col-4"><label className="form-label small fw-bold text-muted mb-1">BREAK</label><input type="number" className="form-control form-control-sm" value={formData.breakMins} onChange={e => setFormData({...formData, breakMins: e.target.value})} min="0" /></div>
                  </div>
                  <div className="mb-3"><input type="text" className="form-control form-control-sm" placeholder="Notes..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} /></div>
                  <button className="btn btn-primary btn-sm w-100 fw-bold shadow-sm" onClick={handleAddShift} disabled={loading}>{loading ? 'Saving...' : <><Plus size={14} className="me-1 d-inline"/> Add to Roster</>}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 2. Bulk Schedule Modal (批量智能排班)
// ============================================================================
function BulkModal({ isOpen, staffList, presets, leaves, schedules, onClose, openPresetModal }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  const [formData, setFormData] = useState({
    presetIdx: '', dateMode: 'range', 
    start: '', end: '', month: new Date().toISOString().slice(0, 7),
    staffIds: [],
    rules: {
      1: { active: true }, 2: { active: true }, 3: { active: true }, 
      4: { active: true }, 5: { active: true }, 6: { active: false }, 0: { active: false }
    },
    timeStart: '09:00', timeEnd: '18:00', breakMins: 60
  });

  if (!isOpen) return null;

  const handleRunBulk = async () => {
    const { presetIdx, dateMode, start, end, month, staffIds, rules, timeStart, timeEnd, breakMins } = formData;
    if (staffIds.length === 0) return alert('Select at least one staff.');
    
    let sDateStr, eDateStr;
    if (dateMode === 'month') {
      if(!month) return alert('Select a month.');
      sDateStr = `${month}-01`;
      const [y, m] = month.split('-');
      eDateStr = `${month}-${new Date(y, m, 0).getDate()}`;
    } else {
      if (!start || !end) return alert('Date Range is required.');
      sDateStr = start; eDateStr = end;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      let successCount = 0;
      let activeRules = {};

      if (presetIdx !== "") {
        const p = presets[presetIdx];
        if (p?.schedule) activeRules = p.schedule;
      } else {
        if(!timeStart || !timeEnd) throw new Error("Enter manual Time.");
        [0, 1, 2, 3, 4, 5, 6].forEach(day => {
          if (rules[day].active) activeRules[day] = { active: true, start: timeStart, end: timeEnd, break: breakMins };
        });
        if(Object.keys(activeRules).length === 0) throw new Error("Select at least one active day.");
      }

      const selectedStaff = staffList.filter(s => staffIds.includes(s.id));

      selectedStaff.forEach(u => {
        const cleanId = String(u.id).trim();
        let userStartDateStr = sDateStr;
        if (u.employment?.joinDate && u.employment.joinDate > sDateStr) userStartDateStr = u.employment.joinDate;
        if (userStartDateStr > eDateStr) return;

        let curr = new Date(userStartDateStr);
        const endDt = new Date(eDateStr);
        
        while (curr <= endDt) {
          const dateStr = curr.toISOString().split('T')[0];
          const dayOfWeek = String(curr.getUTCDay()); 
          const dayRule = activeRules[dayOfWeek];

          if (dayRule?.active && dayRule.start && dayRule.end) {
            const key = `${cleanId}_${dateStr}`;
            if (!leaves[key] && !schedules.some(s => String(s.userId).trim() === cleanId && s.date === dateStr)) {
              const ref = doc(collection(db, "schedules"));
              batch.set(ref, { 
                userId: u.id, empName: u.personal?.name || u.name, 
                date: dateStr, 
                start: Timestamp.fromDate(new Date(`${dateStr}T${dayRule.start}:00`)), 
                end: Timestamp.fromDate(new Date(`${dateStr}T${dayRule.end}:00`)), 
                breakMins: parseInt(dayRule.break) || 0, notes: '', 
                createdAt: Timestamp.now(), createdBy: currentUser.uid 
              });
              successCount++;
            }
          }
          curr.setUTCDate(curr.getUTCDate() + 1);
        }
      });

      if (successCount > 0) await batch.commit();
      onClose();
      alert(`✅ Scheduled ${successCount} shifts.\nSmart Feature: New joiners were only scheduled from their Join Date.`);
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const isCustom = formData.presetIdx === "";

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered"> 
          <div className="modal-content border-0 shadow-lg">
            <div className="modal-header py-3 bg-primary bg-opacity-10 border-0">
              <h6 className="modal-title fw-bold text-primary"><Layers size={18} className="me-2 d-inline"/>Bulk Schedule</h6>
              <button className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-4 bg-light">
              <div className="mb-3 bg-white p-3 border rounded shadow-sm">
                <label className="form-label small fw-bold text-muted mb-2">STEP 1: SELECT PRESET</label>
                <div className="d-flex gap-2">
                  <select className="form-select border-primary fw-bold text-primary" value={formData.presetIdx} onChange={e => setFormData({...formData, presetIdx: e.target.value})}>
                    <option value="">Custom (Use settings below)</option>
                    {presets.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
                  </select>
                  <button className="btn btn-outline-secondary" onClick={() => { onClose(); openPresetModal(); }}><Settings size={18}/></button>
                </div>
              </div>

              <div className="mb-3 bg-white p-3 border rounded shadow-sm">
                <label className="form-label small fw-bold text-muted mb-2">STEP 2: DATE RANGE</label>
                <div className="btn-group w-100 mb-3 shadow-sm">
                  <input type="radio" className="btn-check" id="modeRange" checked={formData.dateMode === 'range'} onChange={() => setFormData({...formData, dateMode: 'range'})} />
                  <label className="btn btn-sm btn-outline-primary fw-bold" htmlFor="modeRange">Specific Range</label>
                  <input type="radio" className="btn-check" id="modeMonth" checked={formData.dateMode === 'month'} onChange={() => setFormData({...formData, dateMode: 'month'})} />
                  <label className="btn btn-sm btn-outline-primary fw-bold" htmlFor="modeMonth">Whole Month</label>
                </div>
                {formData.dateMode === 'range' ? (
                  <div className="row g-2">
                    <div className="col-6"><label className="small fw-bold text-muted">From</label><input type="date" className="form-control" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} /></div>
                    <div className="col-6"><label className="small fw-bold text-muted">To</label><input type="date" className="form-control" value={formData.end} onChange={e => setFormData({...formData, end: e.target.value})} /></div>
                  </div>
                ) : (
                  <div>
                    <input type="month" className="form-control border-primary fw-bold text-primary" value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} />
                    <div className="form-text text-success fw-bold small mt-1"><Info size={12} className="me-1 d-inline"/> Auto-detects staff Join Date!</div>
                  </div>
                )}
              </div>

              <div className="mb-3 bg-white p-3 border rounded shadow-sm">
                <label className="form-label small fw-bold text-muted mb-2">STEP 3: SELECT STAFF</label>
                <input type="text" className="form-control form-control-sm mb-2" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
                <select className="form-select form-select-sm" multiple size="4" value={formData.staffIds} onChange={e => setFormData({...formData, staffIds: Array.from(e.target.selectedOptions, o => o.value)})}>
                  {staffList.filter(s => (s.personal?.name || s.name).toLowerCase().includes(search.toLowerCase())).map(s => <option key={s.id} value={s.id}>{s.personal?.name || s.name}</option>)}
                </select>
              </div>

              {isCustom && (
                <div className="bg-white p-3 rounded border shadow-sm border-warning">
                  <div className="mb-2 fw-bold text-warning small">CUSTOM RULES</div>
                  <div className="d-flex gap-1 mb-3">
                    {['M','T','W','T','F','S','S'].map((day, idx) => {
                      const dayKey = idx === 6 ? 0 : idx + 1;
                      return (
                        <div key={dayKey} className="text-center">
                           <input type="checkbox" className="form-check-input" checked={formData.rules[dayKey].active} onChange={e => setFormData({...formData, rules: {...formData.rules, [dayKey]: { active: e.target.checked } }})} />
                           <div className="small text-muted">{day}</div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="row g-2">
                    <div className="col-4"><label className="small fw-bold text-muted">Start</label><input type="time" className="form-control form-control-sm" value={formData.timeStart} onChange={e => setFormData({...formData, timeStart: e.target.value})} /></div>
                    <div className="col-4"><label className="small fw-bold text-muted">End</label><input type="time" className="form-control form-control-sm" value={formData.timeEnd} onChange={e => setFormData({...formData, timeEnd: e.target.value})} /></div>
                    <div className="col-4"><label className="small fw-bold text-muted">Break</label><input type="number" className="form-control form-control-sm" value={formData.breakMins} onChange={e => setFormData({...formData, breakMins: e.target.value})} /></div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer bg-light py-3 border-0">
              <button className="btn btn-secondary fw-bold" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary fw-bold shadow-sm px-4" onClick={handleRunBulk} disabled={loading}>{loading ? 'Processing...' : 'Run Bulk Schedule'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 3. Preset Modal (高级预设管理)
// ============================================================================
function PresetModal({ isOpen, presets, onClose }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    idx: -1, name: '',
    days: [
      { day: 1, label: 'Mon', active: true, start: '09:00', end: '18:00', break: 60 },
      { day: 2, label: 'Tue', active: true, start: '09:00', end: '18:00', break: 60 },
      { day: 3, label: 'Wed', active: true, start: '09:00', end: '18:00', break: 60 },
      { day: 4, label: 'Thu', active: true, start: '09:00', end: '18:00', break: 60 },
      { day: 5, label: 'Fri', active: true, start: '09:00', end: '18:00', break: 60 },
      { day: 6, label: 'Sat', active: false, start: '09:00', end: '18:00', break: 60 },
      { day: 0, label: 'Sun', active: false, start: '09:00', end: '18:00', break: 60 },
    ]
  });

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!form.name.trim()) return alert("Enter a name for the preset.");
    const hasActive = form.days.some(d => d.active);
    if (!hasActive) return alert("Enable at least one day.");

    setLoading(true);
    try {
      const scheduleMap = {};
      form.days.forEach(d => {
        scheduleMap[d.day] = { active: d.active, start: d.start, end: d.end, break: d.break };
      });

      const newPreset = { name: form.name, schedule: scheduleMap };
      let newArray = [...presets];

      if (form.idx === -1) newArray.push(newPreset);
      else newArray[form.idx] = newPreset;

      await setDoc(doc(db, "settings", "shift_presets"), { presets: newArray });
      handleReset();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const handleEdit = (idx) => {
    const p = presets[idx];
    const newDays = form.days.map(d => {
      const rule = p.schedule[d.day];
      return rule ? { ...d, active: rule.active, start: rule.start, end: rule.end, break: rule.break } : d;
    });
    setForm({ idx, name: p.name, days: newDays });
  };

  const handleDelete = async (idx) => {
    if (!window.confirm("Delete this preset?")) return;
    setLoading(true);
    try {
      let newArray = [...presets];
      newArray.splice(idx, 1);
      await setDoc(doc(db, "settings", "shift_presets"), { presets: newArray });
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const handleReset = () => {
    setForm({
      idx: -1, name: '',
      days: form.days.map(d => ({ ...d, active: d.day >= 1 && d.day <= 5, start: '09:00', end: '18:00', break: 60 }))
    });
  };

  const updateDay = (dayKey, field, value) => {
    setForm(prev => ({
      ...prev,
      days: prev.days.map(d => d.day === dayKey ? { ...d, [field]: value } : d)
    }));
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-md modal-dialog-centered">
          <div className="modal-content border-0 shadow">
            <div className="modal-header py-3 bg-light border-0">
              <h6 className="modal-title fw-bold text-dark">Manage Advanced Presets</h6>
              <button className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-3">
              <div className="mb-3 border-bottom pb-3">
                <input type="text" className="form-control form-control-sm mb-3 border-primary text-primary fw-bold" placeholder="Preset Name (e.g., Standard Week)" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                
                <div className="d-flex flex-column gap-2">
                  {form.days.map(d => (
                    <div key={d.day} className="d-flex align-items-center gap-2">
                      <input type="checkbox" className="form-check-input m-0" checked={d.active} onChange={e => updateDay(d.day, 'active', e.target.checked)} />
                      <div style={{ width: '35px' }} className="small fw-bold text-muted">{d.label}</div>
                      <input type="time" className="form-control form-control-sm" value={d.start} onChange={e => updateDay(d.day, 'start', e.target.value)} disabled={!d.active} />
                      <span className="text-muted">-</span>
                      <input type="time" className="form-control form-control-sm" value={d.end} onChange={e => updateDay(d.day, 'end', e.target.value)} disabled={!d.active} />
                      <input type="number" className="form-control form-control-sm" style={{ width: '60px' }} value={d.break} onChange={e => updateDay(d.day, 'break', e.target.value)} disabled={!d.active} />
                      <small className="text-muted">m</small>
                    </div>
                  ))}
                </div>

                <button className={`btn btn-sm w-100 mt-3 fw-bold shadow-sm ${form.idx === -1 ? 'btn-primary' : 'btn-warning text-dark'}`} onClick={handleSave} disabled={loading}>
                  {loading ? 'Saving...' : (form.idx === -1 ? 'Add Preset' : 'Update Preset')}
                </button>
                {form.idx !== -1 && <button className="btn btn-secondary btn-sm w-100 mt-1 fw-bold" onClick={handleReset}>Cancel Edit</button>}
              </div>
              
              <h6 className="small fw-bold text-muted mb-2">Saved Presets</h6>
              <div className="d-flex flex-column gap-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {presets.length === 0 && <div className="text-center small text-muted">No presets saved.</div>}
                {presets.map((p, i) => (
                  <div key={i} className="p-2 border rounded bg-white d-flex justify-content-between align-items-center">
                    <div className="text-truncate" style={{ maxWidth: '200px' }}>
                      <div className="fw-bold small">{p.name}</div>
                    </div>
                    <div className="d-flex gap-1">
                      <button className="btn btn-xs btn-outline-primary" onClick={() => handleEdit(i)}><Edit2 size={14}/></button>
                      <button className="btn btn-xs btn-outline-danger" onClick={() => handleDelete(i)} disabled={loading}><Trash2 size={14}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 4. Staff Analytics Modal (单人排班分析与清理)
// ============================================================================
function StaffAnalyticsModal({ isOpen, uid, schedules, filterDateObj, onClose, openSingleEdit }) {
  const [loading, setLoading] = useState(false);

  if (!isOpen || !uid) return null;

  // 根据传入的过滤日期和UID计算对应的班次
  const userShifts = schedules.filter(s => {
    if (s.userId !== uid) return false;
    if (!filterDateObj) return true; // Fallback
    const sd = new Date(s.date);
    return sd >= filterDateObj.start && sd <= filterDateObj.end;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  const totalHours = userShifts.reduce((acc, s) => acc + (s.hours || 0), 0);
  const empName = userShifts.length > 0 ? userShifts[0].empName : "Unknown Staff";

  const handleClearAll = async () => {
    if (userShifts.some(s => s.clockIn)) return alert("Cannot clear all: Some shifts are already clocked in.");
    if (!window.confirm(`⚠️ DANGER: Are you sure you want to DELETE ALL ${userShifts.length} displayed shifts for ${empName}?`)) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      userShifts.forEach(s => batch.delete(doc(db, "schedules", s.id)));
      await batch.commit();
      onClose();
    } catch (e) { alert("Failed to clear shifts: " + e.message); } finally { setLoading(false); }
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content border-0 shadow">
            <div className="modal-header py-3 bg-primary bg-opacity-10 border-0 align-items-start">
              <div>
                <h6 className="modal-title fw-bold text-primary mb-1 d-flex align-items-center">
                  {empName} 
                  {userShifts.length > 0 && <button className="btn btn-xs btn-outline-danger ms-2 py-0" onClick={handleClearAll} disabled={loading}>Clear All Displayed</button>}
                </h6>
                <small className="text-muted fw-bold">Selected Period</small>
              </div>
              <button className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-0">
              <div className="table-responsive" style={{ maxHeight: '400px' }}>
                <table className="table table-sm table-striped m-0 align-middle border-0" style={{ fontSize: '0.85rem' }}>
                  <thead className="table-light sticky-top text-muted">
                    <tr><th className="ps-3 border-0">Date</th><th className="border-0">Day</th><th className="border-0">Time</th><th className="text-end pe-3 border-0">Hrs</th></tr>
                  </thead>
                  <tbody className="border-0">
                    {userShifts.length === 0 && <tr><td colSpan="4" className="text-center py-4 text-muted">No shifts found for this period.</td></tr>}
                    {userShifts.map(s => (
                      <tr key={s.id}>
                        <td className="ps-3">{s.date}</td>
                        <td><span className="badge bg-light text-dark border">{new Date(s.date).toLocaleDateString('en-US', {weekday: 'short'})}</span></td>
                        <td>{s.start?.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} - {s.end?.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
                        <td className="text-end pe-3 fw-bold text-primary d-flex justify-content-end align-items-center gap-2">
                          {s.hours?.toFixed(1)}
                          {!s.clockIn ? (
                            <button className="btn btn-xs text-primary border-0 p-0" onClick={() => { onClose(); openSingleEdit(s.id); }}><Edit2 size={14}/></button>
                          ) : (
                            <Lock size={14} className="text-muted" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer bg-light py-3 border-0">
              <div className="d-flex w-100 justify-content-between fw-bold small text-dark">
                <span>Total Shifts: <span className="text-primary">{userShifts.length}</span></span>
                <span>Total Hours: <span className="text-primary">{totalHours.toFixed(1)}</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 5. Edit Single Shift Modal (编辑单个班次)
// ============================================================================
function EditSingleShiftModal({ isOpen, shiftId, schedules, onClose }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ start: '', end: '', breakMins: 0 });

  const shift = schedules.find(s => s.id === shiftId);

  useEffect(() => {
    if (isOpen && shift && !shift.clockIn) {
      setFormData({
        start: shift.start?.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) || '',
        end: shift.end?.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) || '',
        breakMins: shift.breakMins || 0
      });
    }
  }, [isOpen, shift]);

  if (!isOpen || !shift) return null;

  const handleSave = async () => {
    if (!formData.start || !formData.end) return alert("Please enter valid times.");
    setLoading(true);
    try {
      const sDT = new Date(`${shift.date}T${formData.start}:00`);
      const eDT = new Date(`${shift.date}T${formData.end}:00`);

      await updateDoc(doc(db, "schedules", shiftId), {
        start: Timestamp.fromDate(sDT),
        end: Timestamp.fromDate(eDT),
        breakMins: parseInt(formData.breakMins) || 0
      });
      onClose();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-sm modal-dialog-centered">
          <div className="modal-content border-0 shadow">
            <div className="modal-header py-2 bg-primary bg-opacity-10 border-0">
              <h6 className="modal-title fw-bold text-primary">Edit Shift</h6>
              <button className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-3">
              <div className="fw-bold text-dark mb-1">{shift.empName}</div>
              <div className="text-muted small mb-3">{shift.date}</div>
              <div className="row g-2 mb-2">
                <div className="col-6"><label className="form-label small fw-bold text-muted">Start</label><input type="time" className="form-control form-control-sm border-primary" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} /></div>
                <div className="col-6"><label className="form-label small fw-bold text-muted">End</label><input type="time" className="form-control form-control-sm border-primary" value={formData.end} onChange={e => setFormData({...formData, end: e.target.value})} /></div>
              </div>
              <div className="mb-2">
                <label className="form-label small fw-bold text-muted">Break (Mins)</label>
                <input type="number" className="form-control form-control-sm border-primary" min="0" value={formData.breakMins} onChange={e => setFormData({...formData, breakMins: e.target.value})} />
              </div>
            </div>
            <div className="modal-footer bg-light py-2 border-0">
              <button className="btn btn-primary btn-sm w-100 fw-bold shadow-sm" onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 6. List Edit Modal (列表视图下的批量时间编辑)
// ============================================================================
function ListEditModal({ isOpen, selectedIds, schedules, onClose, onClearSelection }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ start: '', end: '' });

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!formData.start || !formData.end) return alert("Enter time");
    setLoading(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        const sh = schedules.find(x => x.id === id);
        if (sh && !sh.clockIn) {
          const st = new Date(`${sh.date}T${formData.start}:00`);
          const et = new Date(`${sh.date}T${formData.end}:00`);
          batch.update(doc(db, "schedules", id), { start: Timestamp.fromDate(st), end: Timestamp.fromDate(et) });
        }
      });
      await batch.commit();
      onClearSelection();
      onClose();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-sm modal-dialog-centered">
          <div className="modal-content border-0 shadow">
            <div className="modal-header py-2 bg-warning bg-opacity-10 border-0">
              <h6 className="modal-title fw-bold text-dark">Edit Selected Shifts</h6>
              <button className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-3">
              <p className="small text-muted mb-2">Updating <b className="text-dark">{selectedIds.size}</b> shifts.</p>
              <div className="row g-2 mb-2">
                <div className="col-6"><label className="form-label small fw-bold text-muted">Start</label><input type="time" className="form-control form-control-sm border-warning" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} /></div>
                <div className="col-6"><label className="form-label small fw-bold text-muted">End</label><input type="time" className="form-control form-control-sm border-warning" value={formData.end} onChange={e => setFormData({...formData, end: e.target.value})} /></div>
              </div>
            </div>
            <div className="modal-footer bg-light py-2 border-0">
              <button className="btn btn-primary btn-sm w-100 fw-bold shadow-sm" onClick={handleSubmit} disabled={loading}>{loading ? 'Updating...' : 'Update All'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Main Exporter
// ============================================================================
export default function ScheduleModals({ modals, setModals, schedules, staffList, presets, leaves, filterDateObj, onClearListSelection }) {
  const close = (key) => setModals(prev => ({ ...prev, [key]: { ...prev[key], isOpen: false } }));

  return (
    <>
      <DayManagerModal 
        isOpen={modals.dayManager.isOpen} dateStr={modals.dayManager.dateStr} filterIds={modals.dayManager.filterIds}
        schedules={schedules} staffList={staffList} leaves={leaves} presets={presets}
        onClose={() => close('dayManager')}
        openSingleEdit={(shiftId) => { close('dayManager'); setModals(p => ({...p, singleEdit: { isOpen: true, shiftId }})); }}
      />
      
      <BulkModal 
        isOpen={modals.bulk.isOpen} staffList={staffList} presets={presets} leaves={leaves} schedules={schedules}
        onClose={() => close('bulk')}
        openPresetModal={() => setModals(p => ({...p, preset: { isOpen: true }}))}
      />

      <PresetModal 
        isOpen={modals.preset.isOpen} presets={presets} 
        onClose={() => close('preset')}
      />

      <StaffAnalyticsModal 
        isOpen={modals.analytics.isOpen} uid={modals.analytics.uid} schedules={schedules} filterDateObj={filterDateObj}
        onClose={() => close('analytics')}
        openSingleEdit={(shiftId) => { close('analytics'); setModals(p => ({...p, singleEdit: { isOpen: true, shiftId }})); }}
      />

      <EditSingleShiftModal 
        isOpen={modals.singleEdit.isOpen} shiftId={modals.singleEdit.shiftId} schedules={schedules}
        onClose={() => close('singleEdit')}
      />

      <ListEditModal 
        isOpen={modals.listEdit.isOpen} selectedIds={modals.listEdit.selectedIds} schedules={schedules}
        onClose={() => close('listEdit')}
        onClearSelection={onClearListSelection}
      />
    </>
  );
}