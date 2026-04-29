// src/pages/Staff/StaffForm.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
// 导入需要的图标
import { Fingerprint, Users, Globe, PhoneCall, Calendar, Briefcase, Clock, PiggyBank, ShieldAlert, Landmark, FolderOpen, Wallet, Building2, Heart, Baby, Save, Download, Upload, ArrowLeft, Home, Plane, Siren, Trash2, Plus } from 'lucide-react';

export default function StaffForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [accountStatus, setAccountStatus] = useState(isNew ? 'active' : 'disabled');
  const isReadOnly = accountStatus !== 'editable' && !isNew;

  // 统一的表单数据状态管理 (包含 children 数组)
  const [formData, setFormData] = useState({
    personal: { empCode: '', name: '', shortName: '', bioId: '', icNo: '', oldIc: '', dob: '', gender: '', marital: '', nationality: '', race: '', religion: '', empType: '', blood: '', email: '', mobile: '' },
    foreign: { id: '', passport: '', passportExp: '', passExp: '', arrival: '', fomema: '', issue: '' },
    employment: { joinDate: '', probation: '', confirmDate: '', termDate: '', contractEnd: '', dept: '', section: '', designation: '', desigGroup: '', category: '', status: '', holidayGrp: '', leaveCat: '', shift: '', excludeDays: '', hrsDay: '', daysWeek: '', hrsWeek: '', isPartTime: false, isFlexi: false, isDriver: false },
    statutory: { epf: { cat: '', no: '', name: '', employerNo: '', contrib: '' }, socso: { cat: '', no: '', employerNo: '' }, tax: { no: '', resStatus: '', resType: '', disable: '', spouseStatus: '', spouseDisable: '' }, eis: '', ptptn: '', zakat: '', hrdf: '' },
    payroll: { basic: '', payGroup: '', dailyRateCode: '', paidType: '', ot: { type: '', rate: '' }, split: { multiPayPct: '', multiPayFixed: '', cashPct: '' }, bank1: { name: '', branch: '', acc: '', pct: '', chq: '' }, bank2: { name: '', branch: '', acc: '', pct: '', chq: '' } },
    address: { local: { door: '', loc: '', street: '', city: '', state: '', country: '', pin: '' }, foreign: { door: '', loc: '', street: '', city: '', state: '', country: '', pin: '' }, emergency: { name: '', rel: '', no: '', id: '' } },
    family: { spouse: { name: '', id: '', phone: '', job: '', dob: '' }, children: [] }
  });

  const [activeTab, setActiveTab] = useState('personal');
  const [originalData, setOriginalData] = useState(null);

  useEffect(() => {
    if (isNew) {
      handleNestedChange('employment', 'joinDate', new Date().toISOString().split('T')[0]);
      return;
    }

    const fetchUser = async () => {
      try {
        const docRef = doc(db, "users", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setOriginalData(data);
          setAccountStatus(data.status || 'active');
          
          setFormData(prev => ({
            ...prev,
            personal: { ...prev.personal, ...data.personal },
            foreign: { ...prev.foreign, ...data.foreign },
            employment: { ...prev.employment, ...data.employment },
            statutory: { ...prev.statutory, ...data.statutory },
            payroll: { ...prev.payroll, ...data.payroll },
            address: { ...prev.address, ...data.address },
            family: { ...prev.family, ...data.family },
          }));
        } else {
          setError("User not found!");
        }
      } catch (err) {
        setError("Error loading profile: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [id, isNew]);

  const handleNestedChange = (category, field, value) => {
    setFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const handleDeepNestedChange = (category, subCategory, field, value) => {
    setFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [subCategory]: {
          ...prev[category][subCategory],
          [field]: value
        }
      }
    }));
  };

  // --- 处理 Children 数组逻辑 ---
  const handleAddChild = () => {
    setFormData(prev => ({
      ...prev,
      family: {
        ...prev.family,
        children: [...prev.family.children, { name: '', dob: '', gender: 'MALE', cert: '', isMalaysian: false, taxCat: '', taxPct: '' }]
      }
    }));
  };

  const handleRemoveChild = (index) => {
    setFormData(prev => {
      const newChildren = [...prev.family.children];
      newChildren.splice(index, 1);
      return { ...prev, family: { ...prev.family, children: newChildren } };
    });
  };

  const handleChildChange = (index, field, value) => {
    setFormData(prev => {
      const newChildren = [...prev.family.children];
      newChildren[index][field] = value;
      return { ...prev, family: { ...prev.family, children: newChildren } };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const empCode = formData.personal.empCode;
    const email = formData.personal.email.toLowerCase().trim();

    if (!empCode || !email) {
      setError("Employee Code and Email Address are required.");
      setSaving(false);
      return;
    }

    try {
      if (isNew) {
        const docRef = doc(db, "users", empCode);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          throw new Error(`Code '${empCode}' already exists.`);
        }
        
        const duplicateCheck = await getDocs(query(collection(db, "users"), where("personal.email", "==", email)));
        if (!duplicateCheck.empty) {
          throw new Error("Email is already in use.");
        }

        const payload = {
          ...formData,
          personal: { ...formData.personal, email },
          role: "staff",
          status: "active",
          isDriver: formData.employment.isDriver,
          meta: { updatedAt: serverTimestamp(), isPreRegistered: true, docVersion: "v2.0" }
        };

        await setDoc(docRef, payload);
        alert("✅ Staff Successfully Added!");
        navigate('/staff');

      } else {
        const payload = {
          ...formData,
          personal: { ...formData.personal, email },
          status: accountStatus, // 保存更新后的状态
          "meta.updatedAt": serverTimestamp()
        };

        await updateDoc(doc(db, "users", id), payload);
        alert("Staff details updated successfully!");
      }
    } catch (err) {
      setError("Save Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center p-5"><div className="spinner-border text-primary"></div><p className="mt-2">Loading Profile...</p></div>;

  return (
    <div className="container-fluid py-4 animate__animated animate__fadeIn">
      
      <div className="d-flex justify-content-between align-items-center mb-3 mx-2">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-sm btn-light border rounded-circle shadow-sm" onClick={() => navigate('/staff')}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h5 className="fw-bold text-dark m-0">
              {isNew ? 'New Staff Onboarding' : formData.personal.name || 'Unknown Staff'}
            </h5>
            <small className="text-muted fw-bold">
              {isNew ? 'Fill in details below' : `EMP ID: ${formData.personal.empCode}`}
            </small>
          </div>
        </div>

        {!isNew && (
          <div className="card shadow-sm border-0">
            <div className="card-body py-2 d-flex align-items-center gap-2">
              <small className="fw-bold text-muted text-uppercase me-1">Status:</small>
              <select 
                className={`form-select form-select-sm border-2 fw-bold ${accountStatus === 'editable' ? 'border-warning text-warning' : (accountStatus === 'disabled' ? 'border-danger text-danger' : 'border-success text-success')}`} 
                style={{ width: '130px' }}
                value={accountStatus}
                onChange={(e) => setAccountStatus(e.target.value)}
              >
                <option value="editable">Editable</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
        )}
        
        {isNew && (
          <button className="btn btn-sm btn-outline-primary fw-bold">
             <Upload size={16} className="me-1" /> Upload Excel
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger mx-2">{error}</div>}

      <div className="card mx-2 shadow-sm border-0">
        
        <div className="card-header bg-white p-0 border-bottom">
          <ul className="nav nav-tabs card-header-tabs m-0">
            {['personal', 'employment', 'statutory', 'payroll', 'family', 'address'].map((tab) => (
              <li className="nav-item" key={tab}>
                <button 
                  className={`nav-link fw-bold text-capitalize ${activeTab === tab ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setActiveTab(tab); }}
                >
                  {tab}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-body p-4 pt-3">
          <form onSubmit={handleSubmit}>
            
            {/* ======================= TAB 1: PERSONAL ======================= */}
            {activeTab === 'personal' && (
              <div className="animate__animated animate__fadeIn">
                <div className="text-primary fw-bold mb-2 border-bottom pb-1"><Fingerprint size={16} className="me-1 mb-1"/> Identity & Access</div>
                <div className="row g-2">
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Employee Code *</label>
                    <input type="text" className={`form-control form-control-sm fw-bold ${isNew ? 'border-primary text-primary' : 'bg-light'}`} required disabled={!isNew} value={formData.personal.empCode} onChange={(e) => { handleNestedChange('personal', 'empCode', e.target.value); if (isNew) handleNestedChange('personal', 'bioId', e.target.value); }} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small text-muted fw-bold">Employee Name *</label>
                    <input type="text" className="form-control form-control-sm fw-bold text-dark" required disabled={isReadOnly} value={formData.personal.name} onChange={(e) => handleNestedChange('personal', 'name', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Short Name</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.personal.shortName} onChange={(e) => handleNestedChange('personal', 'shortName', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Bio ID</label>
                    <input type="text" className="form-control form-control-sm bg-light" readOnly value={formData.personal.bioId} />
                  </div>
                </div>

                <div className="text-primary fw-bold mb-2 border-bottom pb-1 mt-4"><Users size={16} className="me-1 mb-1"/> Demographics</div>
                <div className="row g-2">
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">MyKad/Ic No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.personal.icNo} onChange={(e) => handleNestedChange('personal', 'icNo', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Old Ic No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.personal.oldIc} onChange={(e) => handleNestedChange('personal', 'oldIc', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Birth Date *</label>
                    <input type="date" className="form-control form-control-sm fw-bold" required disabled={isReadOnly} value={formData.personal.dob} onChange={(e) => handleNestedChange('personal', 'dob', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Gender *</label>
                    <select className="form-select form-select-sm fw-bold" required disabled={isReadOnly} value={formData.personal.gender} onChange={(e) => handleNestedChange('personal', 'gender', e.target.value)}>
                      <option value="">Select...</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Marital Status</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.personal.marital} onChange={(e) => handleNestedChange('personal', 'marital', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Nationality</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.personal.nationality} onChange={(e) => handleNestedChange('personal', 'nationality', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Race</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.personal.race} onChange={(e) => handleNestedChange('personal', 'race', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Religion</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.personal.religion} onChange={(e) => handleNestedChange('personal', 'religion', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Employment Type</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.personal.empType} onChange={(e) => handleNestedChange('personal', 'empType', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Blood Type</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.personal.blood} onChange={(e) => handleNestedChange('personal', 'blood', e.target.value)} />
                  </div>
                </div>

                <div className="text-primary fw-bold mb-2 border-bottom pb-1 mt-4"><Globe size={16} className="me-1 mb-1"/> Foreigner Details</div>
                <div className="row g-2">
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Foreign ID No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.foreign.id} onChange={(e) => handleNestedChange('foreign', 'id', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Passport No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.foreign.passport} onChange={(e) => handleNestedChange('foreign', 'passport', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Passport Expiry</label>
                    <input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={formData.foreign.passportExp} onChange={(e) => handleNestedChange('foreign', 'passportExp', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Pass Expiry</label>
                    <input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={formData.foreign.passExp} onChange={(e) => handleNestedChange('foreign', 'passExp', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Arrival Date</label>
                    <input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={formData.foreign.arrival} onChange={(e) => handleNestedChange('foreign', 'arrival', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">FOMEMA Expiry</label>
                    <input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={formData.foreign.fomema} onChange={(e) => handleNestedChange('foreign', 'fomema', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Issue Date</label>
                    <input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={formData.foreign.issue} onChange={(e) => handleNestedChange('foreign', 'issue', e.target.value)} />
                  </div>
                </div>

                <div className="text-primary fw-bold mb-2 border-bottom pb-1 mt-4"><PhoneCall size={16} className="me-1 mb-1"/> Contact</div>
                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label small text-primary fw-bold">Email Address (Login ID) *</label>
                    <input type="email" className="form-control form-control-sm border-primary fw-bold" required disabled={isReadOnly} placeholder="Login ID" value={formData.personal.email} onChange={(e) => handleNestedChange('personal', 'email', e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small text-muted fw-bold">Mobile Number</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} placeholder="0123456789" value={formData.personal.mobile} onChange={(e) => handleNestedChange('personal', 'mobile', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* ======================= TAB 2: EMPLOYMENT ======================= */}
            {activeTab === 'employment' && (
              <div className="animate__animated animate__fadeIn">
                 <div className="text-primary fw-bold mb-2 border-bottom pb-1"><Calendar size={16} className="me-1 mb-1"/> Timeline</div>
                 <div className="row g-2">
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Join Date *</label>
                     <input type="date" className="form-control form-control-sm fw-bold border-primary" required disabled={isReadOnly} value={formData.employment.joinDate} onChange={(e) => handleNestedChange('employment', 'joinDate', e.target.value)} />
                   </div>
                   <div className="col-md-2">
                     <label className="form-label small text-muted fw-bold">Probation (Months)</label>
                     <input type="number" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.probation} onChange={(e) => handleNestedChange('employment', 'probation', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Confirmation</label>
                     <input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.confirmDate} onChange={(e) => handleNestedChange('employment', 'confirmDate', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Termination</label>
                     <input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.termDate} onChange={(e) => handleNestedChange('employment', 'termDate', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Contract End</label>
                     <input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.contractEnd} onChange={(e) => handleNestedChange('employment', 'contractEnd', e.target.value)} />
                   </div>
                 </div>

                 <div className="text-primary fw-bold mb-2 border-bottom pb-1 mt-4"><Briefcase size={16} className="me-1 mb-1"/> Organization</div>
                 <div className="row g-2">
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Department</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.dept} onChange={(e) => handleNestedChange('employment', 'dept', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Section</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.section} onChange={(e) => handleNestedChange('employment', 'section', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Designation</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.designation} onChange={(e) => handleNestedChange('employment', 'designation', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Desig Group</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.desigGroup} onChange={(e) => handleNestedChange('employment', 'desigGroup', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Category</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.category} onChange={(e) => handleNestedChange('employment', 'category', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Status</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.status} onChange={(e) => handleNestedChange('employment', 'status', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Holiday Grp</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.holidayGrp} onChange={(e) => handleNestedChange('employment', 'holidayGrp', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Leave Cat</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.leaveCat} onChange={(e) => handleNestedChange('employment', 'leaveCat', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <div className="form-check pt-4">
                       <input type="checkbox" className="form-check-input" id="driverCheck" disabled={isReadOnly} checked={formData.employment.isDriver} onChange={(e) => handleNestedChange('employment', 'isDriver', e.target.checked)} />
                       <label className="form-check-label fw-bold text-primary" htmlFor="driverCheck">Is Driver / Field Staff?</label>
                     </div>
                   </div>
                 </div>

                 <div className="text-primary fw-bold mb-2 border-bottom pb-1 mt-4"><Clock size={16} className="me-1 mb-1"/> Schedule</div>
                 <div className="row g-2">
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Shift</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.shift} onChange={(e) => handleNestedChange('employment', 'shift', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label small text-muted fw-bold">Exclude Days</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.excludeDays} onChange={(e) => handleNestedChange('employment', 'excludeDays', e.target.value)} />
                   </div>
                   <div className="col-md-2">
                     <label className="form-label small text-muted fw-bold">Hrs/Day</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.hrsDay} onChange={(e) => handleNestedChange('employment', 'hrsDay', e.target.value)} />
                   </div>
                   <div className="col-md-2">
                     <label className="form-label small text-muted fw-bold">Days/Week</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.daysWeek} onChange={(e) => handleNestedChange('employment', 'daysWeek', e.target.value)} />
                   </div>
                   <div className="col-md-2">
                     <label className="form-label small text-muted fw-bold">Hrs/Week</label>
                     <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.employment.hrsWeek} onChange={(e) => handleNestedChange('employment', 'hrsWeek', e.target.value)} />
                   </div>
                   <div className="col-md-2">
                     <div className="form-check pt-3">
                       <input type="checkbox" className="form-check-input" id="partTimeCheck" disabled={isReadOnly} checked={formData.employment.isPartTime} onChange={(e) => handleNestedChange('employment', 'isPartTime', e.target.checked)} />
                       <label className="form-check-label text-muted fw-bold" htmlFor="partTimeCheck">Part Time</label>
                     </div>
                   </div>
                   <div className="col-md-2">
                     <div className="form-check pt-3">
                       <input type="checkbox" className="form-check-input" id="flexiCheck" disabled={isReadOnly} checked={formData.employment.isFlexi} onChange={(e) => handleNestedChange('employment', 'isFlexi', e.target.checked)} />
                       <label className="form-check-label text-muted fw-bold" htmlFor="flexiCheck">Flexi Hours</label>
                     </div>
                   </div>
                 </div>
              </div>
            )}

            {/* ======================= TAB 3: STATUTORY ======================= */}
            {activeTab === 'statutory' && (
              <div className="animate__animated animate__fadeIn">
                <div className="text-primary fw-bold mb-2 border-bottom pb-1"><PiggyBank size={16} className="me-1 mb-1"/> EPF</div>
                <div className="row g-2">
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Category</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.epf.cat} onChange={(e) => handleDeepNestedChange('statutory', 'epf', 'cat', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">EPF No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.epf.no} onChange={(e) => handleDeepNestedChange('statutory', 'epf', 'no', e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small text-muted fw-bold">EPF Name</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.epf.name} onChange={(e) => handleDeepNestedChange('statutory', 'epf', 'name', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Employer EPF No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.epf.employerNo} onChange={(e) => handleDeepNestedChange('statutory', 'epf', 'employerNo', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-primary fw-bold">Contribution</label>
                    <input type="text" className="form-control form-control-sm fw-bold border-primary text-primary" disabled={isReadOnly} value={formData.statutory.epf.contrib} onChange={(e) => handleDeepNestedChange('statutory', 'epf', 'contrib', e.target.value)} />
                  </div>
                </div>

                <div className="text-primary fw-bold mb-2 border-bottom pb-1 mt-4"><ShieldAlert size={16} className="me-1 mb-1"/> SOCSO & EIS</div>
                <div className="row g-2">
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Category</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.socso.cat} onChange={(e) => handleDeepNestedChange('statutory', 'socso', 'cat', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Security No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.socso.no} onChange={(e) => handleDeepNestedChange('statutory', 'socso', 'no', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Employer No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.socso.employerNo} onChange={(e) => handleDeepNestedChange('statutory', 'socso', 'employerNo', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-primary fw-bold">EIS Contrib</label>
                    <input type="text" className="form-control form-control-sm fw-bold border-primary text-primary" disabled={isReadOnly} value={formData.statutory.eis} onChange={(e) => handleNestedChange('statutory', 'eis', e.target.value)} />
                  </div>
                </div>

                <div className="text-primary fw-bold mb-2 border-bottom pb-1 mt-4"><Landmark size={16} className="me-1 mb-1"/> Tax (LHDN)</div>
                <div className="row g-2">
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Tax No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.tax.no} onChange={(e) => handleDeepNestedChange('statutory', 'tax', 'no', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Res. Status</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.tax.resStatus} onChange={(e) => handleDeepNestedChange('statutory', 'tax', 'resStatus', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Res. Type</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.tax.resType} onChange={(e) => handleDeepNestedChange('statutory', 'tax', 'resType', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Disable?</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.tax.disable} onChange={(e) => handleDeepNestedChange('statutory', 'tax', 'disable', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Spouse Sts</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.tax.spouseStatus} onChange={(e) => handleDeepNestedChange('statutory', 'tax', 'spouseStatus', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small text-muted fw-bold">Spouse Dis?</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.tax.spouseDisable} onChange={(e) => handleDeepNestedChange('statutory', 'tax', 'spouseDisable', e.target.value)} />
                  </div>
                </div>

                <div className="text-primary fw-bold mb-2 border-bottom pb-1 mt-4"><FolderOpen size={16} className="me-1 mb-1"/> Others</div>
                <div className="row g-2">
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">PTPTN No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.ptptn} onChange={(e) => handleNestedChange('statutory', 'ptptn', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Zakat No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.zakat} onChange={(e) => handleNestedChange('statutory', 'zakat', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">HRDF No</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.statutory.hrdf} onChange={(e) => handleNestedChange('statutory', 'hrdf', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* ======================= TAB 4: PAYROLL ======================= */}
            {activeTab === 'payroll' && (
              <div className="animate__animated animate__fadeIn">
                <div className="text-success fw-bold mb-2 border-bottom border-success pb-1"><Wallet size={16} className="me-1 mb-1"/> Salary & Rates</div>
                <div className="row g-2">
                  <div className="col-md-3">
                    <label className="form-label small text-success fw-bold">Basic Salary</label>
                    <input type="text" className="form-control form-control-sm fw-bold border-success text-success fs-6" disabled={isReadOnly} value={formData.payroll.basic} onChange={(e) => handleNestedChange('payroll', 'basic', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Pay Group</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.payGroup} onChange={(e) => handleNestedChange('payroll', 'payGroup', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Daily Rate Code</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.dailyRateCode} onChange={(e) => handleNestedChange('payroll', 'dailyRateCode', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Paid Type</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.paidType} onChange={(e) => handleNestedChange('payroll', 'paidType', e.target.value)} />
                  </div>
                </div>

                <div className="text-success fw-bold mb-2 border-bottom border-success pb-1 mt-4"><Clock size={16} className="me-1 mb-1"/> Overtime</div>
                <div className="row g-2">
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">OT Type</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.ot.type} onChange={(e) => handleDeepNestedChange('payroll', 'ot', 'type', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small text-muted fw-bold">Rate</label>
                    <input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.ot.rate} onChange={(e) => handleDeepNestedChange('payroll', 'ot', 'rate', e.target.value)} />
                  </div>
                </div>

                <div className="text-success fw-bold mb-2 border-bottom border-success pb-1 mt-4"><Building2 size={16} className="me-1 mb-1"/> Bank Details (GIRO 1)</div>
                <div className="row g-2">
                  <div className="col-md-4"><label className="form-label small text-muted fw-bold">Bank Name</label><input type="text" className="form-control form-control-sm fw-bold" disabled={isReadOnly} value={formData.payroll.bank1.name} onChange={(e) => handleDeepNestedChange('payroll', 'bank1', 'name', e.target.value)} /></div>
                  <div className="col-md-2"><label className="form-label small text-muted fw-bold">Branch ID</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.bank1.branch} onChange={(e) => handleDeepNestedChange('payroll', 'bank1', 'branch', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Account No</label><input type="text" className="form-control form-control-sm fw-bold text-dark border-dark" disabled={isReadOnly} value={formData.payroll.bank1.acc} onChange={(e) => handleDeepNestedChange('payroll', 'bank1', 'acc', e.target.value)} /></div>
                  <div className="col-md-1"><label className="form-label small text-muted fw-bold">Pay %</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.bank1.pct} onChange={(e) => handleDeepNestedChange('payroll', 'bank1', 'pct', e.target.value)} /></div>
                  <div className="col-md-1"><label className="form-label small text-muted fw-bold">Chq %</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.bank1.chq} onChange={(e) => handleDeepNestedChange('payroll', 'bank1', 'chq', e.target.value)} /></div>
                </div>

                <div className="text-muted fw-bold mb-2 border-bottom pb-1 mt-4">Bank Details (GIRO 2)</div>
                <div className="row g-2">
                  <div className="col-md-4"><label className="form-label small text-muted fw-bold">Bank Name 2</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.bank2.name} onChange={(e) => handleDeepNestedChange('payroll', 'bank2', 'name', e.target.value)} /></div>
                  <div className="col-md-2"><label className="form-label small text-muted fw-bold">Branch ID 2</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.bank2.branch} onChange={(e) => handleDeepNestedChange('payroll', 'bank2', 'branch', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Account No 2</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.bank2.acc} onChange={(e) => handleDeepNestedChange('payroll', 'bank2', 'acc', e.target.value)} /></div>
                  <div className="col-md-1"><label className="form-label small text-muted fw-bold">Pay %</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.bank2.pct} onChange={(e) => handleDeepNestedChange('payroll', 'bank2', 'pct', e.target.value)} /></div>
                  <div className="col-md-1"><label className="form-label small text-muted fw-bold">Chq %</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.bank2.chq} onChange={(e) => handleDeepNestedChange('payroll', 'bank2', 'chq', e.target.value)} /></div>
                </div>

                <div className="text-muted fw-bold mb-2 border-bottom pb-1 mt-4">Split Payment</div>
                <div className="row g-2">
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Multiple Pay %</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.split.multiPayPct} onChange={(e) => handleDeepNestedChange('payroll', 'split', 'multiPayPct', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Fixed Amt</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.split.multiPayFixed} onChange={(e) => handleDeepNestedChange('payroll', 'split', 'multiPayFixed', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Cash %</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.payroll.split.cashPct} onChange={(e) => handleDeepNestedChange('payroll', 'split', 'cashPct', e.target.value)} /></div>
                </div>
              </div>
            )}

            {/* ======================= TAB 5: FAMILY ======================= */}
            {activeTab === 'family' && (
              <div className="animate__animated animate__fadeIn">
                <div className="text-primary fw-bold mb-2 border-bottom pb-1"><Heart size={16} className="me-1 mb-1"/> Spouse</div>
                <div className="row g-2">
                  <div className="col-md-4"><label className="form-label small text-muted fw-bold">Spouse Name</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.family.spouse.name} onChange={(e) => handleDeepNestedChange('family', 'spouse', 'name', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">ID/Passport</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.family.spouse.id} onChange={(e) => handleDeepNestedChange('family', 'spouse', 'id', e.target.value)} /></div>
                  <div className="col-md-2"><label className="form-label small text-muted fw-bold">Phone</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.family.spouse.phone} onChange={(e) => handleDeepNestedChange('family', 'spouse', 'phone', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Occupation</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.family.spouse.job} onChange={(e) => handleDeepNestedChange('family', 'spouse', 'job', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">DOB</label><input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={formData.family.spouse.dob} onChange={(e) => handleDeepNestedChange('family', 'spouse', 'dob', e.target.value)} /></div>
                </div>

                <div className="d-flex justify-content-between align-items-center mt-4 border-bottom pb-1 mb-2">
                  <span className="text-primary fw-bold"><Baby size={16} className="me-1 mb-1"/> Children (Max 6)</span>
                  {!isReadOnly && formData.family.children.length < 6 && (
                    <button type="button" className="btn btn-sm btn-outline-primary py-0" onClick={handleAddChild}>
                      <Plus size={14} className="me-1" /> Add Child
                    </button>
                  )}
                </div>
                
                <div className="table-responsive border rounded">
                  <table className="table table-bordered table-sm m-0">
                    <thead className="table-light text-muted small text-uppercase">
                      <tr>
                        <th>Name</th>
                        <th style={{ width: '130px' }}>DOB</th>
                        <th style={{ width: '100px' }}>Gender</th>
                        <th>Cert/IC No</th>
                        <th style={{ width: '80px' }}>M'sian?</th>
                        <th>Tax Cat</th>
                        <th style={{ width: '80px' }}>Tax %</th>
                        {!isReadOnly && <th style={{ width: '50px' }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {formData.family.children.map((child, index) => (
                        <tr key={index}>
                          <td><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={child.name} onChange={(e) => handleChildChange(index, 'name', e.target.value)} /></td>
                          <td><input type="date" className="form-control form-control-sm" disabled={isReadOnly} value={child.dob} onChange={(e) => handleChildChange(index, 'dob', e.target.value)} /></td>
                          <td>
                            <select className="form-select form-select-sm" disabled={isReadOnly} value={child.gender} onChange={(e) => handleChildChange(index, 'gender', e.target.value)}>
                              <option value="MALE">Male</option>
                              <option value="FEMALE">Female</option>
                            </select>
                          </td>
                          <td><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={child.cert} onChange={(e) => handleChildChange(index, 'cert', e.target.value)} /></td>
                          <td className="text-center"><input type="checkbox" className="form-check-input mt-2" disabled={isReadOnly} checked={child.isMalaysian} onChange={(e) => handleChildChange(index, 'isMalaysian', e.target.checked)} /></td>
                          <td><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={child.taxCat} onChange={(e) => handleChildChange(index, 'taxCat', e.target.value)} /></td>
                          <td><input type="number" className="form-control form-control-sm" disabled={isReadOnly} value={child.taxPct} onChange={(e) => handleChildChange(index, 'taxPct', e.target.value)} /></td>
                          {!isReadOnly && (
                            <td className="text-center">
                              <button type="button" className="btn btn-sm text-danger p-1" onClick={() => handleRemoveChild(index)}>
                                <Trash2 size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {formData.family.children.length === 0 && (
                        <tr><td colSpan="8" className="text-center text-muted py-3 small">No children records</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ======================= TAB 6: ADDRESS ======================= */}
            {activeTab === 'address' && (
              <div className="animate__animated animate__fadeIn">
                <div className="text-primary fw-bold mb-2 border-bottom pb-1"><Home size={16} className="me-1 mb-1"/> Local Address</div>
                <div className="row g-2">
                  <div className="col-md-2"><label className="form-label small text-muted fw-bold">Door No</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.local.door} onChange={(e) => handleDeepNestedChange('address', 'local', 'door', e.target.value)} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted fw-bold">Location</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.local.loc} onChange={(e) => handleDeepNestedChange('address', 'local', 'loc', e.target.value)} /></div>
                  <div className="col-md-6"><label className="form-label small text-muted fw-bold">Street</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.local.street} onChange={(e) => handleDeepNestedChange('address', 'local', 'street', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">City</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.local.city} onChange={(e) => handleDeepNestedChange('address', 'local', 'city', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">State</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.local.state} onChange={(e) => handleDeepNestedChange('address', 'local', 'state', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Country</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.local.country} onChange={(e) => handleDeepNestedChange('address', 'local', 'country', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Pincode</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.local.pin} onChange={(e) => handleDeepNestedChange('address', 'local', 'pin', e.target.value)} /></div>
                </div>

                <div className="text-primary fw-bold mb-2 border-bottom pb-1 mt-4"><Plane size={16} className="me-1 mb-1"/> Foreign Address</div>
                <div className="row g-2">
                  <div className="col-md-2"><label className="form-label small text-muted fw-bold">Door No</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.foreign.door} onChange={(e) => handleDeepNestedChange('address', 'foreign', 'door', e.target.value)} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted fw-bold">Location</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.foreign.loc} onChange={(e) => handleDeepNestedChange('address', 'foreign', 'loc', e.target.value)} /></div>
                  <div className="col-md-6"><label className="form-label small text-muted fw-bold">Street</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.foreign.street} onChange={(e) => handleDeepNestedChange('address', 'foreign', 'street', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">City</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.foreign.city} onChange={(e) => handleDeepNestedChange('address', 'foreign', 'city', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">State</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.foreign.state} onChange={(e) => handleDeepNestedChange('address', 'foreign', 'state', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Country</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.foreign.country} onChange={(e) => handleDeepNestedChange('address', 'foreign', 'country', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-muted fw-bold">Pincode</label><input type="text" className="form-control form-control-sm" disabled={isReadOnly} value={formData.address.foreign.pin} onChange={(e) => handleDeepNestedChange('address', 'foreign', 'pin', e.target.value)} /></div>
                </div>

                <div className="text-danger fw-bold mb-2 border-bottom border-danger-subtle pb-1 mt-4"><Siren size={16} className="me-1 mb-1"/> Emergency Contact</div>
                <div className="row g-2">
                  <div className="col-md-4"><label className="form-label small text-danger fw-bold">Name</label><input type="text" className="form-control form-control-sm border-danger-subtle" disabled={isReadOnly} value={formData.address.emergency.name} onChange={(e) => handleDeepNestedChange('address', 'emergency', 'name', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-danger fw-bold">Relationship</label><input type="text" className="form-control form-control-sm border-danger-subtle" disabled={isReadOnly} value={formData.address.emergency.rel} onChange={(e) => handleDeepNestedChange('address', 'emergency', 'rel', e.target.value)} /></div>
                  <div className="col-md-3"><label className="form-label small text-danger fw-bold">Number</label><input type="text" className="form-control form-control-sm border-danger text-danger fw-bold" disabled={isReadOnly} value={formData.address.emergency.no} onChange={(e) => handleDeepNestedChange('address', 'emergency', 'no', e.target.value)} /></div>
                  <div className="col-md-2"><label className="form-label small text-danger fw-bold">ID/Passport</label><input type="text" className="form-control form-control-sm border-danger-subtle" disabled={isReadOnly} value={formData.address.emergency.id} onChange={(e) => handleDeepNestedChange('address', 'emergency', 'id', e.target.value)} /></div>
                </div>
              </div>
            )}

            {/* 🌟 统一的保存按钮 */}
            <div className="mt-4 pt-3 border-top text-end">
              <button 
                type="submit" 
                className="btn btn-success px-5 fw-bold shadow-sm" 
                disabled={isReadOnly || saving}
              >
                {saving ? (
                  <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>
                ) : (
                  <><Save size={18} className="me-2 d-inline mb-1" /> {isNew ? 'Save to DB' : 'Save Changes'}</>
                )}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}