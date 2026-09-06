import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {Recorder,json,readJson,hash,score,events} from './core.mjs';
import {answerSchema,promptFor} from './fixtures.mjs';
const literal=x=>JSON.stringify(x); // TOML basic string/array scalar input, NOT shell text.
export function argumentsFor(manifest,configFile,schema){return ['exec','--json','--ephemeral','--ignore-user-config','--skip-git-repo-check','--sandbox','read-only','-C',manifest.workspace,'--model',manifest.model,'--output-schema',schema,'-c','approval_policy="never"','-c','features.shell_tool=false','-c','features.unified_exec=false','-c','web_search="disabled"','-c',`model_reasoning_effort=${literal(manifest.effort)}`,'-c',`mcp_servers.experiment.command=${literal(process.execPath)}`,'-c',`mcp_servers.experiment.args=${literal([path.join(import.meta.dirname,'mcp.mjs'),configFile])}`,'-c','mcp_servers.experiment.required=true','-c','mcp_servers.experiment.default_tools_approval_mode="auto"','-'];}
export async function runAgent(runDir,task,{executable='codex'}={}){
 const file=path.join(runDir,'manifest.json'),manifest=readJson(file),rec=new Recorder(path.join(runDir,'agent-events.jsonl'));
 const prompt=promptFor(task,manifest.condition);const schema=path.join(runDir,'answer-schema.json');json(schema,answerSchema);fs.writeFileSync(path.join(runDir,'prompt.txt'),prompt);
 const argv=argumentsFor(manifest,path.join(runDir,'tool-config.json'),schema);manifest.prompt_sha256=hash(prompt);manifest.argv=argv;manifest.status='running';manifest.started_utc=new Date().toISOString();manifest.evidence_class='DIAGNOSTIC';manifest.passive_eligible=false;json(file,manifest);rec.emit('run_started',{manifest_sha256:hash(JSON.stringify(manifest)),evidence_class:'DIAGNOSTIC'});
 const start=Date.now();let buffer='',stderr='',usage=null,final=null,terminated=false,failure=null,bytes=0;
 const child=spawn(executable,argv,{cwd:manifest.workspace,stdio:['pipe','pipe','pipe'],windowsHide:true});
 function stop(reason){if(terminated)return;terminated=true;failure=reason;rec.emit('run_termination_requested',{reason});if(process.platform==='win32'&&child.pid){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});}catch{child.kill();}}else child.kill('SIGTERM');}
 const timer=setTimeout(()=>stop('time_budget'),manifest.maxDurationMs);
 function ingest(line){if(!line.trim())return;try{const e=JSON.parse(line);rec.emit('runner_event',e);if(e.type==='turn.completed')usage=e.usage;if(e.type==='item.completed'&&e.item?.type==='agent_message')final=e.item.text;if(e.type==='turn.failed'||e.type==='error')failure=e.error?.message??e.message??'runner_error';if(e.item&&['command_execution','web_search','file_change'].includes(e.item.type))stop('unexpected_tool_surface');}catch(e){rec.emit('invalid_runner_line',{line:line.slice(0,2000),error:e.message});failure='invalid_runner_event';}}
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024){stop('trace_size_budget');return;}buffer+=chunk.toString('utf8');let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);ingest(line);}});
 child.stderr.on('data',chunk=>{stderr+=chunk.toString('utf8');if(stderr.length>1024*1024)stop('stderr_size_budget');});
 child.stdin.on('error',()=>{});child.stdin.end(prompt);
 const result=await new Promise(resolve=>{child.on('error',e=>resolve({code:null,error:e.message}));child.on('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);if(buffer.trim())ingest(buffer);
 fs.writeFileSync(path.join(runDir,'stderr.txt'),stderr);fs.writeFileSync(path.join(runDir,'final.txt'),final??'');
 let answer=null;try{answer=JSON.parse(final);}catch{};
 // Independent scoring starts ONLY after child close. No result is returned to the agent.
 manifest.status=terminated?'terminated':result.code===0&&!failure&&answer?'completed':'failed';manifest.failure=failure??result.error??null;manifest.duration_ms=Date.now()-start;manifest.exit=result;manifest.usage=usage;manifest.score=(manifest.status==='completed'?score(task,answer):null);manifest.scoring_started_utc=new Date().toISOString();
 const logs=events(path.join(runDir,'tool-events.jsonl'));manifest.tool_trace_present=logs.length>0;if(!manifest.tool_trace_present&&manifest.status==='completed'){manifest.status='invalid';manifest.failure='no_recorded_tool_evidence';}
 rec.emit('agent_closed',{exit:result,status:manifest.status});rec.emit('post_action_score',manifest.score);manifest.event_chain_head=rec.prev;json(file,manifest);return manifest;
}
