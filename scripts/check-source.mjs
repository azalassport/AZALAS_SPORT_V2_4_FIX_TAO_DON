// Kiểm tra cú pháp TypeScript/TSX sau npm install (chưa thay thế next build).
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=process.cwd();
const paths=[];
function walk(dir){ for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  if(['node_modules','.next','.git'].includes(ent.name)) continue;
  const file=path.join(dir,ent.name);
  if(ent.isDirectory()) walk(file);
  else if(/\.tsx?$/.test(ent.name)&&!ent.name.endsWith('.d.ts')) paths.push(file);
}}
for(const dir of ['app','components','lib'])walk(path.join(root,dir));
paths.push(path.join(root,'proxy.ts'),path.join(root,'tailwind.config.ts'),path.join(root,'next.config.ts'));
let errors=0;
for(const file of paths){const src=fs.readFileSync(file,'utf8');const parsed=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 for(const err of parsed.parseDiagnostics){console.error(path.relative(root,file),ts.flattenDiagnosticMessageText(err.messageText,' '));errors++;}}
console.log(`Checked ${paths.length} TypeScript / TSX files; syntax errors: ${errors}`);
process.exitCode=errors?1:0;
