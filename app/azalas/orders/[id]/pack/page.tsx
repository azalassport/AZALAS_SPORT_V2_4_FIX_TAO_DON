import PackForm from "./pack-form";
export default async function PackPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;return <PackForm unitId={Number(id)}/>;
}
