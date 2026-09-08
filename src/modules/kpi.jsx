import React, { useEffect, useMemo, useState } from "react";
import {
  addDaysISO,
  formatThaiDate,
  formatThaiDateTime,
  requireSupabase,
  rpc,
  severityLabel,
  statusLabel,
  todayISO
} from "../../core.js";
import { Badge, CardTitle, Empty, ErrorState, Icon, Loading, SearchSelect } from "../components/UI.jsx";

const TYPE_LABEL={injection:"Injection",crane:"Crane",vacuum_pump:"Vacuum Pump"};
const SEV_LABEL={low:"เล็กน้อย",medium:"ปานกลาง",high:"รุนแรง"};
const PM_LABEL={normal:"ปกติ",corrected:"แก้ไขแล้ว",issue:"พบปัญหา"};
const PM_STATUS={planned:"วางแผนไว้",in_progress:"กำลังทำ",completed:"เสร็จแล้ว",done:"เสร็จแล้ว",skipped:"ไม่ได้ทำ",overdue:"เกินกำหนด"};

function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function nullableNum(v){const n=Number(v);return v===null||v===undefined||v===""||!Number.isFinite(n)?null:n}
function fmt(v,d=0){const n=nullableNum(v);return n===null?"—":n.toLocaleString("th-TH",{minimumFractionDigits:d,maximumFractionDigits:d})}
function rangeDays(a,b){if(!a||!b)return 0;return Math.max(1,Math.round((new Date(`${b}T12:00:00Z`)-new Date(`${a}T12:00:00Z`))/86400000)+1)}
function startOfMonth(iso=todayISO()){return `${iso.slice(0,7)}-01`}
function startOfYear(iso=todayISO()){return `${iso.slice(0,4)}-01-01`}
function minusMonths(iso,months){const [y,m]=iso.split("-").map(Number);return new Date(Date.UTC(y,m-1-months,1,12)).toISOString().slice(0,10)}
function equipmentLabel(v){return TYPE_LABEL[v]||v||"เครื่องจักร"}
function severityText(v){return SEV_LABEL[v]||severityLabel(v)||v||"-"}
function statusText(v){return statusLabel(v)||v||"-"}

function MetricCard({label,value,unit,sub,tone="",target,icon="kpi"}){
  return <div className={`kpi-overview-card ${tone}`}>
    <div className="kpi-overview-icon"><Icon name={icon} size={23}/></div>
    <div className="kpi-overview-copy">
      <div className="kpi-overview-label">{label}</div>
      <div className="kpi-overview-main"><b>{value}</b>{unit?<span>{unit}</span>:null}</div>
      <div className="kpi-overview-sub">{sub||" "}{target!==null&&target!==undefined?<span className="kpi-target">เป้า {target}</span>:null}</div>
    </div>
  </div>
}

function Section({icon="kpi",title,sub,children,className=""}){
  return <section className={`card kpi-section ${className}`}><CardTitle icon={icon} title={title} sub={sub}/>{children}</section>
}

function TrendLine({rows=[],dateKey="period_date",valueKey="downtime_min",unit=" นาที"}){
  if(!rows.length)return <Empty title="ยังไม่มีข้อมูลแนวโน้ม"/>;
  const W=780,H=250,L=54,R=18,T=18,B=44;
  const vals=rows.map(r=>num(r[valueKey]));
  const max=Math.max(1,...vals);
  const pts=rows.map((r,i)=>({
    x:L+(rows.length===1?0:(i/(rows.length-1))*(W-L-R)),
    y:T+(1-vals[i]/max)*(H-T-B),
    row:r,
    val:vals[i]
  }));
  const poly=pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area=`${L},${H-B} ${poly} ${pts.at(-1)?.x||L},${H-B}`;
  const ticks=[0,.25,.5,.75,1].map(x=>Math.round(max*x));
  const xidx=[0,Math.round((rows.length-1)/3),Math.round((rows.length-1)*2/3),rows.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  return <div className="chart-shell"><svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="กราฟแนวโน้ม">
    {ticks.map((t,i)=>{const y=T+(1-i/(ticks.length-1))*(H-T-B);return <g key={i}><line x1={L} y1={y} x2={W-R} y2={y} className="chart-grid-line"/><text x={L-8} y={y+4} textAnchor="end" className="chart-axis-text">{t.toLocaleString("th-TH")}</text></g>})}
    <polygon points={area} className="trend-area"/>
    <polyline points={poly} className="trend-line"/>
    {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={rows.length>60?2.4:3.8} className="trend-dot"><title>{formatThaiDate(p.row[dateKey])}: {p.val.toLocaleString("th-TH")}{unit}</title></circle>)}
    {xidx.map(i=><text key={i} x={pts[i].x} y={H-15} textAnchor={i===0?"start":i===rows.length-1?"end":"middle"} className="chart-axis-text">{formatThaiDate(rows[i][dateKey],{year:undefined})}</text>)}
  </svg><div className="chart-summary"><span>รวม <b>{vals.reduce((a,b)=>a+b,0).toLocaleString("th-TH")}{unit}</b></span><span>สูงสุด <b>{max.toLocaleString("th-TH")}{unit}</b></span></div></div>
}

function TrendBars({rows=[],dateKey="period_date",valueKey="breakdown_count",unit=" ครั้ง"}){
  if(!rows.length)return <Empty title="ยังไม่มีข้อมูลแนวโน้ม"/>;
  const max=Math.max(1,...rows.map(r=>num(r[valueKey])));
  const visible=rows.length>45?rows.filter((_,i)=>i%Math.ceil(rows.length/45)===0||i===rows.length-1):rows;
  return <div className="spark-bars" title="จำนวนครั้งเสีย"><div className="spark-bar-area">{visible.map((r,i)=>{const v=num(r[valueKey]);return <div className="spark-bar-col" key={`${r[dateKey]}-${i}`}><div className="spark-bar-value">{v||""}</div><div className="spark-bar" style={{height:`${Math.max(v?8:2,v/max*100)}%`}} title={`${formatThaiDate(r[dateKey])}: ${v}${unit}`}/></div>})}</div><div className="chart-summary"><span>รวม <b>{rows.reduce((a,r)=>a+num(r[valueKey]),0).toLocaleString("th-TH")}{unit}</b></span><span>สูงสุด/ช่วง <b>{max.toLocaleString("th-TH")}{unit}</b></span></div></div>
}

function metricValue(row,keys=[],fallback=0){for(const k of keys){const v=nullableNum(row?.[k]);if(v!==null)return v}return fallback}
function metricNullable(row,keys=[]){for(const k of keys){const v=nullableNum(row?.[k]);if(v!==null)return v}return null}
function periodLabel(value,monthly=false){
  if(!value)return '-';
  const raw = monthly && /^\d{4}-\d{2}$/.test(String(value)) ? `${value}-01` : value;
  const date = new Date(String(raw).length===10 ? `${raw}T12:00:00+07:00` : raw);
  if(Number.isNaN(date.getTime()))return String(value);
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',month:'short',year:monthly?'2-digit':undefined,day:monthly?undefined:'numeric'}).format(date);
}
function deltaState(current,previous,better='up'){
  const a=nullableNum(current),b=nullableNum(previous);
  if(a===null||b===null)return {text:'ไม่มีช่วงเปรียบเทียบ',cls:'flat'};
  const diff=a-b;
  const improved = better==='down' ? diff<0 : diff>0;
  if(Math.abs(diff)<0.0001)return {text:'คงที่จากช่วงก่อน',cls:'flat'};
  return {text:`${improved?'ดีขึ้น':'แย่ลง'} ${Math.abs(diff).toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2})}`,cls:improved?'up':'down'};
}

