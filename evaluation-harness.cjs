// Independent evaluation. Usage: node evaluate.cjs <repository> <results-directory>
const fs=require('fs'), path=require('path'), crypto=require('crypto'), assert=require('assert');
const repo=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const tmp=fs.mkdtempSync(path.join(out,'fixtures-'));
const P=require(path.join(repo,'dist/index.js')), E=P.ProvenanceEngine;
const results=[];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const write=(n,b)=>{const p=path.join(tmp,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);return p;};
const side=(p,x)=>fs.writeFileSync(p+'.provenance.json',JSON.stringify(x));
async function test(name,fn){try{results.push({name,observed:await fn()});}catch(e){results.push({name,error:e.stack});}}
(async()=>{
 const key=E.generateEd25519KeyPair(), other=E.generateEd25519KeyPair();
 const f=write('a.md','Fact: 2 + 2 = 4.\n');
 const clean=await E.sealDocument(f,key.privateKey,'evaluator','commit-a',{vaultRoot:tmp});
 const verify=()=>E.verifyDocument(f,key.publicKey);
 await test('valid_signature',verify);
 await test('wrong_key',()=>E.verifyDocument(f,other.publicKey));
 for(const field of ['signer','scope','sha256','signature','created','git_commit']) await test('mutate_'+field,async()=>{const s=clone(clean);s.attestations[0][field]='attacker';side(f,s);return verify();});
 await test('content_mutation',async()=>{side(f,clean);fs.writeFileSync(f,'tampered');const r=await verify();fs.writeFileSync(f,'Fact: 2 + 2 = 4.\n');return r;});
 await test('copied_to_different_scope',async()=>{const g=write('different/a.md',fs.readFileSync(f));side(g,clean);return E.verifyDocument(g,key.publicKey);});
 await test('required_scope_ignored',async()=>{side(f,clean);return P.handleMcpToolCall('verify_artifact_provenance',{file_path:f,public_key_pem:key.publicKey,required_scope:'must-not-match'});});
 await test('timestamp_injection',async()=>{const s=clone(clean);s.attestations.push({method:'rfc3161',tier:'L1_CRYPTO_PRIMARY',tsa_time:'2099-01-01T00:00:00Z',token_b64:'not-a-token'});side(f,s);return verify();});
 await test('conflicting_signature',async()=>{const s=clone(clean);s.attestations.push({...s.attestations[0],signature:'AAAA'});side(f,s);return verify();});
 await test('empty_attestations_library',async()=>{side(f,{...clean,attestations:[]});return verify();});
 await test('minimal_unsigned_gate',async()=>{side(f,{sha256_at_last_write:clean.sha256_at_last_write});return P.handleMcpToolCall('assert_gate_status',{gate_type:'GATE_A_ARCHITECTURE',prerequisite_token_path:f});});
 await test('minimal_unsigned_mcp',()=>P.handleMcpToolCall('verify_artifact_provenance',{file_path:f}));
 await test('forged_human_mcp',async()=>{side(f,{sha256_at_last_write:clean.sha256_at_last_write,attestations:[{method:'openpgp',signer:'moongladeai@gmail.com'}]});return P.handleMcpToolCall('verify_artifact_provenance',{file_path:f});});
 await test('malformed_sidecar',async()=>{fs.writeFileSync(f+'.provenance.json','{');return verify();});
 await test('missing_sidecar',async()=>{fs.unlinkSync(f+'.provenance.json');return verify();});
 await test('rollback',async()=>{fs.writeFileSync(f,'new fact');await E.sealDocument(f,key.privateKey,'evaluator','commit-b',{vaultRoot:tmp});fs.writeFileSync(f,'Fact: 2 + 2 = 4.\n');side(f,clean);return verify();});
 await test('validly_signed_false_claim',async()=>{const g=write('false.md','Fact: 2 + 2 = 5.');await E.sealDocument(g,key.privateKey,'evaluator','x',{vaultRoot:tmp});return E.verifyDocument(g,key.publicKey);});
 await test('crlf_equivalence',async()=>{side(f,clean);fs.writeFileSync(f,'Fact: 2 + 2 = 4.\r\n');return verify();});
 await test('unicode_nfc_equivalence',async()=>{const g=write('unicode.md','caf\u00e9');await E.sealDocument(g,key.privateKey,'evaluator','x',{vaultRoot:tmp});fs.writeFileSync(g,'cafe\u0301');return E.verifyDocument(g,key.publicKey);});
 await test('bom_equivalence',async()=>{const g=write('bom.md','text');await E.sealDocument(g,key.privateKey,'evaluator','x',{vaultRoot:tmp});fs.writeFileSync(g,'\ufefftext');return E.verifyDocument(g,key.publicKey);});
 await test('invalid_utf8_byte_mutation',async()=>{const g=write('binary.bin',Buffer.from([0x80]));await E.sealDocument(g,key.privateKey,'evaluator','x',{vaultRoot:tmp});fs.writeFileSync(g,Buffer.from([0x81]));return E.verifyDocument(g,key.publicKey);});
 const registry={'a.md':{sha256:hash('a')},'b.md':{sha256:hash('b')},'c.md':{sha256:hash('c')}};
 const proof=P.inclusionProof(registry,'b.md');
 for(const [field,value] of [['artifact','forged.md'],['leaf_index',999],['tree_size',-1],['algorithm','wrong'],['merkle_root','00'.repeat(32)],['leaf_sha256','00'.repeat(32)]]) await test('proof_mutate_'+field,()=>P.verifyProof({...proof,[field]:value}));
 await test('proof_invalid_path',()=>P.verifyProof({...proof,proof:[{side:'left',hash:'00'.repeat(32)}]}));
 await test('proof_self_selected_root',()=>P.verifyProof({algorithm:'anything',artifact:'anything',leaf_sha256:'00'.repeat(32),leaf_index:0,tree_size:1,proof:[],merkle_root:'00'.repeat(32)}));
 function refRoot(leaves){if(!leaves.length)return hash(Buffer.alloc(0));if(leaves.length===1)return hash(Buffer.concat([Buffer.from([0]),leaves[0]]));let k=1;while(k*2<leaves.length)k*=2;return hash(Buffer.concat([Buffer.from([1]),Buffer.from(refRoot(leaves.slice(0,k)),'hex'),Buffer.from(refRoot(leaves.slice(k)),'hex')]));}
 await test('independent_merkle_reference',()=>{let proofs=0;for(let n=0;n<=65;n++){const r={};for(let i=0;i<n;i++)r['file'+i]={sha256:hash(String(i))};assert.equal(P.merkleRoot(r),refRoot(Object.keys(r).sort().map(p=>Buffer.from(r[p].sha256+'  '+p))));for(const p of Object.keys(r)){assert(P.verifyProof(P.inclusionProof(r,p)));proofs++;}}return {treeSizes:66,proofs,match:true};});
 const vaultDir=path.join(tmp,'vault');write('vault/a.md','a\n');write('vault/b.md','b');const vault=new P.ProvenanceVault(vaultDir);
 const initial=await vault.scanAndAudit();
 await test('vault_crlf_changes_root',async()=>{write('vault/a.md','a\r\n');return (await vault.scanAndAudit()).merkleRoot!==initial.merkleRoot;});
 await test('vault_deletion_pristine',async()=>{fs.unlinkSync(path.join(vaultDir,'b.md'));return P.handleMcpToolCall('audit_vault_merkle_root',{vault_root:vaultDir});});
 await test('vault_hidden_directory_excluded',async()=>{const before=await vault.scanAndAudit();write('vault/.memory/poison.md','poison');return (await vault.scanAndAudit()).merkleRoot===before.merkleRoot;});
 const digest=Buffer.alloc(32,7),nonce=Buffer.from([1]);
 const fake=P.encodeDerSequence([P.encodeDerSequence([Buffer.from([2,1,0])]),P.encodeDerSequence([Buffer.concat([Buffer.from([4,32]),digest]),Buffer.from([2,1,1]),Buffer.concat([Buffer.from([0x18,15]),Buffer.from('20990101000000Z')])])]);
 await test('unsigned_non_cms_timestamp',()=>P.validateTimeStampResp(fake,{expectedDigest:digest,expectedNonce:nonce}));
 await test('timestamp_wrong_digest',()=>P.validateTimeStampResp(fake,{expectedDigest:Buffer.alloc(32,8),expectedNonce:nonce}));
 await test('timestamp_wrong_nonce',()=>P.validateTimeStampResp(fake,{expectedDigest:digest,expectedNonce:Buffer.from([2])}));
 await test('offline_timestamp',()=>P.concurrentDegradingTimestamp(digest,{specifiedTier:'L4_HOST_UNAUTHENTICATED'}));
 // Compile the unchanged plugin modules in memory using the repository's locked compiler.
 const ts=require(path.join(repo,'node_modules/typescript'));
 const Module=require('module'), cache={};
 function loadTs(file){if(cache[file])return cache[file].exports;const m=new Module(file,module);cache[file]=m;m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));const native=m.require.bind(m);m.require=s=>s.startsWith('.')?loadTs(path.resolve(path.dirname(file),s+'.ts')):native(s);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);return m.exports;}
 const Plugin=loadTs(path.join(repo,'obsidian-plugin/src/engine.ts')).ProvenanceEngine;
 await test('plugin_forged_human',()=>{const g=write('plugin.md','injected');side(g,{sha256_at_last_write:Plugin.sha256('injected'),attestations:[{method:'openpgp',signer:'moongladeai@gmail.com'}]});return Plugin.verifyFile(g,'injected',{canonicalTrustRegistry:path.join(tmp,'absent.json'),registeredVaults:[]});});
 await test('plugin_empty_attestations',()=>{const g=write('plugin-empty.md','injected');side(g,{sha256_at_last_write:Plugin.sha256('injected'),attestations:[]});return Plugin.verifyFile(g,'injected',{canonicalTrustRegistry:path.join(tmp,'absent.json'),registeredVaults:[]});});
 await test('plugin_nfc_equivalence',()=>Plugin.sha256('caf\u00e9')===Plugin.sha256('cafe\u0301'));
 // RFC 8032 section 7.1, test 1: independently known empty-message vector.
 await test('rfc8032_vector',()=>{const pub=crypto.createPublicKey({key:Buffer.from('302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a','hex'),format:'der',type:'spki'});return crypto.verify(null,Buffer.alloc(0),pub,Buffer.from('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b','hex'));});
 await test('stdio_unsigned_gate_b',()=>{side(f,{sha256_at_last_write:hash(fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))});const cp=require('child_process');const req={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'assert_gate_status',arguments:{gate_type:'GATE_B_PR_MERGE',prerequisite_token_path:f}}};const r=cp.spawnSync(process.execPath,[path.join(repo,'dist/mcp.js')],{input:JSON.stringify(req)+'\n',encoding:'utf8',timeout:5000});assert.equal(r.status,0);return JSON.parse(r.stdout);});
 await test('plugin_scope_mismatch',()=>{const g=write('plugin-scope.md','text');side(g,{sha256_at_last_write:Plugin.sha256('text'),attestations:[{method:'openpgp',signer:'moongladeai@gmail.com',scope:'moonglade:vault:other.md'}]});return Plugin.verifyFile(g,'text',{canonicalTrustRegistry:path.join(tmp,'absent.json'),registeredVaults:[{vaultPath:tmp}]});});
 await test('plugin_seal_without_signature',()=>{const g=write('plugin-seal.md','text');Plugin.sealAgentNote(g,'text',tmp);return JSON.parse(fs.readFileSync(g+'.provenance.json'));});
 await test('stale_proof_vs_new_root',()=>{const changed={...registry,'d.md':{sha256:hash('d')}};return {selfContainedOldProof:P.verifyProof(proof),matchesCurrentRoot:proof.merkle_root===P.merkleRoot(changed),withCurrentRoot:P.verifyProof({...proof,merkle_root:P.merkleRoot(changed)})};});
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({runtime:process.versions,platform:process.platform,fixtureDirectory:tmp,results},null,2));
 console.log(JSON.stringify(results.map(r=>({name:r.name,result:r.error?'ERROR':typeof r.observed==='object'?r.observed.verified??r.observed.valid??r.observed:r.observed})),null,2));
 if(results.some(r=>r.error))process.exitCode=1;
})();
