import test from 'node:test';
import assert from 'node:assert/strict';
import {openaiVerzoek, openaiBericht, berichtStroom, openaiAntwoord} from '../supabase/functions/ai/openai.ts';

test('tool calls and their results keep the same identifiers and order', () => {
  const r = openaiVerzoek({system:[{type:'text',text:'Help'}], messages:[
    {role:'user',content:'Bekijk mijn agenda'},
    {role:'assistant',content:[{type:'tool_use',id:'tool_1',name:'agenda_bekijken',input:{van:'2026-10-28'}}]},
    {role:'user',content:[{type:'tool_result',tool_use_id:'tool_1',content:'geen afspraken'}]},
  ],tools:[{name:'agenda_bekijken',description:'Agenda',input_schema:{type:'object',properties:{}}},
    {name:'web_search',type:'web_search_20260209'}]}, 'gpt-5.4');
  assert.equal(r.store,false);
  assert.equal(r.input[1].call_id,'tool_1');
  assert.equal(r.input[2].call_id,'tool_1');
  assert.equal(r.tools[0].strict,false);
  assert.deepEqual(r.tools[1],{type:'web_search'});
});

test('photos and PDFs retain content and MIME type', () => {
  const r=openaiVerzoek({messages:[{role:'user',content:[
    {type:'image',source:{type:'base64',media_type:'image/jpeg',data:'aGVsbG8='}},
    {type:'document',title:'test.pdf',source:{type:'base64',media_type:'application/pdf',data:'cGRm'}},
  ]}]},'gpt-5.4');
  assert.equal(r.input[0].content[0].image_url,'data:image/jpeg;base64,aGVsbG8=');
  assert.equal(r.input[0].content[1].filename,'test.pdf');
  assert.throws(()=>openaiVerzoek({messages:[{role:'user',content:[{type:'unknown'}]}]},'gpt-5.4'));
});

test('OpenAI tool output becomes a complete Anthropic stream', () => {
  const m=openaiBericht({id:'resp_1',status:'completed',usage:{input_tokens:12,output_tokens:4},output:[
    {type:'function_call',call_id:'call_1',name:'taken_bekijken',arguments:'{}'},
  ]},'claude-opus-5-5');
  assert.equal(m.stop_reason,'tool_use');
  assert.equal(m.content[0].id,'call_1');
  const events=berichtStroom(m).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
  assert.equal(events[0].type,'message_start');
  assert.deepEqual(events[2].delta,{type:'input_json_delta',partial_json:'{}'});
  assert.equal(events.at(-1).type,'message_stop');
});

test('quota errors are clear and never echo provider messages or secrets', async () => {
  const old=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({error:{code:'credit_balance_exhausted',type:'insufficient_quota',message:'sensitive upstream details'}},{status:429});
  try {
    const r=await openaiAntwoord({messages:[]},'test-key','gpt-5.4',async()=>assert.fail('no usage for failed requests'));
    assert.equal(r.status,429);
    const b=await r.text();assert.match(b,/tegoed/);assert.doesNotMatch(b,/sensitive|test-key/);
  } finally {globalThis.fetch=old;}
});
