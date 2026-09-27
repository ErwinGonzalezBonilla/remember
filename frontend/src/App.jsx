import { useMemo, useState } from 'react'
import { Routes, Route, Navigate, Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Archive, ArrowLeft, CalendarDays, Camera, ChevronRight, CircleUserRound,
  Clock3, Heart, Image, LockKeyhole, Menu, MessageCircle, Mic, Plus,
  Settings as SettingsIcon, ShieldCheck, Sparkles, Upload, Video, X
} from 'lucide-react'

const photos = [
  'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1491013516836-7db643ee125a?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1504150558240-0b4fd8946624?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1513159446162-54eb8bdaa79b?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=700&q=85',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=85'
]

const memories = [
  { id: 1, title: 'Flour dusted morning', date: 'September 20, 2026', location: 'Kitchen Sanctuary · Philadelphia, PA', note: 'Today Allison took over the spoon and insisted she was the head chef...', image: photos[0], type: 'Photos', capsule: false },
  { id: 2, title: 'Ten years, still us', date: 'September 14, 2026', location: 'Riverside Walk', note: 'A quiet walk that felt like the first one all over again.', image: photos[1], type: 'Photos', capsule: false },
  { id: 3, title: 'Sunday light', date: 'September 8, 2026', location: 'Home', note: 'The kind of ordinary afternoon we will miss someday.', image: photos[2], type: 'Photos', capsule: false },
  { id: 4, title: 'A future hello', date: 'September 9, 2026', location: 'Future Capsule', note: 'A little message for Allison at eighteen.', image: photos[3], type: 'Future Capsules', capsule: true }
]

function Logo() {
  return <div className="logo"><span className="logo-mark"><i/><i/><i/></span><span>Remember</span></div>
}

