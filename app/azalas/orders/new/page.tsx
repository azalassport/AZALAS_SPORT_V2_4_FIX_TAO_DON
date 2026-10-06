import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NewOrderForm from "./new-order-form";

export default function NewOrderPage() {
  return (
    <div className="mx-auto w-full max-w-[1220px] pb-10">
      <div className="mb-4">
        <Link
          href="/azalas"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-[15px] font-extrabold text-blue-700 transition hover:bg-blue-100"
        >
          <ArrowLeft size={19} strokeWidth={2.5} />
          Quay lại
        </Link>
      </div>

      <NewOrderForm />
    </div>
  );
}
