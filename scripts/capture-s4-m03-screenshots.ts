import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { AdminService } from '../packages/server/src/services/admin-service.ts';
import { renderAdminPage } from '../packages/web/src/pages/admin/AdminPages.ts';
import { renderAppShell } from '../packages/web/src/components/shells/AppShell.ts';
import { renderPrivacySettingsPage } from '../packages/web/src/pages/settings/PrivacySettingsPage.ts';

const root=process.cwd(),dbPath=path.join(os.tmpdir(),`zur-s4-m03-${process.pid}.sqlite`),out=process.env.SCREENSHOTS_DIR||path.join(root,'screenshots');
runMigrations(dbPath);seedDatabase(dbPath);const db=getDatabase(dbPath),admin=new AdminService(db),adminId='user-admin-1';
const now=new Date().toISOString();
const enrAda = db.prepare("SELECT id, user_id, pinned_version_id FROM enrollments WHERE id='enr-ada'").get() as any;
db.prepare(`INSERT INTO assessment_attempts (id, enrollment_id, user_id, step_id, course_version_id, attempt_number, type, verdict, is_infrastructure_failure, created_at)
  VALUES ('att-screen-1', ?, ?, 'step-4-python-echo', ?, 1, 'python', 'passed', 0, ?)`).run(enrAda.id, enrAda.user_id, enrAda.pinned_version_id, now);
const v1Row = db.prepare("SELECT id FROM course_versions WHERE course_id='course-python-foundations' ORDER BY version_number ASC LIMIT 1").get() as any;
db.prepare(`INSERT INTO reports(id,reporter_id,course_id,course_version_id,step_id,type,description,status,created_at,updated_at)
  VALUES('report-screen','user-student-1','course-python-foundations',?,'step-4-python-echo','broken_exercise','The expected output differs from the lesson example.','open',?,?)`).run(v1Row.id,now,now);
const overview=admin.getOperationsOverview(adminId);
const users=admin.listUsers(adminId,{search:'Ada'});
const user=admin.getUserDetail(adminId,'user-student-1');
const courses=admin.listCourses(adminId);
const course=admin.getCourseDetail(adminId,'course-python-foundations');
const categories=admin.listCategories(adminId);
const reports=admin.listReports(adminId);
const report=admin.getReport(adminId,'report-screen');
const media=admin.listMedia(adminId);
const execution={overview,jobs:admin.listExecutionJobs(adminId)};
const audit=admin.listAudit(adminId);
const pages:[string,any][]=[
  ['/admin',overview],['/admin/users',users],['/admin/users/user-student-1',user],
  ['/admin/courses',courses],['/admin/courses/course-python-foundations',course],
  ['/admin/categories',categories],['/admin/reports',reports],['/admin/reports/report-screen',report],
  ['/admin/media',media],['/admin/execution',execution],['/admin/audit',audit],
];
const styles=['tokens.css','typography.css','layout.css','shells.css','components.css'].map(f=>fs.readFileSync(path.join(root,'packages/web/src/styles',f),'utf8')).join('\n');
const html=(title:string,body:string)=>`<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${styles}body{margin:0;background:var(--bg-canvas);color:var(--text-primary);font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app">${body}</div></body></html>`;
fs.mkdirSync(out,{recursive:true});
const tempFiles:string[]=[];
for(const [route,data] of pages){
  const body=renderAdminPage(route,data,undefined,{displayName:'Morgan Admin',email:'morgan@example.test'});
  const h=path.join(os.tmpdir(),`s4-m03-${process.pid}-${route.replaceAll('/','_')}.html`);tempFiles.push(h);fs.writeFileSync(h,html(route,body));
  const key=route.replace(/^\/admin\/?/,'').replaceAll('/','_').replaceAll('-','_')||'overview';
  execSync(`google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars --screenshot="${path.join(out,`s4_m03_${key}.png`)}" --window-size=1440,900 --virtual-time-budget=1000 "file://${h}"`,{stdio:'inherit'});
}
const privacyBody=renderAppShell({activePath:'/settings/privacy',user:{displayName:'Ada Lovelace',email:'ada@example.test',capabilities:['student']},headerTitle:'Privacy and account requests',content:renderPrivacySettingsPage({requests:[{id:'priv-export-screen',userId:'user-student-1',requestType:'export',status:'completed',consequenceAcknowledged:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),exportExpiresAt:new Date(Date.now()+8*3600000).toISOString()}]})});
const privacyHtml=path.join(os.tmpdir(),`s4-m03-${process.pid}-privacy.html`);tempFiles.push(privacyHtml);fs.writeFileSync(privacyHtml,html('Privacy settings',privacyBody));
execSync(`google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars --screenshot="${path.join(out,'s4_m03_privacy_export.png')}" --window-size=1440,900 --virtual-time-budget=1000 "file://${privacyHtml}"`,{stdio:'inherit'});
execSync(`google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars --screenshot="${path.join(out,'s4_m03_privacy_export_mobile.png')}" --window-size=390,844 --virtual-time-budget=1000 "file://${privacyHtml}"`,{stdio:'inherit'});
const overviewHtml=tempFiles[0];
execSync(`google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars --screenshot="${path.join(out,'s4_m03_overview_mobile.png')}" --window-size=390,844 --virtual-time-budget=1000 "file://${overviewHtml}"`,{stdio:'inherit'});
console.log('Captured S4-M03 P32–P39 screens at desktop and operations overview on mobile.');
closeDatabase(dbPath);for(const suffix of ['', '-wal','-shm']){const f=dbPath+suffix;if(fs.existsSync(f))fs.unlinkSync(f);}for(const f of tempFiles)if(fs.existsSync(f))fs.unlinkSync(f);
