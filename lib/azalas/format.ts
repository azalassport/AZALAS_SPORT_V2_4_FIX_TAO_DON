export const money=(n:number|string|null|undefined)=>`${Number(n||0).toLocaleString("vi-VN",{maximumFractionDigits:0})} đ`;
export const dt=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
export const day=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—";
export const norm=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();
export const vnToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export function errorText(e:unknown){return e instanceof Error?e.message:typeof e==="object"&&e!==null&&"message" in e?String((e as {message:unknown}).message):String(e)}
