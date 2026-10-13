"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Boxes,HandCoins,Layers3,Link2,Palette,Printer,ReceiptText,Tag,WalletCards} from "lucide-react";
import {createClient} from "@/lib/supabase/client";
import {uploadR2File} from "@/lib/azalas/media-client";
import {money,norm,vnToday} from "@/lib/azalas/format";
import {Loading,Msg} from "@/components/ui";

type Category="DAY_KEO"|"THEU"|"IN"|"VAI";
type PrintBook="NHAT"|"TUNG";
type EntryKind="NORMAL"|"MONTHLY_CLOSE"|"RETURN";
type PaymentKind="PAYMENT"|"ADVANCE";

type Partner={id:number;name:string;category:string;phone:string|null};
type Entry={
  id:number;partner_id:number|null;entry_date:string;item_name:string;quantity:number;unit:string;
  unit_price:number;total:number;note:string|null;entry_kind:EntryKind;tree_count:number|null;
  raw_quantity:number|null;depreciation:number|null;transport_fee:number|null;document_path:string|null;
};
type Payment={
  id:number;partner_id:number;paid_at:string;method:string;amount:number;note:string|null;
  month_key:string|null;payment_kind:PaymentKind;
};
type PriceRow={id:number;category:string;item_name:string;unit_price:number;effective_date:string};
type DayKeoLine={id:string;name:string;quantity:string;price:string};

type MonthlyStat={
  month:string;total:number;advance:number;paid:number;debt:number;credit:number;
  entries:Entry[];payments:Payment[];
};

type FabricKind="IMPORT"|"RETURN"|"PAYMENT";
type FabricRow={
  id:string;kind:FabricKind;date:string;unit:"Kg"|"Mét";item_name:string;tree_count:string;
  raw_quantity:string;depreciation_enabled:boolean;unit_price:string;transport_fee:string;note:string;amount:string;
};

type MoneyDialogState={open:boolean;kind:PaymentKind;month:string;amount:string;date:string;note:string;max:number};