function overallMonthState({mtbfState,mttrState,avState,av,target}){
  const states=[mtbfState?.cls,mttrState?.cls,avState?.cls];
  const up=states.filter(x=>x==='up').length;
  const down=states.filter(x=>x==='down').length;
  const targetAv=nullableNum(target) ?? 95;
  if(av < targetAv - 1 || down >= 2) return {cls:'bad',label:'แย่'};
  if((up >= 2 && av >= targetAv) || (up >= 1 && down === 0 && av >= targetAv)) return {cls:'good',label:'ดี'};
  return {cls:'warn',label:'เฝ้าระวัง'};
}
function TrendMetricChart({title,rows=[],dateKey='period_date',metricKeys=[],unit='',decimals=1,better='up',target=null,tone='blue'}){
  const monthly=dateKey==='period_month';
  const points=(rows||[]).map(r=>({row:r,value:metricNullable(r,metricKeys)})).filter(x=>x.value!==null);
  if(!points.length)return <Empty title={`ยังไม่มีข้อมูล ${title}`} text="ช่วงนี้ยังไม่มีข้อมูลเพียงพอสำหรับคำนวณ KPI นี้"/>;
  const values=points.map(x=>x.value);
  const latest=values.at(-1), previous=values.length>1?values.at(-2):null;
  const average=values.reduce((a,b)=>a+b,0)/values.length;
  const t=nullableNum(target);
  let min=Math.min(...values, t??values[0]);
  let max=Math.max(...values, t??values[0]);
  if(Math.abs(max-min)<0.0001){const pad=Math.max(1,Math.abs(max)*.05);min-=pad;max+=pad}
  const range=Math.max(.0001,max-min);
  const W=540,H=230,L=48,R=14,T=18,B=40;
  const pts=points.map((x,i)=>({
    x:L+(points.length===1?(W-L-R)/2:(i/(points.length-1))*(W-L-R)),
    y:T+(1-((x.value-min)/range))*(H-T-B),
    label:periodLabel(x.row?.[dateKey],monthly),
    value:x.value
  }));
  const poly=pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const ticks=[0,.25,.5,.75,1].map(x=>min+(max-min)*x);
  const xidx=[0,Math.round((points.length-1)/3),Math.round((points.length-1)*2/3),points.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  const targetY=t===null?null:T+(1-((t-min)/range))*(H-T-B);
  const delta=deltaState(latest,previous,better);
  return <div className={`trend-metric-card ${tone}`}>
    <div className="trend-metric-head"><div><h3>{title}</h3><p>{better==='down'?'ค่ายิ่งต่ำยิ่งดี':'ค่ายิ่งสูงยิ่งดี'}</p></div><span className={`trend-delta ${delta.cls}`}>{delta.text}</span></div>
    <svg className="trend-metric-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      {ticks.map((tick,i)=>{const y=T+(1-i/(ticks.length-1))*(H-T-B);return <g key={i}><line x1={L} y1={y} x2={W-R} y2={y} className="chart-grid-line"/><text x={L-8} y={y+4} textAnchor="end" className="chart-axis-text">{tick.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:decimals})}</text></g>})}
      {targetY!==null&&targetY>=T&&targetY<=H-B?<g><line x1={L} y1={targetY} x2={W-R} y2={targetY} className="chart-target-line"/><text x={W-R} y={targetY-6} textAnchor="end" className="chart-target-text">เป้า {t?.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:decimals})}{unit}</text></g>:null}
      <polyline points={poly} className={`trend-line tone-${tone}`}/>
      {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4} className={`trend-dot tone-${tone}`}><title>{`${p.label}: ${p.value.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:decimals})}${unit}`}</title></circle>)}
      {xidx.map(i=><text key={i} x={pts[i].x} y={H-14} textAnchor={i===0?'start':i===points.length-1?'end':'middle'} className="chart-axis-text">{pts[i].label}</text>)}
    </svg>
    <div className="trend-metric-stats">
      <div><span>ล่าสุด</span><b>{latest.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:decimals})}{unit}</b></div>
      <div><span>เฉลี่ย</span><b>{average.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:decimals})}{unit}</b></div>
      <div><span>จำนวนช่วง</span><b>{points.length.toLocaleString('th-TH')}</b></div>
    </div>
  </div>
}
function MonthMetricBars({rows=[],targetAvailability=95}){
  const list=(rows||[]).slice(-6);
  if(!list.length)return <Empty title="ยังไม่มีข้อมูลรายเดือน" text="เมื่อมีข้อมูลหลายเดือน ระบบจะเปรียบเทียบให้ว่าดีขึ้นหรือแย่ลง"/>;
  const mtbfVals=list.map(r=>metricNullable(r,['mtbf_hour','mtbf_hr','mtbf_hours','mtbf'])).filter(v=>v!==null);
  const mttrVals=list.map(r=>metricNullable(r,['mttr_min','mttr'])).filter(v=>v!==null);
  const mtbfMax=Math.max(1,...mtbfVals);
  const mttrMax=Math.max(1,...mttrVals);
  return <div className="monthly-compare-board">
    <div className="monthly-compare-note">เปรียบเทียบ 6 เดือนล่าสุด — <b>สีเขียว = ดี</b>, <b>สีเหลือง = เฝ้าระวัง</b>, <b>สีแดง = แย่</b> · เดือนที่ไม่มี Breakdown จะแสดง MTBF/MTTR เป็น —</div>
    <div className="monthly-compare-list">{list.map((r,i)=>{
      const prev=i>0?list[i-1]:null;
      const mtbf=metricNullable(r,['mtbf_hour','mtbf_hr','mtbf_hours','mtbf']);
      const mttr=metricNullable(r,['mttr_min','mttr']);
      const av=metricNullable(r,['availability_pct','availability']);
      const prevMtbf=prev?metricNullable(prev,['mtbf_hour','mtbf_hr','mtbf_hours','mtbf']):null;
      const prevMttr=prev?metricNullable(prev,['mttr_min','mttr']):null;
      const prevAv=prev?metricNullable(prev,['availability_pct','availability']):null;
      const mtbfState=deltaState(mtbf,prevMtbf,'up');
      const mttrState=deltaState(mttr,prevMttr,'down');
      const avState=deltaState(av,prevAv,'up');
      const overall=overallMonthState({mtbfState,mttrState,avState,av:av??100,target:targetAvailability});
      return <div className={`monthly-compare-row month-${overall.cls}`} key={`${r.period_month||i}`}>
        <div className="month-label-wrap"><div className="month-label">{periodLabel(r.period_month||r.period_date,true)}</div><span className={`month-health-badge ${overall.cls}`}>{overall.label}</span></div>
        <div className="month-bar-group"><small>MTBF</small><div className="month-bar-track"><i className="bar mtbf" style={{width:mtbf===null?'0%':`${Math.max(8,mtbf/mtbfMax*100)}%`}}/></div><b>{mtbf===null?'—':`${mtbf.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:1})} ชม.`}</b><span className={`mini-state ${mtbfState.cls}`}>{mtbfState.text}</span></div>
        <div className="month-bar-group"><small>MTTR</small><div className="month-bar-track"><i className="bar mttr" style={{width:mttr===null?'0%':`${Math.max(8,mttr/mttrMax*100)}%`}}/></div><b>{mttr===null?'—':`${mttr.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:1})} นาที`}</b><span className={`mini-state ${mttrState.cls}`}>{mttrState.text}</span></div>
        <div className="month-bar-group"><small>Availability</small><div className="month-bar-track"><i className="bar availability" style={{width:av===null?'0%':`${Math.min(100,Math.max(av,8))}%`}}/></div><b>{av===null?'—':`${av.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2})}%`}</b><span className={`mini-state ${avState.cls}`}>{avState.text}</span></div>
      </div>
    })}</div>
  </div>
}

