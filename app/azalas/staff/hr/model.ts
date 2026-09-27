export type Employee={id:number;full_name:string;phone:string|null;position:string|null;start_date:string|null;base_salary:number;is_active:boolean};
export type Monthly={id:number;employee_id:number;month_start:string;work_units:number;overtime_hours:number;bonus:number;updated_at:string};
export type Rate={id:number;employee_id:number;effective_date:string;daily_rate:number;overtime_rate:number;created_at:string};
export type Advance={id:number;employee_id:number;advance_date:string;amount:number;note:string|null;deleted_at:string|null;updated_at:string};
export type Audit={id:number;employee_id:number|null;action:string;details:Record<string,unknown>;created_at:string};
export type Profile={id:string;display_name:string;phone:string|null;role:"OWNER"|"ADMIN"|"MEMBER";is_active:boolean};
export type HrData={employees:Employee[];monthly:Monthly[];rates:Rate[];advances:Advance[];audit:Audit[];profiles:Profile[]};
export const monthToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit"}).format(new Date());
export const validDecimal=(s:string)=>/^\d+(?:[.,]\d{1,2})?$/.test(s.trim());
export const decimal=(s:string)=>Number(s.replace(",","."));
export function effectiveRate(rates:Rate[],employeeId:number,month:string){const cutoff=month+"-31";return rates.filter(r=>r.employee_id===employeeId&&r.effective_date<=cutoff).sort((a,b)=>b.effective_date.localeCompare(a.effective_date)||b.id-a.id)[0]||null}
export function employeePay(monthly:Monthly[],rates:Rate[],advances:Advance[],employeeId:number,from:string,to:string){
 const periods=monthly.filter(c=>c.employee_id===employeeId&&c.month_start.slice(0,7)>=from&&c.month_start.slice(0,7)<=to).sort((a,b)=>a.month_start.localeCompare(b.month_start));
 const rows=periods.map(c=>{const rate=effectiveRate(rates,employeeId,c.month_start.slice(0,7));const pay=Number(c.work_units)*Number(rate?.daily_rate||0)+Number(c.overtime_hours)*Number(rate?.overtime_rate||0)+Number(c.bonus);return {...c,rate:rate?.daily_rate||0,overtimeRate:rate?.overtime_rate||0,pay}});
 const adv=advances.filter(a=>a.employee_id===employeeId&&!a.deleted_at&&a.advance_date.slice(0,7)>=from&&a.advance_date.slice(0,7)<=to);
 const total=rows.reduce((s,r)=>s+r.pay,0),advanced=adv.reduce((s,a)=>s+Number(a.amount),0);
 return {rows,adv,total,advanced,remaining:total-advanced,units:rows.reduce((s,r)=>s+Number(r.work_units),0)};
}
