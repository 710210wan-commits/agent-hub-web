"use client";

import {useState} from 'react';
import styles from './tool-arguments.module.css';

type Schema={type?:string;properties?:Record<string,Schema>;items?:Schema;required?:string[];default?:unknown;enum?:unknown[];description?:string};
const names:Record<string,string>={region:'区域',title:'图表标题',data:'数据',category:'分类',value:'数值',time:'时间',group:'分组',query:'查询内容',repoName:'仓库名称',question:'问题',url:'文档地址',width:'宽度',height:'高度',theme:'主题',stack:'堆叠',axisXTitle:'X轴标题',axisYTitle:'Y轴标题'};
function name(key:string){return names[key]??key;}
function scalar(s:Schema){return ['string','number','integer','boolean'].includes(s.type??'');}
function rowsSupported(s:Schema){return s.type==='array'&&s.items?.type==='object'&&Object.values(s.items.properties??{}).length>0&&Object.values(s.items.properties??{}).every(scalar);}
function empty(s:Schema):unknown{return s.type==='boolean'?false:s.type==='number'||s.type==='integer'?0:'';}
function validDefault(s:Schema){return s.default!==undefined&&s.default!==null&&((s.type==='string'&&typeof s.default==='string')||(['number','integer'].includes(s.type??'')&&typeof s.default==='number')||(s.type==='boolean'&&typeof s.default==='boolean'));}
function exampleRows(s:Schema){return [0,1].map(i=>Object.fromEntries(Object.entries(s.items?.properties??{}).filter(([k])=>s.items?.required?.includes(k)).map(([k,v])=>[k,v.type==='string'?(k==='time'?`2026-01-0${i+1}`:`示例${i===0?'一':'二'}`):v.type==='boolean'?false:(i+1)*10])));}
export function createArgumentTemplate(raw:Record<string,unknown>):Record<string,unknown>{
 const s=raw as Schema;const result:Record<string,unknown>={};
 for(const [key,field] of Object.entries(s.properties??{})){
  if(validDefault(field))result[key]=field.default;
  else if(rowsSupported(field))result[key]=exampleRows(field);
  else if(s.required?.includes(key)&&scalar(field))result[key]=field.enum?.[0]??empty(field);
 }
 return result;
}
function parse(value:string):Record<string,unknown>|null{try{const v=JSON.parse(value);return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
function Input({schema,value,label,onChange}:{schema:Schema;value:unknown;label:string;onChange:(v:unknown)=>void}){
 if(schema.enum?.every(x=>typeof x==='string'||typeof x==='number'))return <select aria-label={label} value={value===undefined?'':String(value)} onChange={e=>onChange(e.target.value===''?undefined:schema.enum!.find(v=>String(v)===e.target.value))}><option value="">未设置</option>{schema.enum.map(v=><option key={String(v)} value={String(v)}>{String(v)}</option>)}</select>;
 if(schema.type==='boolean')return <select aria-label={label} value={value===undefined?'':String(value)} onChange={e=>onChange(e.target.value===''?undefined:e.target.value==='true')}><option value="">未设置</option><option value="true">是</option><option value="false">否</option></select>;
 return <input aria-label={label} type={schema.type==='string'?'text':'number'} step={schema.type==='integer'?1:'any'} value={typeof value==='string'||typeof value==='number'?value:''} onChange={e=>onChange(schema.type==='string'?e.target.value:e.target.value===''?undefined:Number(e.target.value))}/>;
}
export function ToolArguments({schema:raw,value,onChange}:{schema:Record<string,unknown>;value:string;onChange:(value:string)=>void}){
 const schema=raw as Schema;const [mode,setMode]=useState<'form'|'json'>('form');const data=parse(value);
 function update(key:string,next:unknown){onChange(JSON.stringify({...data,[key]:next},null,2));}
 const fields=Object.entries(schema.properties??{});
 return <div className={styles.editor}>
  <div className={styles.heading}><strong>调用参数</strong><button type="button" onClick={()=>{if(value!=='{}'&&!window.confirm('用示例模板替换当前参数？'))return;onChange(JSON.stringify(createArgumentTemplate(raw),null,2));}}>填入示例模板</button><button type="button" onClick={()=>setMode(mode==='form'?'json':'form')}>{mode==='form'?'JSON 编辑':'返回表单'}</button></div>
  <p className={styles.hint}>填写下面的内容即可，无需手写 JSON。示例数据仅用于测试，调用前请检查。</p>
  {mode==='json'?<label>调用参数（JSON 对象）<textarea rows={8} value={value} onChange={e=>onChange(e.target.value)}/></label>:!data?<p role="alert">JSON 格式不正确，请切换到 JSON 编辑修正，或重新填入示例模板。</p>:<div className={styles.fields}>
   {fields.map(([key,field])=>{
    const label=name(key);const required=schema.required?.includes(key);
    if(scalar(field))return <label key={key}>{label}{required?' *':''}<Input schema={field} label={label} value={data[key]} onChange={next=>update(key,next)}/></label>;
    if(rowsSupported(field)){
     const rows=Array.isArray(data[key])?data[key] as Record<string,unknown>[]:[];
     const columns=Object.entries(field.items!.properties!);
     if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return <p key={key}>{label}格式不适用于表格，请使用 JSON 编辑。</p>;
     return <fieldset key={key} className={styles.rows}><legend>{label}{required?' *':''}</legend><div className={styles.scroll}><table><thead><tr>{columns.map(([k])=><th key={k}>{name(k)}</th>)}<th>操作</th></tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{columns.map(([k,s])=><td key={k}><Input schema={s} label={`${name(k)} · 第${index+1}行`} value={row[k]} onChange={next=>update(key,rows.map((r,i)=>i===index?{...r,[k]:next}:r))}/></td>)}<td><button type="button" aria-label={`删除第${index+1}行`} onClick={()=>update(key,rows.filter((_,i)=>i!==index))}>删除</button></td></tr>)}</tbody></table></div><button type="button" onClick={()=>update(key,[...rows,Object.fromEntries(columns.filter(([k])=>field.items?.required?.includes(k)).map(([k,s])=>[k,empty(s)]))])}>添加一行</button></fieldset>;
    }
    return <p key={key} className={styles.hint}>{label}{required?'（必填）':'（可选）'}为复杂参数，需要时可在 JSON 编辑中填写。</p>;
   })}
   {fields.length===0&&<p className={styles.hint}>此工具未声明表单字段；如需自定义参数，请使用 JSON 编辑。</p>}
  </div>}
 </div>;
}
