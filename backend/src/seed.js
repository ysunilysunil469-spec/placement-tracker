import bcrypt from 'bcryptjs';
import { getDb, row, run } from './db.js';

await getDb();
const studentPassword = await bcrypt.hash('Student@123', 10);
const adminPassword = await bcrypt.hash('Admin@123', 10);

if (!row('SELECT id FROM users WHERE email=?', ['student@demo.com'])) {
  run(`INSERT INTO users (name,email,password_hash,role,branch,cgpa,backlogs,skills,phone) VALUES (?,?,?,?,?,?,?,?,?)`, ['Aarav Student','student@demo.com',studentPassword,'student','CSE',8.7,0,'React, Node.js, SQL, Python','9876543210']);
}
if (!row('SELECT id FROM users WHERE email=?', ['admin@demo.com'])) {
  run(`INSERT INTO users (name,email,password_hash,role,branch,cgpa,backlogs,skills,phone) VALUES (?,?,?,?,?,?,?,?,?)`, ['Placement Cell','admin@demo.com',adminPassword,'placement','','0',0,'','']);
}

const drives = [
  ['Infosys','Software Engineer','Build scalable enterprise products with modern engineering teams.',8.5,7.5,'CSE,IT,ECE',1,'2026-10-20T23:59:00','Hyderabad','Hybrid','JavaScript,Java,SQL'],
  ['Deloitte','Analyst - Technology','Technology consulting role for problem solvers and builders.',7.5,7.0,'CSE,IT,ECE,EEE',0,'2026-10-14T18:00:00','Bengaluru','Hybrid','Python,SQL,Communication'],
  ['TCS','Digital Engineer','Digital transformation and application engineering opportunity.',6.8,6.5,'CSE,IT,ECE,EEE,ME',1,'2026-10-28T17:00:00','Multiple','On-site','Java,SQL,Problem Solving'],
  ['Microsoft','Software Engineer Intern','Engineering internship with strong CS fundamentals.',10,8.0,'CSE,IT',0,'2026-11-05T23:59:00','Hyderabad','Hybrid','DSA,C++,Azure'],
  ['Accenture','Associate Software Engineer','Entry-level engineering role across cloud and digital teams.',6,6.0,'CSE,IT,ECE,EEE',2,'2026-10-18T20:00:00','Pune','Hybrid','Java,Cloud,SQL']
];
for (const d of drives) {
  if (!row('SELECT id FROM drives WHERE company=? AND role=?', [d[0], d[1]])) {
    run(`INSERT INTO drives (company,role,description,package_lpa,min_cgpa,allowed_branches,max_backlogs,deadline,location,work_mode,skills) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, d);
  }
}

const student = row('SELECT id FROM users WHERE email=?', ['student@demo.com']);
const infosys = row('SELECT id FROM drives WHERE company=?', ['Infosys']);
if (student && infosys && !row('SELECT id FROM applications WHERE student_id=? AND drive_id=?', [student.id, infosys.id])) {
  run('INSERT INTO applications (drive_id,student_id,status) VALUES (?,?,?)', [infosys.id, student.id, 'Shortlisted']);
  run('INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)', [student.id,'You are shortlisted!','Infosys has moved your application to Shortlisted.','success']);
}
console.log('Seed complete.');