function percentChange(current,previous,better='up',threshold=1){
  const c=nullableNum(current),p=nullableNum(previous);
  if(c===null||p===null||Math.abs(p)<.000001)return {raw:null,cls:'flat',label:'เทียบเดือนไม่ได้',arrow:'•'};
  const raw=(c-p)/Math.abs(p)*100;
  if(Math.abs(raw)<threshold)return {raw,cls:'flat',label:'ใกล้เคียงเดือนก่อน',arrow:'→'};
  const improved=better==='down'?raw<0:raw>0;
  return {raw,cls:improved?'good':'bad',label:`${improved?'ดีขึ้น':'แย่ลง'} ${Math.abs(raw).toLocaleString('th-TH',{minimumFractionDigits:1,maximumFractionDigits:1})}%`,arrow:raw>0?'↑':'↓'};
}
function metricHealth({metric,current,previous,target,breakdowns=1}){
  const c=nullableNum(current),p=nullableNum(previous),t=nullableNum(target);
  if(c===null){
    if(metric==='mtbf'&&Number(breakdowns)===0)return {cls:'good',label:'ไม่มี Breakdown'};
    return {cls:'na',label:'ไม่มีข้อมูล'};
  }
  const better=(metric==='mttr'||metric==='loss_time')?'down':'up';
  if(t!==null){
    if(better==='up'){
      if(c>=t)return {cls:'good',label:'ผ่านเป้า'};
      if(c>=t*.9)return {cls:'warn',label:'ใกล้เป้า'};
      return {cls:'bad',label:'ต่ำกว่าเป้า'};
    }
    if(c<=t)return {cls:'good',label:'ผ่านเป้า'};
    if(c<=t*1.1)return {cls:'warn',label:'ใกล้เป้า'};
    return {cls:'bad',label:'สูงกว่าเป้า'};
  }
  if(p===null)return {cls:'warn',label:'เดือนฐาน'};
  if(metric==='availability'){
    const diff=c-p;
    if(Math.abs(diff)<.05)return {cls:'warn',label:'ทรงตัว'};
    return diff>0?{cls:'good',label:'ดีขึ้น'}:{cls:'bad',label:'ลดลง'};
  }
  const delta=percentChange(c,p,better,5);
  if(delta.cls==='good')return {cls:'good',label:'ดีขึ้น'};
  if(delta.cls==='bad')return {cls:'bad',label:'แย่ลง'};
  return {cls:'warn',label:'ทรงตัว'};
}
function monthHealth(row,prev,targets={}){
  if(!row)return {cls:'na',label:'ไม่มีข้อมูล'};
  if(num(row.breakdown_count)===0&&num(row.availability_pct,100)>=99.99)return {cls:'good',label:'ดีมาก'};
  const states=[
    metricHealth({metric:'mtbf',current:row.mtbf_hour,previous:prev?.mtbf_hour,target:targets.mtbf,breakdowns:row.breakdown_count}),
    metricHealth({metric:'mttr',current:row.mttr_min,previous:prev?.mttr_min,target:targets.mttr,breakdowns:row.breakdown_count}),
    metricHealth({metric:'availability',current:row.availability_pct,previous:prev?.availability_pct,target:targets.availability,breakdowns:row.breakdown_count})
  ];
  const good=states.filter(x=>x.cls==='good').length,bad=states.filter(x=>x.cls==='bad').length;
  if(bad>=2)return {cls:'bad',label:'ต้องปรับปรุง'};
  if(good>=2)return {cls:'good',label:'ดีขึ้น'};
  return {cls:'warn',label:'เฝ้าระวัง'};
}
function ProPrimaryCard({metric,label,value,unit,description,target,icon,tone='blue'}){
  return <div className={`pro-primary-card ${tone}`}>
    <div className="pro-primary-top"><div className="pro-primary-icon"><Icon name={icon} size={22}/></div><div><span>{label}</span><small>{description}</small></div></div>
    <div className="pro-primary-value"><b>{value}</b><em>{unit}</em></div>
    <div className="pro-primary-foot"><span>ช่วงวันที่ที่เลือก</span>{target!==null&&target!==undefined?<strong>เป้า {target}</strong>:<strong className="muted-target">ยังไม่ตั้งเป้า</strong>}</div>
  </div>
}
function ProSupportMetric({label,value,unit,sub,icon,tone=''}){
  return <div className={`pro-support-metric ${tone}`}><div className="pro-support-icon"><Icon name={icon} size={18}/></div><div><span>{label}</span><b>{value}<small>{unit}</small></b><em>{sub}</em></div></div>
}
function MiniLine({rows=[],metric='mtbf',valueKey='mtbf_hour',unit='',decimals=1,tone='blue',target=null}){
  const W=760,H=118,L=48,R=18,T=14,B=25;
  const usable=(rows||[]).map((r,i)=>({r,i,v:nullableNum(r?.[valueKey])})).filter(x=>x.v!==null);
  if(!usable.length)return <div className="pro-chart-empty">ยังไม่มีข้อมูลสำหรับ KPI นี้</div>;
  const targetNum=nullableNum(target);
  let min=Math.min(...usable.map(x=>x.v),targetNum??Infinity),max=Math.max(...usable.map(x=>x.v),targetNum??-Infinity);
  if(!Number.isFinite(min)||!Number.isFinite(max)){min=0;max=1}
  if(Math.abs(max-min)<.0001){const pad=Math.max(1,Math.abs(max)*.05);min-=pad;max+=pad}
  const pad=(max-min)*.12;min-=pad;max+=pad;const range=max-min;
  const pts=usable.map((x,j)=>({x:L+(usable.length===1?(W-L-R)/2:j/(usable.length-1)*(W-L-R)),y:T+(1-(x.v-min)/range)*(H-T-B),...x}));
  const poly=pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const targetY=targetNum===null?null:T+(1-(targetNum-min)/range)*(H-T-B);
  return <svg viewBox={`0 0 ${W} ${H}`} className="pro-mini-line" role="img" aria-label={`${metric} trend`}>
    {[0,.5,1].map((q,i)=>{const y=T+q*(H-T-B);return <line key={i} x1={L} y1={y} x2={W-R} y2={y} className="pro-grid-line"/>})}
    {targetY!==null&&targetY>=T&&targetY<=H-B?<line x1={L} y1={targetY} x2={W-R} y2={targetY} className="pro-target-line"/>:null}
    <polyline points={poly} className={`pro-line pro-line-${tone}`}/>
    {pts.map((p,j)=>{const prev=j>0?usable[j-1]?.v:null;const state=metricHealth({metric,current:p.v,previous:prev,target:targetNum,breakdowns:p.r.breakdown_count});return <circle key={j} cx={p.x} cy={p.y} r="4.5" className={`pro-point ${state.cls}`}><title>{periodLabel(p.r.period_month,true)}: {fmt(p.v,decimals)}{unit}</title></circle>})}
    {pts.map((p,j)=>j===0||j===pts.length-1||pts.length<=6?<text key={`x${j}`} x={p.x} y={H-7} textAnchor={j===0?'start':j===pts.length-1?'end':'middle'} className="pro-axis-label">{periodLabel(p.r.period_month,true)}</text>:null)}
  </svg>
}
function ProTrendRow({label,metric,valueKey,rows=[],unit,decimals=1,tone,target,better='up'}){
  const latest=[...(rows||[])].reverse().find(r=>nullableNum(r?.[valueKey])!==null)||null;
  const li=latest?rows.indexOf(latest):-1;const prev=li>0?rows.slice(0,li).reverse().find(r=>nullableNum(r?.[valueKey])!==null):null;
  const change=percentChange(latest?.[valueKey],prev?.[valueKey],better,metric==='availability'?.05:5);
  return <div className="pro-trend-row">
    <div className="pro-trend-meta"><span>{label}</span><b>{latest?fmt(latest[valueKey],decimals):'—'}<small>{unit}</small></b><em className={`pro-change ${change.cls}`}>{change.arrow} {change.label}</em></div>
    <MiniLine rows={rows} metric={metric} valueKey={valueKey} unit={unit} decimals={decimals} tone={tone} target={target}/>
  </div>
}
function ProTrendPanel({rows=[],summary={}}){
  return <section className="pro-panel pro-trend-panel">
    <div className="pro-panel-head"><div><span className="pro-eyebrow">PERFORMANCE TREND</span><h2>แนวโน้ม KPI ย้อนหลัง 6 เดือน</h2><p>จุดสีของแต่ละเดือนบอกสถานะทันที: เขียวดี · เหลืองเฝ้าระวัง · แดงต้องปรับปรุง</p></div><div className="pro-legend"><span className="good">ดี</span><span className="warn">เฝ้าระวัง</span><span className="bad">ต้องปรับปรุง</span></div></div>
    <div className="pro-trend-stack">
      <ProTrendRow label="MTBF" metric="mtbf" valueKey="mtbf_hour" rows={rows} unit=" ชม." decimals={1} tone="blue" target={summary.target_mtbf_hr} better="up"/>
      <ProTrendRow label="MTTR" metric="mttr" valueKey="mttr_min" rows={rows} unit=" นาที" decimals={1} tone="purple" target={summary.target_mttr_min} better="down"/>
      <ProTrendRow label="Availability" metric="availability" valueKey="availability_pct" rows={rows} unit="%" decimals={2} tone="green" target={summary.target_availability} better="up"/>
    </div>
  </section>
}
function ProCurrentMonth({rows=[],summary={}}){
  const latest=rows.at(-1)||null,prev=rows.length>1?rows.at(-2):null;
  if(!latest)return <section className="pro-panel pro-current-panel"><Empty title="ยังไม่มีข้อมูลรายเดือน"/></section>;
  const targets={mtbf:summary.target_mtbf_hr,mttr:summary.target_mttr_min,availability:summary.target_availability};
  const overall=monthHealth(latest,prev,targets);
  const metrics=[
    ['MTBF','mtbf','mtbf_hour',' ชม.',1,'up'],['MTTR','mttr','mttr_min',' นาที',1,'down'],['Availability','availability','availability_pct','%',2,'up']
  ];
  const avgDownPerBd = num(latest.breakdown_count)>0 ? num(latest.downtime_min)/num(latest.breakdown_count) : null;
  return <section className={`pro-panel pro-current-panel ${overall.cls}`}>
    <div className="pro-panel-head compact"><div><span className="pro-eyebrow">LATEST MONTH</span><h2>{periodLabel(latest.period_month,true)}</h2><p>เทียบกับ {prev?periodLabel(prev.period_month,true):'เดือนก่อนหน้า'}</p></div><span className={`pro-overall-badge ${overall.cls}`}>{overall.label}</span></div>
    <div className="pro-current-score"><span>Availability</span><b>{fmt(latest.availability_pct,2)}%</b><div className="pro-health-track"><i style={{width:`${Math.max(0,Math.min(100,num(latest.availability_pct)))}%`}}/></div></div>
    <div className="pro-current-list">{metrics.map(([label,metric,key,unit,d,better])=>{
      const health=metricHealth({metric,current:latest[key],previous:prev?.[key],target:targets[metric],breakdowns:latest.breakdown_count});
      const change=percentChange(latest[key],prev?.[key],better,metric==='availability'?.05:5);
      return <div className="pro-current-item" key={key}><div><span>{label}</span><b>{nullableNum(latest[key])===null?'—':fmt(latest[key],d)}<small>{nullableNum(latest[key])===null?'':unit}</small></b></div><div className={`pro-status-dot ${health.cls}`}>{health.label}</div><em className={`pro-change ${change.cls}`}>{change.arrow} {change.raw===null?'—':`${Math.abs(change.raw).toFixed(1)}%`}</em></div>
    })}</div>
    <div className="pro-current-loss"><div><span>Breakdown</span><b>{fmt(latest.breakdown_count)} ครั้ง</b></div><div><span>Loss Time</span><b>{fmt(latest.downtime_min)} นาที</b></div><div><span>Downtime / ครั้ง</span><b>{avgDownPerBd===null?'—':fmt(avgDownPerBd,1)}{avgDownPerBd===null?'':' นาที'}</b></div></div>
  </section>
}
function ProMatrix({rows=[],summary={}}){
  const targets={mtbf:summary.target_mtbf_hr,mttr:summary.target_mttr_min,availability:summary.target_availability};
  if(!rows.length)return <section className="pro-panel"><Empty title="ยังไม่มีข้อมูลรายเดือน"/></section>;
  const metrics=[
    {label:'MTBF',metric:'mtbf',key:'mtbf_hour',unit:'ชม.',d:1},
    {label:'MTTR',metric:'mttr',key:'mttr_min',unit:'นาที',d:1},
    {label:'Availability',metric:'availability',key:'availability_pct',unit:'%',d:2},
    {label:'Loss Time',metric:'loss_time',key:'downtime_min',unit:'นาที',d:0}
  ];
  return <section className="pro-panel pro-matrix-panel">
    <div className="pro-panel-head"><div><span className="pro-eyebrow">MONTHLY SCORECARD</span><h2>เปรียบเทียบประสิทธิภาพรายเดือน</h2><p>อ่านจากซ้ายไปขวาเพื่อดูว่าเครื่องจักรดีขึ้นต่อเนื่องหรือเริ่มมีแนวโน้มผิดปกติ</p></div></div>
    <div className="pro-matrix-wrap"><div className="pro-matrix" style={{gridTemplateColumns:`150px repeat(${rows.length},minmax(125px,1fr))`}}>
      <div className="pro-matrix-corner">KPI / เดือน</div>{rows.map((r,i)=>{const overall=monthHealth(r,i?rows[i-1]:null,targets);return <div className="pro-matrix-month" key={`m${i}`}><b>{periodLabel(r.period_month,true)}</b><span className={overall.cls}>{overall.label}</span></div>})}
      {metrics.flatMap((m)=>[
        <div className="pro-matrix-label" key={`l-${m.key}`}><b>{m.label}</b><span>{m.metric==='mttr'||m.metric==='loss_time'?'ต่ำลง = ดีขึ้น':'สูงขึ้น = ดีขึ้น'}</span></div>,
        ...rows.map((r,i)=>{const prev=i?rows[i-1]:null;const health=metricHealth({metric:m.metric,current:r[m.key],previous:prev?.[m.key],target:targets[m.metric],breakdowns:r.breakdown_count});const ch=percentChange(r[m.key],prev?.[m.key],(m.metric==='mttr'||m.metric==='loss_time')?'down':'up',m.metric==='availability'?.05:5);const nv=nullableNum(r[m.key]);return <div className={`pro-matrix-cell ${health.cls}`} key={`${m.key}-${i}`}><b>{nv===null?(m.metric==='mtbf'&&num(r.breakdown_count)===0?'No BD':'—'):`${fmt(nv,m.d)} ${m.unit}`}</b><span>{health.label}</span><em>{ch.raw===null?'—':`${ch.arrow} ${Math.abs(ch.raw).toFixed(1)}%`}</em></div>})
      ])}
    </div></div>
  </section>
}

