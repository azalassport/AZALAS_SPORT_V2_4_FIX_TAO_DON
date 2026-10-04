import Link from "next/link";

const cards=[
  {href:"/azalas/materials/daykeo",title:"Dây kéo",desc:"Nhập hàng · Giá & Danh mục · Công nợ",icon:"🔗"},
  {href:"/azalas/materials/embroidery",title:"Thêu",desc:"Chốt tháng · Ứng · Thanh toán",icon:"🧵"},
  {href:"/azalas/materials/printing/nhat",title:"Nhật - In",desc:"Sổ riêng Nhật · PDF đối chiếu · Công nợ",icon:"🖨️"},
  {href:"/azalas/materials/printing/tung",title:"Tùng - In",desc:"Sổ riêng Tùng · PDF đối chiếu · Công nợ",icon:"🖨️"},
  {href:"/azalas/materials/fabric",title:"Vải",desc:"Nhập vải · Hàng trả · Thanh toán · Công nợ",icon:"🧶",wide:true},
];

export default function MaterialsPage(){
  return <div className="stack">
    <section className="panel">
      <div className="muted text-xs font-extrabold uppercase tracking-widest">Kho / Xưởng</div>
      <h1 className="mt-1 text-2xl font-black text-slate-900">Quản lý phụ liệu</h1>
      <p className="muted mt-1">Chọn đúng sổ nghiệp vụ. Nhật - In và Tùng - In được tách riêng.</p>
    </section>
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map(c=><Link key={c.href} href={c.href} className={`panel group block transition hover:-translate-y-0.5 hover:shadow-lg ${c.wide?"md:col-span-2":""}`}>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl">{c.icon}</div>
          <div className="min-w-0 flex-1"><div className="text-lg font-black text-slate-900">{c.title}</div><div className="muted text-sm">{c.desc}</div></div>
          <div className="text-xl text-slate-400 transition group-hover:translate-x-1">→</div>
        </div>
      </Link>)}
    </div>
  </div>
}
