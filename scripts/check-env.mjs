// Kiểm tra .env.local mà không in giá trị URL/key cá nhân ra terminal.
import fs from 'node:fs';
import path from 'node:path';
const filename = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(filename)) {
  console.error('THIEU .env.local. Tao file trong thu muc co package.json; chep 2 dong trong .env.example va thay gia tri Supabase.');
  process.exit(1);
}
const fields = Object.fromEntries(fs.readFileSync(filename,'utf8').split(/\r?\n/).map(line=>line.trim()).filter(line=>line && !line.startsWith('#') && line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^(["'])(.*)\1$/, '$2')]}));
const url = fields.NEXT_PUBLIC_SUPABASE_URL;
const key = fields.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let good = true;
try { const u = new URL(url); if (!['https:','http:'].includes(u.protocol) || u.hostname.includes('YOUR_PROJECT')) throw Error(); }
catch { console.error('NEXT_PUBLIC_SUPABASE_URL chua hop le. Lay Project URL tu Supabase > Settings > API.');good=false; }
if (!key || key.includes('REPLACE_') || key.includes('YOUR_')) {console.error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY chua duoc dien.');good=false;}
if (key && (/^sb_secret_/i.test(key) || key.startsWith('SUPABASE_SERVICE_ROLE_'))) {console.error('KHONG dung secret key/service_role trong NEXT_PUBLIC_...');good=false;}
if (good) console.log('OK: .env.local co Project URL va publishable key (khong in key).');
process.exitCode = good ? 0 : 1;