function RankBars({rows=[],valueKey="downtime_min",secondaryKey="occurrences",suffix=" นาที",limit=8}){
  const list=(rows||[]).slice(0,limit);
  if(!list.length)return <Empty title="ยังไม่มีข้อมูลสำหรับวิเคราะห์"/>;
  const max=Math.max(1,...list.map(r=>num(r[valueKey])));
  return <div className="analysis-bars">{list.map((r,i)=><div className="analysis-bar-row" key={`${r.label}-${i}`}>
    <div className="analysis-rank">{i+1}</div>
    <div className="analysis-bar-copy"><div className="analysis-bar-title" title={r.label}>{r.label||"ไม่ระบุ"}</div><div className="analysis-track"><div className="analysis-fill" style={{width:`${Math.max(4,num(r[valueKey])/max*100)}%`}}/></div></div>
    <div className="analysis-values"><b>{num(r[valueKey]).toLocaleString("th-TH")}{suffix}</b>{secondaryKey&&r[secondaryKey]!==undefined?<span>{num(r[secondaryKey]).toLocaleString("th-TH")} ครั้ง</span>:null}</div>
  </div>)}</div>
}

function Distribution({rows=[],kind="status"}){
  const total=rows.reduce((a,r)=>a+num(r.occurrences),0);
  if(!total)return <Empty title="ยังไม่มีข้อมูล"/>;
  const label=(v)=>kind==="severity"?severityText(v):kind==="status"?statusText(v):v||"ไม่ระบุ";
  return <div className="distribution-list">{rows.map((r,i)=>{const pct=total?num(r.occurrences)/total*100:0;return <div className="distribution-row" key={`${r.label}-${i}`}><div className="distribution-head"><b>{label(r.label)}</b><span>{num(r.occurrences)} ครั้ง · {pct.toFixed(1)}%</span></div><div className="distribution-track"><div className={`distribution-fill dist-${i%5}`} style={{width:`${pct}%`}}/></div><small>Downtime {num(r.downtime_min).toLocaleString("th-TH")} นาที</small></div>})}</div>
}

