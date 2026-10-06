import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { getDb, row, rows, run, persist } from './db.js';
import { auth, role, signToken } from './auth.js';

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

function cleanUser(u) {
  if (!u) return null;
  const { password_hash, ...safe } = u;
  return { ...safe, skills: safe.skills ? safe.skills.split(',').map(s => s.trim()).filter(Boolean) : [] };
}
function driveForUser(d, u) {
  const branches = (d.allowed_branches || '').split(',').map(x => x.trim()).filter(Boolean);
  const eligible = u.role !== 'student' || ((Number(u.cgpa) >= Number(d.min_cgpa)) && Number(u.backlogs) <= Number(d.max_backlogs) && (!branches.length || branches.includes(u.branch)));
  return { ...d, skills: d.skills ? d.skills.split(',').map(s=>s.trim()).filter(Boolean) : [], allowed_branches: branches, eligible };
}
function parseDriveBody(b) {
  return [b.company,b.role,b.description || '',Number(b.package_lpa),Number(b.min_cgpa || 0),(b.allowed_branches || '').toUpperCase(),Number(b.max_backlogs || 0),b.deadline,b.location || 'On Campus',b.work_mode || 'On-site',b.skills || ''];
}

app.get('/api/health', (_,res)=>res.json({ok:true,service:'Placement Pulse'}));

app.post('/api/auth/register', async (req,res)=>{
  const { name,email,password,branch='',cgpa=0,backlogs=0,skills='' } = req.body;
  if (!name || !email || !password) return res.status(400).json({message:'Name, email and password are required.'});
  if (row('SELECT id FROM users WHERE email=?',[email.toLowerCase()])) return res.status(409).json({message:'Email is already registered.'});
  const hash = await bcrypt.hash(password,10);
  const id = run('INSERT INTO users (name,email,password_hash,role,branch,cgpa,backlogs,skills) VALUES (?,?,?,?,?,?,?,?)',[name,email.toLowerCase(),hash,'student',branch,Number(cgpa),Number(backlogs),skills]);
  const user = row('SELECT * FROM users WHERE id=?',[id]);
  res.status(201).json({token:signToken(user),user:cleanUser(user)});
});

app.post('/api/auth/login', async (req,res)=>{
  const {email,password}=req.body;
  const user=row('SELECT * FROM users WHERE email=?',[String(email||'').toLowerCase()]);
  if (!user || !(await bcrypt.compare(password || '',user.password_hash))) return res.status(401).json({message:'Invalid email or password.'});
  res.json({token:signToken(user),user:cleanUser(user)});
});

app.get('/api/me',auth,(req,res)=>res.json({user:cleanUser(row('SELECT * FROM users WHERE id=?',[req.user.id]))}));
app.patch('/api/me',auth,role('student'),(req,res)=>{
  const {name,branch,cgpa,backlogs,skills,phone}=req.body;
  run('UPDATE users SET name=?,branch=?,cgpa=?,backlogs=?,skills=?,phone=? WHERE id=?',[name,branch,Number(cgpa),Number(backlogs),skills,phone,req.user.id]);
  res.json({user:cleanUser(row('SELECT * FROM users WHERE id=?',[req.user.id]))});
});

app.get('/api/drives',auth,(req,res)=>{
  const u=row('SELECT * FROM users WHERE id=?',[req.user.id]);
  const {search='',eligible='all',sort='deadline'}=req.query;
  let drives=rows('SELECT * FROM drives ORDER BY deadline ASC');
  if (search) drives=drives.filter(d=>`${d.company} ${d.role} ${d.skills}`.toLowerCase().includes(search.toLowerCase()));
  drives=drives.map(d=>driveForUser(d,u));
  if (u.role==='student' && eligible==='eligible') drives=drives.filter(d=>d.eligible);
  if (sort==='package') drives.sort((a,b)=>b.package_lpa-a.package_lpa);
  res.json({drives});
});

app.get('/api/drives/:id',auth,(req,res)=>{
  const d=row('SELECT * FROM drives WHERE id=?',[req.params.id]);
  if(!d) return res.status(404).json({message:'Drive not found.'});
  const u=row('SELECT * FROM users WHERE id=?',[req.user.id]);
  res.json({drive:driveForUser(d,u)});
});