function Shell({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const nav = [
    ['/connections', 'Connections', Heart],
    ['/memories', 'Memories', Archive],
    ['/calendar', 'Calendar', CalendarDays],
    ['/settings', 'Settings', SettingsIcon]
  ]
  return <div className="phone">
    <main className="screen">{children}</main>
    {!location.pathname.includes('/login') && <nav className="bottom-nav">
      {nav.map(([path, label, Icon]) => <button key={path} className={location.pathname.startsWith(path) ? 'nav-item active' : 'nav-item'} onClick={() => navigate(path)}>
        <Icon size={20}/><span>{label}</span>
      </button>)}
    </nav>}
  </div>
}

function PageHeader({ eyebrow, title, action }) {
  return <header className="page-header">
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>
    {action}
  </header>
}

function Login() {
  const navigate = useNavigate()
  return <div className="login-page">
    <div className="login-inner">
      <Logo />
      <div className="login-copy">
        <div className="eyebrow">A private place for what matters</div>
        <h1>A private sanctuary for the people and moments that matter most.</h1>
        <p>Keep the little things safe. Return to them whenever you need.</p>
      </div>
      <form className="form-card" onSubmit={e => { e.preventDefault(); localStorage.setItem('remember_token','demo'); navigate('/connections') }}>
        <label>Email<input type="email" defaultValue="felix@remember.app" /></label>
        <label>Password<input type="password" defaultValue="remember123" /></label>
        <button className="primary-button">Sign in <ChevronRight size={17}/></button>
      </form>
      <button className="text-button">Enter or create a private space</button>
    </div>
  </div>
}

function Connections() {
  const navigate = useNavigate()
  const [modal, setModal] = useState(false)
  const cards = [
    { name:'Sofia', role:'Partner', sub:'Our shared sanctuary · 10 years together', count:'128 memories', img:photos[4], path:'/relationship/sofia' },
    { name:'Allison', role:'Daughter', sub:'Little wonders & Future Capsule', count:'48 memories', img:photos[5], path:'/relationship/allison' },
    { name:'Alexander', role:'Best Friend', sub:'Adventures & private archive', count:'76 memories', img:photos[2], path:'/relationship/alexander' }
  ]
  return <div className="page">
    <div className="topbar"><div><div className="eyebrow">Good morning, Felix</div><h2>Keep what matters close.</h2></div><div className="avatar">F</div></div>
    <div className="privacy-pill"><ShieldCheck size={15}/> Private space · only you and invited people</div>
    <section className="section"><div className="section-title"><span>Your people</span><button onClick={()=>setModal(true)}><Plus size={16}/> Create connection</button></div>
      <div className="connection-list">{cards.map(c => <button className="connection-card" key={c.name} onClick={()=>navigate(c.path)}>
        <img src={c.img}/><div className="connection-info"><span className="small-label">{c.role}</span><h3>{c.name}</h3><p>{c.sub}</p><span className="meta">{c.count}</span></div><ChevronRight size={19}/>
      </button>)}</div></section>
    <section className="soft-card"><Sparkles size={20}/><div><strong>One small thing</strong><p>You have 3 memories waiting to be added to your family archive.</p></div></section>
    {modal && <Modal title="Create a connection" close={()=>setModal(false)}><p className="modal-text">Invite someone into a private space. In the full app this would generate a secure invitation or QR code.</p><div className="invite-code">REMEMBER · SOFIA · 84K2</div><button className="primary-button" onClick={()=>setModal(false)}>Done</button></Modal>}
  </div>
}

function Relationship() {
  const { name='sofia' } = useParams()
  const pretty = name.charAt(0).toUpperCase()+name.slice(1)
  const subtitle = name==='sofia' ? 'Partner · 10 years together' : name==='allison' ? 'Daughter · Little wonders' : 'Best Friend · Private archive'
  return <div className="page">
    <button className="back-button" onClick={()=>history.back()}><ArrowLeft size={18}/> Connections</button>
    <div className="relationship-hero">
      <img src={name==='sofia'?photos[1]:photos[2]} />
      <div className="hero-overlay"><span className="eyebrow light">Your shared sanctuary</span><h1>Felix & {pretty}</h1><p>{subtitle}</p></div>
    </div>
    <div className="module-grid">
      <Module icon={MessageCircle} title="Chat" text="Private conversation" href={name==='sofia'?'/chat/sofia':'/chat/sofia'} />
      <Module icon={Image} title="Memories" text="Shared archive" href="/memories"/>
      <Module icon={LockKeyhole} title="Future Capsule" text="Messages for later" href="/future-capsule"/>
      <Module icon={CalendarDays} title="Calendar" text="Dates that matter" href="/calendar"/>
    </div>
    <section className="section"><div className="section-title"><span>Moments from this week</span><Link to="/memories">See all</Link></div><div className="mini-gallery">{memories.slice(0,3).map(m=><Link to={`/memory/${m.id}`} key={m.id}><img src={m.image}/></Link>)}</div></section>
    <div className="milestone"><div className="coral-icon"><Heart size={18}/></div><div><span className="small-label">Upcoming milestone</span><strong>Your 10th anniversary</strong><p>October 14 · A decade of little moments.</p></div></div>
  </div>
}

function Module({icon:Icon,title,text,href}) { return <Link className="module-card" to={href}><div className="module-icon"><Icon size={21}/></div><strong>{title}</strong><span>{text}</span></Link> }

function Memories() {
  const [filter,setFilter]=useState('All')
  const filters=['All','Photos','Videos','Audio Notes','Future Capsules']
  const shown=filter==='All'?memories:memories.filter(m=>m.type===filter)
  return <div className="page"><PageHeader eyebrow="Your archive" title="Memories" action={<Link className="circle-action" to="/create-memory"><Plus/></Link>}/>
    <div className="chips">{filters.map(f=><button key={f} className={filter===f?'chip active':'chip'} onClick={()=>setFilter(f)}>{f}</button>)}</div>
    <div className="memory-grid">{shown.map(m=><Link to={`/memory/${m.id}`} className="memory-card" key={m.id}><div className="memory-image"><img src={m.image}/>{m.capsule&&<span className="lock-tag"><LockKeyhole size={12}/> Sealed</span>}</div><div className="memory-body"><span className="meta">{m.date}</span><h3>{m.title}</h3><p>{m.note}</p><span className="location">{m.location}</span></div></Link>)}</div>
  </div>
}

function MemoryDetail() {
  const {id}=useParams(); const m=memories.find(x=>x.id===Number(id))||memories[0]
  return <div className="page detail-page"><button className="back-button" onClick={()=>history.back()}><ArrowLeft size={18}/> Memories</button><div className="detail-photo"><img src={m.image}/>{m.capsule&&<div className="sealed-center"><LockKeyhole size={24}/><span>Time-locked</span></div>}</div><div className="detail-content"><span className="meta">{m.date} · {m.location}</span><h1>{m.title}</h1><p className="large-note">{m.note}</p><div className="status-card">{m.capsule?<><LockKeyhole size={19}/><span>Time-locked Future Capsule</span></>:<><ShieldCheck size={19}/><span>Shared in Felix & Sofia's Vault</span></>}</div><div className="action-row"><button><Heart size={18}/> React</button><button><Archive size={18}/> Add to story</button><button><Menu size={18}/> More</button></div></div></div>
}

function CreateMemory() {
  const [capsule,setCapsule]=useState(false)
  const [saved,setSaved]=useState(false)
  return <div className="page"><PageHeader eyebrow="Preserve a moment" title="Create memory" action={<Link to="/memories" className="circle-action"><X/></Link>}/>
    <div className="media-tabs"><button className="active"><Image/> Photo</button><button><Video/> Video</button><button><Camera/> Camera</button></div>
    <div className="upload-area"><Upload size={28}/><strong>Add a photo</strong><span>Choose something worth remembering</span></div>
    <label className="field">Memory name<input placeholder="Flour dusted morning with Allison"/></label>
    <label className="field">Your note<textarea placeholder="Write what you want to remember about this moment..."/></label>
    <button className="voice-button"><Mic size={18}/> Record a voice note</button>
    <div className="field"><span>Belongs to</span><div className="choice-row"><button className="choice active">Sofia</button><button className="choice">Allison</button><button className="choice">Alexander</button></div></div>
    <div className="destination"><div className="destination-head"><span>Save to</span></div><button className={!capsule?'destination-card selected':'destination-card'} onClick={()=>setCapsule(false)}><Archive/><div><strong>Shared Vault</strong><p>Your private family archive</p></div></button><button className={capsule?'destination-card selected':'destination-card'} onClick={()=>setCapsule(true)}><LockKeyhole/><div><strong>Future Capsule</strong><p>Open on September 9, 2036 · 18th birthday</p></div></button></div>
    <button className="primary-button full" onClick={()=>setSaved(true)}>{capsule?'Seal memory':'Save memory to vault'}</button>
    {saved&&<div className="success-note"><ShieldCheck size={18}/> {capsule?'Memory sealed until 2036.':'Memory saved to your vault.'}</div>}
  </div>
}

function FutureCapsule() {
  return <div className="page"><PageHeader eyebrow="Private, for later" title="Future Capsule"/><div className="capsule-hero"><div className="big-lock"><LockKeyhole/></div><span className="eyebrow">Sealed for Allison</span><h2>September 9, 2036</h2><p>Her 18th birthday</p><div className="sealed-copy">Sealed with private encryption. Never opened until unlock date.</div></div><section className="section"><div className="section-title"><span>Your capsules</span></div><div className="capsule-row"><div className="small-capsule"><LockKeyhole/><div><strong>A little hello from 2026</strong><span>Unlocks in 10 years</span></div></div><span className="coral-dot"/></div><div className="capsule-row delivered"><div className="small-capsule"><Heart/><div><strong>Our first family trip</strong><span>Delivered · June 2026</span></div></div></div></section></div>
}

function Chat() {
  return <div className="page chat-page"><div className="chat-header"><Link to="/relationship/sofia"><ArrowLeft/></Link><div className="avatar photo-avatar"><img src={photos[4]}/></div><div><strong>Sofia</strong><span>Private · 10 years together</span></div></div><div className="messages"><div className="date-divider">Today</div><div className="bubble incoming">I found that old photo from our first apartment. I can't believe how young we look.</div><div className="memory-message"><img src={photos[1]}/><div><span>Memory · Oct 14, 2016</span><strong>Ten years, still us</strong></div></div><div className="bubble outgoing">Send it here. I want to keep it in our vault forever.</div><div className="bubble incoming">Already did ❤️</div></div><div className="chat-input"><button><Plus/></button><input placeholder="Write something..." /><button><Mic/></button></div></div>
}

function Calendar() {
  const days=['28','29','30','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','1']
  return <div className="page"><PageHeader eyebrow="Shared dates" title="September 2026"/><div className="calendar-card"><div className="weekdays">{['M','T','W','T','F','S','S'].map((x,i)=><span key={i}>{x}</span>)}</div><div className="days">{days.map((d,i)=><button className={[7,13,20,26].includes(i)?'has-event':''} key={i}>{d}{[7,13,20,26].includes(i)&&<i/>}</button>)}</div></div><section className="section"><div className="section-title"><span>Coming up</span></div><Event date="Oct 14" title="10th anniversary" text="Open our anniversary memories" icon={<Heart/>}/><Event date="Nov 02" title="Allison's first school day" text="Add a memory after the day" icon={<Sparkles/>}/><Event date="Dec 21" title="Family winter trip" text="Shared with Sofia & Allison" icon={<CalendarDays/>}/></section></div>
}
function Event({date,title,text,icon}){return <div className="event"><div className="event-date">{date}</div><div className="event-icon">{icon}</div><div><strong>{title}</strong><p>{text}</p></div><ChevronRight size={17}/></div>}

function Settings() {
  return <div className="page"><PageHeader eyebrow="Private space" title="Settings"/><div className="profile-card"><div className="avatar big">F</div><div><strong>Felix González</strong><p>felix@remember.app</p></div><ChevronRight/></div><div className="privacy-banner"><ShieldCheck size={22}/><div><strong>Your memories are yours alone.</strong><p>Private by default. Shared only with people you invite.</p></div></div><section className="settings-section"><h3>Your Legacy</h3><p className="section-description">Memory Handover</p><button className="setting-row"><Heart/><div><strong>Designate a trusted person</strong><span>Choose who can safeguard your archive</span></div><ChevronRight/></button></section><section className="settings-section"><h3>Storage</h3><div className="storage"><div className="storage-top"><span>12.4 GB of 50 GB</span><span>25%</span></div><div className="progress"><i/></div></div><button className="setting-row"><Archive/><div><strong>Download all data</strong><span>Get a complete copy of your memories</span></div><ChevronRight/></button></section><button className="text-button danger" onClick={()=>{localStorage.removeItem('remember_token');location.href='/login'}}>Sign out</button></div>
}

function Modal({title,close,children}){return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={close}><X/></button></div>{children}</div></div>}

function App(){
  const isAuthed=localStorage.getItem('remember_token')
  return <Shell><Routes>
    <Route path="/login" element={<Login/>}/>
    <Route path="/connections" element={<Connections/>}/>
    <Route path="/relationship/:name" element={<Relationship/>}/>
    <Route path="/memories" element={<Memories/>}/>
    <Route path="/memory/:id" element={<MemoryDetail/>}/>
    <Route path="/create-memory" element={<CreateMemory/>}/>
    <Route path="/future-capsule" element={<FutureCapsule/>}/>
    <Route path="/chat/:name" element={<Chat/>}/>
    <Route path="/calendar" element={<Calendar/>}/>
    <Route path="/settings" element={<Settings/>}/>
    <Route path="*" element={<Navigate to={isAuthed?'/connections':'/login'} replace/>}/>
  </Routes></Shell>
}

export default App