function HealthBadge({availability,target=95,breakdowns=0}){
  const a=num(availability,100),t=num(target,95);
  if(!breakdowns)return <span className="health-pill good">ไม่มี Breakdown</span>;
  if(a>=t)return <span className="health-pill good">ปกติ</span>;
  if(a>=t-2)return <span className="health-pill warn">เฝ้าระวัง</span>;
  return <span className="health-pill danger">ต้องวิเคราะห์</span>;
}

function GroupStatus({availability,target=95,breakdowns=0}){
  const a=num(availability,100),t=nullableNum(target)??95;
  if(!breakdowns||a>=t)return <span className="group-status good"><i/>ดีมาก</span>;
  if(a>=t-2)return <span className="group-status warn"><i/>ปานกลาง</span>;
  return <span className="group-status danger"><i/>ต้องปรับปรุง</span>;
}

function GroupPerformance({rows=[],target=95,onSelect}){
  if(!rows.length)return <Empty title="ยังไม่มีข้อมูลเครื่องจักรในขอบเขตนี้"/>;
  const maxDown=Math.max(1,...rows.map(r=>num(r.downtime_min)));
  return <div className="group-performance-list">{rows.map((r,i)=><button type="button" className="group-performance-row" key={r.key||i} onClick={()=>onSelect?.(r)}>
    <div className="group-machine-cell">
      <div className="group-machine-icon"><Icon name={r.isMachine?"machine":"group"} size={25}/></div>
      <div><b>{r.title}</b><span>{r.subtitle}</span>{r.department?<em>แผนก: {r.department}</em>:null}</div>
    </div>
    <div className="group-metric status"><small>สถานะ</small><GroupStatus availability={r.availability_pct} target={target} breakdowns={r.breakdown_count}/></div>
    <div className="group-metric"><small>จำนวนครั้ง (Breakdown)</small><b>{fmt(r.breakdown_count)} <span>ครั้ง</span></b><p>จาก {fmt(r.machine_count)} เครื่อง</p></div>
    <div className="group-metric"><small>Downtime รวม</small><b>{fmt(r.downtime_min)} <span>นาที</span></b><div className="mini-track"><i className="downtime" style={{width:`${Math.max(r.downtime_min?8:0,num(r.downtime_min)/maxDown*100)}%`}}/></div></div>
    <div className="group-metric"><small>MTTR เฉลี่ย</small><b>{fmt(r.mttr_min,1)} <span>นาที</span></b></div>
    <div className="group-metric availability"><small>Availability</small><b>{fmt(r.availability_pct,2)}%</b><div className="mini-track"><i className="availability" style={{width:`${Math.min(100,Math.max(0,num(r.availability_pct)))}%`}}/></div></div>
    <div className="group-go"><Icon name="chevron" size={20}/></div>
  </button>)}</div>
}

