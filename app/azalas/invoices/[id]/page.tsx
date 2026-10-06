import InvoiceDetail from "./invoice-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetail invoiceId={Number(id)} />;
}
