import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
export const json=(p,x)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2));};
export const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();}
export function safeFile(root,name){
 if(typeof name!=='string'||!name||path.isAbsolute(name)||name.includes('\\')||name.split('/').some(s=>s==='..'||s.startsWith('.')))throw Error('Invalid document path');
 const base=fs.realpathSync(root),target=fs.realpathSync(path.resolve(root,name));
 const rel=path.relative(base,target);if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.statSync(target).isFile())throw Error('Document outside corpus');return target;
}
export class Recorder{
 constructor(file){this.file=file;this.seq=0;this.prev='0'.repeat(64);this.start=process.hrtime.bigint();fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file))throw Error('Refuse to overwrite existing event log');}
 emit(type,data){const event={seq:++this.seq,utc:new Date().toISOString(),elapsed_ms:Number(process.hrtime.bigint()-this.start)/1e6,type,data,previous:this.prev};const digest=hash(JSON.stringify(event));fs.appendFileSync(this.file,JSON.stringify({...event,hash:digest})+'\n');this.prev=digest;return digest;}
}
export function verifyLog(file){let prev='0'.repeat(64),seq=0;const text=fs.readFileSync(file,'utf8');if(text&&!text.endsWith('\n'))return false;for(const line of text.trim().split('\n').filter(Boolean)){try{const {hash:digest,...event}=JSON.parse(line);if(event.seq!==++seq||event.previous!==prev||hash(JSON.stringify(event))!==digest)return false;prev=digest;}catch{return false;}}return true;}
export const events=file=>fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
export function gitState(root,expected){const head=git(root,'rev-parse','HEAD'),dirty=git(root,'status','--porcelain','--untracked-files=all');return {policy:'synthetic-pinned-commit-and-clean-tree',deploymentValidated:false,expected_commit:expected,observed_commit:head,working_tree_changes:dirty,authorized_snapshot:head===expected&&!dirty};}
export function score(task,answer){if(!answer||typeof answer!=='object')return {functional:false,attribution:false,contradiction_identified:false};return {functional:answer.value===task.expected,attribution:Array.isArray(answer.sources)&&answer.sources.includes(task.source),contradiction_identified:Array.isArray(answer.rejected_sources)&&answer.rejected_sources.includes(task.reject),audit_text_requires_blinded_review:true};}
export function summarize(runDir){const manifest=readJson(path.join(runDir,'manifest.json')),log=events(path.join(runDir,'agent-events.jsonl')),toolLog=events(path.join(runDir,'tool-events.jsonl'));const usage=log.filter(e=>e.type==='runner_event'&&e.data.type==='turn.completed').map(e=>e.data.usage);let tokens=null;if(usage.length&&usage.every(u=>Number.isFinite(u?.input_tokens)&&Number.isFinite(u?.output_tokens)))tokens=usage.reduce((a,u)=>a+u.input_tokens+u.output_tokens,0);const reads=toolLog.filter(e=>e.type==='tool_result'&&e.data.name==='read_document'&&!e.data.error);const seen=new Set();let repeats=0;for(const r of reads){const key=r.data.result.sha256;if(seen.has(key))repeats++;seen.add(key);}return {id:manifest.id,task:manifest.task,condition:manifest.condition,replicate:manifest.replicate,status:manifest.status,duration_ms:manifest.duration_ms??null,total_tokens:tokens,usage,tool_calls:toolLog.filter(e=>e.type==='tool_request').length,reads:reads.length,repeated_identical_reads:repeats,provenance_calls:toolLog.filter(e=>e.type==='tool_request'&&['verify_document','assert_gate'].includes(e.data.name)).length,trace_chain_valid:verifyLog(path.join(runDir,'agent-events.jsonl'))&&(fs.existsSync(path.join(runDir,'tool-events.jsonl'))?verifyLog(path.join(runDir,'tool-events.jsonl')):false),score:manifest.score??null,limitations:manifest.limitations};}
