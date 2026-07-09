export const BEPAY_BASE="https://app.bepay.com.co/api/v1";

export interface BepayResponse<T> {
  success:boolean;
  data:T;
  message:string;
}
export interface BepayAccount {
  id: number;
  platform:string;
  banks_account_number:string;
  rsa_public_key:string;
}
export interface BepayLink{
  ide:string;
  total:string;
  link:string;
  qr:string | null;
}
export interface BepayTransaction {
  id:string;
  status: "PENDIENTE" | "PAGADO" | "RECHAZADO" | "ERROR";
  amount:string;
  payment_method: string;
  created_at:string;
}
export interface BepayPayaout{
  id:string;
  status: "PENDIENTE" | "COMPLETADO" | "ERROR";
  amount:string;
  destination:string;
}
//REQUESTS
export interface CreateLinkRequest{
  account_id:string;
  total:number;
  description:string;
  redirect_url?:string;
}
export interface PayaoutBrebRequest{
  account_id:number;
  key:string;
  amount:number;
  description:string;
  reference:string;
}
export interface PayoutAchRequest{
  account_id:number;
  bank_code:string;
  account_number:string;
  account_type:"ahorros" | "corriente";
  document_type: string;
  name:string;
  amount:number;
  description:string;
  reference:string;
}