app.post('/api/drives',auth,role('placement'),(req,res)=>{
  const [company,roleName,description,pkg,minCgpa,branches,maxBacklogs,deadline,location,workMode,skills]=parseDriveBody(req.body);
  if(!company||!roleName||!pkg||!deadline) return res.status(400).json({message:'Company, role, package and deadline are required.'});
  const id=run('INSERT INTO drives (company,role,description,package_lpa,min_cgpa,allowed_branches,max_backlogs,deadline,location,work_mode,skills) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[company,roleName,description,pkg,minCgpa,branches,maxBacklogs,deadline,location,workMode,skills]);
  const students=rows('SELECT id FROM users WHERE role=\'student\'');
  for(const s of students) run('INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)',[s.id,`New drive: ${company}`,`${roleName} • ₹${pkg} LPA • Apply before ${new Date(deadline).toLocaleString()}`,'drive']);
  res.status(201).json({drive:row('SELECT * FROM drives WHERE id=?',[id])});
});

app.put('/api/drives/:id',auth,role('placement'),(req,res)=>{
  const d=row('SELECT id FROM drives WHERE id=?',[req.params.id]); if(!d) return res.status(404).json({message:'Drive not found.'});
  const [company,roleName,description,pkg,minCgpa,branches,maxBacklogs,deadline,location,workMode,skills]=parseDriveBody(req.body);
  run('UPDATE drives SET company=?,role=?,description=?,package_lpa=?,min_cgpa=?,allowed_branches=?,max_backlogs=?,deadline=?,location=?,work_mode=?,skills=? WHERE id=?',[company,roleName,description,pkg,minCgpa,branches,maxBacklogs,deadline,location,workMode,skills,req.params.id]);
  res.json({drive:row('SELECT * FROM drives WHERE id=?',[req.params.id])});
});

app.delete('/api/drives/:id',auth,role('placement'),(req,res)=>{run('DELETE FROM drives WHERE id=?',[req.params.id]);res.json({message:'Drive deleted.'});});

app.get('/api/applications',auth,(req,res)=>{
  if(req.user.role==='student') {
    const applications=rows(`SELECT a.*,d.company,d.role,d.package_lpa,d.deadline FROM applications a JOIN drives d ON d.id=a.drive_id WHERE a.student_id=? ORDER BY a.updated_at DESC`,[req.user.id]);
    return res.json({applications});
  }
  const applications=rows(`SELECT a.*,d.company,d.role,d.package_lpa,u.name student_name,u.email,u.branch,u.cgpa,u.backlogs FROM applications a JOIN drives d ON d.id=a.drive_id JOIN users u ON u.id=a.student_id ORDER BY a.updated_at DESC`);
  res.json({applications});
});

app.post('/api/drives/:id/apply',auth,role('student'),(req,res)=>{
  const d=row('SELECT * FROM drives WHERE id=?',[req.params.id]); const u=row('SELECT * FROM users WHERE id=?',[req.user.id]);
  if(!d) return res.status(404).json({message:'Drive not found.'});
  if(!driveForUser(d,u).eligible) return res.status(403).json({message:'You do not meet this drive\'s eligibility criteria.'});
  if(new Date(d.deadline).getTime() < Date.now()) return res.status(400).json({message:'The application deadline has passed.'});
  if(row('SELECT id FROM applications WHERE drive_id=? AND student_id=?',[d.id,u.id])) return res.status(409).json({message:'You have already applied to this drive.'});
  const id=run('INSERT INTO applications (drive_id,student_id,status) VALUES (?,?,?)',[d.id,u.id,'Applied']);
  const placement=rows('SELECT id FROM users WHERE role=\'placement\'');
  for(const p of placement) run('INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)',[p.id,'New application',`${u.name} applied to ${d.company} — ${d.role}.`,'application']);
  res.status(201).json({application:row('SELECT * FROM applications WHERE id=?',[id])});
});

app.patch('/api/applications/:id/status',auth,role('placement'),(req,res)=>{
  const {status}=req.body; if(!['Applied','Shortlisted','Selected','Rejected'].includes(status)) return res.status(400).json({message:'Invalid status.'});
  const a=row('SELECT * FROM applications WHERE id=?',[req.params.id]); if(!a) return res.status(404).json({message:'Application not found.'});
  run('UPDATE applications SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[status,a.id]);
  const d=row('SELECT company FROM drives WHERE id=?',[a.drive_id]);
  run('INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)',[a.student_id,`Application ${status}`,`Your ${d.company} application is now ${status}.`,status==='Selected'?'success':status==='Rejected'?'warning':'info']);
  res.json({message:'Status updated.'});
});

app.get('/api/notifications',auth,(req,res)=>res.json({notifications:rows('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30',[req.user.id])}));
app.patch('/api/notifications/read-all',auth,(req,res)=>{run('UPDATE notifications SET read=1 WHERE user_id=?',[req.user.id]);res.json({ok:true});});

app.get('/api/analytics',auth,role('placement'),(req,res)=>{
  const totalStudents=Number(row('SELECT COUNT(*) c FROM users WHERE role=\'student\'')?.c||0);
  const totalDrives=Number(row('SELECT COUNT(*) c FROM drives')?.c||0);
  const totalApplications=Number(row('SELECT COUNT(*) c FROM applications')?.c||0);
  const selected=Number(row("SELECT COUNT(*) c FROM applications WHERE status='Selected'")?.c||0);
  const statuses=rows('SELECT status,COUNT(*) count FROM applications GROUP BY status');
  const branches=rows("SELECT branch,COUNT(*) count FROM users WHERE role='student' GROUP BY branch ORDER BY count DESC");
  const companies=rows('SELECT d.company,COUNT(a.id) applicants FROM drives d LEFT JOIN applications a ON a.drive_id=d.id GROUP BY d.id ORDER BY applicants DESC');
  res.json({metrics:{totalStudents,totalDrives,totalApplications,selected},statuses,branches,companies});
});

app.post('/api/assistant',auth,async(req,res)=>{
  const q=String(req.body.query||'').toLowerCase();
  const u=row('SELECT * FROM users WHERE id=?',[req.user.id]);
  let answer='I can help with drives, eligibility, applications, deadlines, and placement stats.';
  if(req.user.role==='student') {
    const drives=rows('SELECT * FROM drives ORDER BY deadline ASC').map(d=>driveForUser(d,u));
    const apps=rows(`SELECT a.*,d.company,d.role FROM applications a JOIN drives d ON d.id=a.drive_id WHERE a.student_id=?`,[u.id]);
    if(q.includes('eligible')||q.includes('eligib')) {
      const eligible=drives.filter(d=>d.eligible).slice(0,6);
      answer=eligible.length?`You are eligible for ${eligible.length} drives. Top matches are ${eligible.map(d=>`${d.company} for ${d.role}`).join(', ')}.`:'You currently do not match any posted drive.';
    } else if(q.includes('status')||q.includes('application')) {
      answer=apps.length?`You have ${apps.length} application${apps.length>1?'s':''}. ${apps.map(a=>`${a.company}: ${a.status}`).join('. ')}.`:'You have not applied to any drives yet.';
    } else if(q.includes('deadline')||q.includes('closing')||q.includes('soon')) {
      const upcoming=drives.filter(d=>new Date(d.deadline)>new Date()).slice(0,3);
      answer=upcoming.length?`Upcoming deadlines: ${upcoming.map(d=>`${d.company} on ${new Date(d.deadline).toLocaleDateString()}`).join(', ')}.`:'There are no upcoming deadlines.';
    } else if(q.includes('package')||q.includes('salary')||q.includes('highest')) {
      const top=[...drives].sort((a,b)=>b.package_lpa-a.package_lpa).slice(0,3);
      answer=`Highest packages among your visible drives are ${top.map(d=>`${d.company} at ₹${d.package_lpa} LPA`).join(', ')}.`;
    } else if(q.includes('profile')||q.includes('cgpa')) {
      answer=`Your profile is ${u.branch} branch, CGPA ${u.cgpa}, with ${u.backlogs} backlog${u.backlogs===1?'':'s'}.`;
    }
  } else {
    const total=Number(row('SELECT COUNT(*) c FROM applications')?.c||0);
    if(q.includes('applicant')) {
      const top=rows('SELECT d.company,COUNT(a.id) applicants FROM applications a JOIN drives d ON d.id=a.drive_id GROUP BY d.id ORDER BY applicants DESC LIMIT 5');
      answer=top.length?`Applicant counts: ${top.map(x=>`${x.company} has ${x.applicants}`).join(', ')}.`:'There are no applications yet.';
    } else if(q.includes('selected')||q.includes('selection')) {
      const s=Number(row("SELECT COUNT(*) c FROM applications WHERE status='Selected'")?.c||0); answer=`There are ${s} selected applications out of ${total} total applications.`;
    } else if(q.includes('drive')) {
      const n=Number(row('SELECT COUNT(*) c FROM drives')?.c||0); answer=`There are ${n} placement drives currently in the system.`;
    }
  }
  res.json({answer});
});

await getDb();
app.listen(PORT,()=>console.log(`Placement Pulse API running on http://localhost:${PORT}`));
