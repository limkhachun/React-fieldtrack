// src/pages/Staff/StaffForm.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
// 导入需要的图标
import { Fingerprint, Users, Globe, PhoneCall, Calendar, Briefcase, Clock, PiggyBank, ShieldAlert, Landmark, FolderOpen, Wallet, Building2, Heart, Baby, Save, Download, Upload, ArrowLeft } from 'lucide-react';

export default function StaffForm() {
  const { id } = useParams(); // 获取 URL 中的参数，决定是新建还是编辑
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // 状态：用于控制表单是否可编辑 (对应原本的 active / editable / disabled)
  const [accountStatus, setAccountStatus] = useState(isNew ? 'active' : 'disabled');
  const isReadOnly = accountStatus !== 'editable' && !isNew;

  // 统一的表单数据状态管理
  const [formData, setFormData] = useState({
    personal: { empCode: '', name: '', shortName: '', bioId: '', icNo: '', oldIc: '', dob: '', gender: '', marital: '', nationality: '', race: '', religion: '', empType: '', blood: '', email: '', mobile: '' },
    foreign: { id: '', passport: '', passportExp: '', passExp: '', arrival: '', fomema: '', issue: '' },
    employment: { joinDate: '', probation: '', confirmDate: '', termDate: '', contractEnd: '', dept: '', section: '', designation: '', desigGroup: '', category: '', status: '', holidayGrp: '', leaveCat: '', shift: '', excludeDays: '', hrsDay: '', daysWeek: '', hrsWeek: '', isPartTime: false, isFlexi: false, isDriver: false },
    statutory: { epf: { cat: '', no: '', name: '', employerNo: '', contrib: '' }, socso: { cat: '', no: '', employerNo: '' }, tax: { no: '', resStatus: '', resType: '', disable: '', spouseStatus: '', spouseDisable: '' }, eis: '', ptptn: '', zakat: '', hrdf: '' },
    payroll: { basic: '', payGroup: '', dailyRateCode: '', paidType: '', ot: { type: '', rate: '' }, split: { multiPayPct: '', multiPayFixed: '', cashPct: '' }, bank1: { name: '', branch: '', acc: '', pct: '', chq: '' }, bank2: { name: '', branch: '', acc: '', pct: '', chq: '' } },
    address: { local: { door: '', loc: '', street: '', city: '', state: '', country: '', pin: '' }, foreign: { door: '', loc: '', street: '', city: '', state: '', country: '', pin: '' }, emergency: { name: '', rel: '', no: '', id: '' } },
    family: { spouse: { name: '', id: '', phone: '', job: '', dob: '' }, children: [] }
  });

  const [activeTab, setActiveTab] = useState('personal'); // 控制显示的 Tab
  const [originalData, setOriginalData] = useState(null); // 用于保存时的比对和日志记录

  // --- 初始化数据加载 ---
  useEffect(() => {
    if (isNew) {
      // 新建模式：只需设置今天的默认入职日期
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
          
          // 填充数据到 formData
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

  // --- 通用输入框修改处理器 ---
  // category: 如 'personal', 'employment'
  // field: 如 'name', 'joinDate'
  // value: 用户输入的值
  const handleNestedChange = (category, field, value) => {
    setFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  // 更深层级的修改 (如 statutory.epf.cat)
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

  // --- 提交保存逻辑 ---
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
        // --- 新建模式检查 ---
        const docRef = doc(db, "users", empCode);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          throw new Error(`Code '${empCode}' already exists.`);
        }
        
        // 邮箱重复检查
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
        // --- 编辑模式检查 ---
        // 邮箱变更警告等逻辑可在此处实现 (省略复杂检查以简化示例)
        const payload = {
          ...formData,
          personal: { ...formData.personal, email },
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
      
      {/* 顶部标题区 */}
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

        {/* 只有编辑模式才显示账户状态控制 */}
        {!isNew && (
          <div className="card shadow-sm border-0">
            <div className="card-body py-2 d-flex align-items-center gap-2">
              <small className="fw-bold text-muted text-uppercase me-1">Status:</small>
              <select 
                className="form-select form-select-sm border-2 fw-bold border-primary text-primary" 
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
        
        {/* 新建模式：显示 Excel 上传按钮 */}
        {isNew && (
          <button className="btn btn-sm btn-outline-primary fw-bold">
             <Upload size={16} className="me-1" /> Upload Excel
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger mx-2">{error}</div>}

      <div className="card mx-2 shadow-sm border-0">
        
        {/* 🌟 Tab 导航栏 */}
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

        <div className="card-body p-4">
          <form onSubmit={handleSubmit}>
            
            {/* 🌟 Tab 1: Personal (以此为例展示如何绑定数据) */}
            {activeTab === 'personal' && (
              <div className="animate__animated animate__fadeIn">
                <div className="section-title"><Fingerprint size={16} className="me-1"/> Identity & Access</div>
                <div className="row g-3">
                  <div className="col-md-2">
                    <label className="form-label">Employee Code *</label>
                    <input 
                      type="text" 
                      className={`form-control fw-bold ${isNew ? 'border-primary text-primary' : 'bg-readonly'}`}
                      required 
                      disabled={!isNew} // 只有新建时允许修改 EMP Code
                      value={formData.personal.empCode}
                      onChange={(e) => {
                        handleNestedChange('personal', 'empCode', e.target.value);
                        // 自动同步 BioID
                        if (isNew) handleNestedChange('personal', 'bioId', e.target.value);
                      }}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Employee Name *</label>
                    <input type="text" className="form-control fw-bold text-dark" required disabled={isReadOnly}
                           value={formData.personal.name} onChange={(e) => handleNestedChange('personal', 'name', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Email Address (Login ID) *</label>
                    <input type="email" className="form-control border-primary fw-bold" required placeholder="Login ID" disabled={isReadOnly}
                           value={formData.personal.email} onChange={(e) => handleNestedChange('personal', 'email', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Mobile Number</label>
                    <input type="text" className="form-control" placeholder="0123456789" disabled={isReadOnly}
                           value={formData.personal.mobile} onChange={(e) => handleNestedChange('personal', 'mobile', e.target.value)} />
                  </div>
                </div>

                <div className="section-title mt-4"><Users size={16} className="me-1"/> Demographics</div>
                <div className="row g-3">
                  <div className="col-md-3">
                    <label className="form-label">MyKad/Ic No</label>
                    <input type="text" className="form-control" disabled={isReadOnly}
                           value={formData.personal.icNo} onChange={(e) => handleNestedChange('personal', 'icNo', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Birth Date *</label>
                    <input type="date" className="form-control fw-bold" required disabled={isReadOnly}
                           value={formData.personal.dob} onChange={(e) => handleNestedChange('personal', 'dob', e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Gender *</label>
                    <select className="form-select fw-bold" required disabled={isReadOnly}
                            value={formData.personal.gender} onChange={(e) => handleNestedChange('personal', 'gender', e.target.value)}>
                      <option value="">Select...</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </select>
                  </div>
                  {/* ...可以继续堆叠你在 HTML 里的其他 Demographic 输入框... */}
                </div>
              </div>
            )}

            {/* 🌟 Tab 2: Employment */}
            {activeTab === 'employment' && (
              <div className="animate__animated animate__fadeIn">
                 <div className="section-title"><Calendar size={16} className="me-1"/> Timeline</div>
                 <div className="row g-3">
                   <div className="col-md-3">
                     <label className="form-label">Join Date *</label>
                     <input type="date" className="form-control fw-bold border-primary" required disabled={isReadOnly}
                            value={formData.employment.joinDate} onChange={(e) => handleNestedChange('employment', 'joinDate', e.target.value)} />
                   </div>
                   <div className="col-md-3">
                     <label className="form-label">Department</label>
                     <input type="text" className="form-control" disabled={isReadOnly}
                            value={formData.employment.dept} onChange={(e) => handleNestedChange('employment', 'dept', e.target.value)} />
                   </div>
                   <div className="col-md-12 mt-3">
                     <div className="form-check">
                       <input type="checkbox" className="form-check-input" id="driverCheck" disabled={isReadOnly}
                              checked={formData.employment.isDriver} 
                              onChange={(e) => handleNestedChange('employment', 'isDriver', e.target.checked)} />
                       <label className="form-check-label fw-bold text-primary" htmlFor="driverCheck">
                         Is Driver / Field Staff? (Allows App Access)
                       </label>
                     </div>
                   </div>
                 </div>
              </div>
            )}

            {/* 其他 Tab 的结构类似，暂时用文字占位，你以后可以像上面那样把 input 补齐 */}
            {activeTab === 'statutory' && <div>Statutory Form Fields Go Here...</div>}
            {activeTab === 'payroll' && <div>Payroll Form Fields Go Here...</div>}
            {activeTab === 'family' && <div>Family (Spouse/Children) Fields Go Here...</div>}
            {activeTab === 'address' && <div>Address Fields Go Here...</div>}

            {/* 🌟 统一的保存按钮 */}
            <div className="mt-5 pt-3 border-top text-end">
              <button 
                type="submit" 
                className="btn btn-success px-5 fw-bold shadow-sm" 
                disabled={isReadOnly || saving}
              >
                {saving ? (
                  <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>
                ) : (
                  <><Save size={18} className="me-2 d-inline" /> {isNew ? 'Save to DB' : 'Save Changes'}</>
                )}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}