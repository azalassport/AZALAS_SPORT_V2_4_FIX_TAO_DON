import {PageTop} from "@/components/ui";
import PartnerList from "@/components/partner-list";
export default function Page(){return <><PageTop title="Thợ cắt" kicker="QUẢN LÝ RẬP" description="Danh mục thợ cắt; nghiệp vụ chốt công/công nợ sẽ được chuyển sau khi đối soát code cũ." back="/azalas/patterns"/><PartnerList table="cutters" label="thợ cắt"/></>}