const fmtQty=(v:number)=>Number(v||0).toLocaleString("vi-VN",{maximumFractionDigits:3});
const monthLabel=(m:string)=>{const [y,mo]=m.split("-");return y&&mo?`Tháng ${mo}/${y}`:m};
const dmy=(s:string)=>{if(!s)return "";const [y,m,d]=s.slice(0,10).split("-");return y&&m&&d?`${d}/${m}/${y}`:s};
const uid=()=>`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const safeFile=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-");
const parseDayKeoPrice=(raw:string|number)=>{
  const text=String(raw??"").trim().replace(/\s+/g,"").replace(",",".");
  if(!text)return Number.NaN;
  const n=Number(text);
  if(!Number.isFinite(n)||n<0)return Number.NaN;
  return Math.round(n>0&&n<100?n*1000:n);
};
const normalizeDayKeoStoredPrice=(raw:number)=>{
  const n=Number(raw||0);
  return Math.round(n>0&&n<100?n*1000:n);
};
const dayKeoShortPrice=(raw:number)=>{
  const actual=normalizeDayKeoStoredPrice(raw);
  if(!actual)return "";
  return (actual/1000).toLocaleString("vi-VN",{maximumFractionDigits:3});
};
const previousDay=(iso:string)=>{
  const d=new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate()-1);
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const newDayKeoLine=():DayKeoLine=>({id:uid(),name:"",quantity:"",price:""});

function newFabricRow(kind:FabricKind="IMPORT"):FabricRow{
  return {id:uid(),kind,date:vnToday(),unit:"Kg",item_name:"",tree_count:"",raw_quantity:"",depreciation_enabled:true,unit_price:"",transport_fee:"",note:"",amount:""};
}

export default function MaterialLedger({category,title,book}:{category:Category;title:string;book?:PrintBook}){
  const sb=useMemo(()=>createClient(),[]);
  const [tab,setTab]=useState(category==="DAY_KEO"?"ENTRIES":category==="VAI"?"FABRIC":"CLOSE");
  const [partners,setPartners]=useState<Partner[]>([]);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [payments,setPayments]=useState<Payment[]>([]);
  const [prices,setPrices]=useState<PriceRow[]>([]);
  const [partner,setPartner]=useState(0);
  const [newPartner,setNewPartner]=useState({name:"",phone:""});
  const [month,setMonth]=useState(vnToday().slice(0,7));
  const [query,setQuery]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");
  const [ok,setOk]=useState("");

  const [dayDate,setDayDate]=useState(vnToday());
  const [dayLines,setDayLines]=useState<DayKeoLine[]>([newDayKeoLine()]);
  const [priceForm,setPriceForm]=useState({name:"",price:"",date:vnToday()});
  const [closeForm,setCloseForm]=useState({month:vnToday().slice(0,7),amount:"",note:"",file:null as File|null});
  const [moneyDialog,setMoneyDialog]=useState<MoneyDialogState>({open:false,kind:"PAYMENT",month:"",amount:"",date:vnToday(),note:"",max:0});
  const [fabricRows,setFabricRows]=useState<FabricRow[]>([newFabricRow()]);
  const [fabricPreview,setFabricPreview]=useState(false);
  const [fabricCopiedSignature,setFabricCopiedSignature]=useState("");
  const [fabricInvoiceBlob,setFabricInvoiceBlob]=useState<Blob|null>(null);
  const invoiceRef=useRef<HTMLDivElement|null>(null);

  const fixedPartnerName=category==="DAY_KEO"?"DÂY KÉO":category==="THEU"?"THÊU":category==="IN"?(book==="TUNG"?"TÙNG - IN":"NHẬT - IN"):"";
  const fixedPartner=partners.find(p=>norm(p.name)===norm(fixedPartnerName));

  const load=useCallback(async()=>{
    setLoading(true);setErr("");
    const pricePromise=category==="DAY_KEO"
      ? sb.from("supply_price_history").select("id,category,item_name,unit_price,effective_date").eq("category","DAY_KEO").order("effective_date",{ascending:false}).order("id",{ascending:false}).limit(500)
      : Promise.resolve({data:[] as PriceRow[],error:null});
    const [{data:p,error:pe},{data:e,error:ee},{data:tt,error:te},{data:pr,error:pre}]=await Promise.all([
      sb.from("supply_partners").select("id,name,category,phone").eq("category",category).order("name"),
      sb.from("supply_entries").select("id,partner_id,entry_date,item_name,quantity,unit,unit_price,total,note,entry_kind,tree_count,raw_quantity,depreciation,transport_fee,document_path").eq("category",category).is("deleted_at",null).order("entry_date",{ascending:false}).order("id",{ascending:false}).limit(1200),
      sb.from("supply_payments").select("id,partner_id,paid_at,method,amount,note,month_key,payment_kind").order("paid_at",{ascending:false}).order("id",{ascending:false}).limit(1200),
      pricePromise
    ]);
    if(pe||ee||te||pre)setErr(pe?.message||ee?.message||te?.message||pre?.message||"");
    const pp=(p||[]) as Partner[];
    setPartners(pp);setEntries((e||[]) as Entry[]);setPayments((tt||[]) as Payment[]);setPrices((pr||[]) as PriceRow[]);
    if(category==="VAI"&&!partner&&pp.length)setPartner(pp[0].id);
    setLoading(false);
  },[sb,category,partner]);

  useEffect(()=>{void load()},[load]);

  const scopedEntries=useMemo(()=>{
    if(category!=="IN")return entries;
    if(!fixedPartner)return [];
    return entries.filter(e=>e.partner_id===fixedPartner.id);
  },[entries,category,fixedPartner]);

  const categoryPartnerIds=useMemo(()=>new Set(partners.map(p=>p.id)),[partners]);
  const scopedPayments=useMemo(()=>{
    if(category==="IN")return fixedPartner?payments.filter(p=>p.partner_id===fixedPartner.id):[];
    if(category==="DAY_KEO"||category==="THEU")return fixedPartner?payments.filter(p=>p.partner_id===fixedPartner.id):[];
    return payments.filter(p=>categoryPartnerIds.has(p.partner_id));
  },[payments,category,fixedPartner,categoryPartnerIds]);

  const monthlyStats=useMemo<MonthlyStat[]>(()=>{
    if(category==="VAI")return [];
    const map=new Map<string,MonthlyStat>();
    const ensure=(m:string)=>{if(!map.has(m))map.set(m,{month:m,total:0,advance:0,paid:0,debt:0,credit:0,entries:[],payments:[]});return map.get(m)!};
    scopedEntries.forEach(e=>{
      const m=e.entry_date?.slice(0,7);if(!m)return;
      const s=ensure(m);const entryTotal=category==="DAY_KEO"?Number(e.quantity||0)*normalizeDayKeoStoredPrice(Number(e.unit_price||0)):Number(e.total||0)+Number(e.transport_fee||0);s.total+=entryTotal;s.entries.push(e);
    });
    scopedPayments.forEach(p=>{
      const m=p.month_key||p.paid_at?.slice(0,7);if(!m)return;
      const s=ensure(m);if(p.payment_kind==="ADVANCE")s.advance+=Number(p.amount||0);else s.paid+=Number(p.amount||0);s.payments.push(p);
    });
    return [...map.values()].map(s=>{const bal=s.total-s.advance-s.paid;s.debt=Math.max(0,bal);s.credit=Math.max(0,-bal);return s}).sort((a,b)=>b.month.localeCompare(a.month));
  },[category,scopedEntries,scopedPayments]);

  const totalDebt=monthlyStats.reduce((s,x)=>s+x.debt,0);
  const totalCredit=monthlyStats.reduce((s,x)=>s+x.credit,0);

  function currentPrice(name:string,date:string){
    const rows=prices.filter(p=>norm(p.item_name)===norm(name)&&p.effective_date<=date).sort((a,b)=>b.effective_date.localeCompare(a.effective_date)||b.id-a.id);
    return normalizeDayKeoStoredPrice(Number(rows[0]?.unit_price??0));
  }
  function patchDayLine(id:string,patch:Partial<DayKeoLine>){setDayLines(rows=>rows.map(r=>r.id===id?{...r,...patch}:r))}
  function changeDayName(id:string,name:string){const p=currentPrice(name,dayDate);patchDayLine(id,{name,price:p?dayKeoShortPrice(p):""})}
  function changeDayDate(date:string){
    setDayDate(date);
    setDayLines(rows=>rows.map(r=>{const p=currentPrice(r.name,date);return p?{...r,price:dayKeoShortPrice(p)}:r}));
  }

  async function saveDayEntries(){
    setErr("");setOk("");
    if(!fixedPartner)return setErr("Chưa có sổ Dây kéo. Hãy chạy SQL 32 trước.");
    if(!dayDate)return setErr("Ngày nhập hàng không hợp lệ");
    if(!dayLines.length)return setErr("Cần ít nhất một dòng Dây kéo");
    const parsed=dayLines.map(r=>({...r,unitPrice:parseDayKeoPrice(r.price),qty:Number(r.quantity)}));
    const invalid=parsed.find(r=>!r.name.trim()||r.qty<=0||!Number.isFinite(r.unitPrice)||r.unitPrice<0);
    if(invalid)return setErr("Kiểm tra Tên Dây Kéo, SL và Giá ở tất cả các dòng");
    const {data:{user}}=await sb.auth.getUser();setBusy(true);
    const payload=parsed.map(r=>({partner_id:fixedPartner.id,category:"DAY_KEO",entry_date:dayDate,item_name:r.name.trim(),quantity:r.qty,unit:"sợi",unit_price:r.unitPrice,entry_kind:"NORMAL",created_by:user?.id}));
    const {error}=await sb.from("supply_entries").insert(payload);
    setBusy(false);if(error)return setErr(error.message);
    setDayDate(vnToday());setDayLines([newDayKeoLine()]);setOk(`Đã ghi nhận ${payload.length} dòng Dây kéo.`);await load();
  }

  async function savePrice(){
    setErr("");setOk("");
    const unitPrice=parseDayKeoPrice(priceForm.price);
    if(!priceForm.name.trim()||!Number.isFinite(unitPrice)||unitPrice<0||!priceForm.date)return setErr("Tên dây kéo, giá hoặc ngày áp dụng không hợp lệ");
    setBusy(true);
    const {data,error}=await sb.rpc("az_supply_set_daykeo_price",{p_item_name:priceForm.name.trim(),p_unit_price:unitPrice,p_effective_date:priceForm.date});
    setBusy(false);if(error)return setErr(error.message);
    const recalculated=Number((data as {recalculated?:number}|null)?.recalculated||0);
    setPriceForm({name:"",price:"",date:vnToday()});
    setOk(recalculated?`Đã lưu giá Dây kéo và tính lại ${recalculated} dòng nhập theo ngày hiệu lực.`:"Đã lưu giá Dây kéo.");
    await load();
  }

  async function uploadClosePdf(file:File){
    return uploadR2File(file,"supply");
  }

  async function saveMonthlyClose(){
    setErr("");setOk("");
    if(!fixedPartner)return setErr(`Chưa có sổ ${title}. Hãy chạy SQL 32 trước.`);
    const amount=Number(closeForm.amount);if(!closeForm.month||amount<=0)return setErr("Tháng hoặc số tiền không hợp lệ");
    if(category==="IN"&&closeForm.file&&closeForm.file.type!=="application/pdf")return setErr("File đối chiếu phải là PDF");
    setBusy(true);let documentPath:string|null=null;
    try{
      if(category==="IN"&&closeForm.file)documentPath=await uploadClosePdf(closeForm.file);
      const {data:{user}}=await sb.auth.getUser();
      const {error}=await sb.from("supply_entries").insert({partner_id:fixedPartner.id,category,entry_date:`${closeForm.month}-01`,item_name:"Chốt tháng",quantity:1,unit:"tháng",unit_price:amount,note:category==="IN"?(closeForm.note.trim()||null):null,entry_kind:"MONTHLY_CLOSE",document_path:documentPath,created_by:user?.id});
      if(error)throw error;
      setCloseForm({month:vnToday().slice(0,7),amount:"",note:"",file:null});setOk(`Đã chốt ${title}.`);await load();
    }catch(e){// Keep any orphaned R2 object on failed save; never delete an already-linked document.setErr(e instanceof Error?e.message:String(e));}
    finally{setBusy(false)}
  }

  function openMoney(kind:PaymentKind,monthKey:string,max=0){
    setMoneyDialog({open:true,kind,month:monthKey,amount:"",date:vnToday(),note:kind==="ADVANCE"?`Ứng trước ${monthLabel(monthKey)}`:`Thanh toán ${monthLabel(monthKey)}`,max});
  }

  async function saveMonthlyMoney(){
    if(!fixedPartner)return setErr(`Chưa có sổ ${title}. Hãy chạy SQL 32 trước.`);
    const amount=Number(moneyDialog.amount);if(amount<=0||!moneyDialog.month||!moneyDialog.date)return setErr("Ngày, tháng hoặc số tiền không hợp lệ");
    if(moneyDialog.kind==="PAYMENT"&&moneyDialog.max>0&&amount>moneyDialog.max)return setErr("Số tiền thanh toán vượt số còn nợ của tháng này");
    const {data:{user}}=await sb.auth.getUser();setBusy(true);
    const {error}=await sb.from("supply_payments").insert({partner_id:fixedPartner.id,paid_at:moneyDialog.date,method:"CHUYEN_KHOAN",amount,note:moneyDialog.note.trim()||null,month_key:moneyDialog.month,payment_kind:moneyDialog.kind,created_by:user?.id});
    setBusy(false);if(error)return setErr(error.message);
    setMoneyDialog(v=>({...v,open:false}));setOk(moneyDialog.kind==="ADVANCE"?"Đã ghi nhận ứng trước.":"Đã ghi nhận thanh toán.");await load();
  }

  async function openPdf(path:string|null){
    if(!path)return;
    if(path.startsWith("r2:")){
      const {data:{session}}=await sb.auth.getSession();
      if(!session)return setErr("Hết phiên đăng nhập");
      const endpoint=path.includes("/vai/")?"/api/azalas/fabric-files":"/api/azalas/media";
      const response=await fetch(endpoint+"?path="+encodeURIComponent(path),{
        headers:{Authorization:`Bearer ${session.access_token}`}
      });
      if(!response.ok){const result=await response.json().catch(()=>({error:"Không đọc được ảnh R2"}));return setErr(result.error||"Không đọc được ảnh R2")}
      const blob=await response.blob(),url=URL.createObjectURL(blob);
      window.open(url,"_blank","noopener,noreferrer");
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      return;
    }
    const {data,error}=await sb.storage.from("az-supply-documents").createSignedUrl(path,3600);
    if(error)return setErr(error.message);
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }

  function fabricCalc(r:FabricRow){
    const raw=Number(r.raw_quantity||0),trees=Number(r.tree_count||0),price=Number(r.unit_price||0),transport=Number(r.transport_fee||0);
    if(r.kind==="PAYMENT")return {depreciation:0,net:0,total:-Number(r.amount||0)};
    if(r.kind==="RETURN")return {depreciation:0,net:raw,total:-(raw*price)};
    const depreciation=r.unit==="Kg"&&r.depreciation_enabled?trees*0.3:0;const net=Math.max(0,raw-depreciation);return {depreciation,net,total:net*price+transport};
  }
  const fabricGrandTotal=fabricRows.reduce((s,r)=>s+fabricCalc(r).total,0);
  const fabricInvoiceSignature=useMemo(()=>JSON.stringify({partner,rows:fabricRows.map(r=>({
    kind:r.kind,date:r.date,unit:r.unit,item_name:r.item_name,tree_count:r.tree_count,raw_quantity:r.raw_quantity,
    depreciation_enabled:r.depreciation_enabled,unit_price:r.unit_price,transport_fee:r.transport_fee,note:r.note,amount:r.amount
  }))}),[partner,fabricRows]);
  const fabricInvoiceCopied=fabricCopiedSignature===fabricInvoiceSignature&&!!fabricCopiedSignature;
  function patchFabric(id:string,patch:Partial<FabricRow>){setFabricRows(rows=>rows.map(r=>r.id===id?{...r,...patch}:r))}
  function removeFabric(id:string){setFabricRows(rows=>rows.length===1?[newFabricRow()]:rows.filter(r=>r.id!==id))}
  function openFabricInvoice(){
    setErr("");setOk("");
    if(!partner)return setErr("Chọn Nhà Vải trước khi xem hóa đơn");
    if(!fabricRows.some(r=>r.kind==="PAYMENT"?Number(r.amount)>0:r.item_name.trim()&&Number(r.raw_quantity)>0))return setErr("Chưa có nội dung để xem hóa đơn");
    setFabricPreview(true);
  }

  async function saveFabric(){
    setErr("");setOk("");if(!partner)return setErr("Chọn Nhà Vải");
    if(!fabricInvoiceCopied||!fabricInvoiceBlob)return setErr("Cần XEM HÓA ĐƠN và COPY ẢNH đúng dữ liệu hiện tại trước khi LƯU NHẬP VẢI");
    const entryPayload:any[]=[];const payPayload:any[]=[];
    for(const r of fabricRows){
      if(r.kind==="PAYMENT"){
        const amount=Number(r.amount);if(amount<=0)continue;payPayload.push({paid_at:r.date,method:"CHUYEN_KHOAN",amount,note:r.note||null});continue;
      }
      const c=fabricCalc(r);if(!r.item_name.trim()||Number(r.raw_quantity)<=0||Number(r.unit_price)<0)return setErr("Kiểm tra Tên vải, số Kg/Mét và Đơn giá");
      entryPayload.push({entry_date:r.date,item_name:r.item_name.trim(),quantity:c.net,unit:r.unit,unit_price:Number(r.unit_price),note:r.note||null,entry_kind:r.kind==="RETURN"?"RETURN":"NORMAL",tree_count:Number(r.tree_count||0),raw_quantity:Number(r.raw_quantity),depreciation:c.depreciation,transport_fee:r.kind==="IMPORT"?Number(r.transport_fee||0):0});
    }
    if(!entryPayload.length&&!payPayload.length)return setErr("Chưa có nội dung để lưu");
    const {data:{user}}=await sb.auth.getUser();
    if(!user)return setErr("Không xác định được tài khoản đăng nhập");
    const documentPath=`${user.id}/vai/${Date.now()}-${crypto.randomUUID()}.png`;
    setBusy(true);
    let uploadedPath="";
    try{
      const form=new FormData();
      form.append("file",new File([fabricInvoiceBlob],"fabric-invoice.png",{type:"image/png"}));
      const {data:{session}}=await sb.auth.getSession();
      if(!session)throw new Error("Hết phiên đăng nhập");
      const response=await fetch("/api/azalas/fabric-files",{
        method:"POST",headers:{Authorization:`Bearer ${session.access_token}`},body:form
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Không lưu được ảnh lên R2");
      uploadedPath=String(result.path||"");
      if(!uploadedPath.startsWith("r2:"))throw new Error("R2 không trả về mã ảnh hợp lệ");
    }catch(e){
      setBusy(false);
      return setErr(`Không lưu được ảnh phiếu lên R2: ${e instanceof Error?e.message:String(e)}`);
    }
    const payloadWithImage=entryPayload.map(x=>({...x,document_path:uploadedPath}));
    const {error}=await sb.rpc("az_supply_save_fabric_batch",{p_partner_id:partner,p_entries:payloadWithImage,p_payments:payPayload});
    if(error){
      const {data:{session}}=await sb.auth.getSession();
      if(session)await fetch("/api/azalas/fabric-files",{
        method:"DELETE",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({path:uploadedPath})
      }).catch(()=>{});

      setBusy(false);return setErr(error.message);
    }
    setBusy(false);setFabricRows([newFabricRow()]);setFabricCopiedSignature("");setFabricInvoiceBlob(null);setFabricPreview(false);setOk("Đã lưu phiếu Vải và ảnh hóa đơn.");await load();
  }

  async function savePartner(){
    if(!newPartner.name.trim())return setErr("Cần nhập tên Nhà Vải");setBusy(true);
    const {data,error}=await sb.from("supply_partners").insert({name:newPartner.name.trim(),phone:newPartner.phone.trim()||null,category:"VAI"}).select("id").single();setBusy(false);
    if(error)return setErr(error.message);setNewPartner({name:"",phone:""});setPartner(data.id);setOk("Đã thêm Nhà Vải.");await load();
  }

  const fabricPartners=partners;
  const selectedFabricEntries=entries.filter(e=>e.partner_id===partner);
  const selectedFabricPayments=payments.filter(p=>p.partner_id===partner);
  const entryEffective=(e:Entry)=>e.entry_kind==="RETURN"?-Math.abs(Number(e.total||0)):Number(e.total||0)+Number(e.transport_fee||0);
  const fabricPartnerDebt=selectedFabricEntries.reduce((s,e)=>s+entryEffective(e),0)-selectedFabricPayments.reduce((s,p)=>s+Number(p.amount||0),0);
  const fabricTotalDebt=fabricPartners.reduce((sum,p)=>{
    const es=entries.filter(e=>e.partner_id===p.id).reduce((s,e)=>s+entryEffective(e),0);
    const ps=payments.filter(x=>x.partner_id===p.id).reduce((s,x)=>s+Number(x.amount||0),0);return sum+Math.max(0,es-ps);
  },0);

  async function saveFabricPayment(){
    if(!partner)return setErr("Chọn Nhà Vải");const amount=Number(moneyDialog.amount);if(amount<=0||!moneyDialog.date)return setErr("Ngày hoặc số tiền không hợp lệ");
    if(fabricPartnerDebt>0&&amount>fabricPartnerDebt)return setErr("Số tiền thanh toán vượt công nợ hiện tại");
    const {data:{user}}=await sb.auth.getUser();setBusy(true);
    const {error}=await sb.from("supply_payments").insert({partner_id:partner,paid_at:moneyDialog.date,method:"CHUYEN_KHOAN",amount,note:moneyDialog.note.trim()||null,payment_kind:"PAYMENT",month_key:null,created_by:user?.id});setBusy(false);
    if(error)return setErr(error.message);setMoneyDialog(v=>({...v,open:false}));setOk("Đã ghi nhận thanh toán Nhà Vải.");await load();
  }

  async function copyFabricInvoice(){
    if(!invoiceRef.current)return;
    setErr("");setOk("");
    try{
      const html2canvas=(await import("html2canvas")).default;
      const clone=invoiceRef.current.cloneNode(true) as HTMLDivElement;
      clone.style.position="fixed";clone.style.left="-10000px";clone.style.top="0";clone.style.width="1180px";clone.style.maxWidth="1180px";
      clone.style.background="#ffffff";clone.style.boxSizing="border-box";clone.style.borderRadius="0";clone.style.boxShadow="none";
      document.body.appendChild(clone);
      const canvas=await html2canvas(clone,{backgroundColor:"#ffffff",scale:3,useCORS:true,logging:false,windowWidth:1240});
      clone.remove();
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
      if(!blob)throw new Error("Không tạo được ảnh");
      if(navigator.clipboard&&"ClipboardItem" in window){
        await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);
        setFabricInvoiceBlob(blob);
        setFabricCopiedSignature(fabricInvoiceSignature);
        setOk("Đã copy ảnh hóa đơn Vải. Ảnh này sẽ được lưu cùng phiếu khi bấm LƯU NHẬP VẢI.");
      }else{
        const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`vai-${vnToday()}.png`;a.click();URL.revokeObjectURL(url);
        setErr("Trình duyệt không cho copy ảnh. Đã tải PNG nhưng cần COPY ẢNH thành công trước khi lưu.");
      }
    }catch(e){setErr(e instanceof Error?e.message:String(e))}
  }

  const tabs=category==="DAY_KEO"?[{value:"ENTRIES",label:"Nhập Hàng"},{value:"PRICES",label:"Giá & Danh Mục"},{value:"DEBT",label:"Công Nợ & Thanh Toán"}]
    :category==="VAI"?[{value:"FABRIC",label:"Nhập Vải"},{value:"DEBT",label:"Công Nợ & Thanh Toán"}]
    :[{value:"CLOSE",label:"Chốt Tháng"},{value:"DEBT",label:"Công Nợ & Thanh Toán"}];

  const uiMeta=category==="DAY_KEO"
    ?{
      Icon:Link2,
      kicker:"KHO / PHỤ LIỆU",
      subtitle:"Nhập hàng, quản lý giá và theo dõi công nợ dây kéo.",
      hero:"from-orange-50 via-white to-amber-50",
      iconBox:"bg-orange-100 text-orange-600",
      accent:"text-orange-600",
      tabActive:"border-orange-300 bg-orange-50 text-orange-700 shadow-[0_10px_24px_rgba(249,115,22,.12)]",
      glow:"bg-orange-200/40",
    }
    :category==="THEU"
    ?{
      Icon:Palette,
      kicker:"XƯỞNG / PHỤ LIỆU",
      subtitle:"Chốt tháng, ứng trước và quản lý thanh toán thêu.",
      hero:"from-blue-50 via-white to-cyan-50",
      iconBox:"bg-blue-100 text-blue-600",
      accent:"text-blue-600",
      tabActive:"border-blue-300 bg-blue-50 text-blue-700 shadow-[0_10px_24px_rgba(37,99,235,.12)]",
      glow:"bg-blue-200/40",
    }
    :category==="IN"
    ?{
      Icon:Printer,
      kicker:"XƯỞNG / IN ẤN",
      subtitle:book==="TUNG"
        ?"Sổ riêng Tùng - In, đối chiếu và quản lý công nợ."
        :"Sổ riêng Nhật - In, đối chiếu và quản lý công nợ.",
      hero:book==="TUNG"?"from-rose-50 via-white to-pink-50":"from-violet-50 via-white to-indigo-50",
      iconBox:book==="TUNG"?"bg-rose-100 text-rose-600":"bg-violet-100 text-violet-600",
      accent:book==="TUNG"?"text-rose-600":"text-violet-600",
      tabActive:book==="TUNG"
        ?"border-rose-300 bg-rose-50 text-rose-700 shadow-[0_10px_24px_rgba(244,63,94,.12)]"
        :"border-violet-300 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,.12)]",
      glow:book==="TUNG"?"bg-rose-200/40":"bg-violet-200/40",
    }
    :{
      Icon:Layers3,
      kicker:"KHO / VẢI",
      subtitle:"Nhập vải, hàng trả, thanh toán và theo dõi công nợ nhà vải.",
      hero:"from-emerald-50 via-white to-teal-50",
      iconBox:"bg-emerald-100 text-emerald-600",
      accent:"text-emerald-600",
      tabActive:"border-emerald-300 bg-emerald-50 text-emerald-700 shadow-[0_10px_24px_rgba(16,185,129,.12)]",
      glow:"bg-emerald-200/40",
    };

  const tabIcon=(value:string)=>{
    if(value==="ENTRIES"||value==="FABRIC")return Boxes;
    if(value==="PRICES")return Tag;
    if(value==="CLOSE")return ReceiptText;
    if(value==="DEBT")return WalletCards;
    return HandCoins;
  };

  const filteredDayEntries=scopedEntries.filter(e=>e.entry_date.startsWith(month)&&norm(e.item_name).includes(norm(query)));
  const priceGroups=useMemo(()=>{
    const groups=new Map<string,{name:string;rows:PriceRow[]}>();
    prices.forEach(p=>{
      const key=norm(p.item_name);
      if(!groups.has(key))groups.set(key,{name:p.item_name,rows:[]});
      const g=groups.get(key)!;
      if(!g.rows.some(x=>x.effective_date===p.effective_date))g.rows.push(p);
    });
    const today=vnToday();
    return [...groups.values()].map(g=>{
      const rows=[...g.rows].sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||a.id-b.id);
      const current=[...rows].filter(r=>r.effective_date<=today).pop()||null;
      const upcoming=rows.find(r=>r.effective_date>today)||null;
      return {...g,rows,current,upcoming};
    }).sort((a,b)=>a.name.localeCompare(b.name,"vi"));
  },[prices]);
  const latestPrices=useMemo(()=>priceGroups.map(g=>g.current||g.upcoming||g.rows[g.rows.length-1]).filter((x):x is PriceRow=>!!x),[priceGroups]);
  const dayGrandTotal=dayLines.reduce((sum,r)=>{const p=parseDayKeoPrice(r.price);return sum+Number(r.quantity||0)*(Number.isFinite(p)?p:0)},0);

  function renderMonthlyDebt(){
    const active=monthlyStats.filter(x=>x.debt>0||x.credit>0||x.total===0);const done=monthlyStats.filter(x=>x.total>0&&x.debt===0&&x.credit===0);
    return <div className="stack">
      <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[22px] font-black tracking-[-0.35px] text-[#0d2346] sm:text-[25px]">Công nợ {title}</h2><p className="muted text-sm">Một tháng = một khối công nợ. Ứng tháng nào chỉ trừ đúng tháng đó.</p></div><button className="btn soft" onClick={()=>openMoney("ADVANCE",month)}>+ Ứng trước</button></div>
        <div className="grid gap-3 md:grid-cols-3"><div className="kpi"><span className="muted">Còn nợ</span><strong>{money(totalDebt)}</strong></div><div className="kpi"><span className="muted">Dư ứng</span><strong>{money(totalCredit)}</strong></div><div className="kpi"><span className="muted">Số tháng cần xử lý</span><strong>{active.length}</strong></div></div>
      </section>
      <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6"><h2 className="text-[22px] font-black tracking-[-0.35px] text-[#0d2346] sm:text-[25px]">Cần xử lý · {active.length} tháng</h2>{!active.length&&<p className="muted">Không có tháng nào cần xử lý.</p>}{active.map(s=><MonthlyCard key={s.month} stat={s} title={title} category={category} onPay={()=>openMoney("PAYMENT",s.month,s.debt)} onAdvance={()=>openMoney("ADVANCE",s.month)} onPdf={openPdf}/>)}</section>
      {!!done.length&&<details className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6"><summary className="cursor-pointer font-extrabold text-emerald-700">Đã thanh toán xong · {done.length} tháng</summary><div className="stack mt-4">{done.map(s=><MonthlyCard key={s.month} stat={s} title={title} category={category} done onPay={()=>{}} onAdvance={()=>{}} onPdf={openPdf}/>)}</div></details>}
    </div>
  }

  if(loading)return <Loading/>;

  const HeroIcon=uiMeta.Icon;

  return <div className="space-y-5">
    <section className={`relative overflow-hidden rounded-[30px] border border-slate-200 bg-gradient-to-br ${uiMeta.hero} p-5 shadow-[0_18px_48px_rgba(15,23,42,.07)] sm:p-7`}>
      <div aria-hidden="true" className={`pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full blur-3xl ${uiMeta.glow}`}/>
      <div className="relative flex items-center gap-4 sm:gap-5">
        <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-[22px] shadow-[0_12px_28px_rgba(15,23,42,.08)] sm:h-20 sm:w-20 ${uiMeta.iconBox}`}>
          <HeroIcon className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={2.25}/>
        </div>
        <div className="min-w-0">
          <div className={`text-[11px] font-black uppercase tracking-[0.16em] sm:text-[12px] ${uiMeta.accent}`}>{uiMeta.kicker}</div>
          <h1 className="mt-1 text-[30px] font-black leading-tight tracking-[-0.7px] text-[#0d2346] sm:text-[40px]">{title}</h1>
          <p className="mt-2 max-w-[760px] text-[13px] font-semibold leading-6 text-slate-500 sm:text-[15px]">{uiMeta.subtitle}</p>
        </div>
      </div>
    </section>

    <div className={`grid gap-3 ${tabs.length===3?"sm:grid-cols-3":"sm:grid-cols-2"}`}>
      {tabs.map(item=>{
        const I=tabIcon(item.value);
        const active=tab===item.value;
        return <button
          key={item.value}
          type="button"
          onClick={()=>setTab(item.value)}
          className={`group flex min-h-[76px] items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,.08)] ${active?uiMeta.tabActive:"border-slate-200 bg-white text-slate-600"}`}
        >
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active?uiMeta.iconBox:"bg-slate-50 text-slate-500"}`}>
            <I className="h-5 w-5" strokeWidth={2.35}/>
          </span>
          <span className="text-[13px] font-black sm:text-[14px]">{item.label}</span>
        </button>
      })}
    </div>

    <Msg error={err} success={ok}/>

    {category==="DAY_KEO"&&tab==="ENTRIES"&&<>
      <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6">
        <h2 className="text-[22px] font-black tracking-[-0.35px] text-[#0d2346] sm:text-[25px]">Nhập Dây Kéo</h2>
        <label className="max-w-sm">Ngày Nhập Hàng *<input type="date" className="field mt-2" value={dayDate} onChange={e=>changeDayDate(e.target.value)}/></label>
        <datalist id="daykeo-list">{latestPrices.map(p=><option key={p.id} value={p.item_name}/>)}</datalist>
        <TableWrap><table className="az-table"><thead><tr><th style={{minWidth:320}}>Tên Dây Kéo *</th><th style={{width:170}}>SL *</th><th style={{width:210}}>Giá *</th><th className="text-right" style={{width:190}}>Thành tiền</th><th style={{width:90}}></th></tr></thead><tbody>{dayLines.map(r=>{const parsed=Number.isFinite(parseDayKeoPrice(r.price))?parseDayKeoPrice(r.price):0;return <tr key={r.id}><td><input list="daykeo-list" className="field" value={r.name} onChange={e=>changeDayName(r.id,e.target.value)}/></td><td><input type="number" min="0.01" step="0.01" className="field" value={r.quantity} onChange={e=>patchDayLine(r.id,{quantity:e.target.value})}/></td><td><input type="text" inputMode="decimal" className="field" placeholder="0,6 / 1,25" value={r.price} onChange={e=>patchDayLine(r.id,{price:e.target.value})}/></td><td className="text-right font-extrabold text-red-600 whitespace-nowrap">{money(Number(r.quantity||0)*parsed)}</td><td className="text-center">{dayLines.length>1&&<button className="btn soft" onClick={()=>setDayLines(rows=>rows.filter(x=>x.id!==r.id))}>Xóa</button>}</td></tr>})}</tbody><tfoot><tr><td colSpan={3} className="text-right font-black text-lg">Tổng:</td><td className="text-right font-black text-lg text-red-600 whitespace-nowrap">{money(dayGrandTotal)}</td><td></td></tr></tfoot></table></TableWrap>
        <div className="muted text-xs">Giá có thể nhập bằng phẩy hoặc chấm: 0,6 / 0.6 = 600đ · 1,25 / 1.25 = 1.250đ.</div>
        <div className="flex flex-wrap items-center justify-between gap-3"><button className="btn soft w-fit" onClick={()=>setDayLines(rows=>[...rows,newDayKeoLine()])}>+ THÊM DÒNG SẢN PHẨM</button><button className="btn primary" disabled={busy} onClick={saveDayEntries}>XÁC NHẬN NHẬP KHO · {dayLines.length} DÒNG</button></div>
      </section>
      <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[22px] font-black tracking-[-0.35px] text-[#0d2346] sm:text-[25px]">Nhật ký Dây Kéo</h2><div className="flex gap-2"><input type="month" className="field" value={month} onChange={e=>setMonth(e.target.value)}/><input className="field" placeholder="Tìm dây kéo" value={query} onChange={e=>setQuery(e.target.value)}/></div></div><TableWrap><table className="az-table"><thead><tr><th>STT</th><th>Ngày</th><th>Tên Dây Kéo</th><th>SL</th><th>Giá áp dụng</th><th>Thành tiền</th></tr></thead><tbody>{filteredDayEntries.map((e,i)=><tr key={e.id}><td>{i+1}</td><td>{dmy(e.entry_date)}</td><td className="font-bold">{e.item_name}</td><td>{fmtQty(e.quantity)}</td><td>{money(normalizeDayKeoStoredPrice(e.unit_price))}</td><td className="font-extrabold text-red-600">{money(Number(e.quantity||0)*normalizeDayKeoStoredPrice(e.unit_price))}</td></tr>)}</tbody></table></TableWrap></section>
    </>}

    {category==="DAY_KEO"&&tab==="PRICES"&&<section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6"><h2 className="text-[22px] font-black tracking-[-0.35px] text-[#0d2346] sm:text-[25px]">Giá & Danh Mục</h2><div className="grid gap-3 md:grid-cols-3"><label>Tên dây kéo *<input list="daykeo-price-list" className="field mt-2" value={priceForm.name} onChange={e=>setPriceForm(v=>({...v,name:e.target.value}))}/><datalist id="daykeo-price-list">{latestPrices.map(p=><option key={p.id} value={p.item_name}/>)}</datalist></label><label>Giá áp dụng (nghìn đ/sợi) *<input type="text" inputMode="decimal" className="field mt-2" placeholder="VD: 0,6 hoặc 1,25" value={priceForm.price} onChange={e=>setPriceForm(v=>({...v,price:e.target.value}))}/><span className="muted text-xs mt-1 block">Có thể dùng phẩy hoặc chấm: 0,6 / 0.6 = 600đ · 1,25 / 1.25 = 1.250đ · nhập 600 cũng được.</span>{priceForm.price.trim()&&Number.isFinite(parseDayKeoPrice(priceForm.price))&&<span className="text-xs mt-1 block font-bold text-blue-700">Quy đổi: {money(parseDayKeoPrice(priceForm.price))}/sợi</span>}</label><label>Ngày bắt đầu tính giá này *<input type="date" className="field mt-2" value={priceForm.date} onChange={e=>setPriceForm(v=>({...v,date:e.target.value}))}/></label></div><div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Khi thêm hoặc sửa một mốc giá cũ, hệ thống sẽ tính lại các phiếu Dây kéo đúng theo ngày hiệu lực. Ví dụ giá 700đ có hiệu lực từ 08/01 thì phiếu ngày 15/01 sẽ tự đổi sang 700đ; phiếu trước 08/01 vẫn giữ giá cũ.</div><button className="btn primary w-fit" disabled={busy} onClick={savePrice}>LƯU / CẬP NHẬT GIÁ</button><TableWrap><table className="az-table"><thead><tr><th>STT</th><th>Tên Dây Kéo</th><th>Giá hiện tại</th><th>Áp dụng từ</th><th>Lịch sử giá</th></tr></thead><tbody>{priceGroups.map((g,i)=>{const current=g.current;return <tr key={norm(g.name)}><td>{i+1}</td><td className="font-bold">{g.name}</td><td>{current?<><b>{money(normalizeDayKeoStoredPrice(current.unit_price))}</b><div className="muted text-xs">Nhập tắt: {dayKeoShortPrice(current.unit_price)}</div></>:<span className="muted">Chưa áp dụng</span>}</td><td>{current?dmy(current.effective_date):g.upcoming?`Sắp áp dụng ${dmy(g.upcoming.effective_date)}`:"—"}</td><td><div className="flex flex-col gap-1">{g.rows.map((r,idx)=>{const next=g.rows[idx+1];const actual=normalizeDayKeoStoredPrice(r.unit_price);const isCurrent=current?.id===r.id;const isFuture=r.effective_date>vnToday();const period=next?`${dmy(r.effective_date)} → ${dmy(previousDay(next.effective_date))}`:`Từ ${dmy(r.effective_date)}`;return <div key={r.id} className={`rounded-lg border px-2 py-1 text-sm ${isCurrent?"border-emerald-300 bg-emerald-50 font-bold":isFuture?"border-blue-200 bg-blue-50":"bg-white"}`}><span>{period}</span><span className="mx-2">·</span><b>{money(actual)}</b>{isCurrent&&<span className="ml-2 text-emerald-700">HIỆN TẠI</span>}{isFuture&&<span className="ml-2 text-blue-700">CHƯA TỚI NGÀY</span>}</div>})}</div></td></tr>})}</tbody></table></TableWrap></section>}

    {(category==="THEU"||category==="IN")&&tab==="CLOSE"&&<section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6"><h2 className="text-[22px] font-black tracking-[-0.35px] text-[#0d2346] sm:text-[25px]">Chốt Tháng · {title}</h2><div className="grid gap-3 md:grid-cols-2"><label>Tháng / Năm *<input type="month" className="field mt-2" value={closeForm.month} onChange={e=>setCloseForm(v=>({...v,month:e.target.value}))}/></label><label>Số tiền *<input type="number" min="1" className="field mt-2" value={closeForm.amount} onChange={e=>setCloseForm(v=>({...v,amount:e.target.value}))}/></label>{category==="IN"&&<><label className="md:col-span-2">Ghi chú<input className="field mt-2" value={closeForm.note} onChange={e=>setCloseForm(v=>({...v,note:e.target.value}))}/></label><label className="md:col-span-2">File PDF đối chiếu<input type="file" accept="application/pdf,.pdf" className="field mt-2" onChange={e=>setCloseForm(v=>({...v,file:e.target.files?.[0]||null}))}/></label></>}</div><div className="flex items-center justify-between gap-3"><div className="text-xl font-extrabold">Tổng chốt: <span className="text-red-600">{money(Number(closeForm.amount||0))}</span></div><button className="btn primary" disabled={busy} onClick={saveMonthlyClose}>CHỐT THÁNG {title.toUpperCase()}</button></div></section>}

    {category!=="VAI"&&tab==="DEBT"&&renderMonthlyDebt()}

    {category==="VAI"&&tab==="FABRIC"&&<>
      <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-72 flex-1">Tên Nhà Vải *<select className="field mt-2" value={partner} onChange={e=>setPartner(Number(e.target.value))}><option value="0">-- Chọn Nhà Vải --</option>{fabricPartners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><details className="rounded-xl border p-3"><summary className="cursor-pointer font-bold text-emerald-700">+ Thêm Nhà Vải</summary><div className="grid gap-2 mt-3 md:grid-cols-3"><input className="field" placeholder="Tên nhà cung cấp vải" value={newPartner.name} onChange={e=>setNewPartner(v=>({...v,name:e.target.value}))}/><input className="field" placeholder="Số điện thoại" value={newPartner.phone} onChange={e=>setNewPartner(v=>({...v,phone:e.target.value}))}/><button className="btn primary" disabled={busy} onClick={savePartner}>LƯU NHÀ VẢI</button></div></details></div></section>
      <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6"><h2 className="text-[22px] font-black tracking-[-0.35px] text-[#0d2346] sm:text-[25px]">Nhập Vải</h2>{fabricRows.map((r,idx)=><FabricRowCard key={r.id} row={r} index={idx} calc={fabricCalc(r)} onPatch={p=>patchFabric(r.id,p)} onRemove={()=>removeFabric(r.id)}/>) }<div className="flex flex-wrap gap-2"><button className="btn soft" onClick={()=>setFabricRows(v=>[...v,newFabricRow("IMPORT")])}>+ THÊM LẦN NHẬP</button><button className="btn soft" onClick={()=>setFabricRows(v=>[...v,newFabricRow("PAYMENT")])}>+ THÊM THANH TOÁN</button><button className="btn soft" onClick={()=>setFabricRows(v=>[...v,newFabricRow("RETURN")])}>+ THÊM HÀNG TRẢ</button></div><div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><div className="muted text-sm">TỔNG TIỀN</div><div className={`text-3xl font-black ${fabricGrandTotal<0?"text-red-600":"text-emerald-700"}`}>{money(fabricGrandTotal)}</div><div className="muted mt-1 text-xs">Thứ tự bắt buộc: Xem hóa đơn → Copy ảnh → Lưu nhập vải</div></div><button className="btn primary" onClick={openFabricInvoice}>XEM HÓA ĐƠN</button></div></section>
    </>}

    {category==="VAI"&&tab==="DEBT"&&<div className="stack"><section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6"><div className="grid gap-3 md:grid-cols-3"><div className="kpi"><span className="muted">Tổng nợ tất cả Nhà Vải</span><strong>{money(fabricTotalDebt)}</strong></div><div className="md:col-span-2"><label>Chọn Nhà Vải *<select className="field mt-2" value={partner} onChange={e=>setPartner(Number(e.target.value))}><option value="0">-- Chọn Nhà Vải --</option>{fabricPartners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div></div>{partner>0&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"><div><div className="muted text-sm">CÔNG NỢ TỪ TRƯỚC ĐẾN NAY</div><div className={`text-3xl font-black ${fabricPartnerDebt>0?"text-red-600":"text-emerald-700"}`}>{money(fabricPartnerDebt)}</div></div><button className="btn primary" onClick={()=>setMoneyDialog({open:true,kind:"PAYMENT",month:"",amount:"",date:vnToday(),note:"",max:Math.max(0,fabricPartnerDebt)})}>Thanh toán</button></div>}</section>{partner>0&&<section className="space-y-5 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,.06)] sm:p-6"><h2 className="text-[22px] font-black tracking-[-0.35px] text-[#0d2346] sm:text-[25px]">Lịch sử Nhà Vải</h2><FabricHistory entries={selectedFabricEntries} payments={selectedFabricPayments} onImage={openPdf}/></section>}</div>}

    {moneyDialog.open&&<Modal onClose={()=>setMoneyDialog(v=>({...v,open:false}))}><h2 className="text-[22px] font-black tracking-[-0.35px] text-[#0d2346] sm:text-[25px]">{category==="VAI"?"THANH TOÁN NHÀ VẢI":moneyDialog.kind==="ADVANCE"?`ỨNG TRƯỚC · ${monthLabel(moneyDialog.month)}`:`THANH TOÁN · ${monthLabel(moneyDialog.month)}`}</h2><div className="stack mt-4">{category!=="VAI"&&<label>Tháng<input type="month" className="field mt-2" value={moneyDialog.month} disabled={moneyDialog.kind==="PAYMENT"} onChange={e=>setMoneyDialog(v=>({...v,month:e.target.value}))}/></label>}<label>Ngày<input type="date" className="field mt-2" value={moneyDialog.date} onChange={e=>setMoneyDialog(v=>({...v,date:e.target.value}))}/></label><label>Số tiền<input type="number" min="1" className="field mt-2" value={moneyDialog.amount} onChange={e=>setMoneyDialog(v=>({...v,amount:e.target.value}))}/></label><label>Ghi chú<input className="field mt-2" value={moneyDialog.note} onChange={e=>setMoneyDialog(v=>({...v,note:e.target.value}))}/></label><button className="btn primary" disabled={busy} onClick={category==="VAI"?saveFabricPayment:saveMonthlyMoney}>XÁC NHẬN</button></div></Modal>}

    {fabricPreview&&<Modal wide onClose={()=>setFabricPreview(false)}><div ref={invoiceRef} className="bg-white px-7 py-8 text-slate-900"><div className="border-b pb-5 text-center"><div className="text-[22px] font-black tracking-wide">HÓA ĐƠN GIAO NHẬN VẢI & CÔNG NỢ</div><div className="mt-1 text-[16px] font-semibold text-slate-600">{dmy(vnToday())}</div></div><div className="mt-5 flex items-center justify-between gap-4 rounded-xl border bg-slate-50 px-4 py-3"><div><span className="text-sm text-slate-500">Nhà cung cấp</span><div className="text-lg font-black">{partners.find(p=>p.id===partner)?.name||"—"}</div></div><div className="text-right"><span className="text-sm text-slate-500">Tổng công nợ phiếu</span><div className={`text-xl font-black ${fabricGrandTotal<0?"text-emerald-700":"text-red-600"}`}>{money(fabricGrandTotal)}</div></div></div><div className="mt-5 overflow-hidden rounded-xl border"><table className="w-full border-collapse text-[15px]"><thead className="bg-slate-100"><tr><th className="px-3 py-3 text-left font-extrabold">Loại</th><th className="px-3 py-3 text-left font-extrabold">Tên Vải</th><th className="px-3 py-3 text-right font-extrabold">Cây</th><th className="px-3 py-3 text-right font-extrabold">Kg/M</th><th className="px-3 py-3 text-right font-extrabold">K.Hao</th><th className="px-3 py-3 text-right font-extrabold">Còn lại</th><th className="px-3 py-3 text-right font-extrabold">Giá</th><th className="px-3 py-3 text-right font-extrabold">Thành tiền</th></tr></thead><tbody>{fabricRows.flatMap(r=>{const c=fabricCalc(r);const rowTone=r.kind==="RETURN"?"bg-red-50":r.kind==="PAYMENT"?"bg-blue-50":"bg-white";const transport=r.kind==="IMPORT"?Number(r.transport_fee||0):0;const fabricAmount=r.kind==="IMPORT"?c.net*Number(r.unit_price||0):c.total;const main=<tr key={`${r.id}-main`} className={`${rowTone} border-t`}><td className="px-3 py-3 font-bold">{r.kind==="IMPORT"?"Nhập":r.kind==="RETURN"?"Trả":"Thanh toán"}</td><td className="px-3 py-3">{r.kind==="PAYMENT"?(r.note||"Thanh toán"):r.item_name}</td><td className="px-3 py-3 text-right">{r.kind==="PAYMENT"?"—":fmtQty(Number(r.tree_count||0))}</td><td className="px-3 py-3 text-right">{r.kind==="PAYMENT"?"—":`${fmtQty(Number(r.raw_quantity||0))} ${r.unit}`}</td><td className="px-3 py-3 text-right">{r.kind==="IMPORT"?fmtQty(c.depreciation):"—"}</td><td className="px-3 py-3 text-right">{r.kind==="PAYMENT"?"—":fmtQty(c.net)}</td><td className="px-3 py-3 text-right">{r.kind==="PAYMENT"?"—":money(Number(r.unit_price||0))}</td><td className={`px-3 py-3 text-right font-black ${fabricAmount<0?"text-emerald-700":"text-slate-900"}`}>{money(fabricAmount)}</td></tr>;if(transport<=0)return [main];const fee=<tr key={`${r.id}-transport`} className="border-t bg-amber-50"><td className="px-3 py-3 font-bold text-amber-800">Tiền xe</td><td className="px-3 py-3 text-amber-800">Phí vận chuyển</td><td className="px-3 py-3 text-right">—</td><td className="px-3 py-3 text-right">—</td><td className="px-3 py-3 text-right">—</td><td className="px-3 py-3 text-right">—</td><td className="px-3 py-3 text-right">—</td><td className="px-3 py-3 text-right font-black text-amber-800">{money(transport)}</td></tr>;return [main,fee]})}</tbody><tfoot className="border-t-2 bg-slate-50"><tr><td colSpan={6}></td><td className="px-3 py-4 text-right text-[16px] font-black">TỔNG CỘNG</td><td className={`px-3 py-4 text-right text-[18px] font-black ${fabricGrandTotal<0?"text-emerald-700":"text-red-600"}`}>{money(fabricGrandTotal)}</td></tr></tfoot></table></div><div className="mt-4 text-right text-xs text-slate-400">AZALAS SPORT · Phiếu giao nhận vải</div></div><div className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm"><b>Thứ tự:</b> 1. Kiểm tra hóa đơn → 2. Copy ảnh → 3. Lưu nhập vải. {fabricInvoiceCopied?<span className="ml-2 font-bold text-emerald-700">✓ Đã copy đúng dữ liệu hiện tại</span>:<span className="ml-2 font-bold text-amber-700">Chưa copy ảnh</span>}</div><div className="flex justify-end gap-2 mt-4"><button className="btn soft" disabled={busy} onClick={copyFabricInvoice}>📸 COPY ẢNH</button><button className="btn primary" disabled={busy||!fabricInvoiceCopied} onClick={saveFabric}>LƯU NHẬP VẢI</button></div></Modal>}
  </div>
}

function TableWrap({children}:{children:React.ReactNode}){return <div className="az-table-wrap overflow-x-auto rounded-[20px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,.04)]">{children}</div>}

function MonthlyCard({stat,title,category,done,onPay,onAdvance,onPdf}:{stat:MonthlyStat;title:string;category:Category;done?:boolean;onPay:()=>void;onAdvance:()=>void;onPdf:(p:string|null)=>void}){
  return <div className={`rounded-[24px] border border-slate-200 p-4 shadow-[0_10px_28px_rgba(15,23,42,.05)] sm:p-5 ${done?"bg-slate-50/80":"bg-white"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-lg font-black text-blue-800">{monthLabel(stat.month)}</div><div className="muted text-sm">{stat.entries.length} lần chốt/nhập · {stat.payments.length} giao dịch tiền</div></div><div className="text-right"><div className="font-black text-red-600">{stat.debt>0?`CÒN NỢ ${money(stat.debt)}`:stat.credit>0?`DƯ ỨNG ${money(stat.credit)}`:"ĐÃ XONG"}</div></div></div><div className="grid gap-2 mt-4 md:grid-cols-4"><Mini label={category==="DAY_KEO"?"Tổng mua":"Đã chốt"} value={money(stat.total)}/><Mini label="Ứng" value={money(stat.advance)}/><Mini label="Đã thanh toán" value={money(stat.paid)}/><Mini label={stat.credit>0?"Dư ứng":"Còn lại"} value={money(stat.credit||stat.debt)}/></div><details className="mt-4 rounded-xl border p-3"><summary className="cursor-pointer font-bold">Chi tiết tháng</summary><div className="mt-3 stack"><TableWrap><table className="az-table"><thead><tr><th>STT</th><th>Ngày</th><th>Nội dung</th><th>Thành tiền</th><th></th></tr></thead><tbody>{stat.entries.map((e,i)=><tr key={e.id}><td>{i+1}</td><td>{dmy(e.entry_date)}</td><td>{e.item_name}{e.note?` · ${e.note}`:""}</td><td className="font-bold">{money(Number(e.total||0)+Number(e.transport_fee||0))}</td><td>{e.document_path&&<button className="btn soft" onClick={()=>onPdf(e.document_path)}>PDF</button>}</td></tr>)}</tbody></table></TableWrap>{!!stat.payments.length&&<div><div className="font-bold mb-2">Ứng / Thanh toán</div>{stat.payments.map(p=><div key={p.id} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{dmy(p.paid_at)} · {p.payment_kind==="ADVANCE"?"Ứng":"Thanh toán"}{p.note?` · ${p.note}`:""}</span><b>-{money(p.amount)}</b></div>)}</div>}</div></details>{!done&&<div className="flex flex-wrap gap-2 mt-4">{stat.debt>0&&<button className="btn primary" onClick={onPay}>Thanh toán tháng này</button>}<button className="btn soft" onClick={onAdvance}>Ứng thêm tháng này</button></div>}</div>
}

function Mini({label,value}:{label:string;value:string}){return <div className="rounded-[18px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3.5 shadow-[0_6px_18px_rgba(15,23,42,.04)]"><div className="text-[11px] font-black uppercase tracking-[0.06em] text-slate-400">{label}</div><div className="mt-1 text-[19px] font-black text-[#0d2346]">{value}</div></div>}

function FabricRowCard({row,index,calc,onPatch,onRemove}:{row:FabricRow;index:number;calc:{depreciation:number;net:number;total:number};onPatch:(p:Partial<FabricRow>)=>void;onRemove:()=>void}){
  const kindLabel=row.kind==="IMPORT"?"Nhập Vải":row.kind==="RETURN"?"Trả Lại Vải (Lỗi/Dư)":"Thanh Toán (Trừ Nợ)";
  return <div className={`rounded-[24px] border p-4 shadow-[0_8px_24px_rgba(15,23,42,.04)] sm:p-5 ${row.kind==="RETURN"?"border-rose-200 bg-rose-50/70":row.kind==="PAYMENT"?"border-blue-200 bg-blue-50/70":"border-emerald-100 bg-white"}`}><div className="flex items-center justify-between gap-3"><div className="font-black">{index+1}. {kindLabel}</div><button className="btn soft" onClick={onRemove}>Xóa dòng</button></div><div className="grid gap-3 mt-3 md:grid-cols-2">{row.kind==="PAYMENT"?<><label>Ngày *<input type="date" className="field mt-2" value={row.date} onChange={e=>onPatch({date:e.target.value})}/></label><label>Số tiền *<input type="number" min="1" className="field mt-2" value={row.amount} onChange={e=>onPatch({amount:e.target.value})}/></label><label className="md:col-span-2">Lý do thanh toán<input className="field mt-2" value={row.note} onChange={e=>onPatch({note:e.target.value})}/></label></>:<><label>Ngày *<input type="date" className="field mt-2" value={row.date} onChange={e=>onPatch({date:e.target.value})}/></label><label>Đơn vị *<select className="field mt-2" value={row.unit} onChange={e=>onPatch({unit:e.target.value as "Kg"|"Mét"})}><option>Kg</option><option>Mét</option></select></label><label className="md:col-span-2">Tên vải *<input className="field mt-2" value={row.item_name} onChange={e=>onPatch({item_name:e.target.value})}/></label><label>Số Cây<input type="number" min="0" step="0.01" className="field mt-2" value={row.tree_count} onChange={e=>onPatch({tree_count:e.target.value})}/></label><label>{row.unit==="Kg"?"Số Kg":"Số Mét"} *<input type="number" min="0" step="0.01" className="field mt-2" value={row.raw_quantity} onChange={e=>onPatch({raw_quantity:e.target.value})}/></label>{row.kind==="IMPORT"&&row.unit==="Kg"&&<label className="flex items-center gap-2 rounded-xl border p-3"><input type="checkbox" checked={row.depreciation_enabled} onChange={e=>onPatch({depreciation_enabled:e.target.checked})}/><span>Khấu hao (x0.3)</span></label>}<div className="rounded-xl border p-3"><div className="muted text-sm">{row.kind==="IMPORT"?"Còn Lại":"Số lượng trả"}</div><b>{fmtQty(calc.net)} {row.unit}</b>{row.kind==="IMPORT"&&<div className="muted text-xs mt-1">Khấu hao: {fmtQty(calc.depreciation)}</div>}</div><label>{row.kind==="RETURN"?"Đơn Giá Cấn Trừ":"Đơn Giá"} *<input type="number" min="0" className="field mt-2" value={row.unit_price} onChange={e=>onPatch({unit_price:e.target.value})}/></label>{row.kind==="IMPORT"&&<label>Tiền xe (không bắt buộc)<input type="number" className="field mt-2" value={row.transport_fee} onChange={e=>onPatch({transport_fee:e.target.value})}/></label>}</>}</div>{row.kind==="IMPORT"?<div className="mt-3 rounded-xl border bg-slate-50 p-3"><div className="flex flex-wrap justify-end gap-x-5 gap-y-1 text-sm"><span>Tiền vải: <b>{money(calc.net*Number(row.unit_price||0))}</b></span><span>Tiền xe: <b>{money(Number(row.transport_fee||0))}</b></span></div><div className="mt-1 text-right text-xl font-black text-emerald-700">Tổng: {money(calc.total)}</div></div>:<div className={`text-right text-xl font-black mt-3 ${calc.total<0?"text-red-600":"text-emerald-700"}`}>{row.kind==="RETURN"?"Tổng trừ nợ":"Thành tiền"}: {money(calc.total)}</div>}</div>
}

function FabricHistory({entries,payments,onImage}:{entries:Entry[];payments:Payment[];onImage:(p:string|null)=>void}){
  const rows=[...entries.map(e=>({key:`e-${e.id}`,date:e.entry_date,type:e.entry_kind==="RETURN"?"HÀNG TRẢ":"NHẬP VẢI",text:e.item_name,amount:e.entry_kind==="RETURN"?-Math.abs(Number(e.total||0)):Number(e.total||0)+Number(e.transport_fee||0),document_path:e.document_path})),...payments.map(p=>({key:`p-${p.id}`,date:p.paid_at,type:"THANH TOÁN",text:p.note||"Thanh toán",amount:-Number(p.amount||0),document_path:null as string|null}))].sort((a,b)=>b.date.localeCompare(a.date)||b.key.localeCompare(a.key));
  if(!rows.length)return <p className="muted">Chưa có giao dịch.</p>;
  const firstImageRow=new Map<string,string>();
  rows.forEach(r=>{if(r.document_path&&!firstImageRow.has(r.document_path))firstImageRow.set(r.document_path,r.key)});
  return <div>{rows.map(r=><div key={r.key} className="grid gap-2 border-b py-3 md:grid-cols-[120px_140px_1fr_150px_150px]"><div>{dmy(r.date)}</div><div className="font-bold">{r.type}</div><div>{r.text}</div><div>{r.document_path&&firstImageRow.get(r.document_path)===r.key?<button className="btn soft" onClick={()=>onImage(r.document_path)}>🖼 Xem ảnh phiếu</button>:null}</div><div className={`text-right font-extrabold ${r.amount<0?"text-emerald-700":"text-red-600"}`}>{r.amount<0?"-":"+"}{money(Math.abs(r.amount))}</div></div>)}</div>
}

function Modal({children,onClose,wide}:{children:React.ReactNode;onClose:()=>void;wide?:boolean}){return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className={`max-h-[92vh] overflow-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-6 ${wide?"w-full max-w-6xl":"w-full max-w-lg"}`}><div className="flex justify-end"><button className="btn soft" onClick={onClose}>Đóng</button></div>{children}</div></div>}
