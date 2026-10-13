export type Role="OWNER"|"ADMIN"|"MEMBER";
export const isManager=(role:string|null|undefined)=>role==="OWNER"||role==="ADMIN";
export const memberPages=["/azalas","/azalas/orders","/azalas/orders/new","/azalas/returns","/azalas/images","/azalas/patterns/progress","/azalas/account"] as const;