function MachineHealth({rows=[],target,search,setSearch,onSelect}){
  const filtered=rows.filter(r=>`${r.machine_no} ${r.machine_name} ${r.area||""}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="machine-health-toolbar"><div className="field kpi-search"><label>ค้นหาเครื่อง</label><input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="เช่น IVF4 / 650T-16 / Crane No.4"/></div><div className="machine-health-count">{filtered.length.toLocaleString("th-TH")} เครื่อง</div></div>
    {!filtered.length?<Empty title="ไม่พบเครื่องจักรตามคำค้น"/>:<>
      <div className="desktop-only"><div className="table-wrap kpi-health-wrap"><table className="table kpi-health-table"><thead><tr><th>เครื่อง</th><th>พื้นที่</th><th>สถานะ</th><th>เสีย</th><th>Downtime</th><th>MTTR</th><th>MTBF</th><th>Availability</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.machine_id}><td><b className="mono">{r.machine_no}</b><br/><span className="muted-xs">{r.machine_name}</span></td><td>{r.area||"-"}{r.has_robot===true?<><br/><span className="robot-tag">Robot</span></>:r.has_robot===false?<><br/><span className="robot-tag off">No Robot</span></>:null}</td><td><HealthBadge availability={r.availability_pct} target={target} breakdowns={num(r.breakdown_count)}/></td><td className="mono">{num(r.breakdown_count)}</td><td className="mono">{num(r.downtime_min).toLocaleString("th-TH")} m</td><td className="mono">{fmt(r.mttr_min,1)}</td><td className="mono">{fmt(r.mtbf_hour,1)}</td><td><b className="mono">{fmt(r.availability_pct,2)}%</b></td><td><button className="btn small" onClick={()=>onSelect(r.machine_id)}>ดูเครื่องนี้</button></td></tr>)}</tbody></table></div></div>
      <div className="mobile-only machine-health-cards">{filtered.map(r=><button type="button" className="machine-health-card" key={r.machine_id} onClick={()=>onSelect(r.machine_id)}><div className="machine-health-card-head"><div><b className="mono">{r.machine_no}</b><span>{r.machine_name}</span></div><HealthBadge availability={r.availability_pct} target={target} breakdowns={num(r.breakdown_count)}/></div><div className="machine-health-mini-grid"><div><small>เสีย</small><b>{num(r.breakdown_count)} ครั้ง</b></div><div><small>Downtime</small><b>{num(r.downtime_min)} นาที</b></div><div><small>MTTR</small><b>{fmt(r.mttr_min,1)}</b></div><div><small>Availability</small><b>{fmt(r.availability_pct,2)}%</b></div></div><div className="machine-health-foot"><span>{r.area||"ไม่ระบุพื้นที่"}</span>{r.has_robot!==null&&r.has_robot!==undefined?<span>{r.has_robot?"มี Robot":"ไม่มี Robot"}</span>:null}</div></button>)}</div>
    </>}
  </>
}

function InsightPanel({data,selectedMachine}){
  const s=data?.summary||{},machines=data?.machine_ranking||[],causes=data?.causes||[],problems=data?.problem_pareto||[];
  const worst=machines.find(x=>num(x.breakdown_count)>0),cause=causes[0],problem=problems[0];
  const insights=[];
  if(selectedMachine)insights.push({title:`กำลังวิเคราะห์ ${selectedMachine.machine_no}`,text:`${selectedMachine.machine_name}${selectedMachine.area?` · ${selectedMachine.area}`:""}${selectedMachine.has_robot===true?" · มี Robot":selectedMachine.has_robot===false?" · ไม่มี Robot":""}`});
  if(worst)insights.push({title:"เครื่องที่เสียเวลาสูงสุด",text:`${worst.machine_no} มี Downtime ${num(worst.downtime_min).toLocaleString("th-TH")} นาที จาก ${num(worst.breakdown_count)} ครั้ง`});
  if(cause)insights.push({title:"สาเหตุหลัก",text:`${cause.label} ทำให้เสียเวลา ${num(cause.downtime_min).toLocaleString("th-TH")} นาที (${num(cause.occurrences)} ครั้ง)`});
  if(problem)insights.push({title:"ปัญหาซ้ำบ่อย",text:`${problem.label} เกิด ${num(problem.occurrences)} ครั้ง รวม ${num(problem.downtime_min).toLocaleString("th-TH")} นาที`});
  if(num(s.follow_up_count)+num(s.no_parts_count)>0)insights.push({title:"งานที่ต้องติดตาม",text:`ต้องติดตามต่อ ${num(s.follow_up_count)} งาน · ไม่มีอะไหล่ ${num(s.no_parts_count)} งาน`});
  if(!insights.length)return <Empty title="ยังไม่มี Insight" text="เมื่อมีประวัติซ่อม ระบบจะสรุปจุดที่ควรสนใจให้ที่นี่"/>;
  return <div className="insight-grid">{insights.slice(0,5).map((x,i)=><div className="insight-card" key={i}><span className="insight-index">{String(i+1).padStart(2,"0")}</span><div><b>{x.title}</b><p>{x.text}</p></div></div>)}</div>
}

export default function KPIModule(){
  const today=todayISO();
  const [departments,setDepartments]=useState([]);
  const [groups,setGroups]=useState([]);
  const [machines,setMachines]=useState([]);
  const [filters,setFilters]=useState({department_id:"",group_id:"",machine_id:"",from:startOfMonth(today),to:today});
  const [data,setData]=useState(null);
  const [pmData,setPmData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [mastersLoading,setMastersLoading]=useState(true);
  const [error,setError]=useState("");
  const [machineSearch,setMachineSearch]=useState("");

  useEffect(()=>{(async()=>{try{setMastersLoading(true);const sb=requireSupabase();const [d,g,m]=await Promise.all([
    sb.from("departments").select("id,dept_code,dept_name,is_active,sort_order").eq("is_active",true).order("sort_order"),
    sb.from("machine_groups").select("id,department_id,group_code,group_name,sort_order,is_active").eq("is_active",true).order("sort_order"),
    sb.from("machines").select("id,department_id,machine_group_id,machine_no,machine_name,production_line,area,equipment_type,has_robot,is_active").eq("is_active",true).order("machine_no")
  ]);if(d.error)throw d.error;if(g.error)throw g.error;if(m.error)throw m.error;setDepartments(d.data||[]);setGroups(g.data||[]);setMachines(m.data||[])}catch(e){setError(e.message||"โหลด Master KPI ไม่สำเร็จ")}finally{setMastersLoading(false)}})()},[]);

  async function load(){
    setLoading(true);setError("");
    try{
      const args={p_department_id:filters.department_id||null,p_group_id:filters.group_id||null,p_machine_id:filters.machine_id||null,p_from:filters.from,p_to:filters.to};
      const historyArgs={...args,p_from:minusMonths(filters.to,5),p_to:filters.to};
      const [dashboard,trendMetrics,historyMetrics]=await Promise.all([
        rpc("kpi_dashboard_v2",args),
        rpc("kpi_trend_metrics_v1",args),
        rpc("kpi_trend_metrics_v1",historyArgs)
      ]);
      const mergedDashboard={
        ...(dashboard||{}),
        daily_trend:trendMetrics?.daily_trend||dashboard?.daily_trend||[],
        monthly_trend:trendMetrics?.monthly_trend||dashboard?.monthly_trend||[],
        history_monthly_trend:historyMetrics?.monthly_trend||trendMetrics?.monthly_trend||dashboard?.monthly_trend||[]
      };
      const sb=requireSupabase();
      let q=sb.from("pm_schedule").select("id,department_id,machine_id,due_date,status,plan_title_snapshot,machine_no_snapshot,machine_name_snapshot,overall_result,completed_at").gte("due_date",filters.from).lte("due_date",filters.to).order("due_date",{ascending:false}).limit(300);
      if(filters.department_id)q=q.eq("department_id",filters.department_id);
      if(filters.machine_id)q=q.eq("machine_id",filters.machine_id);
      else if(filters.group_id){const ids=machines.filter(m=>m.machine_group_id===filters.group_id).map(m=>m.id);if(ids.length)q=q.in("machine_id",ids);else q=q.eq("id","00000000-0000-0000-0000-000000000000")}
      const {data:pm,error:pmErr}=await q;if(pmErr)throw pmErr;
      setData(mergedDashboard);setPmData(pm||[]);
    }catch(e){setError(e.message||"โหลด KPI ไม่สำเร็จ")}finally{setLoading(false)}
  }
  useEffect(()=>{if(!mastersLoading)load()},[mastersLoading,filters.department_id,filters.group_id,filters.machine_id,filters.from,filters.to]);

  const visibleGroups=useMemo(()=>groups.filter(g=>!filters.department_id||g.department_id===filters.department_id),[groups,filters.department_id]);
  const visibleMachines=useMemo(()=>machines.filter(m=>(!filters.department_id||m.department_id===filters.department_id)&&(!filters.group_id||m.machine_group_id===filters.group_id)),[machines,filters.department_id,filters.group_id]);
  const selectedMachine=machines.find(m=>m.id===filters.machine_id)||null;
  const selectedDepartment=departments.find(d=>d.id===filters.department_id)||null;
  const selectedGroup=groups.find(g=>g.id===filters.group_id)||null;
  const s=data?.summary||{};
  const trendRows=rangeDays(filters.from,filters.to)>75?(data?.monthly_trend||[]):(data?.daily_trend||[]);
  const trendDateKey=rangeDays(filters.from,filters.to)>75?"period_month":"period_date";
  const historyMonthly=(data?.history_monthly_trend||[]).slice(-6);
  const pmSummary=useMemo(()=>({total:pmData.length,done:pmData.filter(x=>x.status==="completed").length,issue:pmData.filter(x=>x.overall_result==="issue").length,corrected:pmData.filter(x=>x.overall_result==="corrected").length,normal:pmData.filter(x=>x.overall_result==="normal").length}),[pmData]);
  const groupRows=useMemo(()=>{
    const ranking=data?.machine_ranking||[];
    const machineById=new Map(machines.map(m=>[m.id,m]));
    const groupById=new Map(groups.map(g=>[g.id,g]));
    const deptById=new Map(departments.map(d=>[d.id,d]));
    const buckets=new Map();
    ranking.forEach(r=>{
      const m=machineById.get(r.machine_id);
      if(!m)return;
      const gid=m.machine_group_id;
      const key=gid?`g:${gid}`:`m:${m.id}`;
      if(!buckets.has(key))buckets.set(key,{key,group_id:gid||"",machine_id:gid?"":m.id,members:[],isMachine:!gid});
      buckets.get(key).members.push({r,m});
    });
    return [...buckets.values()].map(b=>{
      const group=b.group_id?groupById.get(b.group_id):null;
      const down=b.members.reduce((a,x)=>a+num(x.r.downtime_min),0);
      const br=b.members.reduce((a,x)=>a+num(x.r.breakdown_count),0);
      const av=b.members.length?b.members.reduce((a,x)=>a+num(x.r.availability_pct,100),0)/b.members.length:100;
      const types=[...new Set(b.members.map(x=>x.m.machine_name).filter(Boolean))];
      const first=b.members[0]?.m;
      const dept=deptById.get(first?.department_id);
      return {
        ...b,
        title:group?.group_name||first?.machine_no||"ไม่ระบุกลุ่ม",
        subtitle:group?(types.length===1?types[0]:`${b.members.length} เครื่อง`):(first?.machine_name||"เครื่องจักร"),
        department:dept?.dept_code||"",
        machine_count:b.members.length,breakdown_count:br,downtime_min:down,mttr_min:br?down/br:0,availability_pct:av
      };
    }).sort((a,b)=>num(b.availability_pct)-num(a.availability_pct)||num(b.downtime_min)-num(a.downtime_min));
  },[data,machines,groups,departments]);

  function setPreset(name){
    const t=todayISO();let from=startOfMonth(t),to=t;
    if(name==="7d")from=addDaysISO(t,-6);
    if(name==="30d")from=addDaysISO(t,-29);
    if(name==="3m")from=minusMonths(t,2);
    if(name==="6m")from=minusMonths(t,5);
    if(name==="year")from=startOfYear(t);
    setFilters(f=>({...f,from,to}));
  }
  function chooseDepartment(v){setFilters(f=>({...f,department_id:v,group_id:"",machine_id:""}));setMachineSearch("")}
  function chooseGroup(v){setFilters(f=>({...f,group_id:v,machine_id:""}));setMachineSearch("")}
  function focusMachine(id){const m=machines.find(x=>x.id===id);if(!m)return;setFilters(f=>({...f,department_id:m.department_id,group_id:m.machine_group_id||"",machine_id:id}));setMachineSearch("");window.scrollTo({top:0,behavior:"smooth"})}
  function resetScope(){setFilters(f=>({...f,department_id:"",group_id:"",machine_id:""}));setMachineSearch("")}

  if(mastersLoading&&!data)return <Loading text="กำลังเตรียมข้อมูล KPI…"/>;
  if(error&&!data)return <ErrorState message={error} onRetry={load}/>;

  function selectPerformanceRow(row){
    if(row.group_id){chooseGroup(row.group_id);window.scrollTo({top:0,behavior:"smooth"});return}
    if(row.machine_id)focusMachine(row.machine_id);
  }

  const affectedPct=num(s.active_machines)?num(s.affected_machines)/num(s.active_machines)*100:0;

  return <div className="stack kpi-page-v3">
    <section className="kpi-clean-head">
      <div className="kpi-clean-title"><div className="kpi-clean-title-icon"><Icon name="kpi" size={27}/></div><div><h1>KPI ภาพรวมประสิทธิภาพเครื่องจักร</h1><p>ดูสถานะเครื่องจักรที่สำคัญได้ในหน้าเดียว และเจาะรายละเอียดเพิ่มเมื่อจำเป็น</p></div></div>
      <button className="btn ghost kpi-refresh" onClick={load} disabled={loading}><Icon name="refresh" size={17}/>{loading?"กำลังโหลด…":"รีเฟรชข้อมูล"}</button>
    </section>

    <section className="kpi-clean-filter">
      <div className="kpi-filter-item date-range"><label><Icon name="calendar" size={17}/> ช่วงวันที่</label><div className="date-range-fields"><input type="date" value={filters.from} max={filters.to} onChange={e=>setFilters(f=>({...f,from:e.target.value}))}/><span>–</span><input type="date" value={filters.to} min={filters.from} onChange={e=>setFilters(f=>({...f,to:e.target.value}))}/></div></div>
      <div className="kpi-filter-item"><label>แผนก / ไลน์</label><select value={filters.department_id} onChange={e=>chooseDepartment(e.target.value)}><option value="">ทั้งหมด</option>{departments.map(d=><option key={d.id} value={d.id}>{d.dept_code} · {d.dept_name}</option>)}</select></div>
      <div className="kpi-filter-item"><label>กลุ่มเครื่องจักร</label><SearchSelect value={filters.group_id} onChange={chooseGroup} placeholder="ทั้งหมด" searchPlaceholder="ค้นหากลุ่มเครื่องจักร…" options={[{value:"",label:"ทั้งหมด",sub:`${visibleMachines.length} เครื่อง`},...visibleGroups.map(g=>({value:g.id,label:g.group_name,sub:`${machines.filter(m=>m.machine_group_id===g.id).length} เครื่อง`}))]}/></div>
      <div className="kpi-filter-actions"><button type="button" onClick={()=>setPreset("month")}>เดือนนี้</button><button type="button" onClick={()=>setPreset("30d")}>30 วัน</button><button type="button" onClick={()=>setPreset("year")}>ปีนี้</button>{filters.machine_id?<button type="button" className="clear" onClick={resetScope}>ล้างเครื่องที่เลือก</button>:null}</div>
    </section>

    {selectedMachine?<div className="kpi-selected-machine"><div><Icon name="machine" size={19}/><span>กำลังดูเครื่อง</span><b>{selectedMachine.machine_no}</b><em>{selectedMachine.machine_name}</em></div><button type="button" onClick={()=>setFilters(f=>({...f,machine_id:""}))}>กลับไปดูกลุ่ม</button></div>:null}
    {error?<div className="card flat error-inline">{error}</div>:null}

    <section className="pro-kpi-primary-grid">
      <ProPrimaryCard metric="mtbf" icon="machine" tone="blue" label="MTBF" value={fmt(s.mtbf_hour,1)} unit="ชม." description="Mean Time Between Failures" target={nullableNum(s.target_mtbf_hr)!==null?`${fmt(s.target_mtbf_hr,1)} ชม.`:null}/>
      <ProPrimaryCard metric="mttr" icon="repair" tone="purple" label="MTTR" value={fmt(s.mttr_min,1)} unit="นาที" description="Mean Time To Repair" target={nullableNum(s.target_mttr_min)!==null?`${fmt(s.target_mttr_min,1)} นาที`:null}/>
      <ProPrimaryCard metric="availability" icon="kpi" tone="green" label="Availability" value={fmt(s.availability_pct,2)} unit="%" description="Machine Availability" target={nullableNum(s.target_availability)!==null?`${fmt(s.target_availability,1)}%`:null}/>
    </section>

    <section className="pro-support-grid pro-support-grid-4">
      <ProSupportMetric icon="clock" tone="orange" label="Loss Time รวม" value={fmt(s.downtime_min)} unit=" นาที" sub="รวมเวลาสูญเสียจาก Breakdown"/>
      <ProSupportMetric icon="repair" tone="amber" label="Downtime / ครั้ง" value={num(s.breakdown_count)>0?fmt(num(s.downtime_min)/num(s.breakdown_count),1):'—'} unit={num(s.breakdown_count)>0?" นาที":""} sub={`สูงสุด ${fmt(s.max_downtime_min)} นาที/ครั้ง`}/>
      <ProSupportMetric icon="alert" tone="red" label="Breakdown" value={fmt(s.breakdown_count)} unit=" ครั้ง" sub={`${fmt(s.affected_machines)} เครื่องได้รับผลกระทบ`}/>
      <ProSupportMetric icon="machine" tone="slate" label="เครื่องในขอบเขต" value={fmt(s.active_machines)} unit=" เครื่อง" sub={`Affected ${affectedPct.toFixed(1)}%`}/>
    </section>

    <div className="pro-main-grid">
      <ProTrendPanel rows={historyMonthly} summary={s}/>
      <ProCurrentMonth rows={historyMonthly} summary={s}/>
    </div>

    <ProMatrix rows={historyMonthly} summary={s}/>

    <details className="kpi-more-analysis">
      <summary><span><Icon name="dashboard" size={19}/><b>การวิเคราะห์เพิ่มเติม</b><em>กราฟ, Pareto, Machine Health, PM/TPM และรายการ Breakdown ล่าสุด</em></span><Icon name="chevron" size={20}/></summary>
      <div className="kpi-more-body">
        <div className="kpi-deep-filter"><div><b>ขอบเขตปัจจุบัน</b><span>{selectedDepartment?selectedDepartment.dept_code:"ทุกแผนก"} › {selectedGroup?.group_name||"ทุกกลุ่ม"} › {selectedMachine?.machine_no||"ทุกเครื่อง"}</span></div><div>{formatThaiDate(filters.from)} – {formatThaiDate(filters.to)}</div></div>
        <Section icon="kpi" title="Insight ที่ควรสนใจ" sub="สรุปจุดสำคัญจากขอบเขตที่เลือก"><InsightPanel data={data} selectedMachine={selectedMachine}/></Section>
        <div className="kpi-chart-grid">
          <Section icon="kpi" title="แนวโน้ม Downtime" sub={rangeDays(filters.from,filters.to)>75?"สรุปรายเดือน":"สรุปรายวัน"}><TrendLine rows={trendRows} dateKey={trendDateKey}/></Section>
          <Section icon="alert" title="แนวโน้มจำนวนครั้งเสีย" sub={rangeDays(filters.from,filters.to)>75?"Breakdown รายเดือน":"Breakdown รายวัน"}><TrendBars rows={trendRows} dateKey={trendDateKey}/></Section>
        </div>
        <div className="grid grid-3 kpi-analysis-grid">
          <Section icon="alert" title="Pareto ปัญหาซ้ำ" sub="ปัญหาที่เกิดบ่อยที่สุด"><RankBars rows={data?.problem_pareto||[]} valueKey="occurrences" secondaryKey="downtime_min" suffix=" ครั้ง"/></Section>
          <Section icon="machine" title="จุดเสียที่กินเวลา" sub="ตำแหน่งที่สร้าง Downtime สูง"><RankBars rows={data?.point_pareto||[]} valueKey="downtime_min" secondaryKey="occurrences"/></Section>
          <Section icon="repair" title="สาเหตุเสียสูงสุด" sub="เรียงตาม Downtime"><RankBars rows={data?.causes||[]} valueKey="downtime_min" secondaryKey="occurrences"/></Section>
        </div>
        <div className="grid grid-3 kpi-analysis-grid">
          <Section icon="report" title="ประเภทปัญหา" sub="Electrical / Mechanical / Air และประเภทอื่น"><Distribution rows={data?.problem_types||[]} kind="type"/></Section>
          <Section icon="alert" title="ระดับความรุนแรง" sub="สัดส่วนงานเสียแต่ละระดับ"><Distribution rows={data?.severity||[]} kind="severity"/></Section>
          <Section icon="repair" title="ผลหลังซ่อม" sub="ปกติ / ต้องติดตาม / ไม่มีอะไหล่"><Distribution rows={data?.status||[]} kind="status"/></Section>
        </div>
        <Section icon="machine" title="Machine Health — KPI รายหมายเลขเครื่อง" sub="ค้นหาและกดดูเฉพาะเครื่องได้"><MachineHealth rows={data?.machine_ranking||[]} target={s.target_availability} search={machineSearch} setSearch={setMachineSearch} onSelect={focusMachine}/></Section>
        <div className="grid grid-3 kpi-analysis-grid">
          <Section icon="clock" title="Breakdown ตามกะ" sub="ดูว่ากะไหนเกิดงานเสียและ Downtime มาก"><Distribution rows={data?.shifts||[]} kind="shift"/></Section>
          <Section icon="repair" title="วิธีแก้ที่ใช้บ่อย" sub="Action ที่ถูกบันทึกในช่วงที่เลือก"><RankBars rows={data?.actions||[]} valueKey="occurrences" secondaryKey="downtime_min" suffix=" ครั้ง" limit={10}/></Section>
          <Section icon="team" title="ภาระงานช่าง" sub="จำนวนงานที่ช่างรับผิดชอบ"><div className="tech-ranking">{!(data?.technicians||[]).length?<Empty title="ยังไม่มีข้อมูลช่าง"/>:(data.technicians||[]).map((r,i)=><div className="tech-rank-row" key={`${r.technician_code}-${i}`}><div className="tech-rank-no">{i+1}</div><div><b>{r.technician_name}</b><span className="mono">{r.technician_code}</span></div><div><b>{num(r.repair_count)} งาน</b><span>Downtime {num(r.downtime_min)} นาที · เฉลี่ย {num(r.avg_repair_min).toFixed(1)} นาที</span></div></div>)}</div></Section>
        </div>
        <Section icon="pm" title="PM / TPM Performance" sub="ดูผล PM ในช่วงเดียวกับ KPI"><div className="pm-kpi-grid"><div><span>แผนทั้งหมด</span><b>{pmSummary.total}</b></div><div><span>เสร็จแล้ว</span><b>{pmSummary.done}</b></div><div><span>ปกติ</span><b>{pmSummary.normal}</b></div><div><span>แก้ไขแล้ว</span><b>{pmSummary.corrected}</b></div><div className={pmSummary.issue?"pm-issue":""}><span>พบปัญหา</span><b>{pmSummary.issue}</b></div></div>{!pmData.length?<Empty title="ไม่มี PM ในช่วงที่เลือก"/>:<div className="table-wrap pm-kpi-table"><table className="table"><thead><tr><th>วันที่</th><th>เครื่อง</th><th>แผน PM</th><th>สถานะ</th><th>ผลรวม</th><th>เสร็จเมื่อ</th></tr></thead><tbody>{pmData.slice(0,40).map(r=><tr key={r.id}><td>{formatThaiDate(r.due_date)}</td><td><b className="mono">{r.machine_no_snapshot||"-"}</b><br/>{r.machine_name_snapshot||"-"}</td><td>{r.plan_title_snapshot||"-"}</td><td>{PM_STATUS[r.status]||r.status||"-"}</td><td><Badge value={r.overall_result}>{PM_LABEL[r.overall_result]||r.overall_result||"-"}</Badge></td><td>{r.completed_at?formatThaiDateTime(r.completed_at):"-"}</td></tr>)}</tbody></table></div>}</Section>
        <Section icon="report" title="รายการ Breakdown ล่าสุด" sub="ใช้ไล่ย้อนดูเหตุการณ์ที่ทำให้ KPI เปลี่ยน"><div className="table-wrap"><table className="table kpi-recent-table"><thead><tr><th>เวลา</th><th>เครื่อง</th><th>อาการ</th><th>สาเหตุ</th><th>Downtime</th><th>ช่าง</th><th>ผลหลังซ่อม</th></tr></thead><tbody>{!(data?.recent||[]).length?<tr><td colSpan="7"><Empty title="ไม่มี Breakdown ในช่วงที่เลือก"/></td></tr>:(data.recent||[]).map(r=><tr key={r.id}><td>{formatThaiDateTime(r.started_at)}</td><td><b className="mono">{r.machine_no_snapshot}</b><br/>{r.machine_name_snapshot}</td><td>{r.symptom}</td><td>{r.cause}</td><td><b className="mono">{num(r.loss_time_min)} m</b></td><td>{r.technician_name_snapshot}<br/><span className="mono muted-xs">{r.technician_code_snapshot||"-"}</span></td><td>{statusText(r.status)}</td></tr>)}</tbody></table></div></Section>
      </div>
    </details>
  </div>
}
