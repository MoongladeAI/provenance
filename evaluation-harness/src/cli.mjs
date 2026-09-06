import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {fixture,TASKS} from './fixtures.mjs';
import {json,hash,git} from './core.mjs';
import {runAgent} from './runner.mjs';
import {report} from './report.mjs';
const home=path.resolve(import.meta.dirname,'..'),workspace=path.resolve(home,'../..');
const command=process.argv[2]??'help';
if(command==='report'){const batch=path.resolve(process.argv[3]);console.log(JSON.stringify(report(batch),null,2));}
else if(command==='smoke'){
 const repo=path.resolve(process.env.PROVENANCE_REPO??path.join(workspace,'work/provenance'));
 const commit=git(repo,'rev-parse','HEAD');if(commit!=='bb744c45e1141161a22f99ecfab9a0cece3a6e2c')throw Error('Unexpected provenance revision');
 const batch=path.join(home,'runs','smoke-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(batch,{recursive:true});
 const key=crypto.generateKeyPairSync('ed25519',{publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 const seed=Number(process.env.EXPERIMENT_SEED??20260906);let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const schedule=[];for(const task of TASKS)for(let replicate=1;replicate<=2;replicate++){const conditions=random()<.5?['A','B']:['B','A'];for(const condition of conditions)schedule.push({task,condition,replicate});}
 const exe=process.env.CODEX_EXE??'codex',model=process.env.EXPERIMENT_MODEL??'gpt-6-astra';const cliVersion=execFileSync(exe,['--version'],{encoding:'utf8',windowsHide:true}).trim();
 const batchManifest={schema:1,evidence_class:'DIAGNOSTIC',passive_eligible:false,reason:'Synthetic task/corpus, reference Git adapter, evaluator-created tool adapter; deployed wiring unavailable',seed,model,model_served:null,model_served_reason:'not exposed by CLI JSON event schema',effort:'low',cliVersion,repo_commit:commit,limits:{maxRuns:8,maxDurationMs:120000,maxToolCalls:24,concurrency:1,rawTokensStopAfterRun:120000,hardTokenCap:false},non_interference:{post_action_scoring:true,no_evaluator_feedback:true,independent_checks_returned_to_agent:false},schedule:schedule.map(({task,...x})=>({...x,task:task.id})),node:process.version};json(path.join(batch,'batch.json'),batchManifest);console.log('BATCH '+batch);
 let consumed=0;for(let i=0;i<schedule.length;i++){const {task,condition,replicate}=schedule[i],id=String(i+1).padStart(2,'0')+'-'+crypto.randomUUID().slice(0,8),runDir=path.join(batch,id),agentWorkspace=path.join(workspace,'work','agent-runs',id+'-'+crypto.randomUUID().slice(0,8)),corpus=path.join(runDir,'corpus');fs.mkdirSync(agentWorkspace,{recursive:true});
 const f=await fixture(corpus,repo,task,key);const config={condition,corpus,repo,documents:f.documents,expectedCommit:f.expectedCommit,publicKey:key.publicKey,maxToolCalls:24,log:path.join(runDir,'tool-events.jsonl')};json(path.join(runDir,'tool-config.json'),config);
 const manifest={id,task:task.id,condition,replicate,workspace:agentWorkspace,corpus_sha256:f.corpusHash,model,effort:'low',cliVersion,status:'prepared',maxDurationMs:120000,evidence_class:'DIAGNOSTIC',passive_eligible:false,limitations:['Not a deployed Git evaluation','Synthetic memory reuse, not multi-session lifecycle','No hard token cap: time/call caps enforced; aggregate usage checked after each run','Served model revision unavailable','Local tool restrictions are not a hostile-agent isolation certification']};json(path.join(runDir,'manifest.json'),manifest);
 console.log('START '+id+' '+task.id+' '+condition);const result=await runAgent(runDir,task,{executable:exe});console.log('END '+id+' '+result.status+' '+JSON.stringify(result.usage));report(batch);
 if(result.usage)consumed+=(result.usage.input_tokens??0)+(result.usage.output_tokens??0);if(result.status!=='completed'||consumed>=120000){batchManifest.stopped_reason=result.status!=='completed'?'runner_or_instrumentation_failure':'observed_token_budget';break;}}
 batchManifest.completed_utc=new Date().toISOString();batchManifest.observed_total_tokens=consumed;json(path.join(batch,'batch.json'),batchManifest);console.log('REPORT '+path.join(batch,'comparison.html'));
}else console.log('node src/cli.mjs smoke | report <batch-directory>');
