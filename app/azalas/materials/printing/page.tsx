import Link from "next/link";
export default function Page(){return <div className="grid gap-4 md:grid-cols-2"><Link className="panel block" href="/azalas/materials/printing/nhat"><h2>Nhật - In</h2><p className="muted">Mở sổ riêng của Nhật.</p></Link><Link className="panel block" href="/azalas/materials/printing/tung"><h2>Tùng - In</h2><p className="muted">Mở sổ riêng của Tùng.</p></Link></div>}
