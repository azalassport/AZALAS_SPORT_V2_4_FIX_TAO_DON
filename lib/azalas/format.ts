export const money=(n:number|string|null|undefined)=>`${Number(n||0).toLocaleString("vi-VN",{maximumFractionDigits:0})} đ`;
export const dt=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
// Ngay hien thi dd/MM/yyyy. CHI dung cho nhan/ngay in, khong dung lam gia tri input type=date hay SQL.
export const day=(iso:string|null|undefined)=>{
  if(!iso)return "—";
  const dateOnly=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if(dateOnly)return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date=new Date(iso);
  if(Number.isNaN(date.getTime()))return "—";
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(date);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value||"";
  return `${part("day")}/${part("month")}/${part("year")}`;
};
export const monthVN=(iso:string|null|undefined)=>{
  if(!iso)return "—";
  const parts=/^(\d{4})-(\d{2})/.exec(iso);
  return parts?`${parts[2]}/${parts[1]}`:"—";
};
export const norm=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();
export const vnToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export function errorText(e:unknown){return e instanceof Error?e.message:typeof e==="object"&&e!==null&&"message" in e?String((e as {message:unknown}).message):String(e)}